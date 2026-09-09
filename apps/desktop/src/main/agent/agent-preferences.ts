/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Agent Preferences
 */

import { randomUUID } from "node:crypto";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";

/** Stores IDs only, outside workspace content. Provider credentials belong to the adapters. */
export class AgentPreferences {
    providerId = "codex";
    models: Record<string, string> = {};
    constructor(private readonly path?: string) {}
    static async open(path: string): Promise<AgentPreferences> {
        const preferences = new AgentPreferences(path);
        try {
            const data = JSON.parse(await readFile(path, "utf8")) as unknown;
            if (!data || typeof data !== "object") {
                throw new Error();
            }
            const value = data as Record<string, unknown>;
            if (![
                "codex",
                "claude",
                "opencode",
            ].includes(String(value.providerId)) || !value.models || typeof value.models !== "object"
        || Array.isArray(value.models) || Object.entries(value.models).some(([
                key,
                model,
            ]) => {
                return ![
                    "codex",
                    "claude",
                    "opencode",
                ].includes(key) || typeof model !== "string" || model.length > 512;
            })) {
                throw new Error();
            }
            preferences.providerId = value.providerId as string;
            preferences.models = value.models as Record<string, string>;
        } catch (error) {
            if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) {
                throw new Error("Agent preferences could not be loaded.", { cause: error });
            }
        }
        return preferences;
    }
    async save(providerId: string, models = this.models): Promise<void> {
        if (this.path) {
            const temporary = `${this.path}.${randomUUID()}.tmp`;
            try {
                await writeFile(temporary, JSON.stringify({
                    providerId,
                    models,
                }), { mode: 0o600 });
                await rename(temporary, this.path);
            } finally {
                await unlink(temporary).catch(() => {
                });
            }
        }
        this.providerId = providerId;
        this.models = { ...models };
    }
}
