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
  | { readonly text: string; readonly type: "text" }
  | { readonly name: string; readonly type: "resource_link"; readonly uri: string };

export interface AcpSessionUpdate {
  readonly sessionId: string;
  readonly update: unknown;
}

export class AcpClient {
  constructor(private readonly transport: AcpTransport) {}

  initialize(clientInfo: { readonly name: string; readonly title?: string; readonly version: string }, clientCapabilities: AcpClientCapabilities): Promise<AcpInitializeResult> {
    return this.transport.request("initialize", {
      clientCapabilities,
      clientInfo,
      protocolVersion: 1,
    });
  }

  newSession(cwd: string): Promise<{ readonly sessionId: string }> {
    return this.transport.request("session/new", { cwd, mcpServers: [] });
  }

  loadSession(sessionId: string, cwd: string): Promise<void> {
    return this.transport.request("session/load", { cwd, mcpServers: [], sessionId });
  }

  prompt(sessionId: string, prompt: readonly AcpContentBlock[]): Promise<{ readonly stopReason: string }> {
    return this.transport.request("session/prompt", { prompt, sessionId });
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
  | { readonly text: string; readonly type: "messageChunk" }
  | { readonly title: string; readonly type: "activity" };

export interface AcpByteStream {
  readonly readable: ReadableStream<Uint8Array>;
  readonly writable: WritableStream<Uint8Array>;
}

export interface AcpSessionConnectionOptions {
  readonly clientInfo: {
    readonly name: string;
    readonly title?: string;
    readonly version: string;
  };
  readonly cwd: string;
  readonly onEvent: (event: AcpRuntimeEvent) => void;
  readonly stream: AcpByteStream;
}

export class AcpSessionConnection {
  private constructor(
    private readonly connection: acp.ClientConnection,
    readonly agentName: string,
    readonly sessionId: string,
  ) {}

  static async connect(
    options: AcpSessionConnectionOptions,
  ): Promise<AcpSessionConnection> {
    const stream = acp.ndJsonStream(
      options.stream.writable,
      options.stream.readable,
    );
    const client = acp.client({ name: options.clientInfo.name })
      .onRequest(
        acp.methods.client.session.requestPermission,
        () => ({ outcome: { outcome: "cancelled" } }),
      )
      .onNotification(acp.methods.client.session.update, ({ params }) => {
        const update = params.update;

        if (
          update.sessionUpdate === "agent_message_chunk" &&
          update.content.type === "text"
        ) {
          options.onEvent({ text: update.content.text, type: "messageChunk" });
        } else if (update.sessionUpdate === "tool_call") {
          options.onEvent({ title: update.title, type: "activity" });
        }
      });
    const connection = client.connect(stream);

    try {
      const initialized = await connection.agent.request<acp.InitializeResponse>(
        "initialize",
        {
          clientCapabilities: {},
          clientInfo: options.clientInfo,
          protocolVersion: acp.PROTOCOL_VERSION,
        },
      );
      const session = await connection.agent.request(
        acp.methods.agent.session.new,
        { cwd: options.cwd, mcpServers: [] },
      );

      return new AcpSessionConnection(
        connection,
        initialized.agentInfo?.title ?? initialized.agentInfo?.name ?? "Agent",
        session.sessionId,
      );
    } catch (error) {
      connection.close(error);
      throw error;
    }
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
        prompt: [{ text, type: "text" }],
        sessionId: this.sessionId,
      },
    );

    return response.stopReason;
  }
}
