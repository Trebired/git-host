import { GitHostError } from "../../errors.js";
import { buildGitEnv } from "../run_git.js";
import type {
  CheckoutBranchInput,
  CheckoutRefInput,
  CreateBranchInput,
  CreateTagInput,
  DeleteBranchInput,
  DeleteTagInput,
  GitHost,
  ListCommitsOptions,
} from "../../types.js";
import { isTruthy, text } from "../../utils/text.js";
import { readRepositoryBranches, readRepositoryCommits, readRepositoryTag, readRepositoryTags } from "../repository.js";
import { repositoryExists, runGit } from "../run_git.js";
import type { GitHostMethodContext } from "./shared.js";
import { toGitHostError } from "./shared.js";

function createBranchMethods(context: GitHostMethodContext): Pick<
  GitHost,
  "checkoutBranch" | "checkoutRef" | "createBranch" | "createTag" | "deleteBranch" | "deleteTag" | "listBranches" | "listCommits" | "listTags" | "readTag"
> {
  const { ensureRepositoryInner, lockManager, readSummaryForRepository, resolveRepository } = context;

  return {
    async listBranches(repositoryId: string) {
      const repository = await resolveRepository(repositoryId);
      const hasRepository = await repositoryExists(repository.path);
      if (!hasRepository) {
        throw new GitHostError("repository_not_initialized", `Repository "${repository.id}" is not initialized.`, {
          path: repository.path,
          repositoryId: repository.id,
        });
      }

      try {
        return await readRepositoryBranches(repository.path);
      } catch (error) {
        throw toGitHostError(error, "git_command_failed", "Failed to list repository branches.");
      }
    },

    async listCommits(repositoryId: string, listOptions: ListCommitsOptions = {}) {
      const repository = await resolveRepository(repositoryId);
      const hasRepository = await repositoryExists(repository.path);
      if (!hasRepository) {
        throw new GitHostError("repository_not_initialized", `Repository "${repository.id}" is not initialized.`, {
          path: repository.path,
          repositoryId: repository.id,
        });
      }

      try {
        return await readRepositoryCommits(repository.path, listOptions);
      } catch (error) {
        throw toGitHostError(error, "git_command_failed", "Failed to list repository commits.");
      }
    },

    async listTags(repositoryId: string) {
      const repository = await resolveRepository(repositoryId);
      const hasRepository = await repositoryExists(repository.path);
      if (!hasRepository) {
        throw new GitHostError("repository_not_initialized", `Repository "${repository.id}" is not initialized.`, {
          path: repository.path,
          repositoryId: repository.id,
        });
      }

      try {
        return await readRepositoryTags(repository.path);
      } catch (error) {
        throw toGitHostError(error, "git_command_failed", "Failed to list repository tags.");
      }
    },

    async readTag(repositoryId: string, tagName: string) {
      const repository = await resolveRepository(repositoryId);
      const hasRepository = await repositoryExists(repository.path);
      if (!hasRepository) {
        throw new GitHostError("repository_not_initialized", `Repository "${repository.id}" is not initialized.`, {
          path: repository.path,
          repositoryId: repository.id,
        });
      }

      try {
        return await readRepositoryTag(repository.path, tagName);
      } catch (error) {
        throw toGitHostError(error, "git_command_failed", "Failed to read repository tag.");
      }
    },

    async createBranch(repositoryId: string, input: CreateBranchInput) {
      return await lockManager.withLock(text(repositoryId), async () => {
        const repository = await ensureRepositoryInner(repositoryId);
        const branchName = text(input && input.name);
        if (!branchName) throw new GitHostError("invalid_branch_name", "Branch name is required.");

        const formatRes = await runGit(["check-ref-format", "--branch", branchName], { cwd: repository.path });
        if (!formatRes.ok) {
          throw new GitHostError("invalid_branch_name", text(formatRes.stderr, "Invalid branch name."), {
            branch: branchName,
            repositoryId: repository.id,
          });
        }

        const args = ["branch", branchName];
        const startPoint = text(input && input.startPoint);
        if (startPoint) args.push(startPoint);

        const createRes = await runGit(args, { cwd: repository.path });
        if (!createRes.ok) {
          throw new GitHostError("git_command_failed", text(createRes.stderr, "Failed to create repository branch."), {
            branch: branchName,
            repositoryId: repository.id,
          });
        }

        if (isTruthy(input && input.checkout)) {
          const checkoutRes = await runGit(["checkout", branchName], { cwd: repository.path });
          if (!checkoutRes.ok) {
            throw new GitHostError("git_command_failed", text(checkoutRes.stderr, "Failed to switch to the new repository branch."), {
              branch: branchName,
              repositoryId: repository.id,
            });
          }
        }

        return await readSummaryForRepository(repository);
      });
    },

    async checkoutBranch(repositoryId: string, input: CheckoutBranchInput) {
      return await lockManager.withLock(text(repositoryId), async () => {
        const repository = await ensureRepositoryInner(repositoryId);
        const branchName = text(input && input.name);
        if (!branchName) throw new GitHostError("invalid_branch_name", "Branch name is required.");

        const checkoutRes = await runGit(["checkout", branchName], { cwd: repository.path });
        if (!checkoutRes.ok) {
          throw new GitHostError("git_command_failed", text(checkoutRes.stderr, "Failed to switch repository branch."), {
            branch: branchName,
            repositoryId: repository.id,
          });
        }

        return await readSummaryForRepository(repository);
      });
    },

    async checkoutRef(repositoryId: string, input: CheckoutRefInput) {
      return await lockManager.withLock(text(repositoryId), async () => {
        const repository = await ensureRepositoryInner(repositoryId);
        const ref = text(input && input.ref);
        if (!ref) throw new GitHostError("git_command_failed", "A ref is required.", { repositoryId: repository.id });

        const verifyRes = await runGit(["rev-parse", "--verify", `${ref}^{commit}`], { cwd: repository.path });
        if (!verifyRes.ok) {
          throw new GitHostError("git_command_failed", text(verifyRes.stderr, "That ref does not exist."), {
            ref,
            repositoryId: repository.id,
          });
        }

        const checkoutRes = await runGit(
          isTruthy(input && input.detach) ? ["checkout", "--detach", ref] : ["checkout", ref],
          { cwd: repository.path },
        );
        if (!checkoutRes.ok) {
          throw new GitHostError("git_command_failed", text(checkoutRes.stderr, "Failed to check out repository ref."), {
            ref,
            repositoryId: repository.id,
          });
        }

        return await readSummaryForRepository(repository);
      });
    },

    async deleteBranch(repositoryId: string, input: DeleteBranchInput) {
      return await lockManager.withLock(text(repositoryId), async () => {
        const repository = await ensureRepositoryInner(repositoryId);
        const branchName = text(input && input.name);
        if (!branchName) throw new GitHostError("invalid_branch_name", "Branch name is required.");

        const deleteRes = await runGit(["branch", isTruthy(input && input.force) ? "-D" : "-d", branchName], {
          cwd: repository.path,
        });
        if (!deleteRes.ok) {
          throw new GitHostError("git_command_failed", text(deleteRes.stderr, "Failed to delete repository branch."), {
            branch: branchName,
            repositoryId: repository.id,
          });
        }

        return await readSummaryForRepository(repository);
      });
    },

    async createTag(repositoryId: string, input: CreateTagInput = {}) {
      return await lockManager.withLock(text(repositoryId), async () => {
        const repository = await ensureRepositoryInner(repositoryId);
        const tagName = text(input && input.name);
        if (!tagName) throw new GitHostError("invalid_branch_name", "Tag name is required.");

        const formatRes = await runGit(["check-ref-format", `refs/tags/${tagName}`], { cwd: repository.path });
        if (!formatRes.ok) {
          throw new GitHostError("invalid_branch_name", text(formatRes.stderr, "Invalid tag name."), {
            repositoryId: repository.id,
            tag: tagName,
          });
        }

        const ref = text(input && input.ref, "HEAD");
        const verifyRes = await runGit(["rev-parse", "--verify", `${ref}^{object}`], { cwd: repository.path });
        if (!verifyRes.ok) {
          throw new GitHostError("git_command_failed", text(verifyRes.stderr, "That tag target does not exist."), {
            ref,
            repositoryId: repository.id,
            tag: tagName,
          });
        }

        const message = text(input && input.message);
        const args = message ? ["tag", "-a", tagName, "-m", message, ref] : ["tag", tagName, ref];
        const createRes = await runGit(args, {
          cwd: repository.path,
          env: buildGitEnv({ actor: input && input.actor ? input.actor : null }),
        });
        if (!createRes.ok) {
          throw new GitHostError("git_command_failed", text(createRes.stderr, "Failed to create repository tag."), {
            ref,
            repositoryId: repository.id,
            tag: tagName,
          });
        }

        return await readRepositoryTag(repository.path, tagName);
      });
    },

    async deleteTag(repositoryId: string, input: DeleteTagInput = {}) {
      return await lockManager.withLock(text(repositoryId), async () => {
        const repository = await ensureRepositoryInner(repositoryId);
        const tagName = text(input && input.name);
        if (!tagName) throw new GitHostError("invalid_branch_name", "Tag name is required.");

        const deleteRes = await runGit(["tag", "-d", tagName], { cwd: repository.path });
        if (!deleteRes.ok) {
          throw new GitHostError("git_command_failed", text(deleteRes.stderr, "Failed to delete repository tag."), {
            repositoryId: repository.id,
            tag: tagName,
          });
        }
      });
    },
  };
}

export { createBranchMethods };
