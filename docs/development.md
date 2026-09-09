# Development

The root pnpm scripts are the source of truth for repository tasks.

## Validation

Choose verification by the affected boundary:

- `pnpm validate` runs lint, type checks, service/component tests, and the build.
- `pnpm test:electron browser plugins` checks web and local native widget surfaces.
- `pnpm test:electron workspace` checks dashboard/workspace transitions.
- `pnpm test:electron storage resources` checks scoped persistence and sharing.
- `pnpm test:electron` runs all five native scenarios for cross-cutting changes
  and release checks. Each selected scenario runs once, with its own temporary
  profile and bounded application cleanup; an unknown scenario fails explicitly.

A cosmetic change normally needs the relevant component checks and visual QA,
plus a native scenario only when native views or input are affected. Detailed
validation rules belong in service tests; native tests exercise real preload,
IPC, process isolation, and persistence wiring. See
[Electron test responsibilities](../apps/desktop/test/e2e/README.md) before
adding another end-to-end assertion.

`pnpm lint` also validates repository boundaries, including catalog and
workspace dependency declarations, renderer privilege isolation, and the
runtime neutrality of public plugin and ACP contracts.

`pnpm test` runs Node.js unit and integration tests and headless Chromium browser tests.
Tests live under each workspace's `test/unit/` or `test/integration/`, mirroring
the source subtree. Desktop Vitest projects separate `unit`, `integration`, and
`browser` execution; `test/e2e/` is run separately by `pnpm test:electron`.
Browser tests use the `*.browser.test.ts` suffix and cover renderer plugin DOM
behavior; they do not replace Electron main/preload integration testing.
Before the first browser test run, install Chromium with:

```sh
pnpm --filter @avesd/desktop exec playwright install chromium
```

## Dependency maintenance

- `pnpm depcheck` reports outdated dependencies across the workspace.
- `pnpm ud` updates within declared ranges and deduplicates the lockfile.
- `pnpm update-all` updates all workspace dependencies to their latest stable
  versions, updates referenced GitHub Actions, and deduplicates the lockfile.
- `pnpm iud` installs, updates within declared ranges, deduplicates, and updates
  the pinned pnpm version.

Equivalent Make targets provide short, stable entry points such as `make dev`,
`make validate`, and `make update-all`; running plain `make` performs no work.
