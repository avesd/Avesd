/**
 * @author Avesd
 * @package Kernel
 * @namespace Root
 * @description Contribution Broker
 */

import type { ContributionRegistry } from "./contribution-registry";
import type { ContributionPoint,
    Dispose,
    PluginContributions } from "@avesd/plugin-api";

export class ContributionBroker {
    readonly #registries = new Map<ContributionPoint<unknown>, ContributionRegistry<unknown>>();

    register<T>(
        point: ContributionPoint<T>,
        registry: ContributionRegistry<T>,
    ): Dispose {
        if (this.#registries.has(point)) {
            throw new Error(`Contribution point already registered: ${point.id}`);
        }

        this.#registries.set(
            point,
            registry,
        );

        return () => {
            this.#registries.delete(point);
        };
    }

    createScope(pluginId: string): PluginContributions {
        return Object.freeze({
            contribute: <T>(point: ContributionPoint<T>, value: T): Dispose => {
                const registry = this.#registries.get(point);
                if (!registry) {
                    throw new Error(`Unknown contribution point: ${point.id}`);
                }

                return registry.contribute(point.id, value, pluginId);
            },
        });
    }
}
