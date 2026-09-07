import { ContributionRegistry } from "@avesd/kernel";
import { dashboardWidgetContribution } from "@avesd/plugin-ui";
import type { DataSourceContribution } from "@avesd/plugin-data";
import type { WidgetContribution } from "@avesd/plugin-ui";
import {
  DashboardLayoutCoordinator,
  InMemoryWorkspaceRepository,
  WorkspaceDataCoordinator,
} from "@avesd/workspace-model";
import type {
  DashboardId,
  DashboardScope,
  WidgetDefinition,
  WorkspaceId,
} from "@avesd/workspace-model";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { createRoot } from "react-dom/client";

import "../styles.css";
import { DashboardShell } from "./DashboardShell";

const scope: DashboardScope = {
  dashboardId: "dashboard-test" as DashboardId,
  workspaceId: "workspace-test" as WorkspaceId,
};

const widget: WidgetContribution = {
  configuration: { default: { label: "Widget content" }, version: 1 },
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
        content.textContent = String(state.configuration.label);
      },
    };
  },
  sizing: {
    default: { height: 4, width: 6 },
    policy: {
      kind: "fixed",
      sizes: [{ height: 4, width: 6 }],
    },
  },
  widgetTypeId: "test",
};

describe("DashboardShell", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("adds and manually moves a contributed widget", async () => {
    const repository = new InMemoryWorkspaceRepository();
    await repository.createWorkspace({ id: scope.workspaceId, name: "Test" });
    await repository.createDashboard(
      { workspaceId: scope.workspaceId },
      { id: scope.dashboardId, name: "Dashboard", viewState: {} },
    );
    const widgets = new ContributionRegistry<WidgetContribution>();
    const sourceTypes = new ContributionRegistry<DataSourceContribution>();
    widgets.contribute(dashboardWidgetContribution.id, widget, "test.plugin");
    const layouts = new DashboardLayoutCoordinator(
      repository,
      (pluginId, widgetTypeId): WidgetDefinition | undefined =>
        pluginId === "test.plugin" && widgetTypeId === widget.widgetTypeId
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
          : undefined,
    );
    const dataSources = new WorkspaceDataCoordinator(repository, () => undefined);

    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    root.render(
      <DashboardShell
        dataSources={dataSources}
        layouts={layouts}
        scope={scope}
        sourceTypes={sourceTypes}
        widgets={widgets}
      />,
    );

    await expect.element(page.getByRole("button", { name: "Configure dashboard" })).toBeVisible();
    await page.getByRole("button", { name: "Configure dashboard" }).click();
    await expect.element(page.getByRole("heading", { name: "Edit layout" })).toBeVisible();
    await page.getByRole("button", { name: "Add" }).click();
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
    await vi.waitFor(() => expect(card?.style.gridColumn).toBe("2 / span 6"));
    await page.getByRole("button", { name: "Done" }).click();
    await page.getByRole("button", { name: "Update widget configuration" }).click();
    await expect.element(page.getByText("Updated content")).toBeVisible();
    expect(document.querySelector(".dashboard-widget-editor")).toBeNull();
    expect(card && getComputedStyle(card).borderTopWidth).toBe("0px");

    const widgetRoot = document.querySelector<HTMLElement>(".dashboard-widget-content")?.shadowRoot;
    root.unmount();
    expect(widgetRoot?.childElementCount).toBe(0);
  });
});
