import { describe, expect, it, vi } from "vitest";
import type { DashboardId, WidgetInstance, WidgetInstanceId, WorkspaceId, WorkspaceSnapshot } from "@avesd/workspace-model";
import { BrowserBindings } from "./browser-bindings";
import { parseBrowserControls } from "../shared/browser-controls";
import type { BrowserBinding } from "../shared/browser-controls";
import { WEB_PLUGIN_ID } from "../shared/web-surface";

const widget = (id: string, type: string, dashboardId = "dashboard"): WidgetInstance => ({
  id: id as WidgetInstanceId, pluginId: WEB_PLUGIN_ID, widgetTypeId: type,
  workspaceId: "workspace" as WorkspaceId, dashboardId: dashboardId as DashboardId,
  bindings: {}, configuration: {}, configurationVersion: 1, placement: { x: 0, y: 0, width: 6, height: 6 },
});
const snapshot: WorkspaceSnapshot = { version: 1, workspaces: [], dashboards: [], dataSources: [],
  widgets: [widget("source", "controls"), widget("target", "page"), widget("other", "page", "other-dashboard")] };
const grant = { type: "bind" as const, sourceId: "source", inputId: "browser", targetId: "target",
  origin: "https://example.com", operations: ["extract" as const] };

describe("host browser bindings", () => {
  it("persists explicit grants, survives movement, denies undeclared actions and invalid instances", async () => {
    let saved: readonly BrowserBinding[] | undefined;
    const storage = { load: async () => saved, save: async (bindings: readonly BrowserBinding[]) => { saved = structuredClone(bindings); } };
    const service = await BrowserBindings.open(storage);
    expect(() => service.authorize("source", "browser", "extract", snapshot)).toThrow();
    await service.bind(grant, snapshot);
    expect(() => service.authorize("source", "browser", "click", snapshot)).toThrow();
    expect(() => service.authorize("target", "browser", "extract", snapshot)).toThrow();
    await expect(service.bind({ ...grant, targetId: "other" }, snapshot)).rejects.toThrow();
    await expect(service.bind({ ...grant, sourceId: "target" }, snapshot)).rejects.toThrow();
    const reopened = await BrowserBindings.open(storage);
    expect(reopened.authorize("source", "browser", "extract", {
      ...snapshot, widgets: snapshot.widgets.map((item) => ({ ...item, placement: { ...item.placement, y: 20 } })),
    }).targetId).toBe("target");
    const removed = { ...snapshot, widgets: snapshot.widgets.filter((item) => item.id !== "target") };
    expect(() => reopened.authorize("source", "browser", "extract", removed)).toThrow();
    await reopened.prune(removed);
    expect(() => reopened.authorize("source", "browser", "extract", snapshot)).toThrow();
  });

  it("invalidates in-flight authorization on replacement/revocation, and does not grant on failed save", async () => {
    const save = vi.fn<((bindings: readonly BrowserBinding[]) => Promise<void>)>(async () => undefined);
    const service = await BrowserBindings.open({ load: async () => undefined, save });
    await service.bind(grant, snapshot);
    const previous = service.authorize("source", "browser", "extract", snapshot);
    await service.bind({ ...grant, operations: ["navigate"] }, snapshot);
    expect(service.isCurrent(previous, snapshot)).toBe(false);
    const current = service.authorize("source", "browser", "navigate", snapshot);
    save.mockRejectedValueOnce(new Error("Synthetic save failure"));
    await expect(service.bind(grant, snapshot)).rejects.toThrow();
    expect(service.isCurrent(current, snapshot)).toBe(true);
    expect(() => service.authorize("source", "browser", "extract", snapshot)).toThrow();
    await service.unbind("source", "browser");
    expect(service.isCurrent(current, snapshot)).toBe(false);
  });

  it("does not accept script execution, unknown bindings, unsafe URLs, or malformed fields", () => {
    for (const input of [
      { ...grant, operations: ["run"] }, { ...grant, inputId: "other" },
      { ...grant, origin: "file:///tmp/a" },
      { type: "invoke", sourceId: "source", inputId: "browser", action: { type: "run", code: "1" } },
      { type: "invoke", sourceId: "source", inputId: "browser", action: { type: "extract", fields: { name: 1 } } },
    ]) expect(() => parseBrowserControls(input)).toThrow();
    expect(parseBrowserControls({ ...grant, origin: "https://example.com/path" })).toMatchObject({ origin: "https://example.com" });
  });
});
