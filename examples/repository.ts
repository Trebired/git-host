import { resolveRepositoryPath } from "#fcd73bf294d5";

function resolveExampleRepository(repositoriesRoot: string, repositoryKey: string) {
  return {
    id: repositoryKey,
    path: resolveRepositoryPath({
        repositoryPath: `${repositoryKey}/workspace`,
        rootDir: repositoriesRoot,
    }),
  };
}

function createExampleRepositoryResolver(repositoriesRoot: string) {
  return (repositoryKey: string) =>
  resolveExampleRepository(repositoriesRoot, repositoryKey);
}

export { createExampleRepositoryResolver, resolveExampleRepository };
