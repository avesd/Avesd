/**
 * @author Avesd
 * @package Workspace Model
 * @namespace Root
 * @description Persistent Workspace Repository
 */

import { InMemoryWorkspaceRepository } from "./in-memory-workspace-repository";
import type { CreateDashboard,
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
    WorkspaceSnapshot } from "./workspace-model";
import { parseWorkspaceSnapshot } from "./workspace-snapshot";

export interface WorkspacePersistenceDriver {
    load(): Promise<unknown>;
    save(snapshot: WorkspaceSnapshot, expected?: {
        snapshot: WorkspaceSnapshot | undefined;
    }): Promise<void>;
}

export class PersistentWorkspaceRepository implements WorkspaceRepository {
    #queue: Promise<unknown> = Promise.resolve();
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
        return this.mutate(async () => {
            return this.memory.createWorkspace(workspace);
        });
    }

    async createDashboard(scope: WorkspaceScope, dashboard: CreateDashboard): Promise<Dashboard> {
        return this.mutate(async () => {
            return this.memory.createDashboard(scope, dashboard);
        });
    }

    async createDataSource(
        scope: DataSourceScope,
        dataSource: CreateDataSource,
    ): Promise<DataSource> {
        return this.mutate(async () => {
            return this.memory.createDataSource(scope, dataSource);
        });
    }

    async deleteDashboard(scope: DashboardScope): Promise<void> {
        return this.mutate(async () => {
            await this.memory.deleteDashboard(scope);
        });
    }

    async deleteDataSource(scope: WorkspaceScope, dataSourceId: DataSourceId): Promise<void> {
        return this.mutate(async () => {
            await this.memory.deleteDataSource(scope, dataSourceId);
        });
    }

    async deleteWorkspace(scope: WorkspaceScope): Promise<void> {
        return this.mutate(async () => {
            await this.memory.deleteWorkspace(scope);
        });
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
        return this.serial(async () => {
            const stored = parseWorkspaceSnapshot(await this.driver.load());
            this.memory.replace(stored, notify);
        });
    }

    async updateDataSource(
        scope: WorkspaceScope,
        dataSourceId: DataSourceId,
        expectedRevision: number,
        value: JsonValue,
    ): Promise<DataSource> {
        return this.mutate(async () => {
            return this.memory.updateDataSource(
                scope,
                dataSourceId,
                expectedRevision,
                value,
            );
        });
    }

    async writeDashboardLayout(
        scope: DashboardScope,
        expectedRevision: number,
        widgets: readonly WidgetInstance[],
    ): Promise<DashboardLayoutSnapshot> {
        return this.mutate(async () => {
            return this.memory.writeDashboardLayout(scope, expectedRevision, widgets);
        });
    }

    private mutate<T>(operation: () => Promise<T>): Promise<T> {
        return this.serial(async () => {
            const stored = parseWorkspaceSnapshot(await this.driver.load());
            this.memory.replace(stored, false);
            try {
                const result = await operation();
                await this.driver.save(parseWorkspaceSnapshot(await this.memory.snapshot())!, { snapshot: stored });
                return result;
            } catch (error) {
                this.memory.replace(parseWorkspaceSnapshot(await this.driver.load()), true);
                throw error;
            }
        });
    }

    private serial<T>(operation: () => Promise<T>): Promise<T> {
        const work = this.#queue.then(operation);
        this.#queue = work.catch(() => {
            return undefined;
        });
        return work;
    }
}
