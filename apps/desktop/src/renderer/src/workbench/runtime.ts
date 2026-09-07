import {
  CapabilityBroker,
  ContributionBroker,
  ContributionRegistry,
  PluginHost,
} from "@avesd/kernel";
import { dashboardWidgetContribution } from "@avesd/plugin-ui";
import { dataSourceContribution } from "@avesd/plugin-data";
import type { DataSourceContribution } from "@avesd/plugin-data";
import type { WidgetContribution } from "@avesd/plugin-ui";
import {
  DashboardLayoutCoordinator,
  PersistentWorkspaceRepository,
  WorkspaceDataCoordinator,
} from "@avesd/workspace-model";
import type {
  DashboardId,
  DashboardScope,
  WidgetDefinition,
  WorkspaceId,
} from "@avesd/workspace-model";

import { agentPlugin } from "../plugins/agent-plugin";
import { counterPlugin } from "../plugins/counter-plugin";
import { createDashboardPlugin } from "../plugins/dashboard-plugin";
import { welcomePlugin } from "../plugins/welcome-plugin";
import { createWebPlugin } from "../plugins/web-plugin";
import { WebResults } from "./web-results";
import {
  agentOverlayContribution,
  mainViewContribution,
} from "./types";
import type { WorkbenchView } from "./types";

export const mainViewRegistry = new ContributionRegistry<WorkbenchView>();
export const agentOverlayRegistry = new ContributionRegistry<WorkbenchView>();
export const dashboardWidgetRegistry = new ContributionRegistry<WidgetContribution>();
export const dataSourceRegistry = new ContributionRegistry<DataSourceContribution>();
const contributions = new ContributionBroker();
contributions.register(mainViewContribution, mainViewRegistry);
contributions.register(agentOverlayContribution, agentOverlayRegistry);
contributions.register(dashboardWidgetContribution, dashboardWidgetRegistry);
contributions.register(dataSourceContribution, dataSourceRegistry);
const capabilities = new CapabilityBroker(
  (pluginId, capability) =>
    pluginId === agentPlugin.id && capability === "agent",
);
capabilities.register("agent", () => window.avesd.agent);
export const pluginHost = new PluginHost({ capabilities, contributions });
let disposeWorkspaceRefresh: (() => void | Promise<void>) | undefined;

const dashboardScope: DashboardScope = {
  dashboardId: "local-dashboard" as DashboardId,
  workspaceId: "local-workspace" as WorkspaceId,
};
const resolveWidget = (
  pluginId: string,
  widgetTypeId: string,
): WidgetDefinition | undefined => {
  const contribution = dashboardWidgetRegistry
    .getAll(dashboardWidgetContribution.id)
    .find(({ pluginId: ownerId, value }) =>
      ownerId === pluginId && value.widgetTypeId === widgetTypeId);
  return contribution?.pluginId
    ? {
        configurationVersion: contribution.value.configuration.version,
        defaultConfiguration: contribution.value.configuration.default,
        defaultSize: contribution.value.sizing.default,
        displayName: contribution.value.displayName,
        inputs: contribution.value.inputs ?? [],
        pluginId: contribution.pluginId,
        sizePolicy: contribution.value.sizing.policy,
        widgetTypeId: contribution.value.widgetTypeId,
      }
    : undefined;
};

export const startWorkbench = async (): Promise<void> => {
  const workspaceRepository = await PersistentWorkspaceRepository.open(window.avesd.workspaceStorage);
  disposeWorkspaceRefresh?.();
  disposeWorkspaceRefresh = window.avesd.agent.subscribe((event) => {
    if (event.type === "turnComplete") {
      void workspaceRepository.refresh();
    }
  });
  if ((await workspaceRepository.listWorkspaces()).length === 0) {
    await workspaceRepository.createWorkspace({
      id: dashboardScope.workspaceId,
      name: "Local workspace",
    });
    await workspaceRepository.createDashboard(
      { workspaceId: dashboardScope.workspaceId },
      { id: dashboardScope.dashboardId, name: "My dashboard", viewState: {} },
    );
  }
  const webResults = new WebResults(window.avesd.web, workspaceRepository);
  const dataSources = webResults.wrap(new WorkspaceDataCoordinator(
    workspaceRepository,
    (pluginId, sourceTypeId) => {
      const contribution = dataSourceRegistry.getAll(dataSourceContribution.id).find(
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
    },
  ));
  const dashboardLayouts = new DashboardLayoutCoordinator(workspaceRepository, resolveWidget,
    (scope, id) => dataSources.read(scope, id));
  const dashboardPlugin = createDashboardPlugin(
    dashboardLayouts,
    dashboardScope,
    dashboardWidgetRegistry,
    dataSources,
    dataSourceRegistry,
    window.avesd.browserControls,
  );
  await pluginHost.replace(counterPlugin);
  await pluginHost.replace(dashboardPlugin);
  await pluginHost.replace(welcomePlugin);
  await pluginHost.replace(createWebPlugin(window.avesd.web, webResults));
  await window.avesd.agent.configureWorkbench({
    dataSourceDefinitions: dataSourceRegistry.getAll(dataSourceContribution.id).flatMap(
      ({ pluginId, value }) => pluginId ? [{
        configuration: value.configuration.default,
        dataType: value.dataType,
        displayName: value.displayName,
        initialValue: value.initialValue,
        pluginId,
        sourceTypeId: value.sourceTypeId,
      }] : [],
    ),
    scope: dashboardScope,
    widgetDefinitions: dashboardWidgetRegistry.getAll(dashboardWidgetContribution.id).flatMap(
      ({ pluginId, value }) => {
        const definition = pluginId ? resolveWidget(pluginId, value.widgetTypeId) : undefined;
        return definition ? [definition] : [];
      },
    ),
  });
  await pluginHost.replace(agentPlugin);
};

if (import.meta.hot) {
  import.meta.hot.accept("../plugins/welcome-plugin", (module) => {
    if (module) {
      void pluginHost.replace(module.welcomePlugin);
    }
  });

  import.meta.hot.accept("../plugins/agent-plugin", (module) => {
    if (module) {
      void pluginHost.replace(module.agentPlugin);
    }
  });

  import.meta.hot.dispose(() => {
    void disposeWorkspaceRefresh?.();
    void pluginHost.dispose();
  });
}
