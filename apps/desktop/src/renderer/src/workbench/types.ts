import { defineContributionPoint } from "@avesd/plugin-api";
import type {
  JsonObject,
  WidgetDefinition,
  WidgetSize,
} from "@avesd/workspace-model";
import type { ReactNode } from "react";

export interface WorkbenchView {
  readonly render: () => ReactNode;
}

export interface DashboardWidgetRenderProps {
  readonly configuration: JsonObject;
  readonly size: WidgetSize;
}

export interface DashboardWidget extends Omit<WidgetDefinition, "pluginId"> {
  readonly description?: string;
  readonly render: (props: DashboardWidgetRenderProps) => ReactNode;
}

export const mainViewContribution = defineContributionPoint<WorkbenchView>(
  "workbench.main",
);

export const agentOverlayContribution = defineContributionPoint<WorkbenchView>(
  "workbench.overlay.agent",
);

export const dashboardWidgetContribution = defineContributionPoint<DashboardWidget>(
  "dashboard.widget",
);
