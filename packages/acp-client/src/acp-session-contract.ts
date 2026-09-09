/**
 * @author Avesd
 * @package ACP Client
 * @namespace Root
 * @description ACP Session Contract
 */

import type * as acp from "@agentclientprotocol/sdk";

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
