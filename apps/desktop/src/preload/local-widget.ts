/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Local Widget
 */

import type { WidgetWorkspaceIdentity, WidgetWorkspaceRequest, WidgetWorkspaceResult } from "../shared/workspace/widget-workspace";
import { createWidgetWorkspaceServices, widgetWorkspaceChannels } from "../shared/workspace/widget-workspace";
import { contextBridge, ipcRenderer } from "electron";

const services = createWidgetWorkspaceServices([
    "catalog",
    "navigation",
    "management",
    "files",
    "sqlite",
    "resources",
], {
    invoke: (request: WidgetWorkspaceRequest) => {
        return ipcRenderer.invoke(widgetWorkspaceChannels.invoke, request) as Promise<WidgetWorkspaceResult>;
    },
    subscribe(listener) {
        const handler = () => {
            return void listener();
        };
        ipcRenderer.on(widgetWorkspaceChannels.changed, handler);
        return () => {
            ipcRenderer.off(widgetWorkspaceChannels.changed, handler);
        };
    },
});

contextBridge.exposeInMainWorld("avesdWidget", Object.freeze({
    ...services,
    initialize: () => {
        return ipcRenderer.invoke(widgetWorkspaceChannels.invoke, { type: "context" }) as Promise<WidgetWorkspaceIdentity>;
    },
}));
