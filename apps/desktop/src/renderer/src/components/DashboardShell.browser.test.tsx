import { ContributionRegistry } from "@avesd/kernel";
import {
  DashboardLayoutCoordinator,
  InMemoryWorkspaceRepository,
} from "@avesd/workspace-model";
import type {
  DashboardId,
  DashboardScope,
  WidgetDefinition,
  WorkspaceId,
} from "@avesd/workspace-model";
import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { createRoot } from "react-dom/client";

import "../styles.css";
import { dashboardWidgetContribution } from "../workbench/types";
import type { DashboardWidget } from "../workbench/types";
import { DashboardShell } from "./DashboardShell";

const scope: DashboardScope = {
  dashboardId: "dashboard-test" as DashboardId,
  workspaceId: "workspace-test" as WorkspaceId,
};

const widget: DashboardWidget = {
  defaultConfiguration: {},
  defaultSize: { height: 4, width: 6 },
  displayName: "Test widget",
  render: () => <p>Widget content</p>,
  sizePolicy: {
    kind: "fixed",
    sizes: [{ height: 4, width: 6 }],
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
    const widgets = new ContributionRegistry<DashboardWidget>();
    widgets.contribute(dashboardWidgetContribution.id, widget, "test.plugin");
    const layouts = new DashboardLayoutCoordinator(
      repository,
      (pluginId, widgetTypeId): WidgetDefinition | undefined =>
        pluginId === "test.plugin" && widgetTypeId === widget.widgetTypeId
          ? { ...widget, pluginId }
          : undefined,
    );

    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    root.render(<DashboardShell layouts={layouts} scope={scope} widgets={widgets} />);

    await expect.element(page.getByRole("heading", { name: "Start with a widget" })).toBeVisible();
    await page.getByRole("button", { name: "Add" }).click();
    await expect.element(page.getByText("Widget content")).toBeVisible();

    const card = document.querySelector<HTMLElement>(".dashboard-widget");
    expect(card?.style.gridColumn).toBe("1 / span 6");
    await page.getByRole("button", { name: "Move widget right" }).click();
    expect(card?.style.gridColumn).toBe("2 / span 6");

    root.unmount();
  });
});
