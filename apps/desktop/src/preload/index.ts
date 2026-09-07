import { contextBridge, ipcRenderer } from "electron";

import type { AgentEvent } from "@avesd/plugin-api";

import { agentIpcChannels } from "../shared/desktop-api";
import type { DesktopApi } from "../shared/desktop-api";

const desktopApi: DesktopApi = Object.freeze({
  agent: Object.freeze({
    cancel: () => ipcRenderer.invoke(agentIpcChannels.cancel) as Promise<void>,
    connect: () => ipcRenderer.invoke(agentIpcChannels.connect) as Promise<void>,
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
});

contextBridge.exposeInMainWorld("avesd", desktopApi);
