/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Local Widget Surfaces
 */

import type { LocalWidgetCommand } from "../../shared/plugins/local-plugins";
import { WIDGET_CONTENT_RADIUS } from "../../shared/widget-appearance";
import type { AgentTaskBridge } from "../agent/agent-task-bridge";
import type { PluginBrowserBridge } from "../browser/plugin-browser-bridge";
import type { AgentWorkbench } from "../workspace/agent-workbench";
import type { WidgetWorkspaceBridge } from "../workspace/widget-workspace-bridge";
import type { LocalPluginStore } from "./local-plugin-store";
import { bounded, loadLocalWidget, localWidgetPreferences } from "./local-widget-sandbox";
import type { WorkspaceSnapshot } from "@avesd/workspace-model";
import { sameDashboard } from "@avesd/workspace-model";
import type { BrowserWindow } from "electron";
import { WebContentsView } from "electron";
import { randomUUID } from "node:crypto";

export class LocalWidgetSurfaces {
    readonly #views = new Map<string, {
        widgetId: string;
        view: WebContentsView;
        disposeServices: () => void;
        sizeKey?: string;
    }>();
    #closed = false;
    constructor(
        private readonly window: BrowserWindow, private readonly store: LocalPluginStore,
        private readonly load: () => Promise<WorkspaceSnapshot | undefined>,
        private readonly bridge: WidgetWorkspaceBridge, private readonly workbench: AgentWorkbench,
        private readonly browsers: PluginBrowserBridge,
        private readonly agents: AgentTaskBridge,
    ) {}

    async command(command: LocalWidgetCommand): Promise<{
        id: string;
    }> {

        if (this.#closed) {
            throw new Error("Local widget surfaces are closed.");
        }
        if (command.type === "create") {
            const snapshot = await this.load();
            const widget = snapshot?.widgets.find((widget) => {

                return widget.id === command.widgetId && sameDashboard(widget, snapshot.selection);
            });
            if (!widget) {
                throw new Error("Widget is unavailable.");
            }
            const draft = await this.store.installed(widget.pluginId);
            // The surface manager can close while the plugin draft is loading.
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            if (draft.manifest.widgetTypeId !== widget.widgetTypeId || this.#closed) {
                throw new Error("Widget type is unavailable.");
            }
            for (const [
                id,
                item,
            ] of this.#views) {
                if (item.widgetId === widget.id) {
                    this.#destroy(id);
                }
            }
            if (this.#views.size >= 8) {
                throw new Error("At most eight local widgets can be open.");
            }
            const id = randomUUID();
            const view = new WebContentsView({ webPreferences: localWidgetPreferences() });
            view.setBorderRadius(WIDGET_CONTENT_RADIUS);
            const disposeServices = this.bridge.register(view.webContents, {
                identity: {
                    instanceId: widget.id,
                    workspaceId: widget.workspaceId,
                    dashboardId: widget.dashboardId,
                    capabilities: draft.manifest.capabilities ?? [],
                },
                invoke: (request, isActive) => {

                    return this.workbench.invokeWidget(widget.id, request, isActive);
                },
            });
            const disposeBrowser = draft.manifest.browser
                ? this.browsers.register(view.webContents, widget.id, widget.pluginId, draft.manifest.browser) : () => {
                };
            const disposeAgent = draft.manifest.capabilities?.includes("agent") ? this.agents.register(view.webContents, widget.id) : () => {
            };
            this.#views.set(id, {
                widgetId: widget.id,
                view,
                disposeServices: () => {

                    disposeAgent(); disposeBrowser(); disposeServices();
                },
            });
            this.window.contentView.addChildView(view);
            view.setVisible(false);
            try {
                await bounded(loadLocalWidget(view.webContents, draft), 5000, () => {

                    return void this.#destroy(id);
                });
            }
            catch (error) { this.#destroy(id); throw new Error("Local widget failed to start.", { cause: error }); }
            if (!this.#views.has(id)) {
                throw new Error("Local widget was closed.");
            }

            return { id };
        }
        if (command.type === "destroy") {
            this.#destroy(command.id);

            return { id: command.id };
        }
        const item = this.#views.get(command.id);
        if (!item) {
            throw new Error("Local widget surface is unavailable.");
        }
        const { x, y, width, height, visible } = command.bounds;
        const area = this.window.getContentBounds();
        const fits = x >= 0 && y >= 0 && x + width <= area.width + 1 && y + height <= area.height + 1;
        item.view.setVisible(visible && fits && width > 0 && height > 0);
        if (fits) {
            item.view.setBounds({
                x: Math.round(x),
                y: Math.round(y),
                width: Math.round(width),
                height: Math.round(height),
            });
        }

        const sizeKey = JSON.stringify(command.size);
        if (item.sizeKey !== sizeKey) {
            item.sizeKey = sizeKey;
            await bounded(item.view.webContents.executeJavaScript(`window.__avesdWidget.update(${sizeKey})`), 5000);
        }

        return { id: command.id };
    }

    #destroy(id: string): void {

        const item = this.#views.get(id);
        if (!item) {
            return;
        }
        item.disposeServices();
        this.#views.delete(id);
        this.window.contentView.removeChildView(item.view);
        const contents = item.view.webContents;
        if (!contents.isDestroyed()) {
            void bounded(contents.executeJavaScript("window.__avesdWidget?.dispose()"), 250)
                .catch(() => {

                    return undefined;
                })
                .finally(() => {

                    if (!contents.isDestroyed()) {
                        contents.close({ waitForBeforeUnload: false });
                    }
                });
        }
    }

    dispose(): void {

        this.#closed = true; for (const id of this.#views.keys()) {this.#destroy(id);}
    }
}
