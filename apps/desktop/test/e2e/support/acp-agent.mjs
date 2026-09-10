/**
 * @author Avesd
 * @package Desktop
 * @namespace TestE2eSupport
 * @description ACP Agent
 */

// Synthetic ACP process for testing host lifecycle and configuration without accounts.
import { appendFileSync } from "node:fs";
import { createInterface } from "node:readline";

const provider = process.argv[2] ?? "codex";
let model = "fast";
let effort = "medium";
const config = () => {

    return [
        {
            id: "reasoning_effort",
            name: "Reasoning effort",
            category: "thought_level",
            type: "select",
            currentValue: effort,
            options: [
                {
                    value: "medium",
                    name: "Medium",
                },
                {
                    value: "high",
                    name: "High",
                },
            ].filter(option => {

                return !process.env.AVESD_TEST_PROBE_TRACE || model === "deep" || option.value === "medium";
            }),
        },
        {
            id: "model",
            name: "Model",
            category: "model",
            type: "select",
            currentValue: model,
            options: [
                {
                    group: "available",
                    name: "Available",
                    options: [
                        {
                            value: "fast",
                            name: `${provider} Fast`,
                        },
                        {
                            value: "deep",
                            name: `${provider} Deep`,
                        },
                        {
                            value: "reject",
                            name: "Rejected choice",
                        },
                    ],
                },
            ],
        },
    ];
};
const send = message => {

    return process.stdout.write(JSON.stringify({
        jsonrpc: "2.0",
        ...message,
    }) + "\n");
};
createInterface({ input: process.stdin }).on("line", line => {

    const { id, method, params } = JSON.parse(line);
    if (process.env.AVESD_TEST_PROBE_TRACE) {
        appendFileSync(process.env.AVESD_TEST_PROBE_TRACE, JSON.stringify({
            method,
            model,
            effort,
            ...(method === "session/new" ? { mcpCount: params.mcpServers.length } : {}),
        }) + "\n");
    }
    if (id === undefined) {
        return;
    }
    if (method === "initialize") {
        send({
            id,
            result: {
                protocolVersion: 1,
                agentCapabilities: {},
                agentInfo: {
                    name: provider,
                    version: "1.0.0",
                },
            },
        });
    }
    else if (method === "session/new") {
        send({
            id,
            result: {
                sessionId: provider + "-session",
                configOptions: config(),
            },
        });
    }
    else if (method === "session/set_config_option") {
        if (params.value === "reject") {
            return send({
                id,
                error: {
                    code: -32602,
                    message: "Synthetic model unavailable",
                },
            });
        }
        if (params.configId === "reasoning_effort") {
            effort = params.value;
        }
        else {
            model = params.value;
        }
        send({
            method: "session/update",
            params: {
                sessionId: params.sessionId,
                update: {
                    sessionUpdate: "config_option_update",
                    configOptions: config(),
                },
            },
        });
        send({
            id,
            result: { configOptions: config() },
        });
    } else if (method === "session/prompt") {
        if (process.env.AVESD_TEST_PROBE_FAIL === "1" || params.prompt.some(item => {

            return item.text?.includes("Synthetic provider failure");
        })) {
            return send({
                id,
                result: {
                    stopReason: "end_turn",
                    _meta: {
                        jetbrains: {
                            air: {
                                version: 1,
                                sessionFailure: {
                                    id: "synthetic-failure",
                                    revision: 1,
                                    severity: "error",
                                    category: "provider",
                                    title: "Synthetic private provider response",
                                    actions: [],
                                },
                            },
                        },
                    },
                },
            });
        }
        const text = process.env.AVESD_TEST_ECHO_CONTEXT === "1"
            ? JSON.stringify({
                cwd: process.cwd(),
                prompt: params.prompt[0]?.text,
            })
            : provider + "/" + model;
        send({
            method: "session/update",
            params: {
                sessionId: params.sessionId,
                update: {
                    sessionUpdate: "agent_message_chunk",
                    content: {
                        type: "text",
                        text,
                    },
                },
            },
        });
        setTimeout(() => {

            return send({
                id,
                result: { stopReason: "end_turn" },
            });
        }, 100);
    } else {
        send({
            id,
            error: {
                code: -32601,
                message: "Unknown method",
            },
        });
    }
});
