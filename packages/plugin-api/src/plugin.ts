/**
 * @author Avesd
 * @package Plugin API
 * @namespace Root
 * @description Plugin
 */

import type { PluginContributions } from "./contribution";
import type { Dispose } from "./dispose";
import type { PluginCapability, PluginServices } from "./plugin-services";

export interface PluginContext {
    readonly contributions: PluginContributions;
    readonly pluginId: string;
    readonly services: Readonly<Partial<PluginServices>>;
    effect(setup: () => Dispose): void;
    onDispose(dispose: Dispose): void;
}

export interface PluginDefinition {
    readonly apiVersion: 1;
    readonly capabilities?: readonly PluginCapability[];
    readonly id: string;
    readonly version: string;
    activate(context: PluginContext): Dispose | Promise<Dispose | void> | void;
}

export interface PluginManifest {
    readonly apiVersion: 1;
    readonly capabilities?: readonly PluginCapability[];
    readonly displayName: string;
    readonly id: string;
    readonly main?: string;
    readonly ui?: string;
    readonly version: string;
}
