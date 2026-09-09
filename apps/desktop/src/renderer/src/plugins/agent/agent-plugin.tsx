/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Agent Plugin
 */

import { AgentDock } from "../../components/AgentDock";
import type { WorkbenchView } from "../../workbench/types";
import { agentOverlayContribution } from "../../workbench/types";
import type { AgentService, PluginDefinition } from "@avesd/plugin-api";

const createAgentView = (service: AgentService): WorkbenchView => {
    return {
        render: () => {
            return <AgentDock
                service={service}
            />;
        },
    };
};

export const agentPlugin: PluginDefinition = {
    activate(context) {
        const service = context.services.agent;
        if (!service) {
            throw new Error("Agent capability was not provided");
        }

        context.effect(() => {
            return context.contributions.contribute(
                agentOverlayContribution,
                createAgentView(service),
            );
        });
    },
    apiVersion: 1,
    capabilities: ["agent"],
    id: "avesd.builtin.agent",
    version: "0.1.0",
};
