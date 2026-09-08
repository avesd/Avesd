import type { DashboardId, WorkspaceId, WorkspaceNavigationCommand, WorkspaceNavigationState } from "@avesd/workspace-model";

export const workspaceNavigationChannel = "workspace:navigate";
export interface WorkspaceNavigationApi {
  command(command: WorkspaceNavigationCommand): Promise<WorkspaceNavigationState>;
}

export function parseWorkspaceNavigation(input: unknown): WorkspaceNavigationCommand {
  if (!input || typeof input !== "object") throw new Error("Invalid workspace navigation command.");
  const command = input as Record<string, unknown>;
  const text = (value: unknown): string => {
    if (typeof value !== "string" || !value.trim() || value.length > 128) throw new Error("Invalid workspace navigation field.");
    return value;
  };
  if (command.type === "inspect") return { type: "inspect" };
  if (command.type === "createWorkspace") return { type: command.type, name: text(command.name) };
  if (command.type === "renameWorkspace") return { type: command.type, workspaceId: text(command.workspaceId) as WorkspaceId, name: text(command.name) };
  if (command.type === "deleteWorkspace") return { type: command.type, workspaceId: text(command.workspaceId) as WorkspaceId };
  if (command.type === "create") return { type: "create", workspaceId: text(command.workspaceId) as WorkspaceId, name: text(command.name) };
  const value = command.scope as Record<string, unknown> | undefined;
  if (!value) throw new Error("Dashboard scope is required.");
  const scope = { workspaceId: text(value.workspaceId) as WorkspaceId, dashboardId: text(value.dashboardId) as DashboardId };
  if (command.type === "select" || command.type === "delete") return { type: command.type, scope };
  if (command.type === "rename") return { type: "rename", scope, name: text(command.name) };
  throw new Error("Unknown workspace navigation command.");
}
