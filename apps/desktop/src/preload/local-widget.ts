import { contextBridge, ipcRenderer } from "electron";
import { createWidgetWorkspaceServices, widgetWorkspaceChannels } from "../shared/widget-workspace";
import type { WidgetWorkspaceIdentity, WidgetWorkspaceRequest, WidgetWorkspaceResult } from "../shared/widget-workspace";

const services = createWidgetWorkspaceServices(["catalog", "navigation", "management"], {
  invoke: (request: WidgetWorkspaceRequest) => ipcRenderer.invoke(widgetWorkspaceChannels.invoke, request) as Promise<WidgetWorkspaceResult>,
  subscribe(listener) {
    const handler = () => listener();
    ipcRenderer.on(widgetWorkspaceChannels.changed, handler);
    return () => { ipcRenderer.off(widgetWorkspaceChannels.changed, handler); };
  },
});

contextBridge.exposeInMainWorld("avesdWidget", Object.freeze({
  ...services,
  initialize: () => ipcRenderer.invoke(widgetWorkspaceChannels.invoke, { type: "context" }) as Promise<WidgetWorkspaceIdentity>,
}));
