/**
 * @author Avesd
 * @package Kernel
 * @namespace Root
 * @description Contribution Registry
 */

import type { Dispose } from "@avesd/plugin-api";

type Listener = () => void;

interface Contribution<T> {
    readonly pluginId?: string;
    readonly token: symbol;
    readonly value: T;
}

export interface RegisteredContribution<T> {
    readonly pluginId?: string;
    readonly value: T;
}

export class ContributionRegistry<T> {
    readonly #allSnapshots = new Map<string, readonly RegisteredContribution<T>[]>();
    readonly #contributions = new Map<string, Contribution<T>[]>();
    readonly #listeners = new Set<Listener>();

    contribute(key: string, value: T, pluginId?: string): Dispose {
        const contribution = {
            pluginId,
            token: Symbol(key),
            value,
        };
        const entries = this.#contributions.get(key) ?? [];
        entries.push(contribution);
        this.#contributions.set(key, entries);
        this.#allSnapshots.delete(key);
        this.#emit();

        return () => {
            const currentEntries = this.#contributions.get(key);
            const index = currentEntries?.findIndex(({ token }) => {
                return token === contribution.token;
            }) ?? -1;

            if (!currentEntries || index < 0) {
                return;
            }

            currentEntries.splice(index, 1);
            if (currentEntries.length === 0) {
                this.#contributions.delete(key);
            }
            this.#allSnapshots.delete(key);
            this.#emit();
        };
    }

    get(key: string): T | undefined {
        return this.#contributions.get(key)?.at(-1)?.value;
    }

    getAll(key: string): readonly RegisteredContribution<T>[] {
        const current = this.#allSnapshots.get(key);
        if (current) {
            return current;
        }
        const snapshot = (this.#contributions.get(key) ?? []).map(({ pluginId, value }) => {
            return {
                pluginId,
                value,
            };
        });
        this.#allSnapshots.set(key, snapshot);
        return snapshot;
    }

    keys(): readonly string[] {
        return [...this.#contributions.keys()];
    }

    subscribe(listener: Listener): Dispose {
        this.#listeners.add(listener);
        return () => {
            this.#listeners.delete(listener);
        };
    }

    #emit(): void {
        for (const listener of this.#listeners) {
            listener();
        }
    }
}
