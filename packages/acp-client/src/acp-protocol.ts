/**
 * @author Avesd
 * @package ACP Client
 * @namespace Root
 * @description ACP Protocol
 */

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
