/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Browser Controls
 */

import { parseWebUrl } from "./web-surface";
import type { DashboardScope, JsonObject } from "@avesd/workspace-model";

export const browserControlsChannel = "browser-controls:command";
export const BROWSER_INPUT = "browser";
export const BROWSER_OPERATIONS = [
    "extract",
    "navigate",
    "click",
] as const;
export type BrowserOperation = typeof BROWSER_OPERATIONS[number];

export interface BrowserBinding extends DashboardScope {
    readonly sourceId: string;
    readonly targetId: string;
    readonly inputId: string;
    readonly origin: string;
    readonly operations: readonly BrowserOperation[];
}

export type BrowserControlAction =
  | {
      readonly type: "extract";
      readonly fields: Readonly<Record<string, string>>;
  }
  | {
      readonly type: "navigate";
      readonly url: string;
  }
  | {
      readonly type: "click";
      readonly selector: string;
  };

export type BrowserControlsCommand =
  | {
      readonly type: "list";
  }
  | {
      readonly type: "bind";
      readonly sourceId: string;
      readonly targetId: string;
      readonly inputId: string;
      readonly origin: string;
      readonly operations: readonly BrowserOperation[];
  }
  | {
      readonly type: "unbind";
      readonly sourceId: string;
      readonly inputId: string;
  }
  | {
      readonly type: "invoke";
      readonly sourceId: string;
      readonly inputId: string;
      readonly action: BrowserControlAction;
  };

/** Desktop host administration; widgets receive only WidgetBrowserService. */
export interface BrowserControlsApi {
    list(): Promise<readonly BrowserBinding[]>;
    bind(binding: Extract<BrowserControlsCommand, {
        type: "bind";
    }>): Promise<void>;
    unbind(sourceId: string, inputId: string): Promise<void>;
    invoke(sourceId: string, inputId: string, action: BrowserControlAction): Promise<JsonObject | null>;
}

export function parseBrowserControls(input: unknown): BrowserControlsCommand {

    if (!input || typeof input !== "object") {
        throw new Error("Invalid browser control command.");
    }
    const value = input as Record<string, unknown>;
    const text = (record: Record<string, unknown>, key: string, max = 128): string => {

        const item = record[key];
        if (typeof item !== "string" || item.length === 0 || item.length > max) {
            throw new Error("Invalid browser control field.");
        }

        return item;
    };
    if (value.type === "list") {
        return { type: "list" };
    }
    const sourceId = text(value, "sourceId");
    const inputId = text(value, "inputId");
    if (inputId !== BROWSER_INPUT) {
        throw new Error("Unknown browser input.");
    }
    if (value.type === "unbind") {
        return {
            type: "unbind",
            sourceId,
            inputId,
        };
    }
    if (value.type === "bind") {
        if (!Array.isArray(value.operations) || value.operations.length > 3
      || !value.operations.every((operation) => {

          return BROWSER_OPERATIONS.includes(operation);
      })) {
            throw new Error("Invalid browser operations.");
        }

        return {
            type: "bind",
            sourceId,
            inputId,
            targetId: text(value, "targetId"),
            origin: parseWebUrl(text(value, "origin", 4096)).origin,
            operations: [...new Set(value.operations)] as BrowserOperation[],
        };
    }
    if (value.type !== "invoke" || !value.action || typeof value.action !== "object") {
        throw new Error("Unknown browser control command.");
    }
    const action = value.action as Record<string, unknown>;
    switch (action.type) {
        case "navigate": return {
            type: "invoke",
            sourceId,
            inputId,
            action: {
                type: "navigate",
                url: parseWebUrl(text(action, "url", 4096)).href,
            },
        };
        case "click": return {
            type: "invoke",
            sourceId,
            inputId,
            action: {
                type: "click",
                selector: text(action, "selector", 512),
            },
        };
        case "extract": {
            if (!action.fields || typeof action.fields !== "object" || Array.isArray(action.fields)) {
                throw new Error("Invalid extraction fields.");
            }
            const fields = action.fields as Record<string, unknown>;
            const keys = Object.keys(fields);
            if (!keys.length || keys.length > 16 || keys.some((key) => {

                return !/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(key);
            })) {
                throw new Error("Use one to sixteen named fields.");
            }

            return {
                type: "invoke",
                sourceId,
                inputId,
                action: {
                    type: "extract",
                    fields: Object.fromEntries(keys.map((key) => {

                        return [
                            key,
                            text(fields, key, 512),
                        ];
                    })),
                },
            };
        }
        default: throw new Error("Unsupported browser action.");
    }
}
