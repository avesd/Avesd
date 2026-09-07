import type {
  CreateDashboard,
  CreateDataSource,
  CreateWorkspace,
  Dashboard,
  DashboardId,
  DashboardLayoutSnapshot,
  DashboardScope,
  DataSource,
  DataSourceId,
  WidgetInstance,
  WidgetInstanceId,
  Workspace,
  WorkspaceId,
  WorkspaceRepository,
  WorkspaceScope,
} from "./workspace-model";
import { WorkspaceModelError } from "./workspace-model-error";

export class InMemoryWorkspaceRepository implements WorkspaceRepository {
  readonly #dashboards = new Map<DashboardId, Dashboard>();
  readonly #dataSources = new Map<DataSourceId, DataSource>();
  readonly #widgets = new Map<WidgetInstanceId, WidgetInstance>();
  readonly #workspaces = new Map<WorkspaceId, Workspace>();

  async createWorkspace(workspace: CreateWorkspace): Promise<Workspace> {
    this.#assertAvailable(this.#workspaces, workspace.id, "workspace");
    this.#workspaces.set(workspace.id, workspace);
    return workspace;
  }

  async createDashboard(
    scope: WorkspaceScope,
    dashboard: CreateDashboard,
  ): Promise<Dashboard> {
    this.#requireWorkspace(scope.workspaceId);
    this.#assertAvailable(this.#dashboards, dashboard.id, "dashboard");
    const created = { ...dashboard, layoutRevision: 0, workspaceId: scope.workspaceId };
    this.#dashboards.set(created.id, created);
    return created;
  }

  async createDataSource(
    scope: WorkspaceScope,
    dataSource: CreateDataSource,
  ): Promise<DataSource> {
    this.#requireWorkspace(scope.workspaceId);
    this.#assertAvailable(this.#dataSources, dataSource.id, "data source");
    const created = { ...dataSource, workspaceId: scope.workspaceId };
    this.#dataSources.set(created.id, created);
    return created;
  }

  async listWorkspaces(): Promise<readonly Workspace[]> {
    return [...this.#workspaces.values()];
  }

  async listDashboards(scope: WorkspaceScope): Promise<readonly Dashboard[]> {
    this.#requireWorkspace(scope.workspaceId);
    return [...this.#dashboards.values()].filter(
      (dashboard) => dashboard.workspaceId === scope.workspaceId,
    );
  }

  async listWidgetInstances(scope: DashboardScope): Promise<readonly WidgetInstance[]> {
    this.#requireDashboard(scope);
    return [...this.#widgets.values()].filter(
      (widget) =>
        widget.workspaceId === scope.workspaceId && widget.dashboardId === scope.dashboardId,
    );
  }

  async listDataSources(scope: WorkspaceScope): Promise<readonly DataSource[]> {
    this.#requireWorkspace(scope.workspaceId);
    return [...this.#dataSources.values()].filter(
      (dataSource) => dataSource.workspaceId === scope.workspaceId,
    );
  }

  async readDashboardLayout(scope: DashboardScope): Promise<DashboardLayoutSnapshot> {
    const dashboard = this.#requireDashboard(scope);
    return {
      ...scope,
      revision: dashboard.layoutRevision,
      widgets: await this.listWidgetInstances(scope),
    };
  }

  async writeDashboardLayout(
    scope: DashboardScope,
    expectedRevision: number,
    widgets: readonly WidgetInstance[],
  ): Promise<DashboardLayoutSnapshot> {
    const dashboard = this.#requireDashboard(scope);
    if (dashboard.layoutRevision !== expectedRevision) {
      throw new WorkspaceModelError(
        "revision-conflict",
        `dashboard ${scope.dashboardId} layout revision changed`,
      );
    }

    const ids = new Set<WidgetInstanceId>();
    for (const widget of widgets) {
      if (widget.workspaceId !== scope.workspaceId || widget.dashboardId !== scope.dashboardId) {
        throw new WorkspaceModelError(
          "scope-mismatch",
          `widget ${widget.id} does not belong to dashboard ${scope.dashboardId}`,
        );
      }
      if (ids.has(widget.id)) {
        throw new WorkspaceModelError("already-exists", `widget instance already exists: ${widget.id}`);
      }
      ids.add(widget.id);
    }

    for (const [id, widget] of this.#widgets) {
      if (widget.workspaceId === scope.workspaceId && widget.dashboardId === scope.dashboardId) {
        this.#widgets.delete(id);
      }
    }
    for (const widget of widgets) {
      this.#widgets.set(widget.id, widget);
    }

    const updated = { ...dashboard, layoutRevision: dashboard.layoutRevision + 1 };
    this.#dashboards.set(updated.id, updated);
    return {
      ...scope,
      revision: updated.layoutRevision,
      widgets: [...widgets],
    };
  }

  async deleteDashboard(scope: DashboardScope): Promise<void> {
    this.#requireDashboard(scope);
    this.#dashboards.delete(scope.dashboardId);

    for (const [id, widget] of this.#widgets) {
      if (widget.workspaceId === scope.workspaceId && widget.dashboardId === scope.dashboardId) {
        this.#widgets.delete(id);
      }
    }
  }

  async deleteWorkspace(scope: WorkspaceScope): Promise<void> {
    this.#requireWorkspace(scope.workspaceId);
    this.#workspaces.delete(scope.workspaceId);

    for (const [id, dashboard] of this.#dashboards) {
      if (dashboard.workspaceId === scope.workspaceId) {
        this.#dashboards.delete(id);
      }
    }
    for (const [id, widget] of this.#widgets) {
      if (widget.workspaceId === scope.workspaceId) {
        this.#widgets.delete(id);
      }
    }
    for (const [id, dataSource] of this.#dataSources) {
      if (dataSource.workspaceId === scope.workspaceId) {
        this.#dataSources.delete(id);
      }
    }
  }

  #assertAvailable<Key>(map: ReadonlyMap<Key, unknown>, id: Key, resource: string): void {
    if (map.has(id)) {
      throw new WorkspaceModelError("already-exists", `${resource} already exists: ${String(id)}`);
    }
  }

  #requireDashboard(scope: DashboardScope): Dashboard {
    const dashboard = this.#dashboards.get(scope.dashboardId);
    if (!dashboard) {
      throw new WorkspaceModelError("not-found", `dashboard not found: ${scope.dashboardId}`);
    }
    if (dashboard.workspaceId !== scope.workspaceId) {
      throw new WorkspaceModelError(
        "scope-mismatch",
        `dashboard ${scope.dashboardId} does not belong to workspace ${scope.workspaceId}`,
      );
    }
    return dashboard;
  }

  #requireWorkspace(id: WorkspaceId): Workspace {
    const workspace = this.#workspaces.get(id);
    if (!workspace) {
      throw new WorkspaceModelError("not-found", `workspace not found: ${id}`);
    }
    return workspace;
  }
}
