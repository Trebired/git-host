import { GitHostError } from "../../errors.js";
import type { CheckoutBranchInput, CheckoutRefInput, CreateBranchInput, DeleteBranchInput, GitHost, ListCommitsOptions } from "../../types.js";
import { isTruthy, text } from "../../utils/text.js";
import { readRepositoryBranches, readRepositoryCommits } from "../repository.js";
import { repositoryExists, runGit } from "../run_git.js";
import type { GitHostMethodContext } from "./shared.js";
import { toGitHostError } from "./shared.js";

function createBranchMethods(context: GitHostMethodContext): Pick<
  GitHost,
  "checkoutBranch" | "checkoutRef" | "createBranch" | "deleteBranch" | "listBranches" | "listCommits"
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
        return await readRepositoryCommits(repository.path, listOptions.limit);
      } catch (error) {
        throw toGitHostError(error, "git_command_failed", "Failed to list repository commits.");
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
  };
}

export { createBranchMethods };
