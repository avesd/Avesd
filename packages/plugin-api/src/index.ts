export type Dispose = () => void | Promise<void>;

export type JsonPrimitive = boolean | number | string | null;
export type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export interface KeyValueStore {
  delete(key: string): Promise<void>;
  get(key: string): Promise<JsonValue | undefined>;
  set(key: string, value: JsonValue): Promise<void>;
}

export interface PluginStorage {
  readonly settings: KeyValueStore;
  readonly state: KeyValueStore;
}

export interface CommandService {
  execute(commandId: string, input?: unknown): Promise<unknown>;
}

export interface ExternalOpenService {
  openUrl(url: string): Promise<void>;
}

export type AgentConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

export type AgentEvent =
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
  cancel(): Promise<void>;
  connect(): Promise<void>;
  prompt(text: string): Promise<void>;
  subscribe(listener: (event: AgentEvent) => void): Dispose;
}

export interface PluginServices {
  readonly agent: AgentService;
  readonly commands: CommandService;
  readonly externalOpen: ExternalOpenService;
  readonly storage: PluginStorage;
}

export type PluginCapability = keyof PluginServices;

export interface ContributionPoint<T> {
  readonly id: string;
  readonly valueType?: T;
}

export const defineContributionPoint = <T>(id: string): ContributionPoint<T> =>
  Object.freeze({ id });

export interface PluginContributions {
  contribute<T>(point: ContributionPoint<T>, value: T): Dispose;
}

export interface PluginContext {
  readonly contributions: PluginContributions;
  readonly pluginId: string;
  readonly services: Readonly<Partial<PluginServices>>;
  effect(setup: () => Dispose): void;
  onDispose(dispose: Dispose): void;
}

export interface PluginDefinition {
  readonly apiVersion: 1;
  readonly capabilities?: readonly PluginCapability[];
  readonly id: string;
  readonly version: string;
  activate(context: PluginContext): Dispose | Promise<Dispose | void> | void;
}

export interface PluginManifest {
  readonly apiVersion: 1;
  readonly capabilities?: readonly PluginCapability[];
  readonly displayName: string;
  readonly id: string;
  readonly main?: string;
  readonly ui?: string;
  readonly version: string;
}
