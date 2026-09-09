/**
 * @author Avesd
 * @package Kernel
 * @namespace Root
 * @description Plugin Host
 */

import { CapabilityBroker } from "./capability-broker";
import { ContributionBroker } from "./contribution-broker";
import type { PluginDefinition } from "@avesd/plugin-api";
import type { PluginContext } from "@avesd/plugin-api";
import { Context } from "cordis";

interface MountedPlugin {
    readonly definition: PluginDefinition;
    readonly fiber: ReturnType<Context["plugin"]>;
}

export class PluginHost {
    readonly #capabilities: CapabilityBroker;
    readonly #contributions: ContributionBroker;
    readonly #context = new Context();
    readonly #plugins = new Map<string, MountedPlugin>();

    constructor(options: {
        readonly capabilities?: CapabilityBroker;
        readonly contributions?: ContributionBroker;
    } = {}) {

        this.#capabilities = options.capabilities ?? new CapabilityBroker();
        this.#contributions = options.contributions ?? new ContributionBroker();
    }

    get activePluginIds(): readonly string[] {

        return [...this.#plugins.keys()];
    }

    async replace(definition: PluginDefinition): Promise<void> {

        // The runtime boundary remains defensive even though the TypeScript contract is version 1.
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (definition.apiVersion !== 1) {
            throw new Error(`Unsupported plugin API version: ${String(definition.apiVersion)}`);
        }

        const candidate = this.#context.plugin((context) => {

            const pluginContext: PluginContext = {
                contributions: this.#contributions.createScope(definition.id),
                effect(setup) {

                    context.effect(setup, `${definition.id}:effect`);
                },
                onDispose(dispose) {

                    context.effect(() => {

                        return dispose;
                    }, `${definition.id}:dispose`);
                },
                pluginId: definition.id,
                services: this.#capabilities.createScope(
                    definition.id,
                    definition.capabilities ?? [],
                ),
            };

            return definition.activate(pluginContext);
        });

        try {
            await candidate;
        } catch (error) {
            await candidate.dispose();
            throw error;
        }

        const previous = this.#plugins.get(definition.id);
        this.#plugins.set(definition.id, {
            definition,
            fiber: candidate,
        });
        await previous?.fiber.dispose();
    }

    async remove(pluginId: string): Promise<void> {

        const plugin = this.#plugins.get(pluginId);
        if (!plugin) {
            return;
        }

        this.#plugins.delete(pluginId);
        await plugin.fiber.dispose();
    }

    async dispose(): Promise<void> {

        this.#plugins.clear();
        await this.#context.fiber.dispose();
    }
}
