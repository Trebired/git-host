import { GitHostError } from "../../errors.js";
import type {
  CherryPickInput,
  CommitInput,
  ContinueOperationInput,
  DiscardPathsInput,
  GitRepositoryHandle,
  MergeInput,
  RebaseInput,
  StagePathsInput,
  UnstagePathsInput,
} from "../../types.js";
import { isTruthy, text } from "../../utils/text.js";
import { readRepositoryOperationState } from "../operation_state.js";
import { readRepositoryStatus } from "../repository.js";
import { buildGitEnv, runGit } from "../run_git.js";
import { assertRepositoryReady, normalizePathList, repositoryHasHead } from "./shared.js";

async function stageRepositoryPaths(repository: GitRepositoryHandle, input: StagePathsInput = {}): Promise<void> {
  await assertRepositoryReady(repository);
  const paths = normalizePathList(input && input.paths);
  const addRes = await runGit(paths.length ? ["add", "--", ...paths] : ["add", "-A"], {
    cwd: repository.path,
  });
  if (!addRes.ok) {
    throw new GitHostError("git_command_failed", text(addRes.stderr, "Failed to stage repository changes."), {
      repositoryId: repository.id,
      paths,
    });
  }
}

async function unstageRepositoryPaths(repository: GitRepositoryHandle, input: UnstagePathsInput = {}): Promise<void> {
  await assertRepositoryReady(repository);
  const paths = normalizePathList(input && input.paths);
  const hasHead = await repositoryHasHead(repository.path);
  const args = hasHead
    ? (paths.length ? ["restore", "--staged", "--", ...paths] : ["restore", "--staged", "--", "."])
    : (paths.length ? ["rm", "-r", "--cached", "--ignore-unmatch", "--", ...paths] : ["rm", "-r", "--cached", "--ignore-unmatch", "."]);
  const unstageRes = await runGit(args, { cwd: repository.path });
  if (!unstageRes.ok) {
    throw new GitHostError("git_command_failed", text(unstageRes.stderr, "Failed to unstage repository changes."), {
      repositoryId: repository.id,
      paths,
    });
  }
}

async function discardRepositoryPaths(repository: GitRepositoryHandle, input: DiscardPathsInput = {}): Promise<void> {
  await assertRepositoryReady(repository);
  const paths = normalizePathList(input && input.paths);
  const hasHead = await repositoryHasHead(repository.path);
  const removeUntracked = isTruthy(input && input.removeUntracked);

  if (hasHead) {
    const restoreArgs = paths.length
      ? ["restore", "--staged", "--worktree", "--source=HEAD", "--", ...paths]
      : ["restore", "--staged", "--worktree", "--source=HEAD", "--", "."];
    const restoreRes = await runGit(restoreArgs, { cwd: repository.path });
    if (!restoreRes.ok) {
      throw new GitHostError("git_command_failed", text(restoreRes.stderr, "Failed to discard repository changes."), {
        repositoryId: repository.id,
        paths,
      });
    }
  }

  if (removeUntracked || !hasHead) {
    const cleanArgs = paths.length ? ["clean", "-fd", "--", ...paths] : ["clean", "-fd"];
    const cleanRes = await runGit(cleanArgs, { cwd: repository.path });
    if (!cleanRes.ok) {
      throw new GitHostError("git_command_failed", text(cleanRes.stderr, "Failed to remove untracked files."), {
        repositoryId: repository.id,
        paths,
      });
    }
  }
}

async function commitRepository(repository: GitRepositoryHandle, input: CommitInput): Promise<void> {
  await assertRepositoryReady(repository);

  const message = text(input && input.message);
  if (!message) {
    throw new GitHostError("git_command_failed", "Commit message is required.", {
      repositoryId: repository.id,
    });
  }

  const status = await readRepositoryStatus(repository.path);
  if (status.clean) {
    throw new GitHostError("git_command_failed", "No repository changes to commit.", {
      repositoryId: repository.id,
    });
  }
  if (!Number(status.staged)) {
    throw new GitHostError("git_command_failed", "Stage changes before creating a commit.", {
      repositoryId: repository.id,
    });
  }

  const commitRes = await runGit(["commit", "-m", message], {
    cwd: repository.path,
    env: buildGitEnv({ actor: input && input.actor ? input.actor : null }),
  });
  if (!commitRes.ok) {
    throw new GitHostError("git_command_failed", text(commitRes.stderr, "Failed to create repository commit."), {
      repositoryId: repository.id,
    });
  }
}

async function mergeRepository(repository: GitRepositoryHandle, input: MergeInput = {}): Promise<void> {
  await assertRepositoryReady(repository);
  const ref = text(input && input.ref);
  if (!ref) {
    throw new GitHostError("git_command_failed", "A merge ref is required.", {
      repositoryId: repository.id,
    });
  }

  const verifyRes = await runGit(["rev-parse", "--verify", `${ref}^{commit}`], { cwd: repository.path });
  if (!verifyRes.ok) {
    throw new GitHostError("git_command_failed", text(verifyRes.stderr, "That merge ref does not exist."), {
      ref,
      repositoryId: repository.id,
    });
  }

  const args = ["merge"];
  if (isTruthy(input && input.ffOnly)) args.push("--ff-only");
  if (isTruthy(input && input.noCommit)) args.push("--no-commit");
  args.push(ref);

  const mergeRes = await runGit(args, {
    cwd: repository.path,
    env: buildGitEnv({ actor: input && input.actor ? input.actor : null }),
  });
  if (!mergeRes.ok) {
    throw new GitHostError("git_command_failed", text(mergeRes.stderr, "Failed to merge repository ref."), {
      ref,
      repositoryId: repository.id,
    });
  }
}

async function rebaseRepository(repository: GitRepositoryHandle, input: RebaseInput = {}): Promise<void> {
  await assertRepositoryReady(repository);
  const ref = text(input && input.ref);
  if (!ref) {
    throw new GitHostError("git_command_failed", "A rebase ref is required.", {
      repositoryId: repository.id,
    });
  }

  const verifyRes = await runGit(["rev-parse", "--verify", `${ref}^{commit}`], { cwd: repository.path });
  if (!verifyRes.ok) {
    throw new GitHostError("git_command_failed", text(verifyRes.stderr, "That rebase ref does not exist."), {
      ref,
      repositoryId: repository.id,
    });
  }

  const onto = text(input && input.onto);
  if (onto) {
    const ontoVerifyRes = await runGit(["rev-parse", "--verify", `${onto}^{commit}`], { cwd: repository.path });
    if (!ontoVerifyRes.ok) {
      throw new GitHostError("git_command_failed", text(ontoVerifyRes.stderr, "That rebase onto ref does not exist."), {
        onto,
        repositoryId: repository.id,
      });
    }
  }

  const args = onto ? ["rebase", "--onto", onto, ref] : ["rebase", ref];
  const rebaseRes = await runGit(args, {
    cwd: repository.path,
    env: buildGitEnv({ actor: input && input.actor ? input.actor : null }),
  });
  if (!rebaseRes.ok) {
    throw new GitHostError("git_command_failed", text(rebaseRes.stderr, "Failed to rebase repository branch."), {
      onto,
      ref,
      repositoryId: repository.id,
    });
  }
}

async function cherryPickRepository(repository: GitRepositoryHandle, input: CherryPickInput = {}): Promise<void> {
  await assertRepositoryReady(repository);
  const refsInput = input && input.refs;
  const refs = Array.isArray(refsInput)
    ? refsInput.map((entry) => text(entry)).filter(Boolean)
    : [text(refsInput)].filter(Boolean);
  if (!refs.length) {
    throw new GitHostError("git_command_failed", "At least one cherry-pick ref is required.", {
      repositoryId: repository.id,
    });
  }

  for (const ref of refs) {
    const verifyRes = await runGit(["rev-parse", "--verify", `${ref}^{commit}`], { cwd: repository.path });
    if (!verifyRes.ok) {
      throw new GitHostError("git_command_failed", text(verifyRes.stderr, "That cherry-pick ref does not exist."), {
        ref,
        repositoryId: repository.id,
      });
    }
  }

  const args = ["cherry-pick"];
  if (isTruthy(input && input.noCommit)) args.push("--no-commit");
  if (Number(input && input.mainline) > 0) args.push("-m", String(Number(input && input.mainline)));
  args.push(...refs);

  const cherryPickRes = await runGit(args, {
    cwd: repository.path,
    env: buildGitEnv({ actor: input && input.actor ? input.actor : null }),
  });
  if (!cherryPickRes.ok) {
    throw new GitHostError("git_command_failed", text(cherryPickRes.stderr, "Failed to cherry-pick repository commit."), {
      refs,
      repositoryId: repository.id,
    });
  }
}

async function continueRepositoryOperation(repository: GitRepositoryHandle, input: ContinueOperationInput = {}): Promise<void> {
  await assertRepositoryReady(repository);

  const operation = readRepositoryOperationState(repository.path);
  if (!operation.in_progress) {
    throw new GitHostError("git_command_failed", "No repository operation is in progress.", {
      repositoryId: repository.id,
    });
  }

  const commands: Record<string, string[]> = {
    merge: ["commit", "--no-edit"],
    rebase: ["rebase", "--continue"],
    "cherry-pick": ["cherry-pick", "--continue"],
    revert: ["revert", "--continue"],
  };
  const args = commands[operation.kind] || [];
  if (!args.length) {
    throw new GitHostError("git_command_failed", "That repository operation cannot be continued.", {
      repositoryId: repository.id,
      operation: operation.kind,
    });
  }

  const continueRes = await runGit(args, {
    cwd: repository.path,
    env: buildGitEnv({
      actor: input && input.actor ? input.actor : null,
      extraEnv: {
        GIT_EDITOR: "true",
      },
    }),
  });
  if (!continueRes.ok) {
    throw new GitHostError("git_command_failed", text(continueRes.stderr, "Failed to continue repository operation."), {
      repositoryId: repository.id,
      operation: operation.kind,
    });
  }
}

async function abortRepositoryOperation(repository: GitRepositoryHandle): Promise<void> {
  await assertRepositoryReady(repository);

  const operation = readRepositoryOperationState(repository.path);
  if (!operation.in_progress) {
    throw new GitHostError("git_command_failed", "No repository operation is in progress.", {
      repositoryId: repository.id,
    });
  }

  const commands: Record<string, string[]> = {
    merge: ["merge", "--abort"],
    rebase: ["rebase", "--abort"],
    "cherry-pick": ["cherry-pick", "--abort"],
    revert: ["revert", "--abort"],
  };
  const args = commands[operation.kind] || [];
  if (!args.length) {
    throw new GitHostError("git_command_failed", "That repository operation cannot be aborted.", {
      repositoryId: repository.id,
      operation: operation.kind,
    });
  }

  const abortRes = await runGit(args, { cwd: repository.path });
  if (!abortRes.ok) {
    throw new GitHostError("git_command_failed", text(abortRes.stderr, "Failed to abort repository operation."), {
      repositoryId: repository.id,
      operation: operation.kind,
    });
  }
}

export {
  abortRepositoryOperation,
  cherryPickRepository,
  commitRepository,
  continueRepositoryOperation,
  discardRepositoryPaths,
  mergeRepository,
  rebaseRepository,
  stageRepositoryPaths,
  unstageRepositoryPaths,
};
