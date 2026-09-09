/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Scoped plugin browser contract
 */

import type { BrowserControlAction } from "./browser-controls";
import { parseBrowserControls } from "./browser-controls";
import { parseWebUrl } from "./web-surface";
import type { JsonValue } from "@avesd/workspace-model";

export const pluginBrowserChannel = "plugin-browser:invoke";

export interface BrowserSessionConfiguration {
    readonly name: string;
    readonly shared: boolean;
}

export interface PluginBrowserConfiguration {
    readonly origins: readonly string[];
    readonly session?: BrowserSessionConfiguration;
}

export type PluginBrowserRequest = BrowserControlAction | {
    readonly type: "show";
} | {
    readonly type: "hide";
} | {
    readonly type: "close";
} | {
    readonly type: "status";
};

export interface PluginBrowserService {
    navigate(url: string): Promise<void>;
    extract(fields: Readonly<Record<string, string>>): Promise<JsonValue>;
    click(selector: string): Promise<void>;
    show(): Promise<void>;
    hide(): Promise<void>;
    close(): Promise<void>;
    status(): Promise<JsonValue>;
}

export function parseBrowserSession(input: unknown): BrowserSessionConfiguration {

    if (!input || typeof input !== "object" || !("name" in input) || !("shared" in input)
        || typeof input.name !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(input.name)
        || typeof input.shared !== "boolean") {
        throw new Error("Use a session name of 1–64 letters, numbers, underscores or hyphens.");
    }

    return {
        name: input.name,
        shared: input.shared,
    };
}

export function parsePluginBrowserRequest(input: unknown): PluginBrowserRequest {

    if (input && typeof input === "object" && "type" in input
        && (input.type === "show" || input.type === "hide" || input.type === "close" || input.type === "status")) {
        return { type: input.type };
    }
    const parsed = parseBrowserControls({
        type: "invoke",
        sourceId: "plugin",
        inputId: "browser",
        action: input,
    });
    if (parsed.type !== "invoke") {
        throw new Error("Invalid plugin browser action.");
    }

    return parsed.action;
}

export function allowsBrowserOrigin(configuration: PluginBrowserConfiguration, url: string): boolean {

    return configuration.origins.includes(parseWebUrl(url).origin);
}
