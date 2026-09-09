/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Authenticated local plugin browser service
 */

import type { PluginBrowserConfiguration } from "../../shared/browser/plugin-browser";
import { allowsBrowserOrigin, parsePluginBrowserRequest, pluginBrowserChannel } from "../../shared/browser/plugin-browser";
import type { WebSurfaceState } from "../../shared/browser/web-surface";
import type { LocalPluginStore } from "../plugins/local-plugin-store";
import type { WebSurfaceManager } from "./web-surface-manager";
import type { WorkspaceSnapshot } from "@avesd/workspace-model";
import { sameDashboard } from "@avesd/workspace-model";
import type { WebContents } from "electron";
import { ipcMain } from "electron";

interface Caller {
    readonly widgetId: string;
    readonly pluginId: string;
    readonly configuration: PluginBrowserConfiguration;
    surface?: Promise<WebSurfaceState>;
    generation: number;
}

export class PluginBrowserBridge {
    readonly #callers = new Map<WebContents, Caller>();

    constructor(private readonly manager: () => WebSurfaceManager | undefined, private readonly load: () => Promise<WorkspaceSnapshot | undefined>, private readonly store: () => LocalPluginStore | undefined) {

        ipcMain.handle(pluginBrowserChannel, async (event, input: unknown) => {

            const caller = this.#callers.get(event.sender);
            const manager = this.manager();
            if (!caller || !manager || event.senderFrame !== event.sender.mainFrame) {
                throw new Error("Plugin browser is unavailable.");
            }
            const request = parsePluginBrowserRequest(input);
            const generation = caller.generation;
            const authorize = async () => {

                const snapshot = await this.load();
                const installed = await this.store()?.installed(caller.pluginId);
                if (caller.generation !== generation || this.#callers.get(event.sender) !== caller || event.sender.isDestroyed() || this.manager() !== manager
                    || !snapshot?.widgets.some(widget => {

                        return widget.id === caller.widgetId && widget.pluginId === caller.pluginId && sameDashboard(widget, snapshot.selection);
                    })
                    || JSON.stringify(installed?.manifest.browser) !== JSON.stringify(caller.configuration)) {
                    throw new Error("Plugin browser authority changed.");
                }
            };
            await authorize();
            if (request.type === "navigate" && !allowsBrowserOrigin(caller.configuration, request.url)) {
                throw new Error("Destination is outside the declared browser origins.");
            }
            if (request.type === "close") {
                caller.generation += 1;
                const pending = caller.surface;
                caller.surface = undefined;
                if (pending) {
                    await manager.command({
                        type: "destroy",
                        id: (await pending).id,
                    });
                }

                return null;
            }
            if (!caller.surface) {
                if (request.type !== "navigate" && request.type !== "show") {
                    return null;
                }
                const pending = manager.command({
                    type: "create",
                    widgetId: caller.widgetId,
                }, authorize, {
                    id: caller.pluginId,
                    configuration: caller.configuration,
                });
                caller.surface = pending;
                void pending.catch(() => {

                    if (caller.surface === pending) {
                        caller.surface = undefined;
                    }
                });
            }
            const state = await caller.surface;
            await authorize();
            if (request.type === "show" || request.type === "hide" || request.type === "navigate") {
                await manager.command({
                    ...request,
                    id: state.id,
                }, authorize);

                return null;
            }
            const current = await manager.command({
                type: "inspect",
                id: state.id,
            });
            const allowed = !!current.url && allowsBrowserOrigin(caller.configuration, current.url);
            if (request.type === "status") {
                return {
                    status: current.url && !allowed ? "interaction-required" : current.status,
                    url: allowed ? current.url : null,
                };
            }
            if (!allowed) {
                throw new Error("Page is outside the declared browser origins. Complete login in the browser window.");
            }
            const code = request.type === "extract"
                ? `Object.fromEntries(Object.entries(${JSON.stringify(request.fields)}).map(([key, selector]) => {
                    const nodes = document.querySelectorAll(selector); if (nodes.length > 1) throw new Error('Ambiguous selector');
                    return [key, nodes[0]?.textContent?.slice(0, 4096) ?? null]; }))`
                : `(() => { const nodes = document.querySelectorAll(${JSON.stringify(request.selector)});
                    if (nodes.length !== 1 || !(nodes[0] instanceof HTMLElement)) throw new Error('Invalid selector');
                    nodes[0].click(); return null; })()`;
            const result = await manager.command({
                type: "run",
                id: current.id,
                document: current.document,
                origin: new URL(current.url).origin,
                mode: "isolated",
                code,
            }, authorize);

            return request.type === "extract" ? result.result : null;
        });
    }

    register(contents: WebContents, widgetId: string, pluginId: string, configuration: PluginBrowserConfiguration): () => void {

        const caller: Caller = {
            widgetId,
            pluginId,
            configuration,
            generation: 0,
        };
        const manager = this.manager();
        this.#callers.set(contents, caller);
        const dispose = () => {

            if (this.#callers.get(contents) !== caller) {
                return;
            }
            this.#callers.delete(contents);
            void caller.surface?.then(state => {

                return manager?.command({
                    type: "destroy",
                    id: state.id,
                });
            }).catch(() => {

                return undefined;
            });
        };
        contents.once("destroyed", dispose);

        return () => {

            dispose(); contents.off("destroyed", dispose);
        };
    }
}
