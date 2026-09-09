/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Workspace MCP
 */

import type { AgentToolResult } from "./agent-tools";
import { createAgentMcpServer } from "./agent-tools";
import { serveStdio } from "@modelcontextprotocol/server/stdio";

const endpoint = process.env.AVESD_HOST_URL;
const token = process.env.AVESD_HOST_TOKEN;
if (!endpoint || !token || new URL(endpoint).hostname !== "127.0.0.1") {
    throw new Error("Avesd host connection is missing.");
}

// This process is a protocol relay. It cannot independently mutate workspace files.
const server = createAgentMcpServer(async (name, input) => {

    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
        },
        body: JSON.stringify({
            name,
            input,
        }),
        signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
        throw new Error("Avesd host is unavailable.");
    }

    return await response.json() as AgentToolResult;
});

serveStdio(() => {

    return server;
}, {
    onerror() {

        process.stderr.write("Avesd MCP request failed.\n");
    },
});
