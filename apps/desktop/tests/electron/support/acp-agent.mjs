/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description ACP Agent
 */

// Synthetic ACP process for testing host lifecycle and configuration without accounts.
import { createInterface } from "node:readline";

const provider = process.argv[2] ?? "codex";
let model = "fast";
const config = () => {
    return [
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
        model = params.value;
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
