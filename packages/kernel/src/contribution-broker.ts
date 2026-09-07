import type {
  ContributionPoint,
  Dispose,
  PluginContributions,
} from "@avesd/plugin-api";

import type { ContributionRegistry } from "./contribution-registry";

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
      point as ContributionPoint<unknown>,
      registry as ContributionRegistry<unknown>,
    );

    return () => {
      this.#registries.delete(point as ContributionPoint<unknown>);
    };
  }

  createScope(pluginId: string): PluginContributions {
    return Object.freeze({
      contribute: <T>(point: ContributionPoint<T>, value: T): Dispose => {
        const registry = this.#registries.get(point as ContributionPoint<unknown>);
        if (!registry) {
          throw new Error(`Unknown contribution point: ${point.id}`);
        }

        return registry.contribute(point.id, value, pluginId);
      },
    });
  }
}
