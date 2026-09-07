# Avesd Core Monorepo

Avesd is the kiosk that grows with you: a local-first, extensible desktop
workspace that gains capabilities through replaceable plugins. The first
product is an Electron application; optional account and cloud capabilities can
be added later without becoming a dependency of the local workflow.

## Prerequisites

- Node.js 24 (see `.nvmrc`)
- Corepack
- pnpm 11.23.0 (pinned in `package.json`)

## Common commands

```sh
pnpm install
pnpm dev
pnpm lint
pnpm compile
pnpm test
pnpm build
pnpm validate
```

The root pnpm scripts are the source of truth for repository tasks. Equivalent
Make targets provide short, stable entry points such as `make dev`,
`make validate`, and `make update-all`; running plain `make` performs no work.

Dependency maintenance commands:

- `pnpm depcheck` reports outdated dependencies across the workspace.
- `pnpm ud` updates within declared ranges and deduplicates the lockfile.
- `pnpm update-all` updates all workspace dependencies to their latest stable
  versions, updates referenced GitHub Actions, and deduplicates the lockfile.
- `pnpm iud` installs, updates within declared ranges, deduplicates, and updates
  the pinned pnpm version.

`pnpm lint` also validates repository boundaries, including catalog and
workspace dependency declarations, renderer privilege isolation, and the
runtime neutrality of public plugin and ACP contracts.

`pnpm test` runs fast Node.js unit tests and headless Chromium browser tests.
Browser tests use the `*.browser.test.ts` suffix and cover renderer plugin DOM
behavior; they do not replace Electron main/preload integration testing.
Before the first browser test run, install Chromium with
`pnpm --filter @avesd/desktop exec playwright install chromium`.

## Repository layout

- `apps/desktop` — Electron main, preload, and React renderer processes.
- `packages/acp-client` — provider-neutral ACP v1 client boundary.
- `packages/configuration` — shared TypeScript, ESLint, and Vitest defaults.
- `packages/kernel` — Cordis-backed plugin lifecycle adapter and contribution
  registries.
- `packages/plugin-api` — stable contracts implemented by plugins.
- `packages/plugin-data` — runtime-neutral local data-source contributions.
- `packages/plugin-ui` — framework-neutral renderer widget contracts and
  contribution points.
- `packages/workspace-model` — runtime-neutral workspace, dashboard, widget, and
  data-source ownership contracts.
- `.agents/common-skills-policy.md` and `.agents/audit-policy.md` — local
  repository policy for globally installed shared skills.
- `working` — non-authoritative audits, plans, notes, and archived project
  memory.

## Runtime architecture

Avesd keeps a small trusted Electron host and moves product capabilities into
replaceable plugins. The internal runtime uses upstream Cordis, hidden behind
`@avesd/plugin-api`, so public plugins do not depend on the runtime framework.
Plugin registrations are reversible effects: activating a new version adds its
contributions first, then disposes the previous version in reverse registration
order. Failed activation removes only the candidate's effects, leaving the
previous version active.

Plugins interact with the host through two explicit surfaces on their activation
context. `contributions` publishes typed extension points such as workbench
views, while `services` contains only the storage, command, or external-opening
capabilities declared by the plugin and authorized by the host. The kernel binds
service scopes to the plugin identifier before activation, so plugin code cannot
select another plugin's service namespace. Concrete persistence and privileged
desktop implementations remain outside the runtime-neutral public API.

Product data has a separate scope hierarchy. A workspace owns dashboards and
shared data sources; a dashboard owns its widget instances, private data
sources, and view state. Deleting a dashboard removes its widgets and private
sources without deleting shared workspace data. Widget instances own their
input bindings, and binding transactions reject invisible or type-incompatible
sources. Repository operations carry an explicit workspace scope, while the
kernel-injected plugin identifier remains an orthogonal security namespace.

The desktop persists a versioned workspace snapshot under Electron's user-data
directory. Renderer code reaches it only through a typed preload API; the main
process validates the envelope and writes a private temporary file before an
atomic rename. The runtime-neutral repository remains usable with memory-only
or alternative persistence drivers.

Each dashboard uses a host-owned 24-column logical grid with unbounded rows.
Plugins contribute widget definitions with fixed or ranged size policies; the
host records the contributing plugin identity and validates every placement.
Manual controls and agents share one transactional layout service, so invalid,
overlapping, out-of-bounds, or stale layout batches are rejected before storage.
The grid is an invisible layout boundary in normal use: widget plugins render
their entire assigned region without host-provided cards, borders, headers, or
padding. Grid guides and layout controls appear only while editing.

Renderer widgets use the framework-neutral `@avesd/plugin-ui` contract. The
host provides an unstyled Shadow DOM root and scoped context, calls the returned
controller when configuration or size changes, and disposes it on removal or
plugin replacement. Widget configuration is versioned JSON with optional schema
metadata for future settings UI and agent tooling. React is an implementation
choice of an individual widget rather than part of the public widget API.

The renderer welcome screen is the first built-in UI plugin and participates in
Vite hot module replacement. External plugin discovery, compilation, sandboxing,
and persisted installation are intentionally not implemented yet.

The desktop also includes a minimal built-in agent overlay plugin. It opens from
the top-right corner and talks to a main-process agent service through typed IPC.
The first provider implementation launches the pinned `codex-acp` adapter over
stdio and creates a local Codex session. The session receives a dedicated local
MCP server exposing the same inspected, revisioned dashboard and data-source
operations as the manual editor. Only tools with the host-owned `avesd_` prefix
are allowed once automatically; unrelated permission requests remain denied.

AI harnesses connect through ACP. The client package owns protocol lifecycle and
capability negotiation while concrete process transports and account
authentication remain outside the protocol-neutral core.
