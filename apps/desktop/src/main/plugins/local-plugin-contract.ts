/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Local Plugin Contract
 */

import * as z from "zod";

export const draftIdSchema = z.uuid();
export const revisionSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const localManifestSchema = z.strictObject({
    capabilities: z.array(z.enum([
        "catalog",
        "navigation",
        "management",
        "files",
        "sqlite",
        "resources",
    ])).max(6)
        .optional(),
    apiVersion: z.literal(1),
    id: z.string().regex(/^avesd\.local\.[a-z][a-z0-9-]{0,63}$/),
    version: z.string().regex(/^\d+\.\d+\.\d+$/)
        .max(32),
    displayName: z.string().trim()
        .min(1)
        .max(80),
    widgetTypeId: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
    size: z.strictObject({
        width: z.number().int()
            .min(4)
            .max(24),
        height: z.number().int()
            .min(4)
            .max(32),
    }),
});
const selector = z.string().min(1)
    .max(256);
export const widgetTestsSchema = z.array(z.discriminatedUnion("type", [
    z.strictObject({
        type: z.literal("click"),
        selector,
    }),
    z.strictObject({
        type: z.literal("fill"),
        selector,
        value: z.string().max(4096),
    }),
    z.strictObject({
        type: z.literal("expectText"),
        selector,
        text: z.string().max(4096),
    }),
])).min(1)
    .max(32)
    .refine((steps) => {
        return steps.some((step) => {
            return step.type === "expectText";
        });
    }, "Include a text assertion.");
export const draftContentSchema = z.strictObject({
    manifest: localManifestSchema,
    source: z.string().min(1)
        .max(65_536)
        .refine((source) => {
            return Buffer.byteLength(source, "utf8") <= 65_536;
        }, "Source exceeds 64 KiB."),
    tests: widgetTestsSchema,
});

export const counterExample = {
    manifest: {
        apiVersion: 1 as const,
        id: "avesd.local.counter",
        version: "0.1.0",
        displayName: "My counter",
        widgetTypeId: "counter",
        size: {
            width: 8,
            height: 8,
        },
    },
    source: `export function mount(root) {
  root.innerHTML = \`<style>
    :host { display:block; height:100%; font:16px system-ui; color:#233b31; }
    section { box-sizing:border-box; height:100%; padding:24px; background:#eaf3e8; border-radius:16px; }
    h2 { margin:0 0 12px; font-size:18px; } output { display:block; font-size:40px; margin:8px 0; }
    button { padding:10px 18px; border:0; border-radius:8px; background:#244f3b; color:white; font:inherit; cursor:pointer; }
  </style><section><h2>My counter</h2><output>0</output><button>Increment</button></section>\`;
  let count = 0;
  const button = root.querySelector('button');
  const increment = () => { root.querySelector('output').textContent = String(++count); };
  button.addEventListener('click', increment);
  return { update() {}, dispose() { button.removeEventListener('click', increment); root.replaceChildren(); } };
}`,
    tests: [
        {
            type: "expectText" as const,
            selector: "output",
            text: "0",
        },
        {
            type: "click" as const,
            selector: "button",
        },
        {
            type: "expectText" as const,
            selector: "output",
            text: "1",
        },
    ],
};

export const localPluginSdk = {
    format: "A single JavaScript ES module exporting mount(root: ShadowRoot, context: { signal: AbortSignal, instanceId, workspaceId, dashboardId, catalog?, navigation?, management?, files?, sqlite?, resources? }). Return synchronous update({configuration, size}) and dispose() methods.",
    lifecycle: "The host calls mount, then update with empty configuration and grid size. Unstored state is in memory. Private files and SQLite persist per workspace and plugin. Destroying a widget aborts signal and disposes its isolated browser.",
    limits: "No imports of packages, network, direct filesystem access, Node, Electron, general host APIs, or data-source bindings. Only declared catalog/navigation/management/files/sqlite/resources services are available. Bundle-free JavaScript and inline CSS only. Source is at most 64 KiB; 1–32 test steps. Tests select within the root ShadowRoot.",
    workspaceServices: {
        declaration: 'Optional manifest capabilities: ["catalog", "navigation", "management", "files", "sqlite", "resources"]. Declare only the services your widget needs. The host checks every call against the installed manifest and the live widget instance.',
        catalog: "context.catalog.listWorkspaces() returns {id,name}[]; listDashboards(workspaceId) returns {id,name,workspaceId}[]. Queries do not switch. subscribe(listener) invalidates metadata; requery when notified. No layouts, configurations, or source values are returned.",
        navigation: "context.navigation.getCurrent() returns {workspaceId,dashboardId}; select(scope) switches. subscribe(listener) signals invalidation. context.workspaceId/dashboardId remain the immutable mounting identity. Switching disposes live widgets; handle pending rejections and stop work when signal is aborted.",
        management: "context.management.execute(command). Dashboard commands: {type:'create',workspaceId,name}, {type:'rename',scope,name}, {type:'delete',scope}. Workspace commands: {type:'createWorkspace',name}, {type:'renameWorkspace',workspaceId,name}, {type:'deleteWorkspace',workspaceId}. Create selects the new dashboard/workspace. Delete removes owned content; show the user the consequence before invoking it. The last workspace/dashboard is protected. Persistence completes before selection changes.",
        files: "context.files.read(path) returns Uint8Array; readText(path) returns UTF-8 text; write(path,string|Uint8Array) atomically replaces a file and creates parent directories; list(path=\"\") returns {name,kind}[]; remove(path) removes one file. Relative ASCII paths only; no absolute paths, traversal, symlinks or hardlinks. Up to 4 MiB per file operation and 1000 directory entries. JSON uses JSON.stringify/JSON.parse with write/readText. Files are private to workspace+plugin, shared by its widget instances, and survive widget removal and application restarts.",
        sqlite: "await context.sqlite.open(\"tasks.sqlite\") returns a scoped facade with query(sql,parameters=[]), execute(sql,parameters=[]), transaction([{sql,parameters?}]). One SQL statement per entry, positional parameters (null/string/finite number/int64 bigint/Uint8Array). Query is read-only. Transactions commit all entries together or roll back. Up to 64 statements, 1000 query rows, 4 MiB result/parameter set/batch, 32 MiB SQLite heap, 2 seconds per operation, and 8192 database pages. Use LIMIT and pagination. Databases use a separate private namespace from files; files API cannot edit an active database. ATTACH, PRAGMA, extensions, virtual tables and SQL transaction control are denied. Handles reauthorize every call; no connection survives a request. Errors omit SQL and filesystem paths.",
        resources: "Declare resources to use context.resources. publish({key,name,kind:'file'|'sqlite',path,contract:{id,version,schema}}) publishes one existing private file/database and also requires files/sqlite respectively. It returns public metadata and a resource id, never a path or contents. Same-key identical publications are idempotent; source, name and contract are immutable. list({kind?,contractId?,version?}) discovers metadata in this workspace with access:'none'|'read'|'read-write'. Version matching is exact; schema is descriptive only. The directory is opt-in shared metadata: do not put credentials or private content in names or schema. openFile(id) returns read/readText/write; openDatabase(id) returns query/execute/transaction. Access requires a host grant to this plugin, rechecked on every call. resources grants do not grant private files/sqlite access. Plugins cannot grant themselves access. Ask the user to authorize the resource and recipient through the Agent's avesd_set_resource_access tool; discovery never grants access. unpublish(id) is publisher-only, removes grants without deleting data, and invalidates old facades. Republish returns a new ID. subscribe invalidates directory/access metadata, not resource contents. File/SQL limits and sandbox restrictions still apply; shared writes cover the whole file/database, not individual fields or tables.",
        preview: "Tests and previews use a private in-memory Preview workspace with one Preview dashboard and fresh temporary file/SQLite storage, never live data. Their navigation updates synthetic selection without unmounting the preview, so declarative tests can inspect the result. Subscriptions are released on abort. Live selection unmounts the widget.",
    },
    workflow: "Create draft; write full source and tests using the current revision; test; inspect report and preview image; activate that exact passing revision; add the manifest's pluginId/widgetTypeId to the dashboard. Failed tests never activate. Editing invalidates the previous report.",
    example: counterExample,
};
