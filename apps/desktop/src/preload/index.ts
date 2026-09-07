import { contextBridge, ipcRenderer } from "electron";

import type { AgentEvent } from "@avesd/plugin-api";
import type { WorkspaceSnapshot } from "@avesd/workspace-model";

import { agentIpcChannels, workspaceIpcChannels } from "../shared/desktop-api";
import type { AgentWorkbenchContext, DesktopApi } from "../shared/desktop-api";
import { webSurfaceChannel, webSurfaceEventChannel } from "../shared/web-surface";
import type { WebSurfaceCommand, WebSurfaceState } from "../shared/web-surface";

const desktopApi: DesktopApi = Object.freeze({
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
    save: (snapshot: WorkspaceSnapshot) =>
      ipcRenderer.invoke(workspaceIpcChannels.save, snapshot) as Promise<void>,
  }),
});

contextBridge.exposeInMainWorld("avesd", desktopApi);
