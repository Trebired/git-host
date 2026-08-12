import { GitHostError } from "#8974ac53d713";
import { buildGitEnv } from "#96b00569f1f4";
import type {
  CheckoutBranchInput,
  CheckoutRefInput,
  CreateBranchInput,
  CreateTagInput,
  DeleteBranchInput,
  DeleteTagInput,
  GitHost,
  GitRepositoryHandle,
} from "#14021226ec9b";
import { isTruthy, text } from "#62f869522d1f";
import { readRepositoryTag } from "#1fu49obi0gq3";
import { runGit } from "#96b00569f1f4";
import { createBranchReadMethods } from "./read_methods.js";
import type { GitHostMethodContext } from "#92b2mrh7s066";

function readRequiredName(value: unknown, message: string) {
  const name = text(value);
  if (!name) throw new GitHostError("invalid_branch_name", message);
  return name;
}

async function assertBranchName(repository: GitRepositoryHandle, branchName: string) {
  const formatRes = await runGit(
    ["check-ref-format", "--branch", branchName],
    { cwd: repository.path },
  );
  if (formatRes.ok) return;
  throw new GitHostError(
    "invalid_branch_name",
    text(formatRes.stderr, "Invalid branch name."),
    {
      branch: branchName,
      repositoryId: repository.id,
    },
  );
}

async function assertTagName(repository: GitRepositoryHandle, tagName: string) {
  const formatRes = await runGit(
    ["check-ref-format", `refs/tags/${tagName}`],
    { cwd: repository.path },
  );
  if (formatRes.ok) return;
  throw new GitHostError(
    "invalid_branch_name",
    text(formatRes.stderr, "Invalid tag name."),
    {
      repositoryId: repository.id,
      tag: tagName,
    },
  );
}

async function createRepositoryBranch(
  repository: GitRepositoryHandle,
  input: CreateBranchInput,
  branchName: string,
) {
  const args = ["branch", branchName];
  const startPoint = text(input && input.startPoint);
  if (startPoint) args.push(startPoint);

  const createRes = await runGit(args, { cwd: repository.path });
  if (createRes.ok) return;
  throw new GitHostError(
    "git_command_failed",
    text(createRes.stderr, "Failed to create repository branch."),
    {
      branch: branchName,
      repositoryId: repository.id,
    },
  );
}

async function checkoutRepositoryBranch(
  repository: GitRepositoryHandle,
  branchName: string,
  message: string,
) {
  const checkoutRes = await runGit(["checkout", branchName], {
      cwd: repository.path,
  });
  if (checkoutRes.ok) return;
  throw new GitHostError(
    "git_command_failed",
    text(checkoutRes.stderr, message),
    {
      branch: branchName,
      repositoryId: repository.id,
    },
  );
}

async function assertTagTarget(
  repository: GitRepositoryHandle,
  tagName: string,
  ref: string,
) {
  const verifyRes = await runGit(
    ["rev-parse", "--verify", `${ref}^{object}`],
    { cwd: repository.path },
  );
  if (verifyRes.ok) return;
  throw new GitHostError(
    "git_command_failed",
    text(verifyRes.stderr, "That tag target does not exist."),
    {
      ref,
      repositoryId: repository.id,
      tag: tagName,
    },
  );
}

async function writeRepositoryTag(
  repository: GitRepositoryHandle,
  input: CreateTagInput,
  tagName: string,
  ref: string,
) {
  const message = text(input && input.message);
  const args = message
  ? ["tag", "-a", tagName, "-m", message, ref]
  : ["tag", tagName, ref];
  const createRes = await runGit(args, {
      cwd: repository.path,
      env: buildGitEnv({
          actor: input && input.actor ? input.actor : null,
      }),
  });
  if (createRes.ok) return;
  throw new GitHostError(
    "git_command_failed",
    text(createRes.stderr, "Failed to create repository tag."),
    {
      ref,
      repositoryId: repository.id,
      tag: tagName,
    },
  );
}

function createBranchMethods(
  context: GitHostMethodContext,
): Pick<
GitHost,
|"checkoutBranch"
|"checkoutRef"
|"createBranch"
|"createTag"
|"deleteBranch"
|"deleteTag"
|"listBranches"
|"listCommits"
|"listTags"
|"readTag"
> {
  const {
    ensureRepositoryInner,
    lockManager,
    readSummaryForRepository,
  } = context;

  return {
    ...createBranchReadMethods(context),

    async createBranch(repositoryId: string, input: CreateBranchInput) {
      return await lockManager.withLock(text(repositoryId), async() => {
          const repository = await ensureRepositoryInner(repositoryId);
          const branchName = readRequiredName(input && input.name, "Branch name is required.");
          await assertBranchName(repository, branchName);
          await createRepositoryBranch(repository, input, branchName);
          if (isTruthy(input && input.checkout)) {
            await checkoutRepositoryBranch(
              repository,
              branchName,
              "Failed to switch to the new repository branch.",
            );
          }

          return await readSummaryForRepository(repository);
      });
    },

    async checkoutBranch(repositoryId: string, input: CheckoutBranchInput) {
      return await lockManager.withLock(text(repositoryId), async() => {
          const repository = await ensureRepositoryInner(repositoryId);
          const branchName = readRequiredName(input && input.name, "Branch name is required.");
          await checkoutRepositoryBranch(
            repository,
            branchName,
            "Failed to switch repository branch.",
          );
          return await readSummaryForRepository(repository);
      });
    },

    async checkoutRef(repositoryId: string, input: CheckoutRefInput) {
      return await lockManager.withLock(text(repositoryId), async() => {
          const repository = await ensureRepositoryInner(repositoryId);
          const ref = text(input && input.ref);
          if (!ref)
          throw new GitHostError("git_command_failed", "A ref is required.", {
              repositoryId: repository.id,
          });

          const verifyRes = await runGit(
            ["rev-parse", "--verify", `${ref}^{commit}`],
            { cwd: repository.path },
          );
          if (!verifyRes.ok) {
            throw new GitHostError(
              "git_command_failed",
              text(verifyRes.stderr, "That ref does not exist."),
              {
                ref,
                repositoryId: repository.id,
              },
            );
          }

          const checkoutRes = await runGit(
            isTruthy(input && input.detach)
            ? ["checkout", "--detach", ref]
            : ["checkout", ref],
            { cwd: repository.path },
          );
          if (!checkoutRes.ok) {
            throw new GitHostError(
              "git_command_failed",
              text(checkoutRes.stderr, "Failed to check out repository ref."),
              {
                ref,
                repositoryId: repository.id,
              },
            );
          }

          return await readSummaryForRepository(repository);
      });
    },

    async deleteBranch(repositoryId: string, input: DeleteBranchInput) {
      return await lockManager.withLock(text(repositoryId), async() => {
          const repository = await ensureRepositoryInner(repositoryId);
          const branchName = text(input && input.name);
          if (!branchName)
          throw new GitHostError(
            "invalid_branch_name",
            "Branch name is required.",
          );

          const deleteRes = await runGit(
            ["branch", isTruthy(input && input.force) ? "-D" : "-d", branchName],
            {
              cwd: repository.path,
            },
          );
          if (!deleteRes.ok) {
            throw new GitHostError(
              "git_command_failed",
              text(deleteRes.stderr, "Failed to delete repository branch."),
              {
                branch: branchName,
                repositoryId: repository.id,
              },
            );
          }

          return await readSummaryForRepository(repository);
      });
    },

    async createTag(repositoryId: string, input: CreateTagInput = {}) {
      return await lockManager.withLock(text(repositoryId), async() => {
          const repository = await ensureRepositoryInner(repositoryId);
          const tagName = readRequiredName(input && input.name, "Tag name is required.");
          await assertTagName(repository, tagName);
          const ref = text(input && input.ref, "HEAD");
          await assertTagTarget(repository, tagName, ref);
          await writeRepositoryTag(repository, input, tagName, ref);
          return await readRepositoryTag(repository.path, tagName);
      });
    },

    async deleteTag(repositoryId: string, input: DeleteTagInput = {}) {
      return await lockManager.withLock(text(repositoryId), async() => {
          const repository = await ensureRepositoryInner(repositoryId);
          const tagName = readRequiredName(input && input.name, "Tag name is required.");

          const deleteRes = await runGit(["tag", "-d", tagName], {
              cwd: repository.path,
          });
          if (!deleteRes.ok) {
            throw new GitHostError(
              "git_command_failed",
              text(deleteRes.stderr, "Failed to delete repository tag."),
              {
                repositoryId: repository.id,
                tag: tagName,
              },
            );
          }
      });
    },
  };
}

export { createBranchMethods };
