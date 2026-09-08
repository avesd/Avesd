import type { ContributionRegistry } from "@avesd/kernel";
import type { PluginDefinition } from "@avesd/plugin-api";
import type { DataSourceContribution } from "@avesd/plugin-data";
import type { WidgetContribution } from "@avesd/plugin-ui";
import type {
  DashboardLayoutService,
  DataSourceService,
} from "@avesd/workspace-model";

import type { WidgetServiceFactory } from "../workbench/widget-services";
import { useSyncExternalStore } from "react";
import type { WorkbenchNavigation } from "../workbench/navigation";
import { DashboardShell } from "../components/DashboardShell";
import { mainViewContribution } from "../workbench/types";
import type { WorkbenchView } from "../workbench/types";
import type { BrowserControlsApi } from "../../../shared/browser-controls";

export const createDashboardPlugin = (
  layouts: DashboardLayoutService,
  navigation: WorkbenchNavigation,
  widgets: ContributionRegistry<WidgetContribution>,
  dataSources: DataSourceService,
  sourceTypes: ContributionRegistry<DataSourceContribution>,
  widgetServices: WidgetServiceFactory,
  browserControls?: BrowserControlsApi,
): PluginDefinition => {
  const DashboardWorkbench = () => {
    const state = useSyncExternalStore(navigation.subscribe, navigation.getSnapshot);
    return <DashboardShell
        key={`${state.scope.workspaceId}/${state.scope.dashboardId}`}
        widgetServices={widgetServices}
        browserControls={browserControls}
        dataSources={dataSources}
        layouts={layouts}
        scope={state.scope}
        sourceTypes={sourceTypes}
        widgets={widgets}
    />;
  };
  const dashboardView: WorkbenchView = { render: () => <DashboardWorkbench /> };

  return {
    activate(context) {
      context.effect(() => context.contributions.contribute(
        mainViewContribution,
        dashboardView,
      ));
    },
    apiVersion: 1,
    id: "avesd.builtin.dashboard",
    version: "0.1.0",
  };
};
