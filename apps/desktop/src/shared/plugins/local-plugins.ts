/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Local Plugins
 */

import type { PluginBrowserConfiguration } from "../browser/plugin-browser";
import type { WebSurfaceBounds } from "../browser/web-surface";
import { parseWebCommand } from "../browser/web-surface";
import type { WidgetDefinition, WidgetSize, WidgetWorkspaceCapability } from "@avesd/workspace-model";

export interface LocalPluginManifest {
    readonly browser?: PluginBrowserConfiguration;
    readonly capabilities?: readonly WidgetWorkspaceCapability[];
    readonly apiVersion: 1;
    readonly id: string;
    readonly version: string;
    readonly displayName: string;
    readonly widgetTypeId: string;
    readonly size: {
        readonly width: number;
        readonly height: number;
    };
}

export type WidgetTestStep =
  | {
      readonly type: "click";
      readonly selector: string;
  }
  | {
      readonly type: "fill";
      readonly selector: string;
      readonly value: string;
  }
  | {
      readonly type: "expectText";
      readonly selector: string;
      readonly text: string;
  };

export interface LocalPluginDraft {
    readonly id: string;
    readonly revision: string;
    readonly manifest: LocalPluginManifest;
    readonly source: string;
    readonly tests: readonly WidgetTestStep[];
}

export interface LocalPluginSummary {
    readonly manifest: LocalPluginManifest;
    readonly revision: string;
}

export interface PluginTestReport {
    readonly draftId: string;
    readonly revision: string;
    readonly passed: boolean;
    readonly checks: readonly {
        readonly name: string;
        readonly passed: boolean;
        readonly message?: string;
    }[];
}

export type LocalWidgetCommand =
  | {
      readonly type: "create";
      readonly widgetId: string;
  }
  | {
      readonly type: "destroy";
      readonly id: string;
  }
  | {
      readonly type: "bounds";
      readonly id: string;
      readonly bounds: WebSurfaceBounds;
      readonly size: WidgetSize;
  };

export interface LocalPluginsApi {
    list(): Promise<readonly LocalPluginSummary[]>;
    subscribe(listener: () => void): () => void;
    surface(command: LocalWidgetCommand): Promise<{
        readonly id: string;
    }>;
}

export const localPluginsChannels = {
    list: "local-plugins:list",
    changed: "local-plugins:changed",
    surface: "local-plugins:surface",
} as const;

export const localWidgetDefinition = (manifest: LocalPluginManifest): WidgetDefinition => {

    return {
        capabilities: manifest.capabilities,
        pluginId: manifest.id,
        widgetTypeId: manifest.widgetTypeId,
        displayName: manifest.displayName,
        configurationVersion: 1,
        defaultConfiguration: {},
        inputs: [],
        defaultSize: manifest.size,
    };
};

export function parseLocalWidgetCommand(input: unknown): LocalWidgetCommand {

    const command = parseWebCommand(input);
    if (command.type === "create") {
        return command;
    }
    if (command.type === "destroy") {
        return {
            type: "destroy",
            id: command.id,
        };
    }
    if (command.type === "bounds") {
        const size = (input as {
            size?: WidgetSize;
        }).size;
        if (!size || !Number.isSafeInteger(size.width) || !Number.isSafeInteger(size.height)
            || size.width < 1 || size.width > 24 || size.height < 1) {
            throw new Error("Invalid local widget size.");
        }

        return {
            ...command,
            size: {
                width: size.width,
                height: size.height,
            },
        };
    }
    throw new Error("Invalid local widget command.");
}
