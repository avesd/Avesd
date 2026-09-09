/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Welcome Plugin Browser Test
 */

import { welcomePlugin } from "./welcome-plugin";
import { ContributionBroker,
    ContributionRegistry,
    PluginHost } from "@avesd/kernel";
import type { WidgetContribution } from "@avesd/plugin-ui";
import { dashboardWidgetContribution } from "@avesd/plugin-ui";
import type { DashboardId,
    WidgetInstanceId,
    WorkspaceId } from "@avesd/workspace-model";
import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";

describe("welcome widget plugin", () => {
    afterEach(() => {
        document.body.replaceChildren();
    });

    it("mounts in a real browser and cleans up its DOM", async () => {
        Object.defineProperty(window, "avesd", {
            configurable: true,
            value: {
                runtime: {
                    chrome: "test",
                    electron: "test",
                    node: "test",
                    platform: "browser",
                },
            },
        });

        const widgets = new ContributionRegistry<WidgetContribution>();
        const contributions = new ContributionBroker();
        contributions.register(dashboardWidgetContribution, widgets);
        const host = new PluginHost({ contributions });
        await host.replace(welcomePlugin);

        const widget = widgets.getAll(dashboardWidgetContribution.id)[0];
        expect(widget?.pluginId).toBe("avesd.builtin.welcome");

        const container = document.createElement("div");
        container.style.width = "480px";
        container.style.height = "180px";
        document.body.append(container);
        const shadowRoot = container.attachShadow({ mode: "open" });
        const controller = widget?.value.mount(shadowRoot, {
            configuration: { async update() {} },
            dashboardId: "dashboard" as DashboardId,
            data: {
                async read() { return []; },
                subscribe() {
                    return () => {
                        return undefined;
                    };
                },
                async update() {},
            },
            instanceId: "widget" as WidgetInstanceId,
            signal: new AbortController().signal,
            workspaceId: "workspace" as WorkspaceId,
        });
        controller?.update({
            configuration: {},
            size: {
                height: 6,
                width: 12,
            },
        });

        await expect.element(page.getByRole("heading", {
            name: "Your space, assembled your way.",
        })).toBeVisible();

        controller?.dispose();
        expect(shadowRoot.childElementCount).toBe(0);

        await host.remove("avesd.builtin.welcome");
        expect(widgets.getAll(dashboardWidgetContribution.id)).toEqual([]);
    });
});
