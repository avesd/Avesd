/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Agent Gateway
 */

import type { AgentToolResult } from "./agent-tools";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";

export interface AgentGatewayAddress {
    readonly url: string;
    readonly token: string;
}

export async function openAgentGateway(invoke: (name: string, input: unknown) => Promise<AgentToolResult>): Promise<AgentGatewayAddress & {
    close(): void;
    rotateToken(): void;
}> {
    let token = randomBytes(32).toString("hex");
    const server = createServer((request, response) => {
        void (async () => {
            if (request.method !== "POST" || request.url !== "/invoke" || request.headers.origin
      || request.headers.authorization !== `Bearer ${token}` || request.headers["content-type"] !== "application/json") {
                response.writeHead(403).end(); return;
            }
            let body = "";
            request.setEncoding("utf8");
            try {
                for await (const chunk of request) {
                    body += String(chunk);
                    if (Buffer.byteLength(body) > 300_000) {
                        response.writeHead(413).end(); return;
                    }
                }
                if (request.headers.authorization !== `Bearer ${token}`) {
                    response.writeHead(403).end(); return;
                }
                const command = JSON.parse(body) as {
                    name?: unknown;
                    input?: unknown;
                };
                if (typeof command.name !== "string") {
                    throw new Error("Invalid Avesd request.");
                }
                const output = await invoke(command.name, command.input);
                response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(output));
            } catch (error) {
                const message = error instanceof Error && error.name !== "ZodError" ? error.message.slice(0, 1024) : "Invalid Avesd tool arguments.";
                response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({
                    isError: true,
                    content: [
                        {
                            type: "text",
                            text: message,
                        },
                    ],
                }));
            }
        })().catch(() => {
            response.destroy();
        });
    });
    server.requestTimeout = 15_000;
    await new Promise<void>((resolve, reject) => {
        server.once("error", reject); server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") {
        throw new Error("Avesd gateway did not start.");
    }
    return {
        url: `http://127.0.0.1:${address.port}/invoke`,
        get token() { return token; },
        rotateToken() { token = randomBytes(32).toString("hex"); },
        close() { server.closeAllConnections(); server.close(); },
    };
}
