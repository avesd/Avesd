/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Web Surface Manager
 */

import type { BrowserControlsCommand } from "../../shared/browser/browser-controls";
import type { PluginBrowserConfiguration } from "../../shared/browser/plugin-browser";
import { parseBrowserSession } from "../../shared/browser/plugin-browser";
import type { WebSurfaceCommand, WebSurfaceState } from "../../shared/browser/web-surface";
import { parseWebResult, parseWebUrl, WEB_PLUGIN_ID } from "../../shared/browser/web-surface";
import { WEB_VIEW_RADIUS } from "../../shared/widget-appearance";
import type { BrowserBindings } from "./browser-bindings";
import { BrowserPresentation } from "./browser-presentation";
import { openBrowserSession } from "./browser-sessions";
import type { JsonObject, WorkspaceSnapshot } from "@avesd/workspace-model";
import { sameDashboard } from "@avesd/workspace-model";
import type { BrowserWindow } from "electron";
import { WebContentsView } from "electron";
import { randomUUID } from "node:crypto";

interface Surface {
    readonly widgetId: string;
    readonly pluginId: string;
    readonly presentation: BrowserPresentation;
    readonly view: WebContentsView;
    state: WebSurfaceState;
    operation?: symbol;
}

/** Owns trusted built-in widget surfaces. Remote pages receive no preload API. */
export class WebSurfaceManager {
    readonly #surfaces = new Map<string, Surface>();
    #closed = false;

    constructor(
        private readonly window: BrowserWindow,
        private readonly load: () => Promise<WorkspaceSnapshot | undefined>,
        private readonly changed: () => void,
    ) {}

    async command(command: WebSurfaceCommand, authorize?: () => Promise<void>, plugin?: {
        readonly id: string;
        readonly configuration: PluginBrowserConfiguration;
    }): Promise<WebSurfaceState> {

        if (this.#closed) {
            throw new Error("Web surfaces are closed.");
        }
        if (command.type === "create") {
            const snapshot = await this.load();
            // The surface manager can close while the workspace snapshot is loading.
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            if (this.#closed || !snapshot?.widgets.some((widget) => {

                return widget.id === command.widgetId && sameDashboard(widget, snapshot.selection)
        && widget.pluginId === (plugin?.id ?? WEB_PLUGIN_ID) && (plugin !== undefined || widget.widgetTypeId === "page");
            })) {
                throw new Error("Web widget is unavailable.");
            }
            const id = randomUUID();
            const widget = snapshot.widgets.find(item => {

                return item.id === command.widgetId;
            })!;
            const configuration = plugin?.configuration.session ?? (widget.configuration.browserSession
                ? parseBrowserSession(widget.configuration.browserSession) : {
                    name: "default",
                    shared: false,
                });
            const browserSession = await openBrowserSession(this.window, widget.workspaceId, plugin?.id ?? widget.id, configuration);
            const current = await this.load();
            if (!current?.widgets.some(item => {

                return item.id === widget.id && item.pluginId === widget.pluginId && sameDashboard(item, current.selection);
            })) {
                throw new Error("Web widget was removed while opening its session.");
            }
            await authorize?.();
            // The manager may close while consent is pending.
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            if (this.#closed) {
                throw new Error("Web surfaces are closed.");
            }
            for (const [
                id,
                surface,
            ] of this.#surfaces) {
                if (surface.widgetId === command.widgetId) {
                    this.#destroy(id);
                }
            }
            if (this.#surfaces.size >= 8) {
                throw new Error("At most eight web widgets can be open.");
            }
            const view = new WebContentsView({
                webPreferences: {
                    session: browserSession,
                    sandbox: true,
                    nodeIntegration: false,
                    contextIsolation: true,
                    webSecurity: true,
                    allowRunningInsecureContent: false,
                    navigateOnDragDrop: false,
                    backgroundThrottling: false,
                },
            });
            view.setBorderRadius(WEB_VIEW_RADIUS);
            const surface: Surface = {
                widgetId: command.widgetId,
                pluginId: widget.pluginId,
                presentation: new BrowserPresentation(this.window, view, this.changed),
                view,
                state: {
                    id,
                    document: 0,
                    url: "",
                    status: "empty",
                    result: null,
                    sessionName: configuration.name,
                    sharedSession: configuration.shared,
                },
            };
            this.#surfaces.set(id, surface);
            this.window.contentView.addChildView(view);
            view.setVisible(false);
            const contents = view.webContents;
            contents.on("did-start-navigation", (_event, _url, _inPlace, mainFrame) => {

                if (!mainFrame) {
                    return;
                }
                surface.operation = undefined;
                surface.state = {
                    ...surface.state,
                    document: surface.state.document + 1,
                    result: null,
                    status: "loading",
                };
                this.changed();
            });
            const ready = () => {

                surface.state = {
                    ...surface.state,
                    url: contents.getURL(),
                    status: "ready",
                };
                this.changed();
            };
            contents.on("did-finish-load", ready);
            contents.on("did-navigate-in-page", (_event, _url, mainFrame) => {

                if (mainFrame) {
                    ready();
                }
            });
            contents.on("did-fail-load", (_event, code, _description, _url, mainFrame) => {

                if (mainFrame && code !== -3) {
                    surface.state = {
                        ...surface.state,
                        status: "error",
                        result: null,
                    };
                    this.changed();
                }
            });
            contents.on("render-process-gone", () => {

                surface.state = {
                    ...surface.state,
                    status: "error",
                    result: null,
                };
                surface.operation = undefined;
                this.changed();
            });

            return surface.state;
        }
        const surface = this.#surfaces.get(command.id);
        if (!surface) {
            throw new Error("Web surface is unavailable.");
        }
        if (command.type === "run" || command.type === "navigate") {
            const snapshot = await this.load();
            if (this.#surfaces.get(command.id) !== surface || !snapshot?.widgets.some((widget) =>
            {

                return widget.id === surface.widgetId && widget.pluginId === surface.pluginId;
            })) {
                throw new Error("Web widget was removed.");
            }
        }
        const contents = surface.view.webContents;
        await authorize?.();
        switch (command.type) {
            case "destroy": this.#destroy(command.id); break;
            case "inspect": break;
            case "show": surface.presentation.show(); break;
            case "hide": surface.presentation.hide(); surface.view.setVisible(false); break;
            case "clear": surface.state = {
                ...surface.state,
                result: null,
            }; this.changed(); break;
            case "bounds": {
                if (surface.presentation.presented) {
                    break;
                }
                const { x, y, width, height, visible } = command.bounds;
                const area = this.window.getContentBounds();
                const fits = x >= 0 && y >= 0 && x + width <= area.width + 1 && y + height <= area.height + 1;
                surface.view.setVisible(visible && fits && width > 0 && height > 0);
                if (fits) {
                    surface.view.setBounds({
                        x: Math.round(x),
                        y: Math.round(y),
                        width: Math.round(width),
                        height: Math.round(height),
                    });
                }
                break;
            }
            case "navigate": {
                surface.state = {
                    ...surface.state,
                    result: null,
                    status: "loading",
                };
                this.changed();
                void contents.loadURL(parseWebUrl(command.url).href).catch(() => {

                    if (this.#surfaces.get(command.id) !== surface) {
                        return;
                    }
                    surface.state = {
                        ...surface.state,
                        status: "error",
                        result: null,
                    };
                    this.changed();
                });
                break;
            }
            case "run": {
                if (surface.operation) {
                    throw new Error("A script is still running. Reload the page to recover.");
                }
                if (surface.state.status !== "ready" || surface.state.document !== command.document
          || parseWebUrl(contents.getURL()).origin !== command.origin) {
                    throw new Error("The page changed. Review it before running again.");
                }
                const operation = Symbol();
                surface.operation = operation;
                try {
                    const work = command.mode === "css"
                        ? contents.insertCSS(command.code)
                        : command.mode === "page" ? contents.executeJavaScript(command.code)
                            : contents.executeJavaScriptInIsolatedWorld(1001, [{ code: command.code }]);
                    // Timeout bounds the caller's wait; it does not promise to stop page side effects.
                    let timer: ReturnType<typeof setTimeout> | undefined;
                    const completion = work.finally(() => {

                        if (surface.operation === operation) {
                            surface.operation = undefined;
                        }
                    });
                    let result: unknown;
                    try {
                        result = await Promise.race([
                            completion,
                            new Promise<never>((_resolve, reject) => {

                                timer = setTimeout(() => {

                                    return void reject(new Error("Script timed out; reload to stop page work."));
                                }, 5000);
                            }),
                        ]);
                    } finally { clearTimeout(timer); }
                    await authorize?.();
                    if (this.#surfaces.get(command.id) !== surface || surface.state.document !== command.document) {
                        throw new Error("Discarded a result from an old document.");
                    }
                    if (command.mode !== "css") {
                        surface.state = {
                            ...surface.state,
                            result: parseWebResult(result ?? null),
                        };
                    }
                    this.changed();
                } catch {
                    throw new Error("Script failed, timed out, returned invalid JSON, or the page changed. Reload before retrying if needed.");
                }
                break;
            }
        }

        return surface.state;
    }

    async control(command: Extract<BrowserControlsCommand, {
        type: "invoke";
    }>, bindings: BrowserBindings): Promise<JsonObject | null> {

        const snapshot = await this.load();
        if (!snapshot) {
            throw new Error("Workspace is unavailable.");
        }
        const binding = bindings.authorize(command.sourceId, command.inputId, command.action.type, snapshot);
        const surface = [...this.#surfaces.values()].find((item) => {

            return item.widgetId === binding.targetId;
        });
        if (!surface) {
            throw new Error("Bound browser is not open.");
        }
        const document = surface.state.document;
        const authorize = async () => {

            const current = await this.load();
            if (!current || !bindings.isCurrent(binding, current) || this.#surfaces.get(surface.state.id) !== surface
        || surface.state.document !== document) {
                throw new Error("Binding, widget, or document changed.");
            }
            if (surface.state.url && parseWebUrl(surface.view.webContents.getURL()).origin !== binding.origin) {
                throw new Error("The current website is outside this binding's origin.");
            }
        };
        if (command.action.type === "navigate") {
            if (parseWebUrl(command.action.url).origin !== binding.origin) {
                throw new Error("Navigation is outside this binding's origin.");
            }
            await this.command({
                type: "navigate",
                id: surface.state.id,
                url: command.action.url,
            }, authorize);

            return null;
        }
        const code = command.action.type === "extract"
            ? `Object.fromEntries(Object.entries(${JSON.stringify(command.action.fields)}).map(([name, selector]) => {
          const matches = document.querySelectorAll(selector);
          if (matches.length > 1) throw new Error('Selector is ambiguous');
          return [name, matches[0]?.textContent?.slice(0, 4096) ?? null];
        }))`
            : `(() => { const matches = document.querySelectorAll(${JSON.stringify(command.action.selector)});
          if (matches.length !== 1 || !(matches[0] instanceof HTMLElement)) throw new Error('Choose exactly one HTML element');
          matches[0].click(); return null; })()`;
        const state = await this.command({
            type: "run",
            id: surface.state.id,
            document,
            origin: binding.origin,
            mode: "isolated",
            code,
        }, authorize);

        return command.action.type === "extract" ? state.result as JsonObject : null;
    }

    #destroy(id: string): void {

        const surface = this.#surfaces.get(id);
        if (!surface) {
            return;
        }
        this.#surfaces.delete(id);
        surface.presentation.dispose();
        this.window.contentView.removeChildView(surface.view);
        const contents = surface.view.webContents;
        if (!contents.isDestroyed()) {
            contents.close({ waitForBeforeUnload: false });
        }
        this.changed();
    }

    dispose(): void {

        this.#closed = true;
        for (const id of this.#surfaces.keys()) {this.#destroy(id);}
    }
}
