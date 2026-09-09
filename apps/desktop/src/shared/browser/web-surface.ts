/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Web Surface
 */

import type { JsonValue } from "@avesd/workspace-model";

export const WEB_PLUGIN_ID = "avesd.builtin.web";
export const WEB_RESULT_TYPE = "avesd.web-result";
export const webSurfaceChannel = "web-surface:command";
export const webSurfaceEventChannel = "web-surface:changed";

export interface WebSurfaceBounds {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly visible: boolean;
}

export interface WebSurfaceState {
    readonly id: string;
    readonly document: number;
    readonly url: string;
    readonly status: "empty" | "loading" | "ready" | "error";
    readonly result: JsonValue;
}

export type WebSurfaceCommand =
  | {
      readonly type: "create";
      readonly widgetId: string;
  }
  | {
      readonly type: "destroy" | "inspect" | "clear";
      readonly id: string;
  }
  | {
      readonly type: "bounds";
      readonly id: string;
      readonly bounds: WebSurfaceBounds;
  }
  | {
      readonly type: "navigate";
      readonly id: string;
      readonly url: string;
  }
  | {
      readonly type: "run";
      readonly id: string;
      readonly document: number;
      readonly origin: string;
      readonly code: string;
      readonly mode: "isolated" | "page" | "css";
  };

export interface WebSurfaceApi {
    command(command: WebSurfaceCommand): Promise<WebSurfaceState>;
    subscribe(listener: () => void): () => void;
}

export type WebSurfaceCommandResult =
  | {
      readonly ok: true;
      readonly state: WebSurfaceState;
  }
  | {
      readonly ok: false;
      readonly error: string;
  };

/** Keeps expected surface lifecycle failures from rejecting the Electron IPC handler itself. */
export async function settleWebSurfaceCommand(command: Promise<WebSurfaceState>): Promise<WebSurfaceCommandResult> {
    try {
        return {
            ok: true,
            state: await command,
        };
    } catch (error) {
        return {
            ok: false,
            error: error instanceof Error ? error.message : "Web command failed.",
        };
    }
}

export function unwrapWebSurfaceCommand(result: WebSurfaceCommandResult): WebSurfaceState {
    if (!result.ok) {
        throw new Error(result.error);
    }
    return result.state;
}

export function parseWebUrl(value: string): URL {
    const url = new URL(value);
    if (url.username || url.password || (url.protocol !== "https:"
    && !(url.protocol === "http:" && [
        "localhost",
        "127.0.0.1",
        "[::1]",
    ].includes(url.hostname)))) {
        throw new Error("Use HTTPS, or HTTP on localhost, without URL credentials.");
    }
    return url;
}

export function parseWebCommand(input: unknown): WebSurfaceCommand {
    if (!input || typeof input !== "object") {
        throw new Error("Invalid web command.");
    }
    const value = input as Record<string, unknown>;
    const text = (key: string, limit = 4096): string => {
        const field = value[key];
        if (typeof field !== "string" || !field.length || field.length > limit) {
            throw new Error("Invalid web command field.");
        }
        return field;
    };
    if (value.type === "create") {
        return {
            type: "create",
            widgetId: text("widgetId", 128),
        };
    }
    const id = text("id", 128);
    switch (value.type) {
        case "destroy": case "inspect": case "clear": return {
            type: value.type,
            id,
        };
        case "navigate": return {
            type: "navigate",
            id,
            url: parseWebUrl(text("url")).href,
        };
        case "run": {
            if (!Number.isSafeInteger(value.document) || (value.document as number) < 0
        || ![
            "isolated",
            "page",
            "css",
        ].includes(String(value.mode))) {
                throw new Error("Invalid script options.");
            }
            return {
                type: "run",
                id,
                document: value.document as number,
                origin: parseWebUrl(text("origin")).origin,
                code: text("code", 32_768),
                mode: value.mode as "isolated" | "page" | "css",
            };
        }
        case "bounds": {
            const bounds = value.bounds as Record<string, unknown> | undefined;
            if (!bounds || typeof bounds.visible !== "boolean"
        || ![
            "x",
            "y",
            "width",
            "height",
        ].every((key) => {
            return typeof bounds[key] === "number"
          && Number.isFinite(bounds[key]) && Math.abs(bounds[key]) <= 100_000;
        })
        || (bounds.width as number) < 0 || (bounds.height as number) < 0) {
                throw new Error("Invalid bounds.");
            }
            return {
                type: "bounds",
                id,
                bounds: bounds as unknown as WebSurfaceBounds,
            };
        }
        default: throw new Error("Unknown web command.");
    }
}

export function parseWebResult(value: unknown): JsonValue {
    let nodes = 0;
    const visit = (item: unknown, depth: number): void => {
        if (++nodes > 10_000 || depth > 20) {
            throw new Error("Result is too large.");
        }
        if (item === null || typeof item === "boolean" || typeof item === "string") {
            return;
        }
        if (typeof item === "number" && Number.isFinite(item)) {
            return;
        }
        if (Array.isArray(item)) {
            item.forEach((child) => {
                return void visit(child, depth + 1);
            }); return;
        }
        if (item && typeof item === "object" && Object.getPrototypeOf(item) === Object.prototype) {
            Object.values(item).forEach((child) => {
                return void visit(child, depth + 1);
            }); return;
        }
        throw new Error("Return a JSON value, not DOM nodes or runtime objects.");
    };
    visit(value, 0);
    if (new TextEncoder().encode(JSON.stringify(value)).length > 65_536) {
        throw new Error("Result exceeds 64 KiB.");
    }
    return value as JsonValue;
}
