import { describe, expect, it } from "vitest";

import {
  DashboardLayoutCoordinator,
  findAvailablePlacement,
  isSupportedWidgetSize,
} from "./dashboard-layout";
import { InMemoryWorkspaceRepository } from "./in-memory-workspace-repository";
import type {
  DashboardId,
  DashboardScope,
  WidgetInstanceId,
  WorkspaceId,
} from "./workspace-model";

const scope: DashboardScope = {
  dashboardId: "dashboard-a" as DashboardId,
  workspaceId: "workspace-a" as WorkspaceId,
};

const definition = {
  defaultConfiguration: { tone: "quiet" },
  defaultSize: { height: 4, width: 6 },
  displayName: "Status",
  pluginId: "example.plugin",
  sizePolicy: {
    kind: "fixed" as const,
    sizes: [
      { height: 4, width: 6 },
      { height: 6, width: 12 },
    ],
  },
  widgetTypeId: "status",
};

const setup = async () => {
  const repository = new InMemoryWorkspaceRepository();
  await repository.createWorkspace({ id: scope.workspaceId, name: "Personal" });
  await repository.createDashboard(
    { workspaceId: scope.workspaceId },
    { id: scope.dashboardId, name: "Overview", viewState: {} },
  );
  const layouts = new DashboardLayoutCoordinator(
    repository,
    (pluginId, widgetTypeId) =>
      pluginId === definition.pluginId && widgetTypeId === definition.widgetTypeId
        ? definition
        : undefined,
  );
  return { layouts, repository };
};

describe("DashboardLayoutCoordinator", () => {
  it("automatically places registered widgets on the 24-column grid", async () => {
    const { layouts } = await setup();
    const firstId = "first" as WidgetInstanceId;
    const secondId = "second" as WidgetInstanceId;

    const result = await layouts.apply(scope, {
      expectedRevision: 0,
      operations: [
        {
          id: firstId,
          pluginId: definition.pluginId,
          type: "add",
          widgetTypeId: definition.widgetTypeId,
        },
        {
          id: secondId,
          pluginId: definition.pluginId,
          type: "add",
          widgetTypeId: definition.widgetTypeId,
        },
      ],
    });

    expect(result.revision).toBe(1);
    expect(result.widgets.map(({ placement }) => placement)).toEqual([
      { height: 4, width: 6, x: 0, y: 0 },
      { height: 4, width: 6, x: 6, y: 0 },
    ]);
  });

  it("rejects overlapping batches without persisting partial changes", async () => {
    const { layouts } = await setup();

    await expect(layouts.apply(scope, {
      expectedRevision: 0,
      operations: [
        {
          id: "first" as WidgetInstanceId,
          placement: { height: 4, width: 6, x: 0, y: 0 },
          pluginId: definition.pluginId,
          type: "add",
          widgetTypeId: definition.widgetTypeId,
        },
        {
          id: "second" as WidgetInstanceId,
          placement: { height: 4, width: 6, x: 5, y: 0 },
          pluginId: definition.pluginId,
          type: "add",
          widgetTypeId: definition.widgetTypeId,
        },
      ],
    })).rejects.toMatchObject({ code: "overlap" });

    await expect(layouts.inspect(scope)).resolves.toMatchObject({ revision: 0, widgets: [] });
  });

  it("enforces registered fixed and range size policies", () => {
    expect(isSupportedWidgetSize(definition.sizePolicy, { height: 6, width: 12 })).toBe(true);
    expect(isSupportedWidgetSize(definition.sizePolicy, { height: 5, width: 10 })).toBe(false);
    expect(isSupportedWidgetSize({
      kind: "range",
      maximum: { height: 12, width: 24 },
      minimum: { height: 4, width: 6 },
      step: { height: 2, width: 2 },
    }, { height: 8, width: 14 })).toBe(true);
  });

  it("finds the first available position in row-major order", () => {
    expect(findAvailablePlacement(
      [{ height: 4, width: 12, x: 0, y: 0 }],
      { height: 4, width: 12 },
    )).toEqual({ height: 4, width: 12, x: 12, y: 0 });
  });
});
