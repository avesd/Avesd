import type { ContributionRegistry } from "@avesd/kernel";
import type { WidgetContribution } from "@avesd/plugin-ui";
import type { DashboardLayoutOperation, WidgetInstance } from "@avesd/workspace-model";

export type ApplyLayout = (operations: readonly DashboardLayoutOperation[]) => Promise<void>;
export type RegisteredWidgets = ReturnType<ContributionRegistry<WidgetContribution>["getAll"]>;

export const resolveWidget = (
  available: RegisteredWidgets,
  instance: WidgetInstance,
): WidgetContribution | undefined => available.find(
  ({ pluginId, value }) =>
    pluginId === instance.pluginId && value.widgetTypeId === instance.widgetTypeId,
)?.value;

