/**
 * @author Avesd
 * @package ACP Client
 * @namespace Root
 * @description ACP Client exports
 */

import * as acp from "@agentclientprotocol/sdk";

export interface AcpTransport {
    notify(method: string, params: unknown): void;
    onNotification(listener: (method: string, params: unknown) => void): () => void;
    request<TResult>(method: string, params: unknown): Promise<TResult>;
}

export interface AcpClientCapabilities {
    readonly fs?: {
        readonly readTextFile?: boolean;
        readonly writeTextFile?: boolean;
    };
    readonly terminal?: boolean;
}

export interface AcpAgentCapabilities {
    readonly loadSession?: boolean;
    readonly promptCapabilities?: {
        readonly audio?: boolean;
        readonly embeddedContext?: boolean;
        readonly image?: boolean;
    };
}

export interface AcpInitializeResult {
    readonly agentCapabilities: AcpAgentCapabilities;
    readonly agentInfo?: {
        readonly name: string;
        readonly title?: string;
        readonly version: string;
    };
    readonly authMethods?: readonly unknown[];
    readonly protocolVersion: number;
}

export type AcpContentBlock =
  | {
      readonly text: string;
      readonly type: "text";
  }
  | {
      readonly name: string;
      readonly type: "resource_link";
      readonly uri: string;
  };

export interface AcpSessionUpdate {
    readonly sessionId: string;
    readonly update: unknown;
}

export class AcpClient {
    constructor(private readonly transport: AcpTransport) {}

    initialize(clientInfo: {
        readonly name: string;
        readonly title?: string;
        readonly version: string;
    }, clientCapabilities: AcpClientCapabilities): Promise<AcpInitializeResult> {
        return this.transport.request("initialize", {
            clientCapabilities,
            clientInfo,
            protocolVersion: 1,
        });
    }

    newSession(cwd: string): Promise<{
        readonly sessionId: string;
    }> {
        return this.transport.request("session/new", {
            cwd,
            mcpServers: [],
        });
    }

    loadSession(sessionId: string, cwd: string): Promise<void> {
        return this.transport.request("session/load", {
            cwd,
            mcpServers: [],
            sessionId,
        });
    }

    prompt(sessionId: string, prompt: readonly AcpContentBlock[]): Promise<{
        readonly stopReason: string;
    }> {
        return this.transport.request("session/prompt", {
            prompt,
            sessionId,
        });
    }

    cancel(sessionId: string): void {
        this.transport.notify("session/cancel", { sessionId });
    }

    onSessionUpdate(listener: (update: AcpSessionUpdate) => void): () => void {
        return this.transport.onNotification((method, params) => {
            if (method === "session/update") {
                listener(params as AcpSessionUpdate);
            }
        });
    }
}

export type AcpRuntimeEvent =
  | {
      readonly type: "thoughtChunk";
      readonly text: string;
  }
  | {
      readonly type: "toolCall";
      readonly id: string;
      readonly title?: string;
      readonly status?: string;
      readonly input?: string;
      readonly output?: string;
  }
  | {
      readonly type: "modelsChanged";
  }
  | {
      readonly text: string;
      readonly type: "messageChunk";
  }
  | {
      readonly title: string;
      readonly type: "activity";
  };

export interface AcpByteStream {
    readonly readable: ReadableStream<Uint8Array>;
    readonly writable: WritableStream<Uint8Array>;
}

export interface AcpSessionConnectionOptions {
    readonly allowedToolNames?: readonly string[];
    readonly authorizeToolCall?: (toolCall: {
        readonly name?: string | null;
        readonly rawInput?: unknown;
    }) => boolean;
    readonly clientInfo: {
        readonly name: string;
        readonly title?: string;
        readonly version: string;
    };
    readonly cwd: string;
    readonly onEvent: (event: AcpRuntimeEvent) => void;
    readonly mcpServers?: acp.McpServer[];
    readonly stream: AcpByteStream;
}

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
        const option = this.modelOption;
        return option ? {
            id: option.currentValue,
            choices: option.options.flatMap(item =>
            {
                return "options" in item ? item.options : [item];
            }).map(item => {
                return {
                    id: item.value,
                    name: item.name,
                };
            }),
        } : { choices: [] };
    }

    private get modelOption() {
        return this.configuration.options.find((option): option is acp.SessionConfigOption & acp.SessionConfigSelect & {
            type: "select";
        } =>
        {
            return option.type === "select" && (option.category === "model" || option.id === "model");
        });
    }

    async selectModel(id: string): Promise<void> {
        const option = this.modelOption;
        if (!option || !this.models.choices.some(model => {
            return model.id === id;
        })) {
            throw new Error("Model is unavailable in this session.");
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
