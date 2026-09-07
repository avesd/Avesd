import { describe, expect, it } from "vitest";

import { DashboardLayoutCoordinator } from "./dashboard-layout";
import { InMemoryWorkspaceRepository } from "./in-memory-workspace-repository";
import type {
  DashboardId,
  DataSourceId,
  WidgetInstanceId,
  WorkspaceId,
} from "./workspace-model";

const ids = {
  dashboardA: "dashboard-a" as DashboardId,
  dashboardB: "dashboard-b" as DashboardId,
  dataSource: "source-a" as DataSourceId,
  widget: "widget-a" as WidgetInstanceId,
  workspaceA: "workspace-a" as WorkspaceId,
  workspaceB: "workspace-b" as WorkspaceId,
};

const emptyConfiguration = {};
const widgetDefinition = {
  defaultConfiguration: emptyConfiguration,
  configurationVersion: 1,
  defaultSize: { height: 4, width: 6 },
  displayName: "Chart",
  inputs: [],
  pluginId: "example.plugin",
  sizePolicy: {
    kind: "fixed" as const,
    sizes: [{ height: 4, width: 6 }],
  },
  widgetTypeId: "example.chart",
};

const addWidget = async (
  repository: InMemoryWorkspaceRepository,
  workspaceId: WorkspaceId,
  dashboardId: DashboardId,
) => {
  const layouts = new DashboardLayoutCoordinator(
    repository,
    (pluginId, widgetTypeId) =>
      pluginId === widgetDefinition.pluginId && widgetTypeId === widgetDefinition.widgetTypeId
        ? widgetDefinition
        : undefined,
  );
  return layouts.apply(
    { dashboardId, workspaceId },
    {
      expectedRevision: 0,
      operations: [{
        id: ids.widget,
        pluginId: widgetDefinition.pluginId,
        type: "add",
        widgetTypeId: widgetDefinition.widgetTypeId,
      }],
    },
  );
};

describe("InMemoryWorkspaceRepository", () => {
  it("keeps dashboards, widgets, and data sources in explicit workspace scopes", async () => {
    const repository = new InMemoryWorkspaceRepository();
    await repository.createWorkspace({ id: ids.workspaceA, name: "Personal" });
    await repository.createWorkspace({ id: ids.workspaceB, name: "Studio" });
    await repository.createDashboard(
      { workspaceId: ids.workspaceA },
      { id: ids.dashboardA, name: "Overview", viewState: emptyConfiguration },
    );
    await repository.createDashboard(
      { workspaceId: ids.workspaceB },
      { id: ids.dashboardB, name: "Operations", viewState: emptyConfiguration },
    );
    await addWidget(repository, ids.workspaceA, ids.dashboardA);
    await repository.createDataSource(
      { kind: "workspace", workspaceId: ids.workspaceA },
      {
        configuration: emptyConfiguration,
        dataType: "example.activity",
        id: ids.dataSource,
        name: "Activity",
        pluginId: "example.plugin",
        sourceTypeId: "example.activity",
        value: [],
      },
    );

    await expect(repository.listDashboards({ workspaceId: ids.workspaceA })).resolves.toEqual([
      expect.objectContaining({ id: ids.dashboardA, workspaceId: ids.workspaceA }),
    ]);
    await expect(repository.listDashboards({ workspaceId: ids.workspaceB })).resolves.toEqual([
      expect.objectContaining({ id: ids.dashboardB, workspaceId: ids.workspaceB }),
    ]);
    await expect(
      repository.listWidgetInstances({
        dashboardId: ids.dashboardA,
        workspaceId: ids.workspaceA,
      }),
    ).resolves.toHaveLength(1);
    await expect(repository.listDataSources({ workspaceId: ids.workspaceA })).resolves.toHaveLength(
      1,
    );
  });

  it("deletes dashboard-owned widgets but preserves workspace-owned data", async () => {
    const repository = new InMemoryWorkspaceRepository();
    await repository.createWorkspace({ id: ids.workspaceA, name: "Personal" });
    await repository.createDashboard(
      { workspaceId: ids.workspaceA },
      { id: ids.dashboardA, name: "Overview", viewState: emptyConfiguration },
    );
    await addWidget(repository, ids.workspaceA, ids.dashboardA);
    await repository.createDataSource(
      { kind: "workspace", workspaceId: ids.workspaceA },
      {
        configuration: emptyConfiguration,
        dataType: "example.activity",
        id: ids.dataSource,
        name: "Activity",
        pluginId: "example.plugin",
        sourceTypeId: "example.activity",
        value: [],
      },
    );

    await repository.deleteDashboard({
      dashboardId: ids.dashboardA,
      workspaceId: ids.workspaceA,
    });

    await expect(repository.listDashboards({ workspaceId: ids.workspaceA })).resolves.toEqual([]);
    await expect(repository.listDataSources({ workspaceId: ids.workspaceA })).resolves.toHaveLength(
      1,
    );
  });

  it("rejects a dashboard used through the wrong workspace scope", async () => {
    const repository = new InMemoryWorkspaceRepository();
    await repository.createWorkspace({ id: ids.workspaceA, name: "Personal" });
    await repository.createWorkspace({ id: ids.workspaceB, name: "Studio" });
    await repository.createDashboard(
      { workspaceId: ids.workspaceA },
      { id: ids.dashboardA, name: "Overview", viewState: emptyConfiguration },
    );

    await expect(
      repository.listWidgetInstances({
        dashboardId: ids.dashboardA,
        workspaceId: ids.workspaceB,
      }),
    ).rejects.toMatchObject({ code: "scope-mismatch" });
  });

  it("cascades workspace deletion through all workspace-owned content", async () => {
    const repository = new InMemoryWorkspaceRepository();
    await repository.createWorkspace({ id: ids.workspaceA, name: "Personal" });
    await repository.createDashboard(
      { workspaceId: ids.workspaceA },
      { id: ids.dashboardA, name: "Overview", viewState: emptyConfiguration },
    );
    await repository.createDataSource(
      { kind: "workspace", workspaceId: ids.workspaceA },
      {
        configuration: emptyConfiguration,
        dataType: "example.activity",
        id: ids.dataSource,
        name: "Activity",
        pluginId: "example.plugin",
        sourceTypeId: "example.activity",
        value: [],
      },
    );

    await repository.deleteWorkspace({ workspaceId: ids.workspaceA });

    await expect(repository.listWorkspaces()).resolves.toEqual([]);
    await expect(repository.listDashboards({ workspaceId: ids.workspaceA })).rejects.toMatchObject({
      code: "not-found",
    });
  });
});
