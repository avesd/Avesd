/**
 * @author Avesd
 * @package Plugin API
 * @namespace Root
 * @description Contribution
 */

import type { Dispose } from "./dispose";

export interface ContributionPoint<T> {
    readonly id: string;
    readonly valueType?: T;
}

export const defineContributionPoint = <T>(id: string): ContributionPoint<T> =>
{
    return Object.freeze({ id });
};

export interface PluginContributions {
    contribute<T>(point: ContributionPoint<T>, value: T): Dispose;
}
