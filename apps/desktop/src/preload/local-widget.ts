/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Local Widget
 */

import { createAgentTaskService, widgetAgentChannel } from "../shared/agent/widget-agent";
import type { PluginBrowserService } from "../shared/browser/plugin-browser";
import { pluginBrowserChannel } from "../shared/browser/plugin-browser";
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
    agent: createAgentTaskService(request => {

        return ipcRenderer.invoke(widgetAgentChannel, request);
    }),
    browser: {
        navigate: (url: string) => {

            return ipcRenderer.invoke(pluginBrowserChannel, {
                type: "navigate",
                url,
            });
        },
        extract: (fields: Readonly<Record<string, string>>) => {

            return ipcRenderer.invoke(pluginBrowserChannel, {
                type: "extract",
                fields,
            });
        },
        click: (selector: string) => {

            return ipcRenderer.invoke(pluginBrowserChannel, {
                type: "click",
                selector,
            });
        },
        show: () => {

            return ipcRenderer.invoke(pluginBrowserChannel, { type: "show" });
        },
        hide: () => {

            return ipcRenderer.invoke(pluginBrowserChannel, { type: "hide" });
        },
        close: () => {

            return ipcRenderer.invoke(pluginBrowserChannel, { type: "close" });
        },
        status: () => {

            return ipcRenderer.invoke(pluginBrowserChannel, { type: "status" });
        },
    } satisfies PluginBrowserService,
    initialize: () => {

        return ipcRenderer.invoke(widgetWorkspaceChannels.invoke, { type: "context" }) as Promise<WidgetWorkspaceIdentity>;
    },
}));
