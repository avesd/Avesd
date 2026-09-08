import type { WorkspaceNavigationCommand } from "./workspace-navigation";
import type { Dashboard, DashboardScope, Workspace, WorkspaceId, WorkspaceSnapshot } from "./workspace-model";

export type WidgetWorkspaceCapability = "catalog" | "navigation" | "management";

export type DashboardSummary = Pick<Dashboard, "id" | "name" | "workspaceId">;
export type WorkspaceCatalogQuery =
  | { readonly type: "workspaces" }
  | { readonly type: "dashboards"; readonly workspaceId: WorkspaceId }
  | { readonly type: "current" };
export type WorkspaceCatalogResult = readonly Workspace[] | readonly DashboardSummary[] | DashboardScope;

/** Project system metadata, never layouts, widget configuration, or source values. */
export function readWorkspaceCatalog(snapshot: WorkspaceSnapshot, query: WorkspaceCatalogQuery): WorkspaceCatalogResult {
  switch (query.type) {
    case "workspaces": return snapshot.workspaces.map(({ id, name }) => ({ id, name }));
    case "dashboards":
      if (!snapshot.workspaces.some(({ id }) => id === query.workspaceId)) throw new Error("Workspace is unavailable.");
      return snapshot.dashboards.filter(({ workspaceId }) => workspaceId === query.workspaceId)
        .map(({ id, name, workspaceId }) => ({ id, name, workspaceId }));
    case "current":
      if (!snapshot.selection) throw new Error("Workspace selection is unavailable.");
      return { ...snapshot.selection };
  }
}

export type WorkspaceManagementCommand = Exclude<WorkspaceNavigationCommand, { type: "inspect" | "select" }>;

export interface WidgetCatalogService {
  listWorkspaces(): Promise<readonly Workspace[]>;
  listDashboards(workspaceId: WorkspaceId): Promise<readonly DashboardSummary[]>;
  /** Invalidation notification: requery the metadata needed by this widget. */
  subscribe(listener: () => void): () => void;
}

export interface WidgetNavigationService {
  getCurrent(): Promise<DashboardScope>;
  select(scope: DashboardScope): Promise<void>;
  subscribe(listener: () => void): () => void;
}

export interface WidgetManagementService {
  execute(command: WorkspaceManagementCommand): Promise<void>;
}

export interface WidgetWorkspaceServices {
  readonly catalog?: WidgetCatalogService;
  readonly navigation?: WidgetNavigationService;
  readonly management?: WidgetManagementService;
}

