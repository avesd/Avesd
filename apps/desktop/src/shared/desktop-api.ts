/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Desktop API
 */

import type { AgentProvidersApi } from "./agent/providers";
import type { BrowserControlsApi } from "./browser/browser-controls";
import type { WebSurfaceApi } from "./browser/web-surface";
import type { LocalPluginsApi } from "./plugins/local-plugins";
import type { WorkbenchPreferencesApi } from "./workbench/preferences";
import type { DesktopWidgetWorkspaceApi } from "./workspace/widget-workspace";
import type { WorkspaceNavigationApi } from "./workspace/workspace-navigation";
import type { AgentService } from "@avesd/plugin-api";
import type { DataSourceDefinition,
    WidgetDefinition,
    WorkspaceSnapshot } from "@avesd/workspace-model";

export interface DesktopRuntime {
    readonly chrome: string;
    readonly electron: string;
    readonly node: string;
    readonly platform: string;
}

export interface DesktopApi {
    readonly agentProviders: AgentProvidersApi;
    readonly preferences: WorkbenchPreferencesApi;
    readonly widgetWorkspace: DesktopWidgetWorkspaceApi;
    readonly navigation: WorkspaceNavigationApi;
    readonly localPlugins: LocalPluginsApi;
    readonly browserControls: BrowserControlsApi;
    readonly web: WebSurfaceApi;
    readonly agent: DesktopAgentApi;
    readonly runtime: DesktopRuntime;
    readonly workspaceStorage: WorkspaceStorageApi;
}

export interface AgentWorkbenchContext {
    readonly dataSourceDefinitions: readonly DataSourceDefinition[];
    readonly widgetDefinitions: readonly WidgetDefinition[];
}

export interface DesktopAgentApi extends AgentService {
    configureWorkbench(context: AgentWorkbenchContext): Promise<void>;
}

export interface WorkspaceStorageApi {
    load(): Promise<unknown>;
    save(snapshot: WorkspaceSnapshot, expected?: {
        snapshot: WorkspaceSnapshot | undefined;
    }): Promise<void>;
    subscribe(listener: () => void): () => void;
}

export const agentIpcChannels = Object.freeze({
    settings: "agent:settings",
    provider: "agent:provider",
    model: "agent:model",
    cancel: "agent:cancel",
    connect: "agent:connect",
    configureWorkbench: "agent:configure-workbench",
    event: "agent:event",
    prompt: "agent:prompt",
});

export const workspaceIpcChannels = Object.freeze({
    changed: "workspace:changed",
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
{
    return `Electron ${runtime.electron} · ${runtime.platform}`;
};
