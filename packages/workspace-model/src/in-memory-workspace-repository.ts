/**
 * @author Avesd
 * @package Workspace Model
 * @namespace Root
 * @description In Memory Workspace Repository
 */

import type { CreateDashboard,
    CreateDataSource,
    CreateWorkspace,
    Dashboard,
    DashboardId,
    DashboardLayoutSnapshot,
    DashboardScope,
    DataSource,
    DataSourceId,
    DataSourceScope,
    JsonValue,
    WidgetInstance,
    WidgetInstanceId,
    Workspace,
    WorkspaceId,
    WorkspaceRepository,
    WorkspaceRepositoryListener,
    WorkspaceScope,
    WorkspaceSnapshot } from "./workspace-model";
import { WorkspaceModelError } from "./workspace-model-error";

export class InMemoryWorkspaceRepository implements WorkspaceRepository {
    #selection?: DashboardScope;
    readonly #dashboards = new Map<DashboardId, Dashboard>();
    readonly #dataSources = new Map<DataSourceId, DataSource>();
    readonly #widgets = new Map<WidgetInstanceId, WidgetInstance>();
    readonly #workspaces = new Map<WorkspaceId, Workspace>();
    readonly #listeners = new Set<WorkspaceRepositoryListener>();

    constructor(snapshot?: WorkspaceSnapshot) {

        this.#hydrate(snapshot);
    }

    replace(snapshot?: WorkspaceSnapshot, notify = true): void {

        this.#workspaces.clear();
        this.#dashboards.clear();
        this.#dataSources.clear();
        this.#widgets.clear();
        this.#hydrate(snapshot);
        if (notify) {
            this.#emit();
        }
    }

    #hydrate(snapshot?: WorkspaceSnapshot): void {

        this.#selection = snapshot?.selection;
        for (const workspace of snapshot?.workspaces ?? []) {
            this.#workspaces.set(workspace.id, workspace);
        }
        for (const dashboard of snapshot?.dashboards ?? []) {
            this.#dashboards.set(dashboard.id, dashboard);
        }
        for (const dataSource of snapshot?.dataSources ?? []) {
            this.#dataSources.set(dataSource.id, dataSource);
        }
        for (const widget of snapshot?.widgets ?? []) {
            this.#widgets.set(widget.id, widget);
        }
    }

    async createWorkspace(workspace: CreateWorkspace): Promise<Workspace> {

        this.#assertAvailable(this.#workspaces, workspace.id, "workspace");
        this.#workspaces.set(workspace.id, workspace);
        this.#emit();

        return workspace;
    }

    async createDashboard(
        scope: WorkspaceScope,
        dashboard: CreateDashboard,
    ): Promise<Dashboard> {

        this.#requireWorkspace(scope.workspaceId);
        this.#assertAvailable(this.#dashboards, dashboard.id, "dashboard");
        const created = {
            ...dashboard,
            layoutRevision: 0,
            workspaceId: scope.workspaceId,
        };
        this.#dashboards.set(created.id, created);
        this.#emit();

        return created;
    }

    async createDataSource(
        scope: DataSourceScope,
        dataSource: CreateDataSource,
    ): Promise<DataSource> {

        this.#requireWorkspace(scope.workspaceId);
        if (scope.kind === "dashboard") {
            this.#requireDashboard(scope);
        }
        this.#assertAvailable(this.#dataSources, dataSource.id, "data source");
        const created = {
            ...dataSource,
            revision: 0,
            scope,
        };
        this.#dataSources.set(created.id, created);
        this.#emit();

        return created;
    }

    async listWorkspaces(): Promise<readonly Workspace[]> {

        return [...this.#workspaces.values()];
    }

    async listDashboards(scope: WorkspaceScope): Promise<readonly Dashboard[]> {

        this.#requireWorkspace(scope.workspaceId);

        return [...this.#dashboards.values()].filter((dashboard) => {

            return dashboard.workspaceId === scope.workspaceId;
        });
    }

    async listWidgetInstances(scope: DashboardScope): Promise<readonly WidgetInstance[]> {

        this.#requireDashboard(scope);

        return [...this.#widgets.values()].filter((widget) =>
        {

            return widget.workspaceId === scope.workspaceId && widget.dashboardId === scope.dashboardId;
        });
    }

    async listDataSources(scope: WorkspaceScope): Promise<readonly DataSource[]> {

        this.#requireWorkspace(scope.workspaceId);

        return [...this.#dataSources.values()].filter((dataSource) => {

            return dataSource.scope.workspaceId === scope.workspaceId;
        });
    }

    async readDataSource(
        scope: WorkspaceScope,
        dataSourceId: DataSourceId,
    ): Promise<DataSource> {

        this.#requireWorkspace(scope.workspaceId);
        const source = this.#dataSources.get(dataSourceId);
        if (!source) {
            throw new WorkspaceModelError("not-found", `data source not found: ${dataSourceId}`);
        }
        if (source.scope.workspaceId !== scope.workspaceId) {
            throw new WorkspaceModelError(
                "scope-mismatch",
                `data source ${dataSourceId} does not belong to workspace ${scope.workspaceId}`,
            );
        }

        return source;
    }

    async updateDataSource(
        scope: WorkspaceScope,
        dataSourceId: DataSourceId,
        expectedRevision: number,
        value: JsonValue,
    ): Promise<DataSource> {

        const source = await this.readDataSource(scope, dataSourceId);
        if (source.revision !== expectedRevision) {
            throw new WorkspaceModelError(
                "revision-conflict",
                `data source ${dataSourceId} revision changed`,
            );
        }
        const updated = {
            ...source,
            revision: source.revision + 1,
            value,
        };
        this.#dataSources.set(dataSourceId, updated);
        this.#emit();

        return updated;
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

        for (const [
            id,
            widget,
        ] of this.#widgets) {
            if (widget.workspaceId === scope.workspaceId && widget.dashboardId === scope.dashboardId) {
                this.#widgets.delete(id);
            }
        }
        for (const widget of widgets) {
            this.#widgets.set(widget.id, widget);
        }

        const updated = {
            ...dashboard,
            layoutRevision: dashboard.layoutRevision + 1,
        };
        this.#dashboards.set(updated.id, updated);
        this.#emit();

        return {
            ...scope,
            revision: updated.layoutRevision,
            widgets: [...widgets],
        };
    }

    async deleteDashboard(scope: DashboardScope): Promise<void> {

        this.#requireDashboard(scope);
        if (this.#selection?.dashboardId === scope.dashboardId) {
            this.#selection = undefined;
        }
        this.#dashboards.delete(scope.dashboardId);

        for (const [
            id,
            widget,
        ] of this.#widgets) {
            if (widget.workspaceId === scope.workspaceId && widget.dashboardId === scope.dashboardId) {
                this.#widgets.delete(id);
            }
        }
        for (const [
            id,
            dataSource,
        ] of this.#dataSources) {
            if (
                dataSource.scope.kind === "dashboard"
        && dataSource.scope.workspaceId === scope.workspaceId
        && dataSource.scope.dashboardId === scope.dashboardId
            ) {
                this.#dataSources.delete(id);
            }
        }
        this.#emit();
    }

    async deleteDataSource(scope: WorkspaceScope, dataSourceId: DataSourceId): Promise<void> {

        await this.readDataSource(scope, dataSourceId);
        this.#dataSources.delete(dataSourceId);
        for (const [
            id,
            widget,
        ] of this.#widgets) {
            const bindings = Object.fromEntries(Object.entries(widget.bindings).map(([
                inputId,
                ids,
            ]) => {

                return [
                    inputId,
                    ids.filter((candidate) => {

                        return candidate !== dataSourceId;
                    }),
                ];
            }));
            this.#widgets.set(id, {
                ...widget,
                bindings,
            });
        }
        this.#emit();
    }

    async deleteWorkspace(scope: WorkspaceScope): Promise<void> {

        this.#requireWorkspace(scope.workspaceId);
        if (this.#selection?.workspaceId === scope.workspaceId) {
            this.#selection = undefined;
        }
        this.#workspaces.delete(scope.workspaceId);

        for (const [
            id,
            dashboard,
        ] of this.#dashboards) {
            if (dashboard.workspaceId === scope.workspaceId) {
                this.#dashboards.delete(id);
            }
        }
        for (const [
            id,
            widget,
        ] of this.#widgets) {
            if (widget.workspaceId === scope.workspaceId) {
                this.#widgets.delete(id);
            }
        }
        for (const [
            id,
            dataSource,
        ] of this.#dataSources) {
            if (dataSource.scope.workspaceId === scope.workspaceId) {
                this.#dataSources.delete(id);
            }
        }
        this.#emit();
    }

    async snapshot(): Promise<WorkspaceSnapshot> {

        return {
            ...(this.#selection ? { selection: this.#selection } : {}),
            dashboards: [...this.#dashboards.values()],
            dataSources: [...this.#dataSources.values()],
            version: 1,
            widgets: [...this.#widgets.values()],
            workspaces: [...this.#workspaces.values()],
        };
    }

    subscribe(listener: WorkspaceRepositoryListener): () => void {

        this.#listeners.add(listener);

        return () => {

            return this.#listeners.delete(listener);
        };
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

    #emit(): void {

        for (const listener of this.#listeners) {
            listener();
        }
    }
}
