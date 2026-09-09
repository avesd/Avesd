/**
 * @author Avesd
 * @package Desktop
 * @namespace TestUnitRendererSrcComponents
 * @description Dashboard Shell Browser Test
 */

import "../../../../../src/renderer/src/styles.css";
import { DashboardShell } from "../../../../../src/renderer/src/components/DashboardShell";
import { DashboardEditingProvider } from "../../../../../src/renderer/src/workbench/dashboard-editing";
import { createWidgetServices } from "../../../../../src/renderer/src/workbench/widget-services";
import { ContributionRegistry } from "@avesd/kernel";
import type { WidgetContribution } from "@avesd/plugin-ui";
import { dashboardWidgetContribution } from "@avesd/plugin-ui";
import type { DashboardId,
    DashboardScope,
    WidgetDefinition,
    WidgetInstanceId,
    WorkspaceId } from "@avesd/workspace-model";
import { DashboardLayoutCoordinator,
    InMemoryWorkspaceRepository,
    WorkspaceDataCoordinator } from "@avesd/workspace-model";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

const scope: DashboardScope = {
    dashboardId: "dashboard-test" as DashboardId,
    workspaceId: "workspace-test" as WorkspaceId,
};

const widget: WidgetContribution = {
    configuration: {
        default: { label: "Widget content" },
        version: 1,
    },
    displayName: "Test widget",
    mount(root, context) {

        const content = document.createElement("p");
        const configure = document.createElement("button");
        configure.textContent = "Update widget configuration";
        configure.addEventListener("click", () => {

            void context.configuration.update({ label: "Updated content" });
        });
        root.append(content, configure);

        return {
            dispose() {

                content.remove();
                configure.remove();
            },
            update(state) {

                content.textContent = typeof state.configuration.label === "string" ? state.configuration.label : "";
            },
        };
    },
    sizing: {
        default: {
            height: 4,
            width: 6,
        },
        policy: {
            kind: "fixed",
            sizes: [
                {
                    height: 4,
                    width: 6,
                },
                {
                    height: 6,
                    width: 10,
                },
            ],
        },
    },
    widgetTypeId: "test",
};

describe("DashboardShell", () => {

    afterEach(() => {

        document.body.replaceChildren();
    });

    it("renders an agent-added widget and allows manual layout changes", async () => {

        const repository = new InMemoryWorkspaceRepository();
        await repository.createWorkspace({
            id: scope.workspaceId,
            name: "Test",
        });
        await repository.createDashboard(
            { workspaceId: scope.workspaceId },
            {
                id: scope.dashboardId,
                name: "Dashboard",
                viewState: {},
            },
        );
        const widgets = new ContributionRegistry<WidgetContribution>();
        widgets.contribute(dashboardWidgetContribution.id, widget, "test.plugin");
        const layouts = new DashboardLayoutCoordinator(
            repository,
            (pluginId, widgetTypeId): WidgetDefinition | undefined =>
            {

                return pluginId === "test.plugin" && widgetTypeId === widget.widgetTypeId
                    ? {
                        configurationVersion: widget.configuration.version,
                        defaultConfiguration: widget.configuration.default,
                        defaultSize: widget.sizing.default,
                        displayName: widget.displayName,
                        inputs: widget.inputs ?? [],
                        pluginId,
                        sizePolicy: widget.sizing.policy,
                        widgetTypeId: widget.widgetTypeId,
                    }
                    : undefined;
            },
        );
        const dataSources = new WorkspaceDataCoordinator(repository, () => {

            return undefined;
        });

        const container = document.createElement("div");
        document.body.append(container);
        const root = createRoot(container);
        root.render(<DashboardEditingProvider>
            <DashboardShell
                widgetServices={createWidgetServices(dataSources)}
                dataSources={dataSources}
                layouts={layouts}
                scope={scope}
                widgets={widgets}
            />
        </DashboardEditingProvider>);

        await expect.element(page.getByText("Make this space yours.")).toBeVisible();
        window.dispatchEvent(new KeyboardEvent("keydown", {
            key: "e",
            metaKey: true,
        }));
        expect(document.querySelector(".layout-editor")).toBeNull();
        expect(document.querySelector(".dashboard-layout-toolbar")).toBeNull();
        await layouts.apply(scope, {
            expectedRevision: (await layouts.inspect(scope)).revision,
            operations: [
                {
                    type: "add",
                    id: "agent-added" as WidgetInstanceId,
                    pluginId: "test.plugin",
                    widgetTypeId: "test",
                },
            ],
        });
        await expect.element(page.getByText("Widget content")).toBeVisible();

        const card = document.querySelector<HTMLElement>(".dashboard-widget");
        expect(card?.style.gridColumn).toBe("1 / span 6");
        const dragHandle = document.querySelector<HTMLElement>('[aria-label="Drag Test widget"]');
        const grid = document.querySelector<HTMLElement>(".dashboard-grid");
        expect(dragHandle).not.toBeNull();
        expect(grid).not.toBeNull();
        const cellWidth = (grid?.getBoundingClientRect().width ?? 720) / 24;
        dragHandle?.dispatchEvent(new PointerEvent("pointerdown", {
            bubbles: true,
            clientX: 10,
            clientY: 10,
        }));
        window.dispatchEvent(new PointerEvent("pointermove", {
            clientX: 10 + cellWidth,
            clientY: 10,
        }));
        window.dispatchEvent(new PointerEvent("pointerup"));
        await vi.waitFor(() => {

            return void expect(card?.style.gridColumn).toBe("2 / span 6");
        });
        const resizeHandle = document.querySelector<HTMLElement>('[aria-label="Resize Test widget"]');
        expect(resizeHandle).not.toBeNull();
        const revision = (await layouts.inspect(scope)).revision;
        resizeHandle?.dispatchEvent(new PointerEvent("pointerdown", {
            bubbles: true,
            clientX: 10,
            clientY: 10,
        }));
        window.dispatchEvent(new PointerEvent("pointermove", {
            clientX: 10 + cellWidth * 3.6,
            clientY: 55,
        }));
        await vi.waitFor(() => {

            return void expect(card?.style.gridColumn).toBe("2 / span 10");
        });
        expect((await layouts.inspect(scope)).revision).toBe(revision);
        window.dispatchEvent(new PointerEvent("pointerup"));
        await vi.waitFor(async () => {

            return void expect((await layouts.inspect(scope)).widgets[0]?.placement).toEqual({
                x: 1,
                y: 0,
                width: 10,
                height: 6,
            });
        });
        resizeHandle?.dispatchEvent(new PointerEvent("pointerdown", {
            bubbles: true,
            clientX: 10,
            clientY: 10,
        }));
        window.dispatchEvent(new PointerEvent("pointermove", {
            clientX: 10 - cellWidth * 4,
            clientY: -38,
        }));
        await vi.waitFor(() => {

            return void expect(card?.style.gridColumn).toBe("2 / span 6");
        });
        window.dispatchEvent(new PointerEvent("pointercancel"));
        await vi.waitFor(() => {

            return void expect(card?.style.gridColumn).toBe("2 / span 10");
        });
        expect((await layouts.inspect(scope)).widgets[0]?.placement.width).toBe(10);
        window.dispatchEvent(new KeyboardEvent("keydown", {
            key: "e",
            metaKey: true,
        }));
        await page.getByRole("button", { name: "Update widget configuration" }).click();
        await expect.element(page.getByText("Updated content")).toBeVisible();
        expect(document.querySelector(".dashboard-widget-editor")).toBeNull();

        const widgetRoot = document.querySelector<HTMLElement>(".dashboard-widget-content")?.shadowRoot;
        root.unmount();
        expect(widgetRoot?.childElementCount).toBe(0);
    });
});
