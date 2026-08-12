import { GitHostError } from "#8974ac53d713";
import type { GitRepositoryHandle, GitSourceArchiveFormat } from "#14021226ec9b";
import { text } from "#62f869522d1f";
import { runGit } from "#96b00569f1f4";

async function resolveArchiveCommit(repository: GitRepositoryHandle, ref: string, format: GitSourceArchiveFormat): Promise<string> {
  const commitRes = await runGit(["rev-parse", "--verify", `${ref}^{commit}`], {
      cwd: repository.path,
  });
  if (commitRes.ok) return text(commitRes.stdout);

  const headRes = await runGit(["rev-parse", "--verify", "HEAD^{commit}"], {
      cwd: repository.path,
  });
  if (!headRes.ok) {
    throw new GitHostError("repository_empty", `Repository "${repository.id}" is empty, so ref "${ref}" cannot be archived as "${format}".`, {
        format,
        ref,
        repositoryId: repository.id,
    });
  }

  throw new GitHostError("archive_ref_not_found", `Archive ref "${ref}" was not found in repository "${repository.id}" for format "${format}".`, {
      format,
      ref,
      repositoryId: repository.id,
  });
}

function createArchiveGenerationError(
  repository: GitRepositoryHandle,
  ref: string,
  format: GitSourceArchiveFormat,
  stderr: string,
): GitHostError {
  return new GitHostError(
    "archive_generation_failed",
    text(stderr, `Failed to generate archive "${format}" for ref "${ref}" in repository "${repository.id}".`),
    {
      format,
      ref,
      repositoryId: repository.id,
    },
  );
}

export { createArchiveGenerationError, resolveArchiveCommit };
