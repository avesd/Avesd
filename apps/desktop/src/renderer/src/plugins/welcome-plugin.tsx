import type { PluginDefinition } from "@avesd/plugin-api";

import { dashboardWidgetContribution } from "../workbench/types";
import type { DashboardWidget } from "../workbench/types";

const welcomeWidget: DashboardWidget = {
  defaultConfiguration: {},
  defaultSize: { height: 6, width: 12 },
  description: "A quiet starting point for your workspace.",
  displayName: "Welcome",
  render: () => (
    <section className="welcome-widget">
      <p className="welcome-kicker">Avesd</p>
      <h2>Your space, assembled your way.</h2>
      <p>Add capabilities as you need them. Every widget stays local to this workspace.</p>
    </section>
  ),
  sizePolicy: {
    kind: "fixed",
    sizes: [
      { height: 5, width: 8 },
      { height: 6, width: 12 },
      { height: 7, width: 24 },
    ],
  },
  widgetTypeId: "welcome",
};

export const welcomePlugin: PluginDefinition = {
  activate(context) {
    context.effect(() => context.contributions.contribute(
      dashboardWidgetContribution,
      welcomeWidget,
    ));
  },
  apiVersion: 1,
  id: "avesd.builtin.welcome",
  version: "0.1.0",
};
