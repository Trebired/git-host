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
	"sync"
	"syscall"
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
