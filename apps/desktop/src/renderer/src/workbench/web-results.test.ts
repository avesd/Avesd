import { describe, expect, it, vi } from "vitest";
import { DashboardLayoutCoordinator, InMemoryWorkspaceRepository, WorkspaceDataCoordinator } from "@avesd/workspace-model";
import type { DashboardId, DataSourceId, WidgetInstanceId, WorkspaceId } from "@avesd/workspace-model";
import { WebResults } from "./web-results";
import { WEB_PLUGIN_ID, WEB_RESULT_TYPE } from "../../../shared/web-surface";

describe("temporary web outputs", () => {
  it("binds a live output without saving content and rejects writes or cross-dashboard binding", async () => {
    const repository = new InMemoryWorkspaceRepository();
    const scope = { workspaceId: "workspace" as WorkspaceId, dashboardId: "dashboard" as DashboardId };
    await repository.createWorkspace({ id: scope.workspaceId, name: "Synthetic" });
    await repository.createDashboard(scope, { id: scope.dashboardId, name: "Dashboard", viewState: {} });
    await repository.createDashboard(scope, { id: "other" as DashboardId, name: "Other", viewState: {} });
    const command = vi.fn().mockResolvedValue({ id: "surface", document: 1, result: { count: 7 } });
    const results = new WebResults({ command, subscribe: () => () => undefined }, repository);
    const data = results.wrap(new WorkspaceDataCoordinator(repository, () => undefined));
    const layouts = new DashboardLayoutCoordinator(repository, (_pluginId, widgetTypeId) => ({
      pluginId: WEB_PLUGIN_ID, widgetTypeId, displayName: "Synthetic", configurationVersion: 1,
      defaultConfiguration: {}, defaultSize: { width: 6, height: 6 },
      sizePolicy: { kind: "fixed", sizes: [{ width: 6, height: 6 }] },
      inputs: [{ id: "result", dataType: WEB_RESULT_TYPE }],
    }), (scope, id) => data.read(scope, id));
    await layouts.apply(scope, { expectedRevision: 0, operations: [
      { type: "add", id: "page" as WidgetInstanceId, pluginId: WEB_PLUGIN_ID, widgetTypeId: "page" },
      { type: "add", id: "consumer" as WidgetInstanceId, pluginId: WEB_PLUGIN_ID, widgetTypeId: "result" },
    ] });
    results.attach("page", "surface");
    const id = "web-result:page" as DataSourceId;
    await layouts.apply(scope, { expectedRevision: 1, operations: [
      { type: "bind", id: "consumer" as WidgetInstanceId, inputId: "result", dataSourceIds: [id] },
    ] });
    expect((await data.read(scope, id)).value).toEqual({ count: 7 });
    expect((await repository.snapshot()).dataSources).toEqual([]);
    expect(JSON.stringify(await repository.snapshot())).not.toContain('"count"');
    await expect(data.update(scope, id, 1, 8)).rejects.toThrow("read-only");
    const other = { ...scope, dashboardId: "other" as DashboardId };
    expect(await data.list(other)).toEqual([]);
    await expect(data.read(other, id)).rejects.toThrow("incompatible");
    await layouts.apply(other, { expectedRevision: 0, operations: [
      { type: "add", id: "other-consumer" as WidgetInstanceId, pluginId: WEB_PLUGIN_ID, widgetTypeId: "result" },
    ] });
    await expect(layouts.apply(other, { expectedRevision: 1, operations: [
      { type: "bind", id: "other-consumer" as WidgetInstanceId, inputId: "result", dataSourceIds: [id] },
    ] })).rejects.toThrow("incompatible");
    results.detach("page", "surface");
    expect((await data.read(scope, id)).value).toBeNull();
  });
});
