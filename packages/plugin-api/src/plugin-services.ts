/**
 * @author Avesd
 * @package Plugin API
 * @namespace Root
 * @description Plugin Services
 */

import type { AgentService } from "./agent-service";
import type { PluginStorage } from "./plugin-storage";

export interface CommandService {
    execute(commandId: string, input?: unknown): Promise<unknown>;
}

export interface ExternalOpenService {
    openUrl(url: string): Promise<void>;
}

export interface PluginServices {
    readonly agent: AgentService;
    readonly commands: CommandService;
    readonly externalOpen: ExternalOpenService;
    readonly storage: PluginStorage;
}

export type PluginCapability = keyof PluginServices;
