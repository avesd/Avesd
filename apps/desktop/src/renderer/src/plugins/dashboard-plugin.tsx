import type { ContributionRegistry } from "@avesd/kernel";
import type { PluginDefinition } from "@avesd/plugin-api";
import type { DataSourceContribution } from "@avesd/plugin-data";
import type { WidgetContribution } from "@avesd/plugin-ui";
import type {
  DashboardLayoutService,
  DashboardScope,
  DataSourceService,
} from "@avesd/workspace-model";

import { DashboardShell } from "../components/DashboardShell";
import { mainViewContribution } from "../workbench/types";
import type { WorkbenchView } from "../workbench/types";
import type { BrowserControlsApi } from "../../../shared/browser-controls";

export const createDashboardPlugin = (
  layouts: DashboardLayoutService,
  scope: DashboardScope,
  widgets: ContributionRegistry<WidgetContribution>,
  dataSources: DataSourceService,
  sourceTypes: ContributionRegistry<DataSourceContribution>,
  browserControls?: BrowserControlsApi,
): PluginDefinition => {
  const dashboardView: WorkbenchView = {
    render: () => (
      <DashboardShell
        browserControls={browserControls}
        dataSources={dataSources}
        layouts={layouts}
        scope={scope}
        sourceTypes={sourceTypes}
        widgets={widgets}
      />
    ),
  };

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
