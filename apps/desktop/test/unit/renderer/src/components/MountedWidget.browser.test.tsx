/**
 * @author Avesd
 * @package Desktop
 * @namespace TestUnitRendererSrcComponents
 * @description Mounted Widget Browser Test
 */

import "../../../../../src/renderer/src/styles.css";
import { MountedWidget } from "../../../../../src/renderer/src/components/MountedWidget";
import type { WidgetServiceFactory } from "../../../../../src/renderer/src/workbench/widget-services";
import type { WidgetContribution } from "@avesd/plugin-ui";
import type { DashboardId, WidgetInstance, WidgetInstanceId, WorkspaceId } from "@avesd/workspace-model";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

let root: Root | undefined;
afterEach(() => {

    root?.unmount(); root = undefined; document.body.replaceChildren();
});
const instance: WidgetInstance = {
    id: "synthetic-widget" as WidgetInstanceId,
    workspaceId: "synthetic-workspace" as WorkspaceId,
    dashboardId: "synthetic-dashboard" as DashboardId,
    pluginId: "synthetic.plugin",
    widgetTypeId: "test",
    configuration: { label: "Saved configuration" },
    configurationVersion: 1,
    placement: {
        x: 0,
        y: 0,
        width: 6,
        height: 4,
    },
    bindings: {},
};
const services: WidgetServiceFactory = (_instance, update) => {

    return {
        configuration: { update },
        data: {
            async read() {

                return [];
            },
            subscribe() {

                return () => {
                };
            },
            async update() {},
        },
    };
};

it("initializes replacements with the existing configuration and releases the previous controller", async () => {

    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    const events: string[] = [];
    const definition = (name: string): WidgetContribution => {

        return {
            widgetTypeId: "test",
            displayName: "Synthetic widget",
            configuration: {
                default: {},
                version: 1,
            },
            sizing: {
                default: {
                    width: 6,
                    height: 4,
                },
                policy: {
                    kind: "fixed",
                    sizes: [
                        {
                            width: 6,
                            height: 4,
                        },
                    ],
                },
            },
            mount(host, context) {

                events.push(`${name}:mount`);
                context.signal.addEventListener("abort", () => {

                    return events.push(`${name}:abort`);
                });
                const content = document.createElement("p");
                host.append(content);

                return {
                    update(state) {

                        const label = typeof state.configuration.label === "string" ? state.configuration.label : "";
                        content.textContent = `${name}: ${label}`;
                    },
                    dispose() {

                        events.push(`${name}:dispose`); content.remove();
                    },
                };
            },
        };
    };
    const render = (widget: WidgetContribution) => {

        return void root!.render(<MountedWidget
            instance={instance}
            definition={widget}
            widgetServices={services}
            apply={async () => {
            }}
        />);
    };
    render(definition("first"));
    await expect.element(page.getByText("first: Saved configuration")).toBeVisible();
    render(definition("replacement"));
    await expect.element(page.getByText("replacement: Saved configuration")).toBeVisible();
    expect(events).toEqual([
        "first:mount",
        "first:abort",
        "first:dispose",
        "replacement:mount",
    ]);
    const shadow = container.querySelector(".dashboard-widget-content")?.shadowRoot;
    root.unmount(); root = undefined;
    expect(events.slice(-2)).toEqual([
        "replacement:abort",
        "replacement:dispose",
    ]);
    expect(shadow?.childElementCount).toBe(0);
});

it("aborts and disposes a failing controller once while keeping a visible fallback", async () => {

    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    const dispose = vi.fn(() => {

        throw new Error("Synthetic disposal failure");
    });
    let signal: AbortSignal | undefined;
    const definition: WidgetContribution = {
        widgetTypeId: "test",
        displayName: "Synthetic widget",
        configuration: {
            default: {},
            version: 1,
        },
        sizing: {
            default: {
                width: 6,
                height: 4,
            },
            policy: {
                kind: "fixed",
                sizes: [
                    {
                        width: 6,
                        height: 4,
                    },
                ],
            },
        },
        mount(host, context) {

            signal = context.signal;
            host.append(document.createElement("button"));

            return {
                update() {

                    throw new Error("Synthetic update failure");
                },
                dispose,
            };
        },
    };
    root.render(<MountedWidget
        instance={instance}
        definition={definition}
        widgetServices={services}
        apply={async () => {
        }}
    />);
    await expect.element(page.getByText("This widget could not be updated.")).toBeVisible();
    expect(signal?.aborted).toBe(true);
    expect(dispose).toHaveBeenCalledOnce();
    root.unmount(); root = undefined;
    expect(dispose).toHaveBeenCalledOnce();
});
