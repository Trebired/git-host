package main

import (
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"
	"sync"
	"syscall"
	"time"
)

type previewBuffer struct {
	mu    sync.Mutex
	value string
}

func (buffer *previewBuffer) append(chunk string) {
	buffer.mu.Lock()
	defer buffer.mu.Unlock()
	buffer.value = appendOutputPreview(buffer.value, chunk)
}

func (buffer *previewBuffer) read() string {
	buffer.mu.Lock()
	defer buffer.mu.Unlock()
	return buffer.value
}

func runStep(input runnerInput, step runnerStep, workspacePath string, writer *eventWriter, signals chan os.Signal, cancelled *bool) error {
	if err := emitStepStarted(writer, step); err != nil {
		return err
	}

	command, stdoutPipe, stderrPipe, err := startStepCommand(input, step, workspacePath)
	if err != nil {
		return err
	}

	ticker := time.NewTicker(resolveHeartbeatInterval(input.HeartbeatIntervalMS))
	defer ticker.Stop()

	preview := &previewBuffer{}
	streamDone := startStepStreams(writer, step, stdoutPipe, stderrPipe, preview)
	waitDone := waitForStepCommand(command)

	return monitorRunningStep(step, writer, signals, cancelled, command, ticker, preview, streamDone, waitDone)
}

func emitStepStarted(writer *eventWriter, step runnerStep) error {
	return writer.emit(runnerEvent{
		Command:   step.Command,
		StepID:    step.ID,
		StepIndex: step.Index,
		StepName:  step.Name,
		Type:      "step.started",
	})
}

func startStepCommand(input runnerInput, step runnerStep, workspacePath string) (*exec.Cmd, io.ReadCloser, io.ReadCloser, error) {
	command := exec.Command(resolveStepShell(input, step), "-lc", step.Command)
	command.Dir = workspacePath
	command.Env = mergeEnv(input, step)

	stdoutPipe, err := command.StdoutPipe()
	if err != nil {
		return nil, nil, nil, err
	}
	stderrPipe, err := command.StderrPipe()
	if err != nil {
		return nil, nil, nil, err
	}
	if err := command.Start(); err != nil {
		return nil, nil, nil, err
	}
	return command, stdoutPipe, stderrPipe, nil
}

func resolveStepShell(input runnerInput, step runnerStep) string {
	shell := step.Shell
	if strings.TrimSpace(shell) == "" {
		shell = input.Shell
	}
	if strings.TrimSpace(shell) == "" {
		shell = "bash"
	}
	return shell
}

func startStepStreams(
	writer *eventWriter,
	step runnerStep,
	stdoutPipe io.Reader,
	stderrPipe io.Reader,
	preview *previewBuffer,
) chan error {
	streamDone := make(chan error, 2)
	go readStepStream("stdout", stdoutPipe, writer, step, preview, streamDone)
	go readStepStream("stderr", stderrPipe, writer, step, preview, streamDone)
	return streamDone
}

func readStepStream(
	stream string,
	source io.Reader,
	writer *eventWriter,
	step runnerStep,
	preview *previewBuffer,
	done chan<- error,
) {
	buffer := make([]byte, 2048)
	for {
		count, readErr := source.Read(buffer)
		if count > 0 {
			chunk := string(buffer[:count])
			preview.append(chunk)
			if emitErr := writer.emit(runnerEvent{
				Chunk:     chunk,
				StepID:    step.ID,
				StepIndex: step.Index,
				StepName:  step.Name,
				Stream:    stream,
				Type:      "step.output",
			}); emitErr != nil {
				done <- emitErr
				return
			}
		}
		if readErr == nil {
			continue
		}
		if errors.Is(readErr, io.EOF) {
			done <- nil
			return
		}
		done <- readErr
		return
	}
}

func waitForStepCommand(command *exec.Cmd) chan error {
	waitDone := make(chan error, 1)
	go func() {
		waitDone <- command.Wait()
	}()
	return waitDone
}

func monitorRunningStep(
	step runnerStep,
	writer *eventWriter,
	signals chan os.Signal,
	cancelled *bool,
	command *exec.Cmd,
	ticker *time.Ticker,
	preview *previewBuffer,
	streamDone chan error,
	waitDone chan error,
) error {
	for {
		select {
		case sig := <-signals:
			return cancelRunningStep(sig, step, writer, cancelled, command, preview, waitDone)
		case <-ticker.C:
			if err := emitStepHeartbeat(writer, step); err != nil {
				return err
			}
		case err := <-streamDone:
			if err != nil {
				_ = command.Process.Kill()
				return err
			}
		case err := <-waitDone:
			return finishRunningStep(err, step, writer, preview)
		}
	}
}

func cancelRunningStep(
	sig os.Signal,
	step runnerStep,
	writer *eventWriter,
	cancelled *bool,
	command *exec.Cmd,
	preview *previewBuffer,
	waitDone chan error,
) error {
	_ = command.Process.Signal(syscall.SIGTERM)
	*cancelled = true
	if sig != os.Interrupt && sig != syscall.SIGTERM {
		return nil
	}
	_ = <-waitDone
	if err := writer.emit(runnerEvent{
		ExitCode:      130,
		OutputPreview: preview.read(),
		Status:        "cancelled",
		StepID:        step.ID,
		StepIndex:     step.Index,
		StepName:      step.Name,
		Summary:       fmt.Sprintf("%s cancelled.", step.Name),
		Type:          "step.finished",
	}); err != nil {
		return err
	}
	return syscall.EINTR
}

func emitStepHeartbeat(writer *eventWriter, step runnerStep) error {
	return writer.emit(runnerEvent{
		StepID:    step.ID,
		StepIndex: step.Index,
		StepName:  step.Name,
		Type:      "step.heartbeat",
	})
}

func finishRunningStep(err error, step runnerStep, writer *eventWriter, preview *previewBuffer) error {
	exitCode, status, summary := stepResult(err, step.Name)
	if emitErr := writer.emit(runnerEvent{
		ExitCode:      exitCode,
		OutputPreview: preview.read(),
		Status:        status,
		StepID:        step.ID,
		StepIndex:     step.Index,
		StepName:      step.Name,
		Summary:       summary,
		Type:          "step.finished",
	}); emitErr != nil {
		return emitErr
	}
	return err
}

func stepResult(err error, stepName string) (int, string, string) {
	if err == nil {
		return 0, "success", fmt.Sprintf("%s completed.", stepName)
	}
	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		return exitErr.ExitCode(), "failed", fmt.Sprintf("%s failed.", stepName)
	}
	return 1, "failed", fmt.Sprintf("%s failed.", stepName)
}
