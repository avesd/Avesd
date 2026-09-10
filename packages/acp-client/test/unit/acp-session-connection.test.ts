/**
 * @author Avesd
 * @package ACP Client
 * @namespace TestUnit
 * @description ACP Session Connection Test
 */

import { AcpSessionConnection } from "../../src/acp-session-connection";
import * as acp from "@agentclientprotocol/sdk";
import { describe, expect, it, vi } from "vitest";

describe("AcpSessionConnection", () => {

    it("initializes a session and normalizes streamed agent text", async () => {

        const clientToAgent = new TransformStream<Uint8Array>();
        const agentToClient = new TransformStream<Uint8Array>();
        let permissionOutcome: unknown;
        let rejectedOutcome: unknown;
        let correlatedOutcome: unknown;
        let receivedMcpServers: unknown;
        const agent = acp.agent({ name: "test-agent" })
            .onRequest("initialize", ({ params }) => {

                expect(params.clientCapabilities?._meta).toMatchObject({
                    jetbrains: {
                        air: {
                            version: 1,
                            capabilities: ["sessionFailure"],
                        },
                    },
                });

                return {
                    agentCapabilities: {},
                    agentInfo: {
                        name: "test-agent",
                        title: "Test Agent",
                        version: "1.0.0",
                    },
                    protocolVersion: acp.PROTOCOL_VERSION,
                };
            })
            .onRequest("session/new", ({ params }) => {

                receivedMcpServers = params.mcpServers;

                return { sessionId: "session-1" };
            })
            .onRequest("session/prompt", async ({ client, params }) => {

                if (params.prompt.some(item => {

                    return item.type === "text" && item.text === "Fail";
                })) {
                    return {
                        stopReason: "end_turn",
                        _meta: {
                            jetbrains: {
                                air: {
                                    version: 1,
                                    sessionFailure: {
                                        severity: "error",
                                        title: "Synthetic private response",
                                    },
                                },
                            },
                        },
                    };
                }

                await client.notify("session/update", {
                    sessionId: params.sessionId,
                    update: {
                        sessionUpdate: "agent_thought_chunk",
                        content: {
                            type: "text",
                            text: "Checking available widgets.",
                        },
                    },
                });
                await client.notify("session/update", {
                    sessionId: params.sessionId,
                    update: {
                        sessionUpdate: "tool_call",
                        toolCallId: "inspect",
                        title: "Inspect dashboard",
                        status: "in_progress",
                        rawInput: { scope: "current" },
                    },
                });
                await client.notify("session/update", {
                    sessionId: params.sessionId,
                    update: {
                        sessionUpdate: "tool_call_update",
                        toolCallId: "inspect",
                        status: "completed",
                        content: [
                            {
                                type: "content",
                                content: {
                                    type: "text",
                                    text: "Two widgets",
                                },
                            },
                        ],
                    },
                });
                permissionOutcome = await client.request(
                    acp.methods.client.session.requestPermission,
                    {
                        options: [
                            {
                                kind: "allow_once",
                                name: "Allow",
                                optionId: "allow",
                            },
                        ],
                        sessionId: params.sessionId,
                        toolCall: {
                            name: "avesd_add_widget",
                            toolCallId: "tool-1",
                        },
                    },
                );
                rejectedOutcome = await client.request(acp.methods.client.session.requestPermission, {
                    options: [
                        {
                            kind: "allow_once",
                            name: "Allow",
                            optionId: "allow",
                        },
                    ],
                    sessionId: params.sessionId,
                    toolCall: {
                        name: "avesd_unregistered_shell",
                        toolCallId: "tool-2",
                    },
                });
                await client.notify("session/update", {
                    sessionId: params.sessionId,
                    update: {
                        sessionUpdate: "tool_call",
                        toolCallId: "tool-3",
                        title: "MCP widget tool",
                        status: "pending",
                        rawInput: {
                            server: "avesd",
                            tool: "avesd_add_widget",
                        },
                    },
                });
                correlatedOutcome = await client.request(acp.methods.client.session.requestPermission, {
                    options: [
                        {
                            kind: "allow_once",
                            name: "Allow",
                            optionId: "allow",
                        },
                    ],
                    sessionId: params.sessionId,
                    toolCall: {
                        toolCallId: "tool-3",
                        status: "pending",
                    },
                });
                await client.notify("session/update", {
                    sessionId: params.sessionId,
                    update: {
                        content: {
                            text: "Hello",
                            type: "text",
                        },
                        sessionUpdate: "agent_message_chunk",
                    },
                });

                return { stopReason: "end_turn" };
            })
            .onNotification("session/cancel", () => {

                return undefined;
            });
        const agentConnection = agent.connect(acp.ndJsonStream(
            agentToClient.writable,
            clientToAgent.readable,
        ));
        const onEvent = vi.fn();
        const session = await AcpSessionConnection.connect({
            allowedToolNames: ["avesd_add_widget"],
            authorizeToolCall: (toolCall) => {

                const input = toolCall.rawInput as {
                    server?: string;
                    tool?: string;
                } | undefined;

                return toolCall.name === "avesd_add_widget" || (input?.server === "avesd" && input.tool === "avesd_add_widget");
            },
            clientInfo: {
                name: "test-client",
                version: "1.0.0",
            },
            cwd: "/workspace",
            mcpServers: [
                {
                    args: ["server.js"],
                    command: "/usr/bin/node",
                    env: [],
                    name: "Avesd workspace",
                },
            ],
            onEvent,
            stream: {
                readable: agentToClient.readable,
                writable: clientToAgent.writable,
            },
        });

        await expect(session.prompt("Fail")).rejects.toThrow("CLI version");
        await expect(session.prompt("Hi")).resolves.toBe("end_turn");
        expect(session.agentName).toBe("Test Agent");
        expect(onEvent).toHaveBeenCalledWith({
            type: "thoughtChunk",
            text: "Checking available widgets.",
        });
        expect(onEvent).toHaveBeenCalledWith({
            type: "toolCall",
            id: "inspect",
            title: "Inspect dashboard",
            status: "in_progress",
            input: JSON.stringify({ scope: "current" }, null, 2),
        });
        expect(onEvent).toHaveBeenCalledWith({
            type: "toolCall",
            id: "inspect",
            status: "completed",
            output: "Two widgets",
        });
        expect(onEvent).toHaveBeenCalledWith({
            text: "Hello",
            type: "messageChunk",
        });
        expect(receivedMcpServers).toEqual([expect.objectContaining({ name: "Avesd workspace" })]);
        expect(permissionOutcome).toEqual({
            outcome: {
                optionId: "allow",
                outcome: "selected",
            },
        });
        expect(rejectedOutcome).toEqual({ outcome: { outcome: "cancelled" } });
        expect(correlatedOutcome).toEqual({
            outcome: {
                optionId: "allow",
                outcome: "selected",
            },
        });

        session.close();
        agentConnection.close();
    });
});
