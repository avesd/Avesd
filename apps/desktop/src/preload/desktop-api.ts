/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Desktop API
 */

import type { AgentProviderConfiguration, AgentProviderId, AgentProviderInstallation } from "../shared/agent/providers";
import { agentProvidersChannels } from "../shared/agent/providers";
import type { BrowserBinding, BrowserControlAction, BrowserControlsCommand } from "../shared/browser/browser-controls";
import { browserControlsChannel } from "../shared/browser/browser-controls";
import type { WebSurfaceCommand, WebSurfaceCommandResult } from "../shared/browser/web-surface";
import { unwrapWebSurfaceCommand, webSurfaceChannel, webSurfaceEventChannel } from "../shared/browser/web-surface";
import type { AgentWorkbenchContext, DesktopApi } from "../shared/desktop-api";
import { agentIpcChannels, workspaceIpcChannels } from "../shared/desktop-api";
import type { LocalPluginSummary, LocalWidgetCommand } from "../shared/plugins/local-plugins";
import { localPluginsChannels } from "../shared/plugins/local-plugins";
import type { SidebarSide } from "../shared/workbench/preferences";
import { workbenchPreferencesChannels } from "../shared/workbench/preferences";
import type { WidgetWorkspaceRequest, WidgetWorkspaceResult } from "../shared/workspace/widget-workspace";
import { workspaceNavigationChannel } from "../shared/workspace/workspace-navigation";
import type { AgentEvent, AgentSettings } from "@avesd/plugin-api";
import type { WidgetInstanceId } from "@avesd/workspace-model";
import type { JsonObject, WorkspaceSnapshot } from "@avesd/workspace-model";
import type { WorkspaceNavigationCommand, WorkspaceNavigationState } from "@avesd/workspace-model";
import { ipcRenderer } from "electron";

export const desktopApi: DesktopApi = Object.freeze({
    agentProviders: Object.freeze({
        list: (refresh = false) => {
            return ipcRenderer.invoke(agentProvidersChannels.list, refresh) as Promise<readonly AgentProviderInstallation[]>;
        },
        configure: (id: AgentProviderId, configuration: AgentProviderConfiguration) => {
            return ipcRenderer.invoke(agentProvidersChannels.configure, id, configuration) as Promise<void>;
        },
        openSetup: (id: AgentProviderId) => {
            return ipcRenderer.invoke(agentProvidersChannels.setup, id) as Promise<void>;
        },
    }),
    preferences: Object.freeze({
        getSidebarSide: () => {
            return ipcRenderer.invoke(workbenchPreferencesChannels.get) as Promise<SidebarSide>;
        },
        setSidebarSide: (side: SidebarSide) => {
            return ipcRenderer.invoke(workbenchPreferencesChannels.set, side) as Promise<void>;
        },
    }),
    widgetWorkspace: Object.freeze({
        invoke: (instanceId: WidgetInstanceId, request: WidgetWorkspaceRequest) => {
            return ipcRenderer.invoke("widget-workspace:renderer", instanceId, request) as Promise<WidgetWorkspaceResult>;
        },
        subscribe(listener: () => void) {
            const handler = () => {
                return void listener();
            };
            ipcRenderer.on(workspaceIpcChannels.changed, handler);
            ipcRenderer.on("widget-workspace:changed", handler);
            return () => {
                ipcRenderer.off(workspaceIpcChannels.changed, handler); ipcRenderer.off("widget-workspace:changed", handler);
            };
        },
    }),
    navigation: Object.freeze({
        command: (command: WorkspaceNavigationCommand) => {
            return ipcRenderer.invoke(workspaceNavigationChannel, command) as Promise<WorkspaceNavigationState>;
        },
    }),
    localPlugins: Object.freeze({
        list: () => {
            return ipcRenderer.invoke(localPluginsChannels.list) as Promise<readonly LocalPluginSummary[]>;
        },
        surface: (command: LocalWidgetCommand) => {
            return ipcRenderer.invoke(localPluginsChannels.surface, command) as Promise<{
                id: string;
            }>;
        },
        subscribe(listener: () => void) {
            const handler = () => {
                return void listener();
            };
            ipcRenderer.on(localPluginsChannels.changed, handler);
            return () => {
                ipcRenderer.off(localPluginsChannels.changed, handler);
            };
        },
    }),
    browserControls: Object.freeze({
        list: () => {
            return ipcRenderer.invoke(browserControlsChannel, { type: "list" }) as Promise<readonly BrowserBinding[]>;
        },
        bind: (binding: Extract<BrowserControlsCommand, {
            type: "bind";
        }>) => {
            return ipcRenderer.invoke(browserControlsChannel, binding) as Promise<void>;
        },
        unbind: (sourceId: string, inputId: string) => {
            return ipcRenderer.invoke(browserControlsChannel, {
                type: "unbind",
                sourceId,
                inputId,
            }) as Promise<void>;
        },
        invoke: (sourceId: string, inputId: string, action: BrowserControlAction) =>
        {
            return ipcRenderer.invoke(browserControlsChannel, {
                type: "invoke",
                sourceId,
                inputId,
                action,
            }) as Promise<JsonObject | null>;
        },
    }),
    web: Object.freeze({
        command: async (command: WebSurfaceCommand) => {
            return unwrapWebSurfaceCommand(await ipcRenderer.invoke(webSurfaceChannel, command) as WebSurfaceCommandResult);
        },
        subscribe(listener: () => void) {
            const handler = () => {
                return void listener();
            };
            ipcRenderer.on(webSurfaceEventChannel, handler);
            return () => {
                ipcRenderer.off(webSurfaceEventChannel, handler);
            };
        },
    }),
    agent: Object.freeze({
        getSettings: () => {
            return ipcRenderer.invoke(agentIpcChannels.settings) as Promise<AgentSettings>;
        },
        selectProvider: (id: string) => {
            return ipcRenderer.invoke(agentIpcChannels.provider, id) as Promise<void>;
        },
        selectModel: (id: string) => {
            return ipcRenderer.invoke(agentIpcChannels.model, id) as Promise<void>;
        },
        selectEffort: (id: string) => {
            return ipcRenderer.invoke(agentIpcChannels.effort, id) as Promise<void>;
        },
        cancel: () => {
            return ipcRenderer.invoke(agentIpcChannels.cancel) as Promise<void>;
        },
        connect: () => {
            return ipcRenderer.invoke(agentIpcChannels.connect) as Promise<void>;
        },
        configureWorkbench: (context: AgentWorkbenchContext) =>
        {
            return ipcRenderer.invoke(agentIpcChannels.configureWorkbench, context) as Promise<void>;
        },
        prompt: (text: string) =>
        {
            return ipcRenderer.invoke(agentIpcChannels.prompt, text) as Promise<void>;
        },
        subscribe(listener: (event: AgentEvent) => void) {
            const handleEvent = (_event: Electron.IpcRendererEvent, event: AgentEvent) => {
                listener(event);
            };
            ipcRenderer.on(agentIpcChannels.event, handleEvent);
            return () => {
                ipcRenderer.off(agentIpcChannels.event, handleEvent);
            };
        },
    }),
    runtime: Object.freeze({
        chrome: process.versions.chrome,
        electron: process.versions.electron,
        node: process.versions.node,
        platform: process.platform,
    }),
    workspaceStorage: Object.freeze({
        load: () => {
            return ipcRenderer.invoke(workspaceIpcChannels.load) as Promise<unknown>;
        },
        save: (snapshot: WorkspaceSnapshot, expected?: {
            snapshot: WorkspaceSnapshot | undefined;
        }) =>
        {
            return ipcRenderer.invoke(workspaceIpcChannels.save, snapshot, expected) as Promise<void>;
        },
        subscribe(listener: () => void) {
            const handler = () => {
                return void listener();
            };
            ipcRenderer.on(workspaceIpcChannels.changed, handler);
            return () => {
                ipcRenderer.off(workspaceIpcChannels.changed, handler);
            };
        },
    }),
});
