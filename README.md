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

### Embedded web widgets

The built-in **Web page** widget embeds a sandboxed `WebContentsView` managed by
the desktop main process. Add it from **Edit layout**, leave editing, enter an
HTTPS URL (HTTP is supported on loopback hosts), and choose **Go**. Its **Tools**
panel supports active-document JavaScript in either an isolated world or the
page world, plus CSS insertion. Each run requires explicitly enabling that
script for the displayed origin; editing the script or navigating clears this
selection. Both JavaScript modes can read and change the page using its login
session. Isolation is not a read-only permission.

Add a **Web result** widget and bind its **Web output** input to the page's
temporary output in **Edit layout**. Script JSON results are available to bound
widgets in the same dashboard. These outputs are read-only, capped at 64 KiB,
and kept in memory: they are not workspace data records and are not returned by
the workspace MCP server. Layout and binding identifiers persist, but URLs,
scripts, extracted values, and browser sessions do not. Reload/navigation clears
the result; **Clear result** also clears it without navigating. Removing the
page destroys its browser and invalidates the output.

This first implementation serves trusted built-in widgets, not sandboxed
third-party plugin code. Remote pages receive no host preload or Electron APIs.
Each instance uses a separate in-memory session; browser permissions, downloads,
and new windows are denied. Up to eight page instances can be open. Script
execution targets the current main document, rejects stale results after
navigation, and limits the caller's wait to five seconds. A timeout does not
undo page actions or guarantee script termination; reload to recover.

Native browser views are hidden while layout editing, the Agent panel, or the
page's tools are open, and when a page viewport is partly outside the window.
Scroll the widget fully into view to interact with it. This avoids treating DOM
z-index or resized native bounds as reliable clipping. Document-start hooks,
worker/subframe automation, network interception, retained/shared browser
profiles, and Agent script execution are not implemented. Website login and
popup compatibility are not universal. Ordinary local widgets remain usable
without network access.

Run `pnpm test:electron` for the native integration test. It builds the desktop,
opens an isolated temporary profile, serves a synthetic loopback page, and
checks sandbox settings, JS/CSS execution, temporary binding, navigation races,
and teardown. It does not use the user's browser profile or connect an Agent.
Native visual QA remains a separate check on an unlocked desktop.

### Browser control bindings

Add **Browser controls** to operate a separate **Web page** widget. In
**Edit layout → Browser control bindings**, choose its target instance, enter
the allowed website origin, select `extract`, `navigate`, and/or `click`, and
save. No actions are granted by default. Choose **Not connected** and save to
revoke the binding. Each controller currently has one input named `browser`.
The controller provides **Read text**, **Navigate**, and **Click element** buttons;
selectors and destination URLs entered there are temporary.

Bindings refer to stable instance IDs, not plugin IDs, display order, grid
position, or temporary browser handles. A plugin supplies widget types; a
dashboard owns their instances. Bindings are restricted to supported trusted
controllers and target browsers in the same dashboard. Moving either instance
preserves the binding; removing an endpoint invalidates it without retargeting
another browser. Grants persist in `browser-bindings-v1.json`, owned and written
only by main, outside the renderer/MCP workspace snapshot. A failed save does
not install a new grant. Invalid grant storage disables browser controls while
leaving the local dashboard available.

The host gives controller widgets a `WidgetBrowserService` scoped to their own
instance. Calls use the input name; callers do not select a target ID. Main
resolves the binding and checks the operation, both instances, dashboard,
actual origin, and document generation. Navigation destinations must match the
allowed origin. Field extraction uses host-owned text selectors and bounded
JSON, and publishes to the browser's existing temporary output. Click dispatches
a DOM `.click()` on exactly one HTML element; it is not native trusted input.
The control interface does not accept arbitrary JavaScript. Revocation or
navigation discards pending results; it cannot undo already dispatched actions.

These are host-enforced control rules for trusted built-in widgets, not a
security sandbox between renderer plugins. The renderer is still one trusted
execution environment with access to the host administration API. Remote pages
do not have that API. Untrusted third-party plugins and Agent control grants
remain unsupported.

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
