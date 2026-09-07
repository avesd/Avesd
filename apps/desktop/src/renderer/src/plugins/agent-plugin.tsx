import type { AgentService, PluginDefinition } from "@avesd/plugin-api";

import { AgentDock } from "../components/AgentDock";
import { agentOverlayContribution } from "../workbench/types";
import type { WorkbenchView } from "../workbench/types";

const createAgentView = (service: AgentService): WorkbenchView => ({
  render: () => <AgentDock service={service} />,
});

export const agentPlugin: PluginDefinition = {
  activate(context) {
    const service = context.services.agent;
    if (!service) {
      throw new Error("Agent capability was not provided");
    }

    context.effect(() => context.contributions.contribute(
      agentOverlayContribution,
      createAgentView(service),
    ));
  },
  apiVersion: 1,
  capabilities: ["agent"],
  id: "avesd.builtin.agent",
  version: "0.1.0",
};
