import { randomUUID } from "node:crypto";

import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import {
  DashboardLayoutCoordinator,
  PersistentWorkspaceRepository,
  WorkspaceDataCoordinator,
} from "@avesd/workspace-model";
import type {
  DashboardLayoutOperation,
  DataSourceId,
  JsonValue,
  WidgetInstanceId,
} from "@avesd/workspace-model";
import * as z from "zod";

import type { AgentWorkbenchContext } from "../shared/desktop-api";
import { WorkspaceFile } from "./workspace-file";

const workspacePath = process.env.AVESD_WORKSPACE_PATH;
const serializedContext = process.env.AVESD_MCP_CONTEXT;
if (!workspacePath || !serializedContext) {
  throw new Error("Avesd MCP workspace context is missing");
}
const context = JSON.parse(serializedContext) as AgentWorkbenchContext;
const file = new WorkspaceFile(workspacePath);

const withServices = async <T>(operation: (services: {
  readonly data: WorkspaceDataCoordinator;
  readonly layouts: DashboardLayoutCoordinator;
}) => Promise<T>): Promise<T> => {
  const repository = await PersistentWorkspaceRepository.open({
    load: () => file.load(),
    save: (snapshot) => file.save(snapshot),
  });
  const layouts = new DashboardLayoutCoordinator(
    repository,
    (pluginId, widgetTypeId) => context.widgetDefinitions.find(
      (definition) =>
        definition.pluginId === pluginId && definition.widgetTypeId === widgetTypeId,
    ),
  );
  const data = new WorkspaceDataCoordinator(
    repository,
    (pluginId, sourceTypeId) => context.dataSourceDefinitions.find(
      (definition) =>
        definition.pluginId === pluginId && definition.sourceTypeId === sourceTypeId,
    ),
  );
  return operation({ data, layouts });
};

const response = (value: unknown) => ({
  content: [{ text: JSON.stringify(value), type: "text" as const }],
});

const server = new McpServer({ name: "avesd-workspace", version: "0.1.0" });

server.registerTool("avesd_inspect_dashboard", {
  description: "Inspect the active Avesd dashboard, available widget types, and visible data sources.",
  inputSchema: z.object({}),
}, async () => withServices(async ({ data, layouts }) => response({
  availableDataSourceTypes: context.dataSourceDefinitions,
  availableWidgetTypes: context.widgetDefinitions,
  dataSources: await data.list(context.scope),
  layout: await layouts.inspect(context.scope),
})));

server.registerTool("avesd_add_widget", {
  description: "Add an available widget to the active dashboard using automatic placement.",
  inputSchema: z.object({
    pluginId: z.string(),
    widgetTypeId: z.string(),
  }),
}, async ({ pluginId, widgetTypeId }) => applyLayout({
  id: randomUUID() as WidgetInstanceId,
  pluginId,
  type: "add",
  widgetTypeId,
}));

server.registerTool("avesd_move_widget", {
  description: "Move a widget on the active dashboard's 24-column grid.",
  inputSchema: z.object({
    id: z.string(),
    x: z.number().int().min(0).max(23),
    y: z.number().int().min(0),
  }),
}, async ({ id, x, y }) => applyLayout({
  id: id as WidgetInstanceId,
  type: "move",
  x,
  y,
}));

server.registerTool("avesd_resize_widget", {
  description: "Resize a widget to one of the sizes allowed by its plugin.",
  inputSchema: z.object({
    height: z.number().int().min(1),
    id: z.string(),
    width: z.number().int().min(1).max(24),
  }),
}, async ({ height, id, width }) => applyLayout({
  height,
  id: id as WidgetInstanceId,
  type: "resize",
  width,
}));

server.registerTool("avesd_remove_widget", {
  description: "Remove a widget from the active dashboard.",
  inputSchema: z.object({ id: z.string() }),
}, async ({ id }) => applyLayout({ id: id as WidgetInstanceId, type: "remove" }));

server.registerTool("avesd_create_data_source", {
  description: "Create an available local data source in workspace or dashboard scope.",
  inputSchema: z.object({
    name: z.string().min(1),
    pluginId: z.string(),
    scope: z.enum(["workspace", "dashboard"]),
    sourceTypeId: z.string(),
  }),
}, async ({ name, pluginId, scope, sourceTypeId }) => withServices(async ({ data }) => response(
  await data.create(
    scope === "workspace"
      ? { kind: "workspace", workspaceId: context.scope.workspaceId }
      : { ...context.scope, kind: "dashboard" },
    {
      id: randomUUID() as DataSourceId,
      name,
      pluginId,
      sourceTypeId,
    },
  ),
)));

server.registerTool("avesd_bind_widget_input", {
  description: "Bind one visible, type-compatible data source to a widget input; omit dataSourceId to disconnect it.",
  inputSchema: z.object({
    dataSourceId: z.string().optional(),
    inputId: z.string(),
    widgetId: z.string(),
  }),
}, async ({ dataSourceId, inputId, widgetId }) => applyLayout({
  dataSourceIds: dataSourceId ? [dataSourceId as DataSourceId] : [],
  id: widgetId as WidgetInstanceId,
  inputId,
  type: "bind",
}));

server.registerTool("avesd_update_data_source", {
  description: "Replace the JSON value of a visible local data source.",
  inputSchema: z.object({
    dataSourceId: z.string(),
    value: z.json(),
  }),
}, async ({ dataSourceId, value }) => withServices(async ({ data }) => {
  const id = dataSourceId as DataSourceId;
  const source = await data.read(context.scope, id);
  return response(await data.update(context.scope, id, source.revision, value as JsonValue));
}));

const applyLayout = (operation: DashboardLayoutOperation) => withServices(async ({ layouts }) => {
  const current = await layouts.inspect(context.scope);
  return response(await layouts.apply(context.scope, {
    expectedRevision: current.revision,
    operations: [operation],
  }));
});

serveStdio(() => server, {
  onerror(error) {
    process.stderr.write(`Avesd MCP error: ${error.message}\n`);
  },
});
