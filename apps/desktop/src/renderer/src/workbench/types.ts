import { defineContributionPoint } from "@avesd/plugin-api";
import type { ReactNode } from "react";

export interface WorkbenchView {
  readonly render: () => ReactNode;
}

export const mainViewContribution = defineContributionPoint<WorkbenchView>(
  "workbench.main",
);

export const agentOverlayContribution = defineContributionPoint<WorkbenchView>(
  "workbench.overlay.agent",
);
