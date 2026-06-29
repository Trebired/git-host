package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"
)

const outputPreviewLimit = 4000

type runnerInput struct {
	Branch              string            `json:"branch"`
	CommitHash          string            `json:"commit_hash"`
	Env                 map[string]string `json:"env"`
	HeartbeatIntervalMS int               `json:"heartbeat_interval_ms"`
	Ref                 string            `json:"ref"`
	ReleaseID           string            `json:"release_id"`
	RepositoryID        string            `json:"repository_id"`
	RepositoryPath      string            `json:"repository_path"`
	RunID               string            `json:"run_id"`
	Shell               string            `json:"shell"`
	Steps               []runnerStep      `json:"steps"`
	WorkflowID          string            `json:"workflow_id"`
	WorkspaceRoot       string            `json:"workspace_root"`
}

type runnerStep struct {
	Command string            `json:"command"`
	Env     map[string]string `json:"env"`
	ID      string            `json:"id"`
	Index   int               `json:"index"`
	Name    string            `json:"name"`
	Shell   string            `json:"shell"`
}

type runnerEvent struct {
	Chunk         string `json:"chunk,omitempty"`
	Command       string `json:"command,omitempty"`
	ExitCode      int    `json:"exit_code,omitempty"`
	OutputPreview string `json:"output_preview,omitempty"`
	Status        string `json:"status,omitempty"`
	StepID        string `json:"step_id,omitempty"`
	StepIndex     int    `json:"step_index,omitempty"`
	StepName      string `json:"step_name,omitempty"`
	Stream        string `json:"stream,omitempty"`
	Summary       string `json:"summary,omitempty"`
	Type          string `json:"type"`
}

type eventWriter struct {
	mu sync.Mutex
}

func (writer *eventWriter) emit(event runnerEvent) error {
	writer.mu.Lock()
	defer writer.mu.Unlock()
	payload, err := json.Marshal(event)
	if err != nil {
		return err
	}
	_, err = os.Stdout.Write(append(payload, '\n'))
	return err
}

func runGit(cwd string, args ...string) error {
	command := exec.Command("git", args...)
	command.Dir = cwd
	command.Stdout = io.Discard
	command.Stderr = os.Stderr
	return command.Run()
}

func materializeWorkspace(input runnerInput) (string, error) {
	workspacePath := filepath.Join(input.WorkspaceRoot, "workspace")
	if err := os.RemoveAll(input.WorkspaceRoot); err != nil {
		return "", err
	}
	if err := os.MkdirAll(input.WorkspaceRoot, 0o755); err != nil {
		return "", err
	}
	if err := runGit(input.WorkspaceRoot, "clone", "--no-checkout", input.RepositoryPath, workspacePath); err != nil {
		return "", err
	}
	if err := runGit(workspacePath, "checkout", "--detach", input.CommitHash); err != nil {
		return "", err
	}
	return workspacePath, nil
}

func appendOutputPreview(current, chunk string) string {
	next := current + chunk
	if len(next) <= outputPreviewLimit {
		return next
	}
	return next[len(next)-outputPreviewLimit:]
}

func main() {
	var input runnerInput
	if err := json.NewDecoder(os.Stdin).Decode(&input); err != nil {
		fmt.Fprintln(os.Stderr, err.Error())
		os.Exit(1)
	}
	if err := execute(input); err != nil {
		fmt.Fprintln(os.Stderr, err.Error())
		if errors.Is(err, syscall.EINTR) {
			os.Exit(130)
		}
		os.Exit(1)
	}
}

func execute(input runnerInput) error {
	writer := &eventWriter{}
	workspacePath, err := materializeWorkspace(input)
	if err != nil {
		return err
	}
	if err := writer.emit(runnerEvent{
		Status:  "running",
		Summary: "Workflow run started.",
		Type:    "run.status",
	}); err != nil {
		return err
	}

	signals := make(chan os.Signal, 2)
	signal.Notify(signals, os.Interrupt, syscall.SIGTERM)
	defer signal.Stop(signals)

	cancelled := false
	for _, step := range input.Steps {
		if cancelled {
			return syscall.EINTR
		}
		if err := runStep(input, step, workspacePath, writer, signals, &cancelled); err != nil {
			if errors.Is(err, syscall.EINTR) {
				return err
			}
			return err
		}
	}
	return nil
}

func runStep(input runnerInput, step runnerStep, workspacePath string, writer *eventWriter, signals chan os.Signal, cancelled *bool) error {
	if err := writer.emit(runnerEvent{
		Command:   step.Command,
		StepID:    step.ID,
		StepIndex: step.Index,
		StepName:  step.Name,
		Type:      "step.started",
	}); err != nil {
		return err
	}

	shell := step.Shell
	if strings.TrimSpace(shell) == "" {
		shell = input.Shell
	}
	if strings.TrimSpace(shell) == "" {
		shell = "bash"
	}

	command := exec.Command(shell, "-lc", step.Command)
	command.Dir = workspacePath
	command.Env = mergeEnv(input, step)

	stdoutPipe, err := command.StdoutPipe()
	if err != nil {
		return err
	}
	stderrPipe, err := command.StderrPipe()
	if err != nil {
		return err
	}

	if err := command.Start(); err != nil {
		return err
	}

	ticker := time.NewTicker(resolveHeartbeatInterval(input.HeartbeatIntervalMS))
	defer ticker.Stop()

	var previewMu sync.Mutex
	outputPreview := ""
	updatePreview := func(chunk string) {
		previewMu.Lock()
		defer previewMu.Unlock()
		outputPreview = appendOutputPreview(outputPreview, chunk)
	}

	readStream := func(stream string, source io.Reader, done chan<- error) {
		buffer := make([]byte, 2048)
		for {
			count, readErr := source.Read(buffer)
			if count > 0 {
				chunk := string(buffer[:count])
				updatePreview(chunk)
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
			if readErr != nil {
				if errors.Is(readErr, io.EOF) {
					done <- nil
					return
				}
				done <- readErr
				return
			}
		}
	}

	streamDone := make(chan error, 2)
	go readStream("stdout", stdoutPipe, streamDone)
	go readStream("stderr", stderrPipe, streamDone)

	waitDone := make(chan error, 1)
	go func() {
		waitDone <- command.Wait()
	}()

	for {
		select {
		case sig := <-signals:
			_ = command.Process.Signal(syscall.SIGTERM)
			*cancelled = true
			if sig == os.Interrupt || sig == syscall.SIGTERM {
				_ = <-waitDone
				previewMu.Lock()
				finalPreview := outputPreview
				previewMu.Unlock()
				_ = writer.emit(runnerEvent{
					ExitCode:      130,
					OutputPreview: finalPreview,
					Status:        "cancelled",
					StepID:        step.ID,
					StepIndex:     step.Index,
					StepName:      step.Name,
					Summary:       fmt.Sprintf("%s cancelled.", step.Name),
					Type:          "step.finished",
				})
				return syscall.EINTR
			}
		case <-ticker.C:
			if err := writer.emit(runnerEvent{
				StepID:    step.ID,
				StepIndex: step.Index,
				StepName:  step.Name,
				Type:      "step.heartbeat",
			}); err != nil {
				return err
			}
		case err := <-streamDone:
			if err != nil {
				_ = command.Process.Kill()
				return err
			}
		case err := <-waitDone:
			previewMu.Lock()
			finalPreview := outputPreview
			previewMu.Unlock()
			exitCode := 0
			status := "success"
			summary := fmt.Sprintf("%s completed.", step.Name)
			if err != nil {
				status = "failed"
				summary = fmt.Sprintf("%s failed.", step.Name)
				var exitErr *exec.ExitError
				if errors.As(err, &exitErr) {
					exitCode = exitErr.ExitCode()
				} else {
					exitCode = 1
				}
			}
			if emitErr := writer.emit(runnerEvent{
				ExitCode:      exitCode,
				OutputPreview: finalPreview,
				Status:        status,
				StepID:        step.ID,
				StepIndex:     step.Index,
				StepName:      step.Name,
				Summary:       summary,
				Type:          "step.finished",
			}); emitErr != nil {
				return emitErr
			}
			if err != nil {
				return err
			}
			return nil
		}
	}
}

func mergeEnv(input runnerInput, step runnerStep) []string {
	env := map[string]string{}
	for _, row := range os.Environ() {
		parts := strings.SplitN(row, "=", 2)
		if len(parts) == 2 {
			env[parts[0]] = parts[1]
		}
	}
	for key, value := range input.Env {
		if strings.TrimSpace(key) == "" {
			continue
		}
		env[key] = value
	}
	for key, value := range step.Env {
		if strings.TrimSpace(key) == "" {
			continue
		}
		env[key] = value
	}
	env["GIT_HOST_ACTIONS_REPOSITORY_ID"] = input.RepositoryID
	env["GIT_HOST_ACTIONS_RUN_ID"] = input.RunID
	env["GIT_HOST_ACTIONS_WORKFLOW_ID"] = input.WorkflowID
	env["GIT_HOST_ACTIONS_COMMIT"] = input.CommitHash
	env["GIT_HOST_ACTIONS_REF"] = input.Ref
	env["GIT_HOST_ACTIONS_BRANCH"] = input.Branch
	env["GIT_HOST_ACTIONS_RELEASE_ID"] = input.ReleaseID
	rows := make([]string, 0, len(env))
	for key, value := range env {
		rows = append(rows, fmt.Sprintf("%s=%s", key, value))
	}
	return rows
}

func resolveHeartbeatInterval(value int) time.Duration {
	if value < 250 {
		value = 250
	}
	return time.Duration(value) * time.Millisecond
}
