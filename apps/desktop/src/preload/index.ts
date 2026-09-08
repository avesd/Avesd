import type { WidgetWorkspaceRequest, WidgetWorkspaceResult } from "../shared/widget-workspace";
import type { WidgetInstanceId } from "@avesd/workspace-model";
import { contextBridge, ipcRenderer } from "electron";

import type { AgentEvent } from "@avesd/plugin-api";
import type { JsonObject, WorkspaceSnapshot } from "@avesd/workspace-model";
import type { WorkspaceNavigationCommand, WorkspaceNavigationState } from "@avesd/workspace-model";
import { workspaceNavigationChannel } from "../shared/workspace-navigation";
import { browserControlsChannel } from "../shared/browser-controls";
import type { BrowserBinding, BrowserControlAction, BrowserControlsCommand } from "../shared/browser-controls";

import { agentIpcChannels, workspaceIpcChannels } from "../shared/desktop-api";
import type { AgentWorkbenchContext, DesktopApi } from "../shared/desktop-api";
import { webSurfaceChannel, webSurfaceEventChannel } from "../shared/web-surface";
import type { WebSurfaceCommand, WebSurfaceState } from "../shared/web-surface";
import { localPluginsChannels } from "../shared/local-plugins";
import type { LocalPluginSummary, LocalWidgetCommand } from "../shared/local-plugins";

const desktopApi: DesktopApi = Object.freeze({
  widgetWorkspace: Object.freeze({
    invoke: (instanceId: WidgetInstanceId, request: WidgetWorkspaceRequest) => ipcRenderer.invoke("widget-workspace:renderer", instanceId, request) as Promise<WidgetWorkspaceResult>,
    subscribe(listener: () => void) {
      const handler = () => listener();
      ipcRenderer.on(workspaceIpcChannels.changed, handler);
      return () => { ipcRenderer.off(workspaceIpcChannels.changed, handler); };
    },
  }),
  navigation: Object.freeze({
    command: (command: WorkspaceNavigationCommand) => ipcRenderer.invoke(workspaceNavigationChannel, command) as Promise<WorkspaceNavigationState>,
  }),
  localPlugins: Object.freeze({
    list: () => ipcRenderer.invoke(localPluginsChannels.list) as Promise<readonly LocalPluginSummary[]>,
    surface: (command: LocalWidgetCommand) => ipcRenderer.invoke(localPluginsChannels.surface, command) as Promise<{ id: string }>,
    subscribe(listener: () => void) {
      const handler = () => listener();
      ipcRenderer.on(localPluginsChannels.changed, handler);
      return () => { ipcRenderer.off(localPluginsChannels.changed, handler); };
    },
  }),
  browserControls: Object.freeze({
    list: () => ipcRenderer.invoke(browserControlsChannel, { type: "list" }) as Promise<readonly BrowserBinding[]>,
    bind: (binding: Extract<BrowserControlsCommand, { type: "bind" }>) => ipcRenderer.invoke(browserControlsChannel, binding) as Promise<void>,
    unbind: (sourceId: string, inputId: string) => ipcRenderer.invoke(browserControlsChannel, { type: "unbind", sourceId, inputId }) as Promise<void>,
    invoke: (sourceId: string, inputId: string, action: BrowserControlAction) =>
      ipcRenderer.invoke(browserControlsChannel, { type: "invoke", sourceId, inputId, action }) as Promise<JsonObject | null>,
  }),
  web: Object.freeze({
    command: (command: WebSurfaceCommand) =>
      ipcRenderer.invoke(webSurfaceChannel, command) as Promise<WebSurfaceState>,
    subscribe(listener: () => void) {
      const handler = () => listener();
      ipcRenderer.on(webSurfaceEventChannel, handler);
      return () => { ipcRenderer.off(webSurfaceEventChannel, handler); };
    },
  }),
  agent: Object.freeze({
    cancel: () => ipcRenderer.invoke(agentIpcChannels.cancel) as Promise<void>,
    connect: () => ipcRenderer.invoke(agentIpcChannels.connect) as Promise<void>,
    configureWorkbench: (context: AgentWorkbenchContext) =>
      ipcRenderer.invoke(agentIpcChannels.configureWorkbench, context) as Promise<void>,
    prompt: (text: string) =>
      ipcRenderer.invoke(agentIpcChannels.prompt, text) as Promise<void>,
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
    load: () => ipcRenderer.invoke(workspaceIpcChannels.load) as Promise<unknown>,
    save: (snapshot: WorkspaceSnapshot, expected?: { snapshot: WorkspaceSnapshot | undefined }) =>
      ipcRenderer.invoke(workspaceIpcChannels.save, snapshot, expected) as Promise<void>,
    subscribe(listener: () => void) {
      const handler = () => listener();
      ipcRenderer.on(workspaceIpcChannels.changed, handler);
      return () => { ipcRenderer.off(workspaceIpcChannels.changed, handler); };
    },
  }),
});

contextBridge.exposeInMainWorld("avesd", desktopApi);
