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

The desktop persists a versioned workspace snapshot in its configured data
directory (Electron's user-data directory by default). Renderer code reaches it
only through a typed preload API. A shared runtime-neutral validator checks JSON
fields, unique entity IDs, workspace/dashboard ownership, stored-source binding
visibility, and non-overlapping grid placements before a snapshot is accepted.
Temporary or plugin-provided binding identifiers remain resolvable by the live
data service without persisting their values or requiring an installed plugin.
The main process rejects invalid snapshots before writing a private temporary
file and atomically renaming it. The runtime-neutral repository remains usable
with memory-only or alternative persistence drivers.

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
The dashboard separates layout editing, grid controls, and widget mounting.
Scoped data, configuration, and browser services are assembled by the workbench;
the mounting component does not select privileges by plugin identity.

### Workspace data and widget navigation

The host has no fixed workspace or dashboard chooser. Widgets own navigation
UI; the floating Agent can query and manage workspaces even on an empty dashboard.
Local workspaces require no account. A workspace owns dashboards and shared
sources; each dashboard owns its widgets and private sources.

Widget contributions and local manifests can declare `catalog`, `navigation`,
and `management` capabilities. The host supplies only the declared services:

- `context.catalog.listWorkspaces()` returns `{id, name}[]`.
- `context.catalog.listDashboards(workspaceId)` returns `{id, name, workspaceId}[]`
  for that workspace without switching or reading its contents.
- `context.navigation.getCurrent()` returns the active workspace/dashboard pair;
  `select(scope)` requests a switch.
- Both read services expose `subscribe(listener)` as invalidation notifications.
  Consumers requery; subscriptions are released when the widget is disposed.
- `context.management.execute(command)` creates, renames, or deletes a dashboard
  or workspace. See the widget SDK for the typed command shapes.

These are projections and commands over the local repository, not ordinary
mutable business data sources. No layout, widget configuration, or source value
is included in directory responses. Widget mounting IDs remain fixed throughout
that widget's lifetime, independently of the current selection. The main process
checks declared capabilities and active instance ownership inside its transaction
queue. Local widgets have a separate narrow preload bridge authenticated by their
native view, with no access to the desktop renderer's host API.

Creating a workspace creates its first dashboard. Creation selects the new
workspace/dashboard. Deleting a dashboard removes its widgets and private sources
while retaining shared workspace data; deleting a workspace removes all of its
owned content. The last workspace and each workspace's last dashboard are
protected. Widgets own the interaction and any deletion confirmation.

Selection is an optional field in the version 1 workspace snapshot. Existing
snapshots retain their IDs and contents. The host bootstraps an existing or new
local dashboard when selection is absent. Management, navigation, and workspace
writes share one transaction queue; failed saves leave selection unchanged.
Deleting the active scope selects a remaining scope in the same transaction.

Switching unmounts old widgets, destroys their native browsers, and starts a fresh
Agent conversation on the next connection. Temporary widget/web state resets;
layouts, configuration, bindings, and persisted data remain. Old Agent credentials
and queued widget calls are rejected. Tests and previews receive their own
synthetic in-memory workspace and never modify the user's workspace. Preview
navigation changes synthetic selection without closing the preview, so tests can
inspect the result; live navigation disposes the originating widget.

The renderer welcome screen is the first built-in UI plugin and participates in
Vite hot module replacement. Local single-module widget plugins can also be
authored, tested, and installed through the Agent tools described below. General
third-party packages, dependency installation, and TypeScript compilation for
user plugins are not implemented.

### Application configuration

Avesd reads application settings from `~/.avesd/config.json` in the user's home
directory. Create the `.avesd` directory and `config.json` file to configure the
application. The currently supported setting is `dataDirectory`, an absolute
path to the product data directory:

```json
{
  "dataDirectory": "/absolute/path/to/avesd-data"
}
```

The configuration location stays fixed even when product data moves. It is
resolved from Electron's `app.getPath("home")`, independently of the current
working directory and Electron's user-data directory. On Windows, this is
normally `%USERPROFILE%\.avesd\config.json`.
Windows paths in JSON must escape backslashes, for example `"D:\\AvesdData"`.
Relative paths, `~`, and environment-variable expansion are not supported.

Quit Avesd before editing this file; the new location takes effect at startup.
The host creates the directory if needed and uses it for `workspace-v1.json`
and `browser-bindings-v1.json`. Plugin drafts and installed versions live in
`plugins/drafts` and `plugins/installed` beneath this directory. The Agent's MCP
relay calls the running desktop host, which owns the same workspace file.
Electron caches and preferences stay in userData;
built-in plugin code stays bundled with the application.

An absent configuration file or `{}` preserves the existing default data
location, Electron's `app.getPath("userData")`.
Invalid or unreadable configuration stops startup with an error instead of
silently opening another workspace. To preserve existing data when changing
directories, copy both data files into the destination while Avesd is closed,
then update the configuration and restart. Files are not automatically moved,
merged, or deleted; an empty destination starts a new local workspace. Use a
separate data directory for each running application instance. Copy the `plugins`
directory as well when migrating installed local widgets.

### Agent-authored local widgets

An ACP session receives the Avesd stdio MCP server. For a new widget, ask the
Agent to read `avesd_get_widget_sdk`, create a draft, write its JavaScript and
interaction tests, run them, inspect the returned preview, activate the passing
revision, and add the widget to the dashboard. These are real host tools; a
successful chat response alone is not a test or installation result.

The first authoring format contains one manifest, one JavaScript ES module, and
declarative tests. The module exports `mount(root, { signal })` and returns
`update({ configuration, size })` and `dispose()` methods. It renders into a
ShadowRoot inside an isolated native browser. The manifest supplies an
`avesd.local.*` plugin ID, a widget type ID, display name, semantic version, and
fixed grid size. Source is limited to 64 KiB. Read the SDK tool for the complete
contract and working counter example.

Tools are `avesd_create_plugin_draft`, `avesd_read_plugin_draft`,
`avesd_write_plugin_draft`, `avesd_test_plugin`, `avesd_preview_widget`, and
`avesd_activate_plugin`, followed by the existing `avesd_add_widget`. Draft writes
require the expected revision. Testing executes module loading, mount/update,
rendered-content and isolation checks, and 1–32 declared `click`, `fill`, or
`expectText` steps, then exercises disposal. Reports identify the source revision
and return a PNG when available. Preview opens one separate window and returns
its image. These checks do not establish full visual correctness or prove the
absence of resource leaks; the Agent should inspect the image and the user can
exercise the preview.

Activation requires a passing report for the exact current draft revision in
the current desktop session. Editing invalidates the report; failed or stale
tests cannot replace an installed version. Installed source and metadata persist
atomically and rehydrate on restart. Existing instances retain their identity
when code is replaced; changing an installed type ID or size is not supported.

Generated code never executes in the main process or trusted renderer. Each
preview, test, and live widget uses its own in-memory Electron session, with
sandboxing and context isolation, no Node or preload, a restrictive CSP, blocked
network and file requests, denied permissions/downloads/popups, and guarded
navigation. The first format has no dependencies, per-widget persistence, data-source
bindings, browser control grants, or other privileged services. Tests have a
10-second deadline; opening a widget has a 5-second deadline. At most eight live
local widgets can be displayed. Native views hide during layout editing or the
Agent overlay and when partly outside the window. Widget state is in memory and
resets when its instance is recreated or the app restarts.

The MCP process is an authenticated loopback relay to the desktop's tool
dispatcher; it does not read or write workspace files directly. The host
serializes tool mutations and renderer saves, rejects stale renderer snapshots,
and broadcasts workspace/catalog changes immediately. Native tests and previews
use a separate serial execution queue, so they do not block workspace or draft
writes. Execution checks the draft revision before starting and again before
returning results; stale tests cannot authorize activation. Newly installed types can
be inspected and added in the same Agent turn. The gateway token stays in main
and the ACP-provided MCP environment, never in the renderer. Failure to start
the gateway disables Agent tools without preventing local dashboard use.

`pnpm test:electron` includes a synthetic harness driving the actual MCP relay
through draft creation, a failed interaction, repair, testing, preview,
activation, live display, and restart persistence. It does not authenticate or
invoke a real AI provider.

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

Native browser views are hidden while layout editing,
the Agent panel, or the page's tools are open, and when a page viewport is partly
outside the window.
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
do not have that API. Local authored widgets run in separate isolated browsers
and receive no control grants. General third-party plugin privileges and Agent
browser control grants remain unsupported.

The desktop also includes a minimal built-in agent overlay plugin. It opens from
the top-right corner and talks to a main-process agent service through typed IPC.
The first provider implementation launches the pinned `codex-acp` adapter over
stdio and creates a local Codex session. The session receives a dedicated local
MCP server exposing the same inspected, revisioned dashboard and data-source
operations as the manual editor, plus the local widget authoring lifecycle.
Permission requests are correlated with their streamed tool-call metadata;
only exact registered tools from the `avesd` MCP server are allowed once
automatically. Missing metadata and unrelated permission requests remain denied. The harness stays
read-only for its own file tools: draft writes use the scoped Avesd tools.

AI harnesses connect through ACP. The client package owns protocol lifecycle and
capability negotiation while concrete process transports and account
authentication remain outside the protocol-neutral core.
