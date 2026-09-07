import { InMemoryWorkspaceRepository } from "./in-memory-workspace-repository";
import type {
  CreateDashboard,
  CreateDataSource,
  CreateWorkspace,
  Dashboard,
  DashboardLayoutSnapshot,
  DashboardScope,
  DataSource,
  DataSourceId,
  DataSourceScope,
  JsonValue,
  WidgetInstance,
  Workspace,
  WorkspaceRepository,
  WorkspaceRepositoryListener,
  WorkspaceScope,
  WorkspaceSnapshot,
} from "./workspace-model";

export interface WorkspacePersistenceDriver {
  load(): Promise<unknown>;
  save(snapshot: WorkspaceSnapshot): Promise<void>;
}

export class PersistentWorkspaceRepository implements WorkspaceRepository {
  private constructor(
    private readonly driver: WorkspacePersistenceDriver,
    private readonly memory: InMemoryWorkspaceRepository,
  ) {}

  static async open(driver: WorkspacePersistenceDriver): Promise<PersistentWorkspaceRepository> {
    const stored = await driver.load();
    return new PersistentWorkspaceRepository(
      driver,
      new InMemoryWorkspaceRepository(parseWorkspaceSnapshot(stored)),
    );
  }

  async createWorkspace(workspace: CreateWorkspace): Promise<Workspace> {
    await this.refresh(false);
    const result = await this.memory.createWorkspace(workspace);
    await this.persist();
    return result;
  }

  async createDashboard(scope: WorkspaceScope, dashboard: CreateDashboard): Promise<Dashboard> {
    await this.refresh(false);
    const result = await this.memory.createDashboard(scope, dashboard);
    await this.persist();
    return result;
  }

  async createDataSource(
    scope: DataSourceScope,
    dataSource: CreateDataSource,
  ): Promise<DataSource> {
    await this.refresh(false);
    const result = await this.memory.createDataSource(scope, dataSource);
    await this.persist();
    return result;
  }

  async deleteDashboard(scope: DashboardScope): Promise<void> {
    await this.refresh(false);
    await this.memory.deleteDashboard(scope);
    await this.persist();
  }

  async deleteDataSource(scope: WorkspaceScope, dataSourceId: DataSourceId): Promise<void> {
    await this.refresh(false);
    await this.memory.deleteDataSource(scope, dataSourceId);
    await this.persist();
  }

  async deleteWorkspace(scope: WorkspaceScope): Promise<void> {
    await this.refresh(false);
    await this.memory.deleteWorkspace(scope);
    await this.persist();
  }

  listDashboards(scope: WorkspaceScope): Promise<readonly Dashboard[]> {
    return this.memory.listDashboards(scope);
  }

  listDataSources(scope: WorkspaceScope): Promise<readonly DataSource[]> {
    return this.memory.listDataSources(scope);
  }

  listWidgetInstances(scope: DashboardScope): Promise<readonly WidgetInstance[]> {
    return this.memory.listWidgetInstances(scope);
  }

  listWorkspaces(): Promise<readonly Workspace[]> {
    return this.memory.listWorkspaces();
  }

  readDashboardLayout(scope: DashboardScope): Promise<DashboardLayoutSnapshot> {
    return this.memory.readDashboardLayout(scope);
  }

  readDataSource(scope: WorkspaceScope, dataSourceId: DataSourceId): Promise<DataSource> {
    return this.memory.readDataSource(scope, dataSourceId);
  }

  snapshot(): Promise<WorkspaceSnapshot> {
    return this.memory.snapshot();
  }

  subscribe(listener: WorkspaceRepositoryListener): () => void {
    return this.memory.subscribe(listener);
  }

  async refresh(notify = true): Promise<void> {
    const stored = parseWorkspaceSnapshot(await this.driver.load());
    this.memory.replace(stored, notify);
  }

  async updateDataSource(
    scope: WorkspaceScope,
    dataSourceId: DataSourceId,
    expectedRevision: number,
    value: JsonValue,
  ): Promise<DataSource> {
    await this.refresh(false);
    const result = await this.memory.updateDataSource(
      scope,
      dataSourceId,
      expectedRevision,
      value,
    );
    await this.persist();
    return result;
  }

  async writeDashboardLayout(
    scope: DashboardScope,
    expectedRevision: number,
    widgets: readonly WidgetInstance[],
  ): Promise<DashboardLayoutSnapshot> {
    await this.refresh(false);
    const result = await this.memory.writeDashboardLayout(scope, expectedRevision, widgets);
    await this.persist();
    return result;
  }

  private async persist(): Promise<void> {
    await this.driver.save(await this.memory.snapshot());
  }
}

export const parseWorkspaceSnapshot = (input: unknown): WorkspaceSnapshot | undefined => {
  if (input === undefined || input === null) {
    return undefined;
  }
  if (!isRecord(input) || input.version !== 1) {
    throw new Error("Unsupported workspace data format");
  }
  for (const key of ["workspaces", "dashboards", "widgets", "dataSources"] as const) {
    if (!Array.isArray(input[key])) {
      throw new Error(`Invalid workspace data: ${key} must be an array`);
    }
  }
  return input as unknown as WorkspaceSnapshot;
};

const isRecord = (input: unknown): input is Record<string, unknown> =>
  typeof input === "object" && input !== null && !Array.isArray(input);
