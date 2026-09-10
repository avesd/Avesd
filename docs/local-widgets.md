# Local widgets

## Composition before authoring

An installed plugin contributes reusable widget types to Avesd's live widget
catalog. A dashboard contains instances of those types: their layout,
configuration, bindings, and local dashboard context. It does not contain or
create a plugin.

When asked to build or change a dashboard, an ACP agent first calls
`avesd_inspect_dashboard` and composes the result from `availableWidgetTypes`,
available data sources, and bindings. It creates instances with
`avesd_add_widget`. This is the normal path, including when a dashboard is
newly created.

Author a local plugin only when the installed catalog has a real reusable
capability gap. A plugin is not a container for one dashboard's content or a
one-off implementation of its layout. After activation it contributes a type
to the catalog, which can then be instantiated on this or other dashboards.

## Authoring lifecycle

An ACP session receives the Avesd stdio MCP server. When the catalog has such a
gap, ask the Agent to read `avesd_get_widget_sdk`, create a draft, write its
JavaScript and interaction tests, run them, inspect the returned preview,
activate the passing revision, and add an instance to the dashboard. These are
real host tools; a successful chat response alone is not a test or installation
result.

The first authoring format contains one manifest, one JavaScript ES module, and
declarative tests. The module exports `mount(root, { signal })` and returns
`update({ configuration, size })` and `dispose()` methods. It renders into a
ShadowRoot inside an isolated native browser. The manifest supplies an
`avesd.local.*` plugin ID, a widget type ID, display name, semantic version, and
default grid size. Source is limited to 64 KiB. Read the SDK tool for the complete
contract and working counter example.

Tools are `avesd_create_plugin_draft`, `avesd_read_plugin_draft`,
`avesd_write_plugin_draft`, `avesd_test_plugin`, `avesd_preview_widget`, and
`avesd_activate_plugin`, followed by the existing `avesd_add_widget`. Draft
writes require the expected revision. Testing executes module loading,
mount/update, rendered-content and isolation checks, and 1–32 declared `click`,
`fill`, or `expectText` steps, then exercises disposal. Reports identify the
source revision and return a PNG when available. Preview opens one separate
window and returns its image. These checks do not establish full visual
correctness or prove the absence of resource leaks; the Agent should inspect the
image and the user can exercise the preview.

Activation requires a passing report for the exact current draft revision in
the current desktop session. Editing invalidates the report; failed or stale
tests cannot replace an installed version. Installed source and metadata persist
atomically and rehydrate on restart. Existing instances retain their identity
when code is replaced; changing an installed type ID is not supported. Changing the default size affects
new instances only; existing instances retain their saved placement. The host
passes the current instance grid size to `update`, including resize previews.

Generated code never executes in the main process or trusted renderer. Each
preview, test, and live widget uses its own in-memory Electron session, with
sandboxing and context isolation, no Node access, a narrow typed preload, a
restrictive CSP, blocked network and file requests, denied
permissions/downloads/popups, and guarded navigation.

The local format has no package dependencies, data-source bindings, or browser
control grants. Declared capabilities provide host-mediated workspace
metadata/navigation/management, private file/SQLite storage, and explicitly
shared resources. Tests have a 10-second deadline; opening a widget has a
5-second deadline. At most eight live local widgets can be displayed. Native
views hide during layout editing or the Agent overlay and when partly outside
the window. Unstored widget state resets when its instance is recreated or the
app restarts.

## Private plugin storage

Declare `files` and/or `sqlite` in the manifest's `capabilities`. The host
derives workspace and plugin identity from the authenticated live widget;
callers cannot choose another scope. Instances of the same plugin in one
workspace share storage. Different workspaces and plugins have separate
namespaces. Every call, including calls through an existing database facade,
rechecks the active widget and manifest.

```js
await context.files.write("notes/state.json", JSON.stringify({ count: 1 }));
const state = JSON.parse(await context.files.readText("notes/state.json"));
await context.files.write("assets/sample.bin", new Uint8Array([1, 2, 3]));
const bytes = await context.files.read("assets/sample.bin");
const entries = await context.files.list("notes"); // {name, kind}[]
await context.files.remove("assets/sample.bin");

const db = await context.sqlite.open("tasks.sqlite");
await db.execute("CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY, title TEXT)");
await db.transaction([
  { sql: "INSERT INTO tasks (title) VALUES (?)", parameters: ["Read"] },
  { sql: "INSERT INTO tasks (title) VALUES (?)", parameters: ["Write"] },
]);
const tasks = await db.query(
  "SELECT id, title FROM tasks WHERE id > ? ORDER BY id LIMIT 20",
  [0],
);
```

Private content lives under the configured data directory in
`plugin-storage-v1/<workspace-hash>/<plugin-hash>/{files,sqlite}/`, outside the
workspace JSON snapshot and Agent inspection responses. Relative file paths use
ASCII letters, digits, spaces, `_`, `-`, and `.`; absolute paths, empty
components, traversal, symlinks, and hardlinks are rejected. File writes
atomically replace one file and create parent directories. Files and databases
use separate namespaces, so file operations cannot overwrite SQLite databases
or journals.

Storage is retained when widget instances are removed. Automatic orphan cleanup
and migration of existing JSON data sources are not yet implemented; back up the
full configured data directory to include private data.

SQLite executes in a host-owned child process with a two-second deadline.
Queries execute on read-only connections after host-only journal recovery.
Parameterized mutations and batches use transactions; a failed batch rolls
back. SQLite authorization denies `ATTACH`, `DETACH`, `PRAGMA`, extension
loading, virtual tables, and plugin-controlled transactions. Each entry accepts
one SQL statement.

Parameters support null, string, finite number, signed int64 bigint, and
Uint8Array; integers beyond JavaScript's safe range return as bigint. Errors do
not return SQL text, data values, or host paths. Initial limits are:

- 4 MiB per file operation.
- 1000 directory entries.
- 16 KiB SQL per statement.
- 128 parameters per statement.
- 64 statements per transaction.
- 1000 rows and 4 MiB per query response.
- 4 MiB per SQL parameter set or batch.
- 32 MiB of SQLite heap.
- 8192 pages per database.

These are per-operation and per-database limits, not an aggregate disk quota.
Use pagination for queries. A connection closes after each request; database
facades carry no filesystem path or unrestricted connection. This isolates
plugin calls, not hostile local OS processes that can modify the application's
private storage directory.

Tests and previews get fresh temporary private storage, never live files or
databases. It is removed after the preview or test closes and pending work ends.
`pnpm test:electron` verifies the actual sandbox bridge, capability denial,
workspace/plugin separation, preview isolation, and restart persistence.

## Shared resources and cross-plugin grants

Declare `resources` to publish or consume explicitly shared resources inside the
current workspace. Publishing also requires `files` or `sqlite` for the chosen
kind. A resource exposes exactly one existing private file or database; the
host-owned directory maps an opaque resource ID to its source. Publishing does
not copy or move bytes, expose the publisher's storage root, or share sibling
files. The source remains available through the publisher's private storage API.
Removing a widget does not delete its publication, grants, or source data.

```js
// Producer: capabilities ["files", "sqlite", "resources"].
const db = await context.sqlite.open("tasks.sqlite");
await db.execute("CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY, title TEXT)");
const published = await context.resources.publish({
  key: "tasks",
  name: "Tasks",
  kind: "sqlite",
  path: "tasks.sqlite",
  contract: {
    id: "example.tasks",
    version: 1,
    schema: {
      tables: { tasks: { columns: { id: "integer", title: "text" } } },
    },
  },
});

// Consumer: capabilities ["resources"]. Discovery itself grants no access.
const candidates = await context.resources.list({
  kind: "sqlite",
  contractId: "example.tasks",
  version: 1,
});

// After the user chooses a resource and authorizes this plugin through the Agent:
const chosen = candidates.find((resource) => resource.access !== "none");
if (chosen) {
  const shared = await context.resources.openDatabase(chosen.id);
  const tasks = await shared.query(
    "SELECT id, title FROM tasks ORDER BY id LIMIT 20",
  );
}
```

The directory returns only published ID, key, name, kind, publisher plugin ID,
contract, and the caller's `none`/`read`/`read-write` access. No source paths,
file contents, SQL rows, or other recipients are returned to plugins. Names and
schema are intentionally published metadata; never place secrets or private
records in them. Contract ID and version filters match exactly. Schemas are
descriptive, not runtime validators, migration programs, or certification that
the source actually conforms. Consumers must handle incompatible data
explicitly.

Authorization is available through the active workspace's Agent tools:

- `avesd_list_resources` returns published metadata plus explicit grants for
  review.
- `avesd_set_resource_access({resourceId, pluginId, access})` sets `read`,
  `read-write`, or `none` to revoke. The Agent must obtain the user's
  authorization for the selected resource, recipient, and access; discovering
  metadata is not authorization. Recipients must be installed plugins declaring
  `resources`.

These are trusted host operations, not widget methods; plugins cannot grant
access to themselves or others. There is no settings panel for grants. Grants
apply to all instances of the recipient plugin in the workspace, including
other dashboards. They do not grant private storage capabilities or
cross-workspace access.

File facades expose `read()`, `readText()`, and `write(value)`; database facades
expose `query`, `execute`, and `transaction`. A read grant blocks file writes and
SQL mutations, including mutations disguised as queries. Read-write access
covers the whole file or database, not selected fields, rows, or tables. Shared
consumers cannot remove files, list directories, choose source paths, or open
additional databases through a resource ID. Existing file and SQL limits apply.

Every operation reloads and checks grants inside the host's serialized
authority. An operation already ahead of a revocation may finish first; once
revocation completes, later calls through existing facades fail.
`resources.subscribe` signals directory/access invalidation only, not file or
SQL content changes. Requery metadata when notified. Active widget identity and
capabilities are checked on every call; workspace switching disposes the
previous widget context.

Publications are immutable. Repeating an identical publication with the same
key in the same workspace/plugin returns its existing ID. Changing its source,
kind, name, or contract requires publisher-only `unpublish(id)` followed by a
new publish. Unpublishing removes grants and invalidates old facades without
deleting source bytes. A new publication gets a new ID and inherits no grants.

The host saves metadata, internal locators, and grants atomically in
`shared-resources-v1.json` under the configured data directory, separate from
the renderer-owned workspace snapshot. It survives restart and must be included
with private storage in backups. Corrupt metadata fails closed; failed saves do
not change access. Current limits are 4096 publications, 256 grants per resource,
and 16 KiB/16 levels per schema. Orphan cleanup and publisher ownership transfer
are not yet implemented. Tests and previews use their own temporary directory
and can never discover or grant access to live resources.

## Native integration coverage

`pnpm test:electron` includes a synthetic harness driving the actual MCP relay
through draft creation, a failed interaction, repair, testing, preview,
activation, live display, and restart persistence. It does not authenticate or
invoke a real AI provider.
