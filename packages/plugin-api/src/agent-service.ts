/**
 * @author Avesd
 * @package Plugin API
 * @namespace Root
 * @description Agent Service
 */

import type { Dispose } from "./dispose";

export type AgentConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

export interface AgentSettings {
    readonly status: AgentConnectionStatus;
    readonly providerId: string;
    readonly providers: readonly {
        readonly id: string;
        readonly name: string;
        readonly available?: boolean;
        readonly unavailableReason?: string;
    }[];
    readonly agentName: string;
    readonly modelId?: string;
    readonly effortId?: string;
    readonly efforts?: readonly {
        readonly id: string;
        readonly name: string;
    }[];
    readonly models: readonly {
        readonly id: string;
        readonly name: string;
    }[];
}

export type AgentEvent =
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
      readonly type: "sessionReset";
  }
  | {
      readonly type: "settings";
      readonly settings: AgentSettings;
  }
  | {
      readonly message?: string;
      readonly status: AgentConnectionStatus;
      readonly type: "status";
  }
  | {
      readonly text: string;
      readonly type: "messageChunk";
  }
  | {
      readonly title: string;
      readonly type: "activity";
  }
  | {
      readonly stopReason: string;
      readonly type: "turnComplete";
  };

export interface AgentService {
    getSettings?(): Promise<AgentSettings>;
    selectProvider?(id: string): Promise<void>;
    selectModel?(id: string): Promise<void>;
    selectEffort?(id: string): Promise<void>;
    cancel(): Promise<void>;
    connect(): Promise<void>;
    prompt(text: string): Promise<void>;
    subscribe(listener: (event: AgentEvent) => void): Dispose;
}
