declare const workspaceIdBrand: unique symbol;
declare const dashboardIdBrand: unique symbol;
declare const widgetInstanceIdBrand: unique symbol;
declare const dataSourceIdBrand: unique symbol;

export type WorkspaceId = string & { readonly [workspaceIdBrand]: true };
export type DashboardId = string & { readonly [dashboardIdBrand]: true };
export type WidgetInstanceId = string & { readonly [widgetInstanceIdBrand]: true };
export type DataSourceId = string & { readonly [dataSourceIdBrand]: true };

export type JsonValue =
  | boolean
  | number
  | string
  | null
  | readonly JsonValue[]
  | JsonObject;

export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export interface WorkspaceScope {
  readonly workspaceId: WorkspaceId;
}

export interface DashboardScope extends WorkspaceScope {
  readonly dashboardId: DashboardId;
}

export interface WorkspaceDataSourceScope extends WorkspaceScope {
  readonly kind: "workspace";
}

export interface DashboardDataSourceScope extends DashboardScope {
  readonly kind: "dashboard";
}

export type DataSourceScope = WorkspaceDataSourceScope | DashboardDataSourceScope;

export interface Workspace {
  readonly id: WorkspaceId;
  readonly name: string;
}

export interface Dashboard {
  readonly id: DashboardId;
  readonly layoutRevision: number;
  readonly name: string;
  readonly viewState: JsonObject;
  readonly workspaceId: WorkspaceId;
}

export interface WidgetInstance {
  readonly bindings: Readonly<Record<string, readonly DataSourceId[]>>;
  readonly configuration: JsonObject;
  readonly configurationVersion: number;
  readonly dashboardId: DashboardId;
  readonly id: WidgetInstanceId;
  readonly pluginId: string;
  readonly placement: GridPlacement;
  readonly widgetTypeId: string;
  readonly workspaceId: WorkspaceId;
}

export interface DataSource {
  readonly configuration: JsonObject;
  readonly dataType: string;
  readonly id: DataSourceId;
  readonly name: string;
  readonly pluginId: string;
  readonly revision: number;
  readonly scope: DataSourceScope;
  readonly sourceTypeId: string;
  readonly value: JsonValue;
}

export type CreateWorkspace = Workspace;
export interface GridPlacement {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

export interface DashboardLayoutSnapshot extends DashboardScope {
  readonly revision: number;
  readonly widgets: readonly WidgetInstance[];
}

export type CreateDashboard = Omit<Dashboard, "layoutRevision" | "workspaceId">;
export type CreateWidgetInstance = Omit<WidgetInstance, "dashboardId" | "workspaceId">;
export type CreateDataSource = Omit<DataSource, "revision" | "scope">;

export interface WorkspaceSnapshot {
  readonly selection?: DashboardScope;
  readonly dashboards: readonly Dashboard[];
  readonly dataSources: readonly DataSource[];
  readonly version: 1;
  readonly widgets: readonly WidgetInstance[];
  readonly workspaces: readonly Workspace[];
}

export type WorkspaceRepositoryListener = () => void;

export interface WorkspaceRepository {
  createDashboard(scope: WorkspaceScope, dashboard: CreateDashboard): Promise<Dashboard>;
  createDataSource(scope: DataSourceScope, dataSource: CreateDataSource): Promise<DataSource>;
  createWorkspace(workspace: CreateWorkspace): Promise<Workspace>;
  deleteDashboard(scope: DashboardScope): Promise<void>;
  deleteDataSource(scope: WorkspaceScope, dataSourceId: DataSourceId): Promise<void>;
  deleteWorkspace(scope: WorkspaceScope): Promise<void>;
  listDashboards(scope: WorkspaceScope): Promise<readonly Dashboard[]>;
  listDataSources(scope: WorkspaceScope): Promise<readonly DataSource[]>;
  listWidgetInstances(scope: DashboardScope): Promise<readonly WidgetInstance[]>;
  listWorkspaces(): Promise<readonly Workspace[]>;
  readDataSource(scope: WorkspaceScope, dataSourceId: DataSourceId): Promise<DataSource>;
  readDashboardLayout(scope: DashboardScope): Promise<DashboardLayoutSnapshot>;
  writeDashboardLayout(
    scope: DashboardScope,
    expectedRevision: number,
    widgets: readonly WidgetInstance[],
  ): Promise<DashboardLayoutSnapshot>;
  updateDataSource(
    scope: WorkspaceScope,
    dataSourceId: DataSourceId,
    expectedRevision: number,
    value: JsonValue,
  ): Promise<DataSource>;
  snapshot(): Promise<WorkspaceSnapshot>;
  subscribe(listener: WorkspaceRepositoryListener): () => void;
}
