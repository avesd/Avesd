import type { WidgetWorkspaceCapability, WidgetWorkspaceServices } from "@avesd/workspace-model";
import type { DashboardScope, DashboardSummary, WidgetInstanceId, Workspace, WorkspaceCatalogQuery, WorkspaceCatalogResult, WorkspaceNavigationCommand } from "@avesd/workspace-model";
import { parseWorkspaceNavigation } from "./workspace-navigation";

export const widgetWorkspaceChannels = { invoke: "widget-workspace:invoke", renderer: "widget-workspace:renderer", changed: "widget-workspace:changed" } as const;
export interface WidgetWorkspaceIdentity extends DashboardScope {
  readonly instanceId: WidgetInstanceId;
  readonly capabilities: readonly WidgetWorkspaceCapability[];
}
export type WidgetWorkspaceRequest = WorkspaceCatalogQuery | { readonly type: "command"; readonly command: Exclude<WorkspaceNavigationCommand, { type: "inspect" }> };
export type WidgetWorkspaceResult = WorkspaceCatalogResult | void;
export interface DesktopWidgetWorkspaceApi {
  invoke(instanceId: WidgetInstanceId, request: WidgetWorkspaceRequest): Promise<WidgetWorkspaceResult>;
  subscribe(listener: () => void): () => void;
}

export interface WidgetWorkspaceTransport {
  invoke(request: WidgetWorkspaceRequest): Promise<WidgetWorkspaceResult>;
  subscribe(listener: () => void): () => void;
}

export function parseWidgetWorkspaceRequest(input: unknown): WidgetWorkspaceRequest {
  if (!input || typeof input !== "object") throw new Error("Invalid widget workspace request.");
  const request = input as Record<string, unknown>;
  if (request.type === "workspaces" || request.type === "current") return { type: request.type };
  if (request.type === "dashboards" && typeof request.workspaceId === "string" && request.workspaceId.trim() && request.workspaceId.length <= 128) {
    return { type: request.type, workspaceId: request.workspaceId as DashboardScope["workspaceId"] };
  }
  if (request.type === "command") {
    const command = parseWorkspaceNavigation(request.command);
    if (command.type !== "inspect") return { type: request.type, command };
  }
  throw new Error("Invalid widget workspace request.");
}

export function requiredWorkspaceCapability(request: WidgetWorkspaceRequest): WidgetWorkspaceCapability {
  if (request.type === "command") return request.command.type === "select" ? "navigation" : "management";
  return request.type === "current" ? "navigation" : "catalog";
}

/** Fixed methods only; transports authenticate the caller independently of arguments. */
export function createWidgetWorkspaceServices(capabilities: readonly WidgetWorkspaceCapability[], transport: WidgetWorkspaceTransport): WidgetWorkspaceServices {
  return {
    catalog: capabilities.includes("catalog") ? {
      listWorkspaces: () => transport.invoke({ type: "workspaces" }) as Promise<readonly Workspace[]>,
      listDashboards: (workspaceId) => transport.invoke({ type: "dashboards", workspaceId }) as Promise<readonly DashboardSummary[]>,
      subscribe: transport.subscribe,
    } : undefined,
    navigation: capabilities.includes("navigation") ? {
      getCurrent: () => transport.invoke({ type: "current" }) as Promise<DashboardScope>,
      select: async (scope) => { await transport.invoke({ type: "command", command: { type: "select", scope } }); },
      subscribe: transport.subscribe,
    } : undefined,
    management: capabilities.includes("management") ? {
      execute: async (command) => { await transport.invoke({ type: "command", command }); },
    } : undefined,
  };
}
