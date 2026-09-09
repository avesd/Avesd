# Avesd Core Monorepo

Avesd is the kiosk that grows with you: a local-first, extensible desktop
workspace that gains capabilities through replaceable plugins. The first
product is an Electron application; optional account and cloud capabilities can
be added later without becoming a dependency of the local workflow.

## Prerequisites

- Node.js 24 (see `.nvmrc`)
- Corepack
- pnpm 11.23.0 (pinned in `package.json`)

## Getting started

```sh
pnpm install
pnpm dev
```

Use the root pnpm scripts for repository tasks:

```sh
pnpm lint
pnpm compile
pnpm test
pnpm build
pnpm validate
```

Equivalent Make targets provide short, stable entry points such as `make dev`,
`make validate`, and `make update-all`; running plain `make` performs no work.
See [Development](docs/development.md) for test selection, validation boundaries,
browser test setup, and dependency maintenance.

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
- `packages/ui` — internal React components and design tokens for trusted Avesd
  product surfaces.
- `packages/workspace-model` — runtime-neutral workspace, dashboard, widget, and
  data-source ownership contracts.
- `.agents/common-skills-policy.md` and `.agents/audit-policy.md` — local
  repository policy for globally installed shared skills.
- `working` — non-authoritative audits, plans, notes, and archived project
  memory.

Desktop code preserves process boundaries and groups related files by feature:

```text
apps/desktop/
  src/
    main/
      index.ts              # Application composition and lifecycle
      agent/                # Agent transport, tools, permissions, MCP entry
      browser/              # Native web surfaces and browser bindings
      plugins/              # Local authoring, installation, sandboxed views
      storage/              # Config, workspace files, scoped storage, resources
      workspace/            # Workbench orchestration and widget service bridge
    preload/                # Narrow privileged bridges
    shared/
      browser/              # Browser IPC contracts
      plugins/              # Local plugin IPC contracts
      storage/              # File, SQLite, and resource contracts/facades
      workspace/            # Widget workspace contracts/facades
      desktop-api.ts        # Aggregate preload API
      widget-appearance.ts  # DOM/native geometry
    renderer/src/
      components/           # Dashboard shell and widget hosting
      workbench/            # Renderer orchestration
      plugins/              # One directory per built-in plugin/adapter
  tests/electron/
    support/                # Shared isolated desktop lifecycle and helpers
    *.test.mjs              # Independently runnable native scenarios
    run.mjs                 # Explicit scenario selection
```

Keep unit and component tests beside the code they cover. Add a feature folder
when several related files need a home; avoid generic `utils` folders, barrel
exports, or new packages solely to shorten paths. Build output entry names stay
stable even when their source files move.

## Architecture overview

Avesd keeps a small trusted Electron host and moves product capabilities into
replaceable plugins. Renderer code reaches privileged behavior only through
narrow typed preload APIs and explicit IPC contracts. The internal runtime uses
Cordis behind `@avesd/plugin-api`, so public plugins do not depend on the runtime
framework.

Workspaces own dashboards and shared data sources. Dashboards own widget
instances, private data sources, and view state. Plugin identity is a separate
security namespace injected by the kernel. Layout, navigation, persistence, and
permission changes pass through host-owned transactional services.

The local workflow requires no account or cloud service. Workspace snapshots,
plugin data, browser grants, and application settings remain on the user's
machine. Sandboxed local widgets and embedded web pages receive only explicitly
declared, host-mediated capabilities.

See [Runtime architecture](docs/runtime-architecture.md) for the complete model.

## Documentation

- [Development](docs/development.md) — validation, tests, and dependency tasks.
- [Runtime architecture](docs/runtime-architecture.md) — process boundaries,
  workspace ownership, navigation, persistence, and Agent integration.
- [Application configuration](docs/application-configuration.md) — local data
  directory configuration and migration.
- [Local widgets](docs/local-widgets.md) — Agent-authored widgets, private
  storage, shared resources, testing, and activation.
- [Browser widgets](docs/browser-widgets.md) — embedded pages, script tools, and
  browser control bindings.
