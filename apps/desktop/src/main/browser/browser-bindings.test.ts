/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Browser Bindings Test
 */

import type { BrowserBinding } from "../../shared/browser/browser-controls";
import { parseBrowserControls } from "../../shared/browser/browser-controls";
import { WEB_PLUGIN_ID } from "../../shared/browser/web-surface";
import { BrowserBindings } from "./browser-bindings";
import type { DashboardId, WidgetInstance, WidgetInstanceId, WorkspaceId, WorkspaceSnapshot } from "@avesd/workspace-model";
import { describe, expect, it, vi } from "vitest";

const widget = (id: string, type: string, dashboardId = "dashboard"): WidgetInstance => {
    return {
        id: id as WidgetInstanceId,
        pluginId: WEB_PLUGIN_ID,
        widgetTypeId: type,
        workspaceId: "workspace" as WorkspaceId,
        dashboardId: dashboardId as DashboardId,
        bindings: {},
        configuration: {},
        configurationVersion: 1,
        placement: {
            x: 0,
            y: 0,
            width: 6,
            height: 6,
        },
    };
};
const snapshot: WorkspaceSnapshot = {
    version: 1,
    workspaces: [],
    dashboards: [],
    dataSources: [],
    widgets: [
        widget("source", "controls"),
        widget("target", "page"),
        widget("other", "page", "other-dashboard"),
    ],
};
const grant = {
    type: "bind" as const,
    sourceId: "source",
    inputId: "browser",
    targetId: "target",
    origin: "https://example.com",
    operations: ["extract" as const],
};

describe("host browser bindings", () => {
    it("persists explicit grants, survives movement, denies undeclared actions and invalid instances", async () => {
        let saved: readonly BrowserBinding[] | undefined;
        const storage = {
            load: async () => {
                return saved;
            },
            save: async (bindings: readonly BrowserBinding[]) => {
                saved = structuredClone(bindings);
            },
        };
        const service = await BrowserBindings.open(storage);
        expect(() => {
            return service.authorize("source", "browser", "extract", snapshot);
        }).toThrow();
        await service.bind(grant, snapshot);
        expect(() => {
            return service.authorize("source", "browser", "click", snapshot);
        }).toThrow();
        expect(() => {
            return service.authorize("target", "browser", "extract", snapshot);
        }).toThrow();
        await expect(service.bind({
            ...grant,
            targetId: "other",
        }, snapshot)).rejects.toThrow();
        await expect(service.bind({
            ...grant,
            sourceId: "target",
        }, snapshot)).rejects.toThrow();
        const reopened = await BrowserBindings.open(storage);
        expect(reopened.authorize("source", "browser", "extract", {
            ...snapshot,
            widgets: snapshot.widgets.map((item) => {
                return {
                    ...item,
                    placement: {
                        ...item.placement,
                        y: 20,
                    },
                };
            }),
        }).targetId).toBe("target");
        const removed = {
            ...snapshot,
            widgets: snapshot.widgets.filter((item) => {
                return item.id !== "target";
            }),
        };
        expect(() => {
            return reopened.authorize("source", "browser", "extract", removed);
        }).toThrow();
        await reopened.prune(removed);
        expect(() => {
            return reopened.authorize("source", "browser", "extract", snapshot);
        }).toThrow();
    });

    it("invalidates in-flight authorization on replacement/revocation, and does not grant on failed save", async () => {
        const save = vi.fn<((bindings: readonly BrowserBinding[]) => Promise<void>)>(async () => {
            return undefined;
        });
        const service = await BrowserBindings.open({
            load: async () => {
                return undefined;
            },
            save,
        });
        await service.bind(grant, snapshot);
        const previous = service.authorize("source", "browser", "extract", snapshot);
        await service.bind({
            ...grant,
            operations: ["navigate"],
        }, snapshot);
        expect(service.isCurrent(previous, snapshot)).toBe(false);
        const current = service.authorize("source", "browser", "navigate", snapshot);
        save.mockRejectedValueOnce(new Error("Synthetic save failure"));
        await expect(service.bind(grant, snapshot)).rejects.toThrow();
        expect(service.isCurrent(current, snapshot)).toBe(true);
        expect(() => {
            return service.authorize("source", "browser", "extract", snapshot);
        }).toThrow();
        await service.unbind("source", "browser");
        expect(service.isCurrent(current, snapshot)).toBe(false);
    });

    it("does not accept script execution, unknown bindings, unsafe URLs, or malformed fields", () => {
        for (const input of [
            {
                ...grant,
                operations: ["run"],
            },
            {
                ...grant,
                inputId: "other",
            },
            {
                ...grant,
                origin: "file:///tmp/a",
            },
            {
                type: "invoke",
                sourceId: "source",
                inputId: "browser",
                action: {
                    type: "run",
                    code: "1",
                },
            },
            {
                type: "invoke",
                sourceId: "source",
                inputId: "browser",
                action: {
                    type: "extract",
                    fields: { name: 1 },
                },
            },
        ]) {
            expect(() => {
                return parseBrowserControls(input);
            }).toThrow();
        }
        expect(parseBrowserControls({
            ...grant,
            origin: "https://example.com/path",
        })).toMatchObject({ origin: "https://example.com" });
    });
});
