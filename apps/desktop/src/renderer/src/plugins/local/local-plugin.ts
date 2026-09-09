/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Local Plugin
 */

import type { LocalPluginsApi, LocalPluginSummary } from "../../../../shared/plugins/local-plugins";
import type { PluginDefinition } from "@avesd/plugin-api";
import { dashboardWidgetContribution } from "@avesd/plugin-ui";

/** This trusted adapter contributes metadata and placement; user code only runs in native sandboxed views. */
export function createLocalPlugin(plugin: LocalPluginSummary, api: LocalPluginsApi): PluginDefinition {
    const { manifest } = plugin;
    return {
        id: manifest.id,
        apiVersion: 1,
        version: manifest.version,
        activate(context) {
            context.effect(() => {
                return context.contributions.contribute(dashboardWidgetContribution, {
                    capabilities: manifest.capabilities,
                    widgetTypeId: manifest.widgetTypeId,
                    displayName: manifest.displayName,
                    description: "Local plugin · isolated browser",
                    configuration: {
                        default: {},
                        version: 1,
                    },
                    sizing: {
                        default: manifest.size,
                        policy: {
                            kind: "fixed",
                            sizes: [manifest.size],
                        },
                    },
                    mount(root, mountContext) {
                        const style = document.createElement("style");
                        style.textContent = ":host { display:block; height:100%; } .local-widget-placeholder { box-sizing:border-box; height:100%; display:grid; place-content:center; padding:16px; color:#687564; background:#eff3ea; font:13px system-ui; text-align:center; }";
                        const viewport = document.createElement("div");
                        viewport.className = "local-widget-placeholder";
                        viewport.textContent = "Starting local widget…";
                        root.append(style, viewport);
                        let id: string | undefined;
                        let disposed = false;
                        let frame = 0;
                        let previous = "";
                        const sync = () => {
                            frame = 0;
                            if (!id || disposed) {
                                return;
                            }
                            const rect = viewport.getBoundingClientRect();
                            const blocked = !!document.querySelector(".dashboard-shell.is-editing, .agent-panel");
                            const fits = rect.left >= 0 && rect.top >= 0 && rect.right <= window.innerWidth && rect.bottom <= window.innerHeight;
                            viewport.textContent = blocked ? `${manifest.displayName} · hidden while editing or using the agent`
                                : !fits ? "Scroll this widget fully into view." : "Local widget";
                            const bounds = {
                                x: rect.x,
                                y: rect.y,
                                width: rect.width,
                                height: rect.height,
                                visible: !blocked && fits,
                            };
                            const key = JSON.stringify(bounds);
                            if (key === previous) {
                                return;
                            }
                            previous = key;
                            void api.surface({
                                type: "bounds",
                                id,
                                bounds,
                            }).catch(() => {
                                viewport.textContent = "Local widget is unavailable.";
                            });
                        };
                        const schedule = () => {
                            if (!frame && !disposed) {
                                frame = requestAnimationFrame(sync);
                            }
                        };
                        const resize = new ResizeObserver(schedule); resize.observe(viewport);
                        const mutation = new MutationObserver(schedule);
                        mutation.observe(document.body, {
                            childList: true,
                            subtree: true,
                            attributes: true,
                            attributeFilter: ["class"],
                        });
                        window.addEventListener("resize", schedule);
                        window.addEventListener("scroll", schedule, true);
                        void api.surface({
                            type: "create",
                            widgetId: mountContext.instanceId,
                        }).then((surface) => {
                            if (disposed) {
                                void api.surface({
                                    type: "destroy",
                                    id: surface.id,
                                }).catch(() => {
                                    return undefined;
                                }); return;
                            }
                            id = surface.id; schedule();
                        })
                            .catch(() => {
                                if (!disposed) {
                                    viewport.textContent = "Local widget failed to start. Test the plugin before retrying.";
                                }
                            });
                        return {
                            update() { schedule(); },
                            dispose() {
                                disposed = true; cancelAnimationFrame(frame); resize.disconnect(); mutation.disconnect();
                                window.removeEventListener("resize", schedule); window.removeEventListener("scroll", schedule, true);
                                if (id) {
                                    void api.surface({
                                        type: "destroy",
                                        id,
                                    }).catch(() => {
                                        return undefined;
                                    });
                                }
                                root.replaceChildren();
                            },
                        };
                    },
                });
            });
        },
    };
}
