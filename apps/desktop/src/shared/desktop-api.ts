import type { AgentService } from "@avesd/plugin-api";
import type {
  DashboardScope,
  DataSourceDefinition,
  WidgetDefinition,
  WorkspaceSnapshot,
} from "@avesd/workspace-model";

export interface DesktopRuntime {
  readonly chrome: string;
  readonly electron: string;
  readonly node: string;
  readonly platform: string;
}

export interface DesktopApi {
  readonly agent: DesktopAgentApi;
  readonly runtime: DesktopRuntime;
  readonly workspaceStorage: WorkspaceStorageApi;
}

export interface AgentWorkbenchContext {
  readonly dataSourceDefinitions: readonly DataSourceDefinition[];
  readonly scope: DashboardScope;
  readonly widgetDefinitions: readonly WidgetDefinition[];
}

export interface DesktopAgentApi extends AgentService {
  configureWorkbench(context: AgentWorkbenchContext): Promise<void>;
}

export interface WorkspaceStorageApi {
  load(): Promise<unknown>;
  save(snapshot: WorkspaceSnapshot): Promise<void>;
}

export const agentIpcChannels = Object.freeze({
  cancel: "agent:cancel",
  connect: "agent:connect",
  configureWorkbench: "agent:configure-workbench",
  event: "agent:event",
  prompt: "agent:prompt",
});

export const workspaceIpcChannels = Object.freeze({
  load: "workspace:load",
  save: "workspace:save",
});

export const parseAgentPrompt = (input: unknown): string => {
  if (typeof input !== "string") {
    throw new TypeError("Agent prompt must be a string");
  }

  const prompt = input.trim();
  if (prompt.length === 0) {
    throw new Error("Agent prompt cannot be empty");
  }
  if (prompt.length > 32_768) {
    throw new Error("Agent prompt is too long");
  }

  return prompt;
};

export const formatRuntimeSummary = (runtime: DesktopRuntime): string =>
  `Electron ${runtime.electron} · ${runtime.platform}`;
