/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Counter Plugin Browser Test
 */

import "../../styles.css";
import { DashboardShell } from "../../components/DashboardShell";
import { DashboardEditingProvider } from "../../workbench/dashboard-editing";
import { createWidgetServices } from "../../workbench/widget-services";
import { counterPlugin } from "./counter-plugin";
import { ContributionBroker, ContributionRegistry, PluginHost } from "@avesd/kernel";
import type { DataSourceContribution } from "@avesd/plugin-data";
import { dataSourceContribution } from "@avesd/plugin-data";
import type { WidgetContribution } from "@avesd/plugin-ui";
import { dashboardWidgetContribution } from "@avesd/plugin-ui";
import type { DashboardId,
    DashboardScope,
    DataSourceId,
    WidgetDefinition,
    WidgetInstanceId,
    WorkspaceId } from "@avesd/workspace-model";
import { DashboardLayoutCoordinator,
    InMemoryWorkspaceRepository,
    WorkspaceDataCoordinator } from "@avesd/workspace-model";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";

const scope: DashboardScope = {
    dashboardId: "counter-dashboard" as DashboardId,
    workspaceId: "counter-workspace" as WorkspaceId,
};

describe("counter plugin data flow", () => {
    afterEach(() => {
        return void document.body.replaceChildren();
    });

    it("creates, binds, updates, and renders a scoped local source", async () => {
        const repository = new InMemoryWorkspaceRepository();
        await repository.createWorkspace({
            id: scope.workspaceId,
            name: "Test",
        });
        await repository.createDashboard(
            { workspaceId: scope.workspaceId },
            {
                id: scope.dashboardId,
                name: "Counter",
                viewState: {},
            },
        );
        const widgets = new ContributionRegistry<WidgetContribution>();
        const sourceTypes = new ContributionRegistry<DataSourceContribution>();
        const contributions = new ContributionBroker();
        contributions.register(dashboardWidgetContribution, widgets);
        contributions.register(dataSourceContribution, sourceTypes);
        const host = new PluginHost({ contributions });
        await host.replace(counterPlugin);

        const layouts = new DashboardLayoutCoordinator(repository, (pluginId, widgetTypeId) => {
            const contribution = widgets.getAll(dashboardWidgetContribution.id).find(({ pluginId: ownerId, value }) =>
            {
                return ownerId === pluginId && value.widgetTypeId === widgetTypeId;
            });
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
            const contribution = sourceTypes.getAll(dataSourceContribution.id).find(({ pluginId: ownerId, value }) =>
            {
                return ownerId === pluginId && value.sourceTypeId === sourceTypeId;
            });
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
        const source = await dataSources.create({
            workspaceId: scope.workspaceId,
            kind: "workspace",
        }, {
            id: "shared-count" as DataSourceId,
            name: "Count",
            pluginId: counterPlugin.id,
            sourceTypeId: "counter",
        });
        const id = "counter" as WidgetInstanceId;
        await layouts.apply(scope, {
            expectedRevision: 0,
            operations: [
                {
                    type: "add",
                    id,
                    pluginId: counterPlugin.id,
                    widgetTypeId: "counter",
                },
                {
                    type: "bind",
                    id,
                    inputId: "count",
                    dataSourceIds: [source.id],
                },
                {
                    type: "configure",
                    id,
                    configuration: { label: "Tasks completed" },
                },
            ],
        });

        await expect.element(page.getByText("0", { exact: true })).toBeVisible();
        await expect.element(page.getByText("Tasks completed", { exact: true })).toBeVisible();
        await page.getByRole("button", { name: "Increment" }).click();
        await expect.element(page.getByText("1", { exact: true })).toBeVisible();

        root.unmount();
        await host.dispose();
    });
});
