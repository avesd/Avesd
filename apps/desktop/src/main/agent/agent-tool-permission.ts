/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Agent Tool Permission
 */

import { agentToolNames } from "./agent-tools";

export const AVESD_MCP_SERVER_NAME = "avesd";
export function authorizeAvesdTool(toolCall: {
    readonly rawInput?: unknown;
}): boolean {

    const input = toolCall.rawInput;
    if (!input || typeof input !== "object") {
        return false;
    }

    return "server" in input && input.server === AVESD_MCP_SERVER_NAME
    && "tool" in input && typeof input.tool === "string" && agentToolNames.includes(input.tool);
}
