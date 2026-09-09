/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Agent Plugin
 */

import { agentTierLabels } from "../../../../shared/agent/sessions";
import { AgentDock } from "../../components/AgentDock";
import { sessionAgentService } from "../../components/session-agent-service";
import type { WorkbenchView } from "../../workbench/types";
import { agentOverlayContribution } from "../../workbench/types";
import { useAgentPanel } from "../../workbench/WorkbenchChrome";
import type { AgentService, PluginDefinition } from "@avesd/plugin-api";
import { useMemo } from "react";

const ManagedAgentDock = () => {

    const { activeSession } = useAgentPanel();
    const service = useMemo(() => {

        return activeSession ? sessionAgentService(window.avesd.agentSessions, activeSession.id) : undefined;
    }, [activeSession?.id]);

    return service && activeSession ? <AgentDock
        key={activeSession.id}
        service={service}
        managed
        label={agentTierLabels[activeSession.tier]}
    /> : null;
};

const createAgentView = (_service: AgentService): WorkbenchView => {

    return {
        render: () => {

            return <ManagedAgentDock />;
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
