import * as z from "zod";

export const draftIdSchema = z.string().uuid();
export const revisionSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const localManifestSchema = z.strictObject({
  capabilities: z.array(z.enum(["catalog", "navigation", "management"])).max(3).optional(),
  apiVersion: z.literal(1),
  id: z.string().regex(/^avesd\.local\.[a-z][a-z0-9-]{0,63}$/),
  version: z.string().regex(/^\d+\.\d+\.\d+$/).max(32),
  displayName: z.string().trim().min(1).max(80),
  widgetTypeId: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
  size: z.strictObject({ width: z.number().int().min(4).max(24), height: z.number().int().min(4).max(32) }),
});
const selector = z.string().min(1).max(256);
export const widgetTestsSchema = z.array(z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("click"), selector }),
  z.strictObject({ type: z.literal("fill"), selector, value: z.string().max(4096) }),
  z.strictObject({ type: z.literal("expectText"), selector, text: z.string().max(4096) }),
])).min(1).max(32).refine((steps) => steps.some((step) => step.type === "expectText"), "Include a text assertion.");
export const draftContentSchema = z.strictObject({
  manifest: localManifestSchema, source: z.string().min(1).max(65_536)
    .refine((source) => Buffer.byteLength(source, "utf8") <= 65_536, "Source exceeds 64 KiB."), tests: widgetTestsSchema,
});

export const counterExample = {
  manifest: { apiVersion: 1 as const, id: "avesd.local.counter", version: "0.1.0", displayName: "My counter",
    widgetTypeId: "counter", size: { width: 8, height: 8 } },
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
    { type: "expectText" as const, selector: "output", text: "0" },
    { type: "click" as const, selector: "button" },
    { type: "expectText" as const, selector: "output", text: "1" },
  ],
};

export const localPluginSdk = {
  format: "A single JavaScript ES module exporting mount(root: ShadowRoot, context: { signal: AbortSignal, instanceId, workspaceId, dashboardId, catalog?, navigation?, management? }). Return synchronous update({configuration, size}) and dispose() methods.",
  lifecycle: "The host calls mount, then update with empty configuration and grid size. State is in memory. Destroying a widget aborts signal and disposes its isolated browser.",
  limits: "No imports of packages, network, files, Node, Electron, general host APIs, per-widget persisted state, or data-source bindings. Only declared catalog/navigation/management services are available. Bundle-free JavaScript and inline CSS only. Source is at most 64 KiB; 1–32 test steps. Tests select within the root ShadowRoot.",
  workspaceServices: {
    declaration: 'Optional manifest capabilities: ["catalog", "navigation", "management"]. Declare only the services your widget needs. The host checks every call against the installed manifest and the live widget instance.',
    catalog: "context.catalog.listWorkspaces() returns {id,name}[]; listDashboards(workspaceId) returns {id,name,workspaceId}[]. Queries do not switch. subscribe(listener) invalidates metadata; requery when notified. No layouts, configurations, or source values are returned.",
    navigation: "context.navigation.getCurrent() returns {workspaceId,dashboardId}; select(scope) switches. subscribe(listener) signals invalidation. context.workspaceId/dashboardId remain the immutable mounting identity. Switching disposes live widgets; handle pending rejections and stop work when signal is aborted.",
    management: "context.management.execute(command). Dashboard commands: {type:'create',workspaceId,name}, {type:'rename',scope,name}, {type:'delete',scope}. Workspace commands: {type:'createWorkspace',name}, {type:'renameWorkspace',workspaceId,name}, {type:'deleteWorkspace',workspaceId}. Create selects the new dashboard/workspace. Delete removes owned content; show the user the consequence before invoking it. The last workspace/dashboard is protected. Persistence completes before selection changes.",
    preview: "Tests and previews use a private in-memory Preview workspace with one Preview dashboard, never live data. Their navigation updates synthetic selection without unmounting the preview, so declarative tests can inspect the result. Subscriptions are released on abort. Live selection unmounts the widget.",
  },
  workflow: "Create draft; write full source and tests using the current revision; test; inspect report and preview image; activate that exact passing revision; add the manifest's pluginId/widgetTypeId to the dashboard. Failed tests never activate. Editing invalidates the previous report.",
  example: counterExample,
};
