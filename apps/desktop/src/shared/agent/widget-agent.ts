/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Provider-independent widget agent transport
 */

import type { AgentTaskRequest, AgentTaskResult, AgentTaskService } from "@avesd/plugin-api";

export const widgetAgentChannel = "widget-agent:invoke";

export type WidgetAgentRequest = {
    readonly type: "start";
    readonly request: AgentTaskRequest;
} | {
    readonly type: "read" | "cancel";
    readonly id: string;
};
export interface WidgetAgentApi {
    invoke(widgetId: string, request: WidgetAgentRequest): Promise<unknown>;
}
export function createAgentTaskService(invoke: (request: WidgetAgentRequest) => Promise<unknown>): AgentTaskService {

    return {
        start: request => {

            return invoke({
                type: "start",
                request,
            }) as Promise<{
                id: string;
            }>;
        },
        read: id => {

            return invoke({
                type: "read",
                id,
            }) as Promise<AgentTaskResult>;
        },
        cancel: id => {

            return invoke({
                type: "cancel",
                id,
            }) as Promise<void>;
        },
    };
}
