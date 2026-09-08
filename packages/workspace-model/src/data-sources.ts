/**
 * @author Avesd
 * @package Workspace Model
 * @namespace Root
 * @description Data Sources
 */

import type { DashboardScope,
    DataSource,
    DataSourceId,
    DataSourceScope,
    JsonObject,
    JsonValue,
    WorkspaceRepository,
    WorkspaceRepositoryListener,
    WorkspaceScope } from "./workspace-model";

export interface DataSourceDefinition {
    readonly configuration: JsonObject;
    readonly dataType: string;
    readonly displayName: string;
    readonly initialValue: JsonValue;
    readonly pluginId: string;
    readonly sourceTypeId: string;
}

export type DataSourceDefinitionResolver = (
    pluginId: string,
    sourceTypeId: string,
) => DataSourceDefinition | undefined;

export interface CreateDataSourceCommand {
    readonly configuration?: JsonObject;
    readonly id: DataSourceId;
    readonly name: string;
    readonly pluginId: string;
    readonly sourceTypeId: string;
}

export interface DataSourceService {
    create(scope: DataSourceScope, command: CreateDataSourceCommand): Promise<DataSource>;
    delete(scope: WorkspaceScope, dataSourceId: DataSourceId): Promise<void>;
    list(scope: DashboardScope): Promise<readonly DataSource[]>;
    read(scope: WorkspaceScope, dataSourceId: DataSourceId): Promise<DataSource>;
    subscribe(listener: WorkspaceRepositoryListener): () => void;
    update(
        scope: WorkspaceScope,
        dataSourceId: DataSourceId,
        expectedRevision: number,
        value: JsonValue,
    ): Promise<DataSource>;
}

export class WorkspaceDataCoordinator implements DataSourceService {
    constructor(
        private readonly repository: WorkspaceRepository,
        private readonly resolveDefinition: DataSourceDefinitionResolver,
    ) {}

    async create(
        scope: DataSourceScope,
        command: CreateDataSourceCommand,
    ): Promise<DataSource> {
        const definition = this.resolveDefinition(command.pluginId, command.sourceTypeId);
        if (!definition) {
            throw new Error(`data source type is unavailable: ${command.pluginId}/${command.sourceTypeId}`);
        }
        return this.repository.createDataSource(scope, {
            configuration: command.configuration ?? definition.configuration,
            dataType: definition.dataType,
            id: command.id,
            name: command.name,
            pluginId: command.pluginId,
            sourceTypeId: command.sourceTypeId,
            value: definition.initialValue,
        });
    }

    delete(scope: WorkspaceScope, dataSourceId: DataSourceId): Promise<void> {
        return this.repository.deleteDataSource(scope, dataSourceId);
    }

    async list(scope: DashboardScope): Promise<readonly DataSource[]> {
        const sources = await this.repository.listDataSources(scope);
        return sources.filter((source) =>
        {
            return source.scope.kind === "workspace" || source.scope.dashboardId === scope.dashboardId;
        });
    }

    read(scope: WorkspaceScope, dataSourceId: DataSourceId): Promise<DataSource> {
        return this.repository.readDataSource(scope, dataSourceId);
    }

    subscribe(listener: WorkspaceRepositoryListener): () => void {
        return this.repository.subscribe(listener);
    }

    update(
        scope: WorkspaceScope,
        dataSourceId: DataSourceId,
        expectedRevision: number,
        value: JsonValue,
    ): Promise<DataSource> {
        return this.repository.updateDataSource(scope, dataSourceId, expectedRevision, value);
    }
}
