/**
 * @author Avesd
 * @package Kernel
 * @namespace Root
 * @description Capability Broker
 */

import type { PluginCapability,
    PluginServices } from "@avesd/plugin-api";

export interface PluginServiceScope {
    readonly pluginId: string;
}

type PluginServiceFactory<TCapability extends PluginCapability> = (
    scope: PluginServiceScope,
) => PluginServices[TCapability];

export type CapabilityAuthorizer = (
    pluginId: string,
    capability: PluginCapability,
) => boolean;

export class CapabilityBroker {
    readonly #authorize: CapabilityAuthorizer;
    readonly #factories = new Map<PluginCapability, PluginServiceFactory<PluginCapability>>();

    constructor(authorize: CapabilityAuthorizer = () => {
        return false;
    }) {
        this.#authorize = authorize;
    }

    register<TCapability extends PluginCapability>(
        capability: TCapability,
        factory: PluginServiceFactory<TCapability>,
    ): void {
        if (this.#factories.has(capability)) {
            throw new Error(`Capability already registered: ${capability}`);
        }

        this.#factories.set(
            capability,
            factory,
        );
    }

    createScope(
        pluginId: string,
        requestedCapabilities: readonly PluginCapability[],
    ): Readonly<Partial<PluginServices>> {
        const services: Partial<PluginServices> = {};

        for (const capability of new Set(requestedCapabilities)) {
            if (!this.#authorize(pluginId, capability)) {
                throw new Error(`Plugin ${pluginId} is not authorized for capability: ${capability}`);
            }

            const factory = this.#factories.get(capability);
            if (!factory) {
                throw new Error(`Capability is not available: ${capability}`);
            }

            Object.defineProperty(services, capability, {
                enumerable: true,
                value: factory({ pluginId }),
            });
        }

        return Object.freeze(services);
    }
}
