/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Browser Bindings
 */

import type { BrowserBinding, BrowserControlsCommand, BrowserOperation } from "../../shared/browser/browser-controls";
import { BROWSER_INPUT, parseBrowserControls } from "../../shared/browser/browser-controls";
import { WEB_PLUGIN_ID } from "../../shared/browser/web-surface";
import type { WorkspaceSnapshot } from "@avesd/workspace-model";

export interface BrowserBindingStorage {
    load(): Promise<unknown>;
    save(bindings: readonly BrowserBinding[]): Promise<void>;
}

/** A single main-process authority, separate from renderer/MCP workspace snapshots. */
export class BrowserBindings {
    #bindings: readonly BrowserBinding[] = [];
    #queue = Promise.resolve();
    private constructor(private readonly storage: BrowserBindingStorage) {}

    static async open(storage: BrowserBindingStorage): Promise<BrowserBindings> {
        const service = new BrowserBindings(storage);
        const stored = await storage.load();
        if (stored === undefined) {
            return service;
        }
        if (!Array.isArray(stored)) {
            throw new Error("Invalid browser bindings file.");
        }
        service.#bindings = stored.map((item) => {
            const parsed = parseBrowserControls({
                ...item,
                type: "bind",
            });
            if (parsed.type !== "bind" || typeof item.workspaceId !== "string" || typeof item.dashboardId !== "string") {
                throw new Error("Invalid browser binding scope.");
            }
            return {
                sourceId: parsed.sourceId,
                targetId: parsed.targetId,
                inputId: parsed.inputId,
                origin: parsed.origin,
                operations: parsed.operations,
                workspaceId: item.workspaceId,
                dashboardId: item.dashboardId,
            };
        });
        return service;
    }

    list(snapshot: WorkspaceSnapshot): readonly BrowserBinding[] {
        return this.#bindings.filter((binding) => {
            return this.#valid(binding, snapshot);
        });
    }

    authorize(sourceId: string, inputId: string, operation: BrowserOperation, snapshot: WorkspaceSnapshot): BrowserBinding {
        const binding = this.list(snapshot).find((binding) => {
            return binding.sourceId === sourceId && binding.inputId === inputId;
        });
        if (!binding || !binding.operations.includes(operation)) {
            throw new Error("Browser control is not bound or this operation is not allowed.");
        }
        return binding;
    }

    isCurrent(binding: BrowserBinding, snapshot: WorkspaceSnapshot): boolean {
        return this.#bindings.includes(binding) && this.#valid(binding, snapshot);
    }

    bind(command: Extract<BrowserControlsCommand, {
        type: "bind";
    }>, snapshot: WorkspaceSnapshot): Promise<void> {
        const source = snapshot.widgets.find((widget) => {
            return widget.id === command.sourceId;
        });
        if (!source) {
            return Promise.reject(new Error("Source widget is unavailable."));
        }
        const binding: BrowserBinding = {
            sourceId: command.sourceId,
            inputId: command.inputId,
            targetId: command.targetId,
            operations: command.operations,
            origin: command.origin,
            workspaceId: source.workspaceId,
            dashboardId: source.dashboardId,
        };
        if (!this.#valid(binding, snapshot)) {
            return Promise.reject(new Error("Choose a browser in the same dashboard for a supported controller."));
        }
        return this.#commit(() => {
            return [
                ...this.#bindings.filter((item) => {
                    return item.sourceId !== binding.sourceId || item.inputId !== binding.inputId;
                }),
                binding,
            ];
        });
    }

    unbind(sourceId: string, inputId: string): Promise<void> {
        return this.#commit(() => {
            return this.#bindings.filter((item) => {
                return item.sourceId !== sourceId || item.inputId !== inputId;
            });
        });
    }

    prune(snapshot: WorkspaceSnapshot): Promise<void> {
        return this.#commit(() => {
            return this.list(snapshot);
        });
    }

    #valid(binding: BrowserBinding, snapshot: WorkspaceSnapshot): boolean {
        const source = snapshot.widgets.find((widget) => {
            return widget.id === binding.sourceId;
        });
        const target = snapshot.widgets.find((widget) => {
            return widget.id === binding.targetId;
        });
        return binding.inputId === BROWSER_INPUT && source?.pluginId === WEB_PLUGIN_ID && source.widgetTypeId === "controls"
      && target?.pluginId === WEB_PLUGIN_ID && target.widgetTypeId === "page"
      && source.workspaceId === binding.workspaceId && target.workspaceId === binding.workspaceId
      && source.dashboardId === binding.dashboardId && target.dashboardId === binding.dashboardId;
    }

    #commit(next: () => readonly BrowserBinding[]): Promise<void> {
        const work = this.#queue.then(async () => {
            const bindings = next();
            if (bindings.length === this.#bindings.length && bindings.every((item, index) => {
                return item === this.#bindings[index];
            })) {
                return;
            }
            await this.storage.save(bindings);
            this.#bindings = bindings;
        });
        this.#queue = work.catch(() => {
            return undefined;
        });
        return work;
    }
}
