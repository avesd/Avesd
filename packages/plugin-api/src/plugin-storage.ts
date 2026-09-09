/**
 * @author Avesd
 * @package Plugin API
 * @namespace Root
 * @description Plugin Storage
 */

import type { JsonValue } from "./json";

export interface KeyValueStore {
    delete(key: string): Promise<void>;
    get(key: string): Promise<JsonValue | undefined>;
    set(key: string, value: JsonValue): Promise<void>;
}

export interface PluginStorage {
    readonly settings: KeyValueStore;
    readonly state: KeyValueStore;
}
