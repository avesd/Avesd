import {
  CapabilityBroker,
  ContributionBroker,
  ContributionRegistry,
  PluginHost,
} from "@avesd/kernel";
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

import { agentPlugin } from "../plugins/agent-plugin";
import { createDashboardPlugin } from "../plugins/dashboard-plugin";
import { welcomePlugin } from "../plugins/welcome-plugin";
import {
  agentOverlayContribution,
  dashboardWidgetContribution,
  mainViewContribution,
} from "./types";
import type { DashboardWidget, WorkbenchView } from "./types";

export const mainViewRegistry = new ContributionRegistry<WorkbenchView>();
export const agentOverlayRegistry = new ContributionRegistry<WorkbenchView>();
export const dashboardWidgetRegistry = new ContributionRegistry<DashboardWidget>();
const contributions = new ContributionBroker();
contributions.register(mainViewContribution, mainViewRegistry);
contributions.register(agentOverlayContribution, agentOverlayRegistry);
contributions.register(dashboardWidgetContribution, dashboardWidgetRegistry);
const capabilities = new CapabilityBroker(
  (pluginId, capability) =>
    pluginId === agentPlugin.id && capability === "agent",
);
capabilities.register("agent", () => window.avesd.agent);
export const pluginHost = new PluginHost({ capabilities, contributions });

const workspaceRepository = new InMemoryWorkspaceRepository();
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
    ? { ...contribution.value, pluginId: contribution.pluginId }
    : undefined;
};
const dashboardLayouts = new DashboardLayoutCoordinator(workspaceRepository, resolveWidget);
const dashboardPlugin = createDashboardPlugin(
  dashboardLayouts,
  dashboardScope,
  dashboardWidgetRegistry,
);

export const startWorkbench = async (): Promise<void> => {
  await workspaceRepository.createWorkspace({
    id: dashboardScope.workspaceId,
    name: "Local workspace",
  });
  await workspaceRepository.createDashboard(
    { workspaceId: dashboardScope.workspaceId },
    { id: dashboardScope.dashboardId, name: "My dashboard", viewState: {} },
  );
  await pluginHost.replace(dashboardPlugin);
  await pluginHost.replace(welcomePlugin);
  await pluginHost.replace(agentPlugin);
};

if (import.meta.hot) {
  import.meta.hot.accept("../plugins/welcome-plugin", (module) => {
    if (module) {
      void pluginHost.replace(module.welcomePlugin);
    }
  });

  import.meta.hot.accept("../plugins/dashboard-plugin", () => {
    void pluginHost.replace(createDashboardPlugin(
      dashboardLayouts,
      dashboardScope,
      dashboardWidgetRegistry,
    ));
  });

  import.meta.hot.accept("../plugins/agent-plugin", (module) => {
    if (module) {
      void pluginHost.replace(module.agentPlugin);
    }
  });

  import.meta.hot.dispose(() => {
    void pluginHost.dispose();
  });
}
