/**
 * @author Avesd
 * @package Workspace Model
 * @namespace Root
 * @description Workspace Model exports
 */

export type {
    ApplyDashboardLayout,
    DashboardLayoutErrorCode,
    DashboardLayoutOperation,
    DashboardLayoutService,
    WidgetDefinition,
    WidgetDefinitionResolver,
    WidgetInputDefinition,
    WidgetSize,
} from "./dashboard-layout";
export {
    DASHBOARD_GRID_COLUMNS,
    DashboardLayoutCoordinator,
    DashboardLayoutError,
    findAvailablePlacement,
} from "./dashboard-layout";
export type {
    CreateDataSourceCommand,
    DataSourceDefinition,
    DataSourceDefinitionResolver,
    DataSourceService,
} from "./data-sources";
export { WorkspaceDataCoordinator } from "./data-sources";
export { InMemoryWorkspaceRepository } from "./in-memory-workspace-repository";
export type { WorkspacePersistenceDriver } from "./persistent-workspace-repository";
export { PersistentWorkspaceRepository } from "./persistent-workspace-repository";
export type { PluginDatabase, PluginFileEntry, PluginFileService, PluginSqliteService, SqlMutationResult, SqlStatement, SqlValue } from "./plugin-storage";
export type { PluginResourceService, ResourceAccess, ResourceContract, ResourceIdentity, ResourceKind, ResourcePublication, ResourceQuery, ResourceRecord, SharedFile, SharedResource } from "./shared-resources";
export { describeResource, resourceAccess } from "./shared-resources";
export type { DashboardSummary, WidgetCatalogService, WidgetManagementService, WidgetNavigationService, WidgetWorkspaceCapability, WidgetWorkspaceServices, WorkspaceCatalogQuery, WorkspaceCatalogResult, WorkspaceManagementCommand } from "./workspace-catalog";
export { readWorkspaceCatalog } from "./workspace-catalog";
export type {
    CreateDashboard,
    CreateDataSource,
    CreateWidgetInstance,
    CreateWorkspace,
    Dashboard,
    DashboardDataSourceScope,
    DashboardId,
    DashboardLayoutSnapshot,
    DashboardScope,
    DataSource,
    DataSourceId,
    DataSourceScope,
    GridPlacement,
    JsonObject,
    JsonValue,
    WidgetInstance,
    WidgetInstanceId,
    Workspace,
    WorkspaceDataSourceScope,
    WorkspaceId,
    WorkspaceRepository,
    WorkspaceRepositoryListener,
    WorkspaceScope,
    WorkspaceSnapshot,
} from "./workspace-model";
export { WorkspaceModelError } from "./workspace-model-error";
export type { WorkspaceNavigationCommand, WorkspaceNavigationState } from "./workspace-navigation";
export { navigateWorkspace, sameDashboard } from "./workspace-navigation";
export { parseWorkspaceSnapshot } from "./workspace-snapshot";
