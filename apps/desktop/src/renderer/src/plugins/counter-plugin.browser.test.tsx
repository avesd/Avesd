import { ContributionBroker, ContributionRegistry, PluginHost } from "@avesd/kernel";
import { dataSourceContribution } from "@avesd/plugin-data";
import type { DataSourceContribution } from "@avesd/plugin-data";
import { dashboardWidgetContribution } from "@avesd/plugin-ui";
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
import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { createRoot } from "react-dom/client";

import { createWidgetServices } from "../workbench/widget-services";
import { DashboardShell } from "../components/DashboardShell";
import "../styles.css";
import { counterPlugin } from "./counter-plugin";

const scope: DashboardScope = {
  dashboardId: "counter-dashboard" as DashboardId,
  workspaceId: "counter-workspace" as WorkspaceId,
};

describe("counter plugin data flow", () => {
  afterEach(() => document.body.replaceChildren());

  it("creates, binds, updates, and renders a scoped local source", async () => {
    const repository = new InMemoryWorkspaceRepository();
    await repository.createWorkspace({ id: scope.workspaceId, name: "Test" });
    await repository.createDashboard(
      { workspaceId: scope.workspaceId },
      { id: scope.dashboardId, name: "Counter", viewState: {} },
    );
    const widgets = new ContributionRegistry<WidgetContribution>();
    const sourceTypes = new ContributionRegistry<DataSourceContribution>();
    const contributions = new ContributionBroker();
    contributions.register(dashboardWidgetContribution, widgets);
    contributions.register(dataSourceContribution, sourceTypes);
    const host = new PluginHost({ contributions });
    await host.replace(counterPlugin);

    const layouts = new DashboardLayoutCoordinator(repository, (pluginId, widgetTypeId) => {
      const contribution = widgets.getAll(dashboardWidgetContribution.id).find(
        ({ pluginId: ownerId, value }) =>
          ownerId === pluginId && value.widgetTypeId === widgetTypeId,
      );
      return contribution?.pluginId ? {
        configurationVersion: contribution.value.configuration.version,
        defaultConfiguration: contribution.value.configuration.default,
        defaultSize: contribution.value.sizing.default,
        displayName: contribution.value.displayName,
        inputs: contribution.value.inputs ?? [],
        pluginId: contribution.pluginId,
        sizePolicy: contribution.value.sizing.policy,
        widgetTypeId: contribution.value.widgetTypeId,
      } satisfies WidgetDefinition : undefined;
    });
    const dataSources = new WorkspaceDataCoordinator(repository, (pluginId, sourceTypeId) => {
      const contribution = sourceTypes.getAll(dataSourceContribution.id).find(
        ({ pluginId: ownerId, value }) =>
          ownerId === pluginId && value.sourceTypeId === sourceTypeId,
      );
      return contribution?.pluginId ? {
        configuration: contribution.value.configuration.default,
        dataType: contribution.value.dataType,
        displayName: contribution.value.displayName,
        initialValue: contribution.value.initialValue,
        pluginId: contribution.pluginId,
        sourceTypeId: contribution.value.sourceTypeId,
      } : undefined;
    });

    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    root.render(
      <DashboardShell
        widgetServices={createWidgetServices(dataSources)}
        dataSources={dataSources}
        layouts={layouts}
        scope={scope}
        sourceTypes={sourceTypes}
        widgets={widgets}
      />,
    );

    await page.getByRole("button", { name: "Configure dashboard" }).click();
    await page.getByRole("button", { name: "Shared" }).click();
    await page.getByRole("button", { name: "Add" }).click();
    const binding = page.getByLabelText("Bind Counter Count");
    await expect.element(binding).toBeVisible();
    const source = (await dataSources.list(scope))[0];
    expect(source).toBeDefined();
    await binding.selectOptions(source?.id ?? "");
    const label = page.getByLabelText("Counter · Label");
    await label.fill("Tasks completed");
    await expect.element(page.getByText("0", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Done" }).click();

    await expect.element(page.getByText("0", { exact: true })).toBeVisible();
    await expect.element(page.getByText("Tasks completed", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Increment" }).click();
    await expect.element(page.getByText("1", { exact: true })).toBeVisible();

    root.unmount();
    await host.dispose();
  });
});
