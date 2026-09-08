import { expect, it, vi } from "vitest";
import { InMemoryWorkspaceRepository, WorkspaceDataCoordinator } from "@avesd/workspace-model";
import type { DashboardId, WidgetInstanceId, WorkspaceId } from "@avesd/workspace-model";
import type { BrowserControlsApi } from "../../../shared/browser-controls";
import { WEB_PLUGIN_ID } from "../../../shared/web-surface";
import { createWidgetServices } from "./widget-services";

it("grants only built-in controllers a browser service bound to their own instance", async () => {
  const invoke = vi.fn<BrowserControlsApi["invoke"]>().mockResolvedValue({ text: "Synthetic page" });
  const api: BrowserControlsApi = { invoke, async list() { return []; }, async bind() {}, async unbind() {} };
  const factory = createWidgetServices(new WorkspaceDataCoordinator(new InMemoryWorkspaceRepository(), () => undefined), api);
  const instance = {
    id: "controller" as WidgetInstanceId, pluginId: WEB_PLUGIN_ID, widgetTypeId: "controls",
    workspaceId: "workspace" as WorkspaceId, dashboardId: "dashboard" as DashboardId, bindings: {},
  };
  const update = vi.fn(async () => {});
  const service = factory(instance, update);
  await expect(service.browser?.extract("browser", { text: "h1" })).resolves.toEqual({ text: "Synthetic page" });
  expect(invoke).toHaveBeenCalledWith("controller", "browser", { type: "extract", fields: { text: "h1" } });
  await service.configuration.update({ label: "Synthetic label" });
  expect(update).toHaveBeenCalledWith({ label: "Synthetic label" });
  expect(factory({ ...instance, pluginId: "avesd.local.synthetic" }, update).browser).toBeUndefined();
  expect(factory({ ...instance, widgetTypeId: "page" }, update).browser).toBeUndefined();
});

it("exposes declared workspace services and revokes calls and subscriptions on widget disposal", async () => {
  const invoke = vi.fn().mockResolvedValue([]);
  const unsubscribe = vi.fn();
  let notify = () => {};
  const workspace = { invoke, subscribe(listener: () => void) { notify = listener; return unsubscribe; } };
  const factory = createWidgetServices(new WorkspaceDataCoordinator(new InMemoryWorkspaceRepository(), () => undefined), undefined, workspace);
  const instance = { id: "synthetic-widget" as WidgetInstanceId, pluginId: "synthetic", widgetTypeId: "catalog",
    workspaceId: "synthetic-workspace" as WorkspaceId, dashboardId: "synthetic-dashboard" as DashboardId, bindings: {} };
  const lifetime = new AbortController();
  const services = factory(instance, async () => {}, { signal: lifetime.signal, capabilities: ["catalog"] });
  expect(services.navigation).toBeUndefined();
  expect(services.management).toBeUndefined();
  await services.catalog!.listWorkspaces();
  expect(invoke).toHaveBeenCalledWith(instance.id, { type: "workspaces" });
  const listener = vi.fn();
  services.catalog!.subscribe(listener);
  notify();
  expect(listener).toHaveBeenCalledTimes(1);
  lifetime.abort();
  notify();
  expect(listener).toHaveBeenCalledTimes(1);
  expect(unsubscribe).toHaveBeenCalledTimes(1);
  await expect(services.catalog!.listWorkspaces()).rejects.toThrow("disposed");
  expect(invoke).toHaveBeenCalledTimes(1);
});
