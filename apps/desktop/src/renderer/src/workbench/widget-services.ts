/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Widget Services
 */

import type { BrowserControlsApi } from "../../../shared/browser/browser-controls";
import { WEB_PLUGIN_ID } from "../../../shared/browser/web-surface";
import type { DesktopWidgetWorkspaceApi } from "../../../shared/workspace/widget-workspace";
import { createWidgetWorkspaceServices } from "../../../shared/workspace/widget-workspace";
import type { WidgetWorkspaceCapability } from "@avesd/plugin-ui";
import type { WidgetConfigurationService, WidgetMountContext } from "@avesd/plugin-ui";
import type { DataSourceService, WidgetInstance } from "@avesd/workspace-model";

type WidgetServiceScope = Pick<WidgetInstance, "id" | "pluginId" | "widgetTypeId" | "workspaceId" | "dashboardId" | "bindings">;
export type WidgetServiceFactory = (
    instance: WidgetServiceScope,
    updateConfiguration: WidgetConfigurationService["update"],
    lifetime?: {
        readonly signal: AbortSignal;
        readonly capabilities?: readonly WidgetWorkspaceCapability[];
    },
) => Pick<WidgetMountContext, "browser" | "configuration" | "data" | "catalog" | "navigation" | "management" | "files" | "sqlite" | "resources">;

/** Trusted host policy and scoped adapters, independent of React and DOM mounting. */
export function createWidgetServices(dataSources: DataSourceService, browserControls?: BrowserControlsApi, workspace?: DesktopWidgetWorkspaceApi): WidgetServiceFactory {
    return (instance, updateConfiguration, lifetime) => {
        const { id: instanceId, workspaceId, dashboardId, bindings } = instance;
        const scope = {
            workspaceId,
            dashboardId,
        };
        return {
            ...(workspace && lifetime ? createWidgetWorkspaceServices(lifetime.capabilities ?? [], {
                invoke(request) {
                    if (lifetime.signal.aborted) {
                        return Promise.reject(new Error("Widget was disposed."));
                    }
                    return workspace.invoke(instanceId, request);
                },
                subscribe(listener) {
                    if (lifetime.signal.aborted) {
                        return () => {
                        };
                    }
                    const unsubscribe = workspace.subscribe(() => {
                        if (!lifetime.signal.aborted) {
                            listener();
                        }
                    });
                    const dispose = () => {
                        unsubscribe(); lifetime.signal.removeEventListener("abort", dispose);
                    };
                    lifetime.signal.addEventListener("abort", dispose, { once: true });
                    return dispose;
                },
            }) : {}),
            browser: browserControls && instance.pluginId === WEB_PLUGIN_ID && instance.widgetTypeId === "controls" ? {
                extract: async (inputId, fields) => {
                    return await browserControls.invoke(instanceId, inputId, {
                        type: "extract",
                        fields,
                    }) ?? {};
                },
                navigate: async (inputId, url) => {
                    await browserControls.invoke(instanceId, inputId, {
                        type: "navigate",
                        url,
                    });
                },
                click: async (inputId, selector) => {
                    await browserControls.invoke(instanceId, inputId, {
                        type: "click",
                        selector,
                    });
                },
            } : undefined,
            configuration: { update: updateConfiguration },
            data: {
                read: (inputId) => {
                    return Promise.all((bindings[inputId] ?? []).map(async (id) => {
                        return (await dataSources.read(scope, id)).value;
                    }));
                },
                subscribe: (_inputId, listener) => {
                    return dataSources.subscribe(listener);
                },
                async update(inputId, value) {
                    const ids = bindings[inputId] ?? [];
                    if (ids.length !== 1 || !ids[0]) {
                        throw new Error(`widget input must have exactly one data source: ${inputId}`);
                    }
                    const source = await dataSources.read(scope, ids[0]);
                    await dataSources.update(scope, source.id, source.revision, value);
                },
            },
        };
    };
}
