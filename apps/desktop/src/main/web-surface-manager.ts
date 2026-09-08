import { randomUUID } from "node:crypto";
import { WebContentsView, session } from "electron";
import type { BrowserWindow } from "electron";
import { sameDashboard } from "@avesd/workspace-model";
import type { JsonObject, WorkspaceSnapshot } from "@avesd/workspace-model";
import type { BrowserBindings } from "./browser-bindings";
import type { BrowserControlsCommand } from "../shared/browser-controls";

import { parseWebResult, parseWebUrl, WEB_PLUGIN_ID } from "../shared/web-surface";
import type { WebSurfaceCommand, WebSurfaceState } from "../shared/web-surface";

interface Surface {
  readonly widgetId: string;
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

  async command(command: WebSurfaceCommand, authorize?: () => Promise<void>): Promise<WebSurfaceState> {
    if (this.#closed) throw new Error("Web surfaces are closed.");
    if (command.type === "create") {
      const snapshot = await this.load();
      if (this.#closed || !snapshot?.widgets.some((widget) => widget.id === command.widgetId && sameDashboard(widget, snapshot.selection)
        && widget.pluginId === WEB_PLUGIN_ID && widget.widgetTypeId === "page")) {
        throw new Error("Web widget is unavailable.");
      }
      for (const [id, surface] of this.#surfaces) {
        if (surface.widgetId === command.widgetId) this.#destroy(id);
      }
      if (this.#surfaces.size >= 8) throw new Error("At most eight web widgets can be open.");
      const id = randomUUID();
      const browserSession = session.fromPartition(`avesd-web-${id}`);
      browserSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
      browserSession.setPermissionCheckHandler(() => false);
      browserSession.setDevicePermissionHandler(() => false);
      browserSession.on("will-download", (event) => event.preventDefault());
      const view = new WebContentsView({ webPreferences: {
        session: browserSession, sandbox: true, nodeIntegration: false, contextIsolation: true,
        webSecurity: true, allowRunningInsecureContent: false, navigateOnDragDrop: false,
      } });
      const surface: Surface = { widgetId: command.widgetId, view,
        state: { id, document: 0, url: "", status: "empty", result: null } };
      this.#surfaces.set(id, surface);
      this.window.contentView.addChildView(view);
      view.setVisible(false);
      const contents = view.webContents;
      contents.setWindowOpenHandler(() => ({ action: "deny" }));
      const guard = (event: Electron.Event, url: string) => {
        try { parseWebUrl(url); } catch { event.preventDefault(); }
      };
      contents.on("will-frame-navigate", (event) => guard(event, event.url));
      contents.on("will-redirect", (event, url) => guard(event, url));
      contents.on("did-start-navigation", (_event, _url, _inPlace, mainFrame) => {
        if (!mainFrame) return;
        surface.operation = undefined;
        surface.state = { ...surface.state, document: surface.state.document + 1,
          result: null, status: "loading" };
        this.changed();
      });
      const ready = () => {
        surface.state = { ...surface.state, url: contents.getURL(), status: "ready" };
        this.changed();
      };
      contents.on("did-finish-load", ready);
      contents.on("did-navigate-in-page", (_event, _url, mainFrame) => { if (mainFrame) ready(); });
      contents.on("did-fail-load", (_event, code, _description, _url, mainFrame) => {
        if (mainFrame && code !== -3) {
          surface.state = { ...surface.state, status: "error", result: null };
          this.changed();
        }
      });
      contents.on("render-process-gone", () => {
        surface.state = { ...surface.state, status: "error", result: null };
        surface.operation = undefined;
        this.changed();
      });
      return surface.state;
    }
    const surface = this.#surfaces.get(command.id);
    if (!surface) throw new Error("Web surface is unavailable.");
    if (command.type === "run" || command.type === "navigate") {
      const snapshot = await this.load();
      if (this.#surfaces.get(command.id) !== surface || !snapshot?.widgets.some((widget) =>
        widget.id === surface.widgetId && widget.pluginId === WEB_PLUGIN_ID && widget.widgetTypeId === "page")) {
        throw new Error("Web widget was removed.");
      }
    }
    const contents = surface.view.webContents;
    await authorize?.();
    switch (command.type) {
      case "destroy": this.#destroy(command.id); break;
      case "inspect": break;
      case "clear": surface.state = { ...surface.state, result: null }; this.changed(); break;
      case "bounds": {
        const { x, y, width, height, visible } = command.bounds;
        const area = this.window.getContentBounds();
        const fits = x >= 0 && y >= 0 && x + width <= area.width + 1 && y + height <= area.height + 1;
        surface.view.setVisible(visible && fits && width > 0 && height > 0);
        if (fits) surface.view.setBounds({ x: Math.round(x), y: Math.round(y),
          width: Math.round(width), height: Math.round(height) });
        break;
      }
      case "navigate": {
        surface.state = { ...surface.state, result: null, status: "loading" };
        this.changed();
        void contents.loadURL(parseWebUrl(command.url).href).catch(() => {
          if (this.#surfaces.get(command.id) !== surface) return;
          surface.state = { ...surface.state, status: "error", result: null };
          this.changed();
        });
        break;
      }
      case "run": {
        if (surface.operation) throw new Error("A script is still running. Reload the page to recover.");
        if (surface.state.status !== "ready" || surface.state.document !== command.document
          || parseWebUrl(contents.getURL()).origin !== command.origin) throw new Error("The page changed. Review it before running again.");
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
            if (surface.operation === operation) surface.operation = undefined;
          });
          let result: unknown;
          try {
            result = await Promise.race([completion, new Promise<never>((_resolve, reject) => {
              timer = setTimeout(() => reject(new Error("Script timed out; reload to stop page work.")), 5000);
            })]);
          } finally { clearTimeout(timer); }
          await authorize?.();
          if (this.#surfaces.get(command.id) !== surface || surface.state.document !== command.document) {
            throw new Error("Discarded a result from an old document.");
          }
          if (command.mode !== "css") surface.state = { ...surface.state, result: parseWebResult(result ?? null) };
          this.changed();
        } catch {
          throw new Error("Script failed, timed out, returned invalid JSON, or the page changed. Reload before retrying if needed.");
        }
        break;
      }
    }
    return surface.state;
  }

  async control(command: Extract<BrowserControlsCommand, { type: "invoke" }>, bindings: BrowserBindings): Promise<JsonObject | null> {
    const snapshot = await this.load();
    if (!snapshot) throw new Error("Workspace is unavailable.");
    const binding = bindings.authorize(command.sourceId, command.inputId, command.action.type, snapshot);
    const surface = [...this.#surfaces.values()].find((item) => item.widgetId === binding.targetId);
    if (!surface) throw new Error("Bound browser is not open.");
    const document = surface.state.document;
    const authorize = async () => {
      const current = await this.load();
      if (!current || !bindings.isCurrent(binding, current) || this.#surfaces.get(surface.state.id) !== surface
        || surface.state.document !== document) throw new Error("Binding, widget, or document changed.");
      if (surface.state.url && parseWebUrl(surface.view.webContents.getURL()).origin !== binding.origin) {
        throw new Error("The current website is outside this binding's origin.");
      }
    };
    if (command.action.type === "navigate") {
      if (parseWebUrl(command.action.url).origin !== binding.origin) throw new Error("Navigation is outside this binding's origin.");
      await this.command({ type: "navigate", id: surface.state.id, url: command.action.url }, authorize);
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
    const state = await this.command({ type: "run", id: surface.state.id, document,
      origin: binding.origin, mode: "isolated", code }, authorize);
    return command.action.type === "extract" ? state.result as JsonObject : null;
  }

  #destroy(id: string): void {
    const surface = this.#surfaces.get(id);
    if (!surface) return;
    this.#surfaces.delete(id);
    this.window.contentView.removeChildView(surface.view);
    const contents = surface.view.webContents;
    if (!contents.isDestroyed()) {
      const browserSession = contents.session;
      contents.close({ waitForBeforeUnload: false });
      void browserSession.clearStorageData().catch(() => undefined);
    }
    this.changed();
  }

  dispose(): void {
    this.#closed = true;
    for (const id of this.#surfaces.keys()) this.#destroy(id);
  }
}
