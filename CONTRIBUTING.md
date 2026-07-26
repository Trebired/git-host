# Contributing

Thanks for helping improve `@trebired/git-host`.

## Development Setup

```sh
bun install
```

The package is authored in TypeScript and published from `dist`. Generated outputs, package tarballs, temp folders, logs, and caches stay out of Git.

## Common Commands

```sh
bun install --frozen-lockfile
bunx @trebired/code-discipline check
bun run typecheck
bun run build
bun run verify:pack
```

There is no package test script. Committed `*.spec.ts` and `*.spec.tsx` files are banned by Code Discipline.

## Pull Request Checklist

- Keep public API changes intentional and documented in `README.md`.
- Run Code Discipline, typecheck, build, and package verification when present.
- Run `bun run verify:pack` before publish work.
- Update `CHANGELOG.md` under the current version or a new version section.
- Do not commit `dist`, package tarballs, temp folders, logs, or caches.

## Code Discipline

- Keep the config at `.code-discipline/config.ts`.
- Use `syncImports.output.type: "alias-map"`.
- Keep `allowRelative: ["./"]`.
- Do not add rule-level excludes to bypass discipline.
- Keep `@trebired/code-discipline` in `devDependencies`.
- Keep hardcoded `trebired` strings out of source files unless the package config explicitly allows the file.

## Design Principles

- Keep the reusable boundary smaller than the product-specific code around it.
- Use the real Git CLI instead of reimplementing Git behavior.
- Keep auth, permissions, and persistence host-owned.
- Keep the React companion headless and optional instead of shipping a bundled UI.
- Prefer logger support that matches `@trebired/logger`'s method shape.
- Prefer explicit repository path resolution over path guessing.
- Avoid runtime dependencies unless they remove meaningful complexity.

## Release Process

1. Update `package.json` and `CHANGELOG.md` together.
2. Run the verification commands from Common Commands.
3. Publish with:

   ```sh
   npm publish
   ```

`npm publish` runs `prepublishOnly`, which typechecks and runs the package publish verification path.
