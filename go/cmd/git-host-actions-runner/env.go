package main

import (
	"fmt"
	"os"
	"strings"
	"time"
)

func appendOutputPreview(current, chunk string) string {
	next := current + chunk
	if len(next) <= outputPreviewLimit {
		return next
	}
	return next[len(next)-outputPreviewLimit:]
}

func mergeEnv(input runnerInput, step runnerStep) []string {
	env := map[string]string{}
	for _, row := range os.Environ() {
		parts := strings.SplitN(row, "=", 2)
		if len(parts) == 2 {
			env[parts[0]] = parts[1]
		}
	}
	applyRunnerEnv(env, input.Env)
	applyRunnerEnv(env, step.Env)
	env["GIT_HOST_ACTIONS_REPOSITORY_ID"] = input.RepositoryID
	env["GIT_HOST_ACTIONS_RUN_ID"] = input.RunID
	env["GIT_HOST_ACTIONS_WORKFLOW_ID"] = input.WorkflowID
	env["GIT_HOST_ACTIONS_COMMIT"] = input.CommitHash
	env["GIT_HOST_ACTIONS_REF"] = input.Ref
	env["GIT_HOST_ACTIONS_BRANCH"] = input.Branch
	env["GIT_HOST_ACTIONS_RELEASE_ID"] = input.ReleaseID
	return envRows(env)
}

func applyRunnerEnv(target map[string]string, input map[string]string) {
	for key, value := range input {
		if strings.TrimSpace(key) == "" {
			continue
		}
		target[key] = value
	}
}

func envRows(values map[string]string) []string {
	rows := make([]string, 0, len(values))
	for key, value := range values {
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
