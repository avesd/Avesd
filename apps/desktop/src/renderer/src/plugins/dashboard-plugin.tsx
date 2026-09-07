import type { PluginDefinition } from "@avesd/plugin-api";
import type { DashboardLayoutService, DashboardScope } from "@avesd/workspace-model";

import { DashboardShell } from "../components/DashboardShell";
import { mainViewContribution } from "../workbench/types";
import type { DashboardWidget, WorkbenchView } from "../workbench/types";
import type { ContributionRegistry } from "@avesd/kernel";

export const createDashboardPlugin = (
  layouts: DashboardLayoutService,
  scope: DashboardScope,
  widgets: ContributionRegistry<DashboardWidget>,
): PluginDefinition => {
  const dashboardView: WorkbenchView = {
    render: () => <DashboardShell layouts={layouts} scope={scope} widgets={widgets} />,
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
