/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Agent Preferences
 */

import type { AgentTierRoutes } from "../../shared/agent/sessions";
import { parseAgentRoutes } from "../../shared/agent/sessions";
import { randomUUID } from "node:crypto";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";

/** Stores IDs only, outside workspace content. Provider credentials belong to the adapters. */
export class AgentPreferences {
    routes: AgentTierRoutes = {
        flagship: {
            providerId: "codex",
            modelId: "",
            effortId: "",
        },
        reasoning: {
            providerId: "codex",
            modelId: "",
            effortId: "",
        },
        action: {
            providerId: "codex",
            modelId: "",
            effortId: "",
        },
    };
    private saving: Promise<void> = Promise.resolve();
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
            if (value.routes !== undefined) {
                preferences.routes = parseAgentRoutes(value.routes);
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
    save(providerId: string, models = this.models): Promise<void> {

        return this.#save(() => {

            return {
                providerId,
                models,
                routes: this.routes,
            };
        });
    }
    configureRoutes(input: unknown): Promise<void> {

        const routes = parseAgentRoutes(input);

        return this.#save(() => {

            return {
                providerId: this.providerId,
                models: this.models,
                routes,
            };
        });
    }
    #save(next: () => {
        providerId: string;
        models: Record<string, string>;
        routes: AgentTierRoutes;
    }): Promise<void> {

        const save = this.saving.catch(() => {
        }).then(async () => {

            const value = next();
            if (this.path) {
                const temporary = `${this.path}.${randomUUID()}.tmp`;
                try {
                    await writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
                    await rename(temporary, this.path);
                } finally {
                    await unlink(temporary).catch(() => {
                    });
                }
            }
            this.providerId = value.providerId; this.models = { ...value.models }; this.routes = value.routes;
        });
        this.saving = save;

        return save;
    }
}
