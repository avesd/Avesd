/**
 * @author Avesd
 * @package ACP Client
 * @namespace Root
 * @description ACP Session Connection
 */

import type { AcpRuntimeEvent, AcpSessionConnectionOptions } from "./acp-session-contract";
import * as acp from "@agentclientprotocol/sdk";

async function sessionRequest<T>(connection: acp.ClientConnection, work: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            work,
            new Promise<never>((_resolve, reject) => {
                timer = setTimeout(() => {
                    connection.close(); reject(new Error("Agent configuration request timed out."));
                }, 30000);
            }),
        ]);
    } finally { clearTimeout(timer); }
}

export class AcpSessionConnection {
    private constructor(
        private readonly connection: acp.ClientConnection,
        readonly agentName: string,
        readonly sessionId: string,
        private readonly configuration: {
            options: acp.SessionConfigOption[];
        },
        private readonly onEvent: (event: AcpRuntimeEvent) => void,
    ) {}

    static async connect(options: AcpSessionConnectionOptions): Promise<AcpSessionConnection> {
        const configuration = { options: [] as acp.SessionConfigOption[] };
        let activeSessionId: string | undefined;
        const toolCalls = new Map<string, {
            name?: string | null;
            rawInput?: unknown;
        }>();
        const stream = acp.ndJsonStream(
            options.stream.writable,
            options.stream.readable,
        );
        const client = acp.client({ name: options.clientInfo.name })
            .onRequest(
                acp.methods.client.session.requestPermission,
                ({ params }) => {
                    const allowOnce = params.options.find(({ kind }) => {
                        return kind === "allow_once";
                    });
                    const key = `${params.sessionId}/${params.toolCall.toolCallId}`;
                    const toolCall = {
                        ...toolCalls.get(key),
                        ...params.toolCall,
                    };
                    const authorized = options.authorizeToolCall?.(toolCall)
            ?? (!!toolCall.name && !!options.allowedToolNames?.includes(toolCall.name));
                    return authorized && allowOnce
                        ? {
                            outcome: {
                                optionId: allowOnce.optionId,
                                outcome: "selected" as const,
                            },
                        }
                        : { outcome: { outcome: "cancelled" as const } };
                },
            )
            .onNotification(acp.methods.client.session.update, ({ params }) => {
                if (activeSessionId && params.sessionId !== activeSessionId) {
                    return;
                }
                const update = params.update;
                if (update.sessionUpdate === "config_option_update") {
                    configuration.options = update.configOptions;
                    options.onEvent({ type: "modelsChanged" });
                }
                if (update.sessionUpdate === "tool_call" || update.sessionUpdate === "tool_call_update") {
                    const key = `${params.sessionId}/${update.toolCallId}`;
                    if (update.status === "completed" || update.status === "failed") {
                        toolCalls.delete(key);
                    }
                    else {
                        const previous = toolCalls.get(key);
                        toolCalls.set(key, {
                            name: update.name ?? previous?.name,
                            rawInput: update.rawInput ?? previous?.rawInput,
                        });
                    }
                }

                if (
                    update.sessionUpdate === "agent_message_chunk" &&
          update.content.type === "text"
                ) {
                    options.onEvent({
                        text: update.content.text,
                        type: "messageChunk",
                    });
                } else if (update.sessionUpdate === "agent_thought_chunk" && update.content.type === "text") {
                    options.onEvent({
                        type: "thoughtChunk",
                        text: update.content.text,
                    });
                } else if (update.sessionUpdate === "tool_call" || update.sessionUpdate === "tool_call_update") {
                    const content = update.content?.map(item => {
                        if (item.type === "content") {
                            if (item.content.type === "text") {
                                return item.content.text;
                            }
                            return `[${item.content.type} content]`;
                        }
                        if (item.type === "diff") {
                            return `${item.path}\n--- Before\n${item.oldText ?? ""}\n+++ After\n${item.newText}`;
                        }
                        return "Terminal output is not provided by this client.";
                    }).join("\n\n");
                    options.onEvent({
                        type: "toolCall",
                        id: update.toolCallId,
                        ...(typeof update.title === "string" ? { title: update.title } : {}),
                        ...(typeof update.status === "string" ? { status: update.status } : {}),
                        ...(update.rawInput !== undefined ? { input: JSON.stringify(update.rawInput, null, 2) } : {}),
                        ...(content !== undefined ? { output: content } : update.rawOutput !== undefined ? { output: JSON.stringify(update.rawOutput, null, 2) } : {}),
                    });
                }
            });
        const connection = client.connect(stream);

        try {
            const initialized = await sessionRequest(connection, connection.agent.request<acp.InitializeResponse>(
                "initialize",
                {
                    clientCapabilities: {},
                    clientInfo: options.clientInfo,
                    protocolVersion: acp.PROTOCOL_VERSION,
                },
            ));
            const session = await sessionRequest(connection, connection.agent.request(
                acp.methods.agent.session.new,
                {
                    cwd: options.cwd,
                    mcpServers: options.mcpServers ?? [],
                },
            ));

            activeSessionId = session.sessionId;
            configuration.options = session.configOptions ?? configuration.options;
            return new AcpSessionConnection(
                connection,
                initialized.agentInfo?.title ?? initialized.agentInfo?.name ?? "Agent",
                session.sessionId,
                configuration,
                options.onEvent,
            );
        } catch (error) {
            connection.close(error);
            throw error;
        }
    }

    get models(): {
        id?: string;
        choices: readonly {
            id: string;
            name: string;
        }[];
    } {
        return this.selectOptions("model");
    }

    get efforts() {
        return this.selectOptions("effort");
    }

    private selectOptions(kind: "model" | "effort") {
        const option = this.configurationOption(kind);
        return option ? {
            id: option.currentValue,
            choices: option.options.flatMap(item =>
            {
                return "options" in item ? item.options.map(choice => {
                    return {
                        ...choice,
                        name: `${item.name} · ${choice.name}`,
                    };
                }) : [item];
            }).map(item => {
                return {
                    id: item.value,
                    name: item.name,
                };
            }),
        } : { choices: [] };
    }

    private configurationOption(kind: "model" | "effort") {
        return this.configuration.options.find((option): option is acp.SessionConfigOption & acp.SessionConfigSelect & {
            type: "select";
        } =>
        {
            return option.type === "select" && (kind === "model"
                ? option.category === "model" || option.id === "model"
                : option.category === "thought_level" || option.id === "reasoning_effort");
        });
    }

    async selectModel(id: string): Promise<void> {
        await this.selectOption("model", id);
    }

    async selectEffort(id: string): Promise<void> {
        await this.selectOption("effort", id);
    }

    private async selectOption(kind: "model" | "effort", id: string): Promise<void> {
        const option = this.configurationOption(kind);
        if (!option || !this.selectOptions(kind).choices.some(model => {
            return model.id === id;
        })) {
            throw new Error(`${kind === "model" ? "Model" : "Reasoning effort"} is unavailable in this session.`);
        }
        const response = await sessionRequest(this.connection, this.connection.agent.request(acp.methods.agent.session.setConfigOption, {
            sessionId: this.sessionId,
            configId: option.id,
            value: id,
        }));
        this.configuration.options = response.configOptions;
        this.onEvent({ type: "modelsChanged" });
    }

    async cancel(): Promise<void> {
        await this.connection.agent.notify(acp.methods.agent.session.cancel, {
            sessionId: this.sessionId,
        });
    }

    close(): void {
        this.connection.close();
    }

    async prompt(text: string): Promise<string> {
        const response = await this.connection.agent.request(
            acp.methods.agent.session.prompt,
            {
                prompt: [
                    {
                        text,
                        type: "text",
                    },
                ],
                sessionId: this.sessionId,
            },
        );

        return response.stopReason;
    }
}
