import { InMemoryWorkspaceRepository } from "./in-memory-workspace-repository";
import { parseWorkspaceSnapshot } from "./workspace-snapshot";
import type { Dashboard, DashboardId, DashboardScope, Workspace, WorkspaceId, WorkspaceSnapshot } from "./workspace-model";

export type WorkspaceNavigationCommand =
  | { readonly type: "inspect" }
  | { readonly type: "createWorkspace"; readonly name: string }
  | { readonly type: "renameWorkspace"; readonly workspaceId: WorkspaceId; readonly name: string }
  | { readonly type: "deleteWorkspace"; readonly workspaceId: WorkspaceId }
  | { readonly type: "select"; readonly scope: DashboardScope }
  | { readonly type: "create"; readonly workspaceId: WorkspaceId; readonly name: string }
  | { readonly type: "rename"; readonly scope: DashboardScope; readonly name: string }
  | { readonly type: "delete"; readonly scope: DashboardScope };

export interface WorkspaceNavigationState {
  readonly scope: DashboardScope;
  readonly workspaces: readonly Workspace[];
  readonly dashboards: readonly Dashboard[];
}

export function sameDashboard(first: DashboardScope | undefined, second: DashboardScope | undefined): boolean {
  return first?.workspaceId === second?.workspaceId && first?.dashboardId === second?.dashboardId;
}

/** Build one transaction; the host commits its snapshot and selection together. */
export async function navigateWorkspace(
  input: WorkspaceSnapshot | undefined,
  command: WorkspaceNavigationCommand,
  createId: () => string,
): Promise<{ snapshot: WorkspaceSnapshot; state: WorkspaceNavigationState }> {
  const repository = new InMemoryWorkspaceRepository(parseWorkspaceSnapshot(input));
  let workspaces = await repository.listWorkspaces();
  if (!workspaces.length) {
    await repository.createWorkspace({ id: createId() as WorkspaceId, name: "Local workspace" });
    workspaces = await repository.listWorkspaces();
  }
  let scope = input?.selection;
  let renamed: { scope: DashboardScope; name: string } | undefined;
  switch (command.type) {
    case "inspect": break;
    case "createWorkspace": {
      const workspaceId = createId() as WorkspaceId;
      await repository.createWorkspace({ id: workspaceId, name: dashboardName(command.name) });
      const dashboard = await repository.createDashboard({ workspaceId }, {
        id: createId() as DashboardId, name: "My dashboard", viewState: {},
      });
      scope = { workspaceId, dashboardId: dashboard.id };
      break;
    }
    case "renameWorkspace":
      if (!workspaces.some((item) => item.id === command.workspaceId)) throw new Error("Workspace is unavailable.");
      break;
    case "deleteWorkspace":
      if (workspaces.length < 2) throw new Error("Keep at least one workspace.");
      await repository.deleteWorkspace({ workspaceId: command.workspaceId });
      if (scope?.workspaceId === command.workspaceId) scope = undefined;
      break;
    case "create": {
      const dashboard = await repository.createDashboard({ workspaceId: command.workspaceId }, {
        id: createId() as DashboardId, name: dashboardName(command.name), viewState: {},
      });
      scope = { workspaceId: dashboard.workspaceId, dashboardId: dashboard.id };
      break;
    }
    case "select":
      await repository.readDashboardLayout(command.scope);
      scope = command.scope;
      break;
    case "rename":
      await repository.readDashboardLayout(command.scope);
      renamed = { scope: command.scope, name: dashboardName(command.name) };
      break;
    case "delete": {
      await repository.readDashboardLayout(command.scope);
      const siblings = await repository.listDashboards(command.scope);
      if (siblings.length < 2) throw new Error("Keep at least one dashboard in this workspace.");
      await repository.deleteDashboard(command.scope);
      if (sameDashboard(scope, command.scope)) {
        scope = { workspaceId: command.scope.workspaceId, dashboardId: siblings.find((item) => item.id !== command.scope.dashboardId)!.id };
      }
      break;
    }
  }
  workspaces = await repository.listWorkspaces();
  if (!scope) {
    const workspaceId = workspaces[0]!.id;
    let dashboard = (await repository.listDashboards({ workspaceId }))[0];
    dashboard ??= await repository.createDashboard({ workspaceId }, {
      id: createId() as DashboardId, name: "My dashboard", viewState: {},
    });
    scope = { workspaceId, dashboardId: dashboard.id };
  }
  const stored = await repository.snapshot();
  const snapshot: WorkspaceSnapshot = {
    ...stored,
    selection: scope,
    workspaces: command.type === "renameWorkspace" ? stored.workspaces.map((workspace) => workspace.id === command.workspaceId
      ? { ...workspace, name: dashboardName(command.name) } : workspace) : stored.workspaces,
    dashboards: renamed ? stored.dashboards.map((dashboard) => dashboard.id === renamed.scope.dashboardId
      ? { ...dashboard, name: renamed.name } : dashboard) : stored.dashboards,
  };
  return {
    snapshot,
    state: { scope, workspaces: snapshot.workspaces, dashboards: snapshot.dashboards.filter((item) => item.workspaceId === scope.workspaceId) },
  };
}

function dashboardName(input: string): string {
  const name = input.trim();
  if (!name || name.length > 100) throw new Error("Use a dashboard name between 1 and 100 characters.");
  return name;
}
