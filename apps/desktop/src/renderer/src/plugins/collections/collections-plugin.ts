/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Persistent collection result widget
 */

import type { BrowserTasksApi } from "../../../../shared/browser/browser-tasks";
import type { PluginDefinition } from "@avesd/plugin-api";
import { dashboardWidgetContribution } from "@avesd/plugin-ui";

export function createCollectionsPlugin(api: BrowserTasksApi): PluginDefinition {

    return {
        id: "avesd.builtin.collections",
        apiVersion: 1,
        version: "0.1.0",
        activate(context) {

            context.effect(() => {

                return context.contributions.contribute(dashboardWidgetContribution, {
                    widgetTypeId: "result",
                    displayName: "Collection result",
                    description: "Displays a saved background collection. Configure taskId or choose a collection in the widget. Removing this widget does not stop collection.",
                    configuration: {
                        default: {},
                        version: 1,
                    },
                    sizing: {
                        default: {
                            width: 8,
                            height: 8,
                        },
                    },
                    mount(root, mountContext) {

                        const style = document.createElement("style");
                        style.textContent = ":host{display:block;height:100%;font:13px system-ui;color:#35472f}section{box-sizing:border-box;height:100%;padding:16px;background:#edf3e8;overflow:auto}h2{margin:0 0 12px;font-size:16px}select{max-width:100%;padding:6px}pre{white-space:pre-wrap;overflow-wrap:anywhere}p{font-size:12px;color:#64715d}";
                        const section = document.createElement("section");
                        const title = document.createElement("h2"); title.textContent = "Collection result";
                        const select = document.createElement("select"); select.setAttribute("aria-label", "Collection");
                        const status = document.createElement("p"); const output = document.createElement("pre");
                        section.append(title, select, status, output); root.append(style, section);
                        let taskId = ""; let disposed = false; let version = 0;
                        const refresh = async () => {

                            const current = ++version;
                            try {
                                const tasks = await api.command({ type: "list" });
                                if (disposed || current !== version) {
                                    return;
                                }
                                select.replaceChildren(new Option("Choose a collection", ""), ...tasks.map(task => {

                                    return new Option(task.name, task.id);
                                }));
                                const task = tasks.find(item => {

                                    return item.id === taskId && item.workspaceId === mountContext.workspaceId;
                                });
                                select.value = task?.id ?? "";
                                title.textContent = task?.name ?? "Collection result";
                                status.textContent = task ? `${task.paused ? "Paused · " : ""}${task.error ? "Refresh failed · " : ""}${task.lastSuccess ? "Updated " + new Date(task.lastSuccess).toLocaleString() : "Waiting for first refresh"}` : "Choose a collection in this workspace.";
                                output.textContent = task?.result ? Object.entries(task.result).map(([
                                    key,
                                    value,
                                ]) => {

                                    return `${key}: ${value}`;
                                })
                                    .join("\n") : "";
                            } catch {
                                if (!disposed) {
                                    status.textContent = "Collections are unavailable.";
                                }
                            }
                        };
                        select.onchange = () => {

                            void mountContext.configuration.update({ taskId: select.value }).catch(() => {

                                status.textContent = "Selection could not be saved.";
                            });
                        };
                        const unsubscribe = api.subscribe(() => {

                            void refresh();
                        });

                        return {
                            update(state) {

                                taskId = typeof state.configuration.taskId === "string" ? state.configuration.taskId : ""; void refresh();
                            },
                            dispose() {

                                disposed = true; unsubscribe(); root.replaceChildren();
                            },
                        };
                    },
                });
            });
        },
    };
}
