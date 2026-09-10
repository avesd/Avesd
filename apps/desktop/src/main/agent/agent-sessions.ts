/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description In-memory lifecycle and transcripts for independent ACP sessions
 */

import type { AgentSessionsChange, AgentSessionSnapshot, AgentSessionSummary, AgentTierRoute } from "../../shared/agent/sessions";
import type { AcpAgentHost } from "./acp-agent-host";
import type { AgentPreferences } from "./agent-preferences";
import type { AgentEvent, AgentSettings, AgentTier } from "@avesd/plugin-api";
import type { DashboardScope } from "@avesd/workspace-model";
import { randomUUID } from "node:crypto";

type SessionHost = Pick<AcpAgentHost, "connect" | "prompt" | "cancel" | "getSettings" | "selectProvider" | "selectModel" | "selectEffort" | "publishSettings" | "subscribe" | "dispose">;
export interface SessionOrigin extends DashboardScope {
    readonly kind: "interactive" | "background";
    readonly source: string;
    readonly widgetId?: string;
    readonly pluginId?: string;
}
interface Entry {
    summary: AgentSessionSummary;
    readonly origin: SessionOrigin;
    readonly route: AgentTierRoute;
    readonly events: {
        sequence: number;
        event: AgentEvent;
    }[];
    sequence: number;
    bytes: number;
    settings?: AgentSettings;
    host?: SessionHost;
    release?: () => void;
    preparing?: Promise<SessionHost>;
    stopped: boolean;
    ready: boolean;
}

export class AgentSessions {
    readonly #entries = new Map<string, Entry>();
    readonly #listeners = new Set<(event: AgentEvent) => void>();
    #selectedId?: string;
    #disposed = false;
    constructor(
        readonly preferences: AgentPreferences,
        private readonly origin: () => Promise<SessionOrigin>,
        private readonly factory: (origin: SessionOrigin, route: AgentTierRoute) => Promise<{
            host: SessionHost;
            release(): void;
        }>,
        private readonly changed: (change: AgentSessionsChange) => void,
    ) {}

    list(): {
        selectedId?: string;
        sessions: readonly AgentSessionSummary[];
    } {

        return {
            selectedId: this.#selectedId,
            sessions: [...this.#entries.values()].map(entry => {

                return entry.summary;
            }).reverse(),
        };
    }
    read(id: string): AgentSessionSnapshot {

        const snapshot = this.snapshot(id);
        if (!snapshot) {
            throw new Error("Agent session is unavailable.");
        }

        return snapshot;
    }
    snapshot(id: string): AgentSessionSnapshot | null {

        const entry = this.#entries.get(id);
        if (!entry) {
            return null;
        }

        return {
            ...entry.summary,
            events: entry.events,
            settings: entry.settings,
        };
    }
    owner(id: string): SessionOrigin {

        return this.#entry(id).origin;
    }

    async create(tier: AgentTier = "flagship", origin?: SessionOrigin): Promise<{
        id: string;
    }> {

        const resolved = origin ?? await this.origin();
        if (this.#disposed || this.#entries.size >= 32) {
            throw new Error("Close an existing session before creating another (limit 32).");
        }
        const id = randomUUID();
        const entry: Entry = {
            origin: resolved,
            route: { ...this.preferences.routes[tier] },
            events: [],
            sequence: 0,
            bytes: 0,
            stopped: false,
            ready: false,
            summary: {
                id,
                tier,
                kind: resolved.kind,
                source: resolved.source,
                workspaceId: resolved.workspaceId,
                dashboardId: resolved.dashboardId,
                status: "idle",
                createdAt: Date.now(),
            },
        };
        this.#entries.set(id, entry);
        if (resolved.kind === "interactive") {
            this.select(id);
        }
        else {
            this.changed({
                type: "updated",
                id,
            });
        }

        return { id };
    }
    select(id: string): void {

        const entry = this.#entry(id);
        this.#selectedId = id;
        this.#legacy({ type: "sessionReset" });
        for (const { event } of entry.events) {this.#legacy(event);}
        this.changed({
            type: "selectionChanged",
            id,
        });
    }
    async connect(id?: string): Promise<void> {

        const entry = await this.#resolve(id);
        await this.#prepare(entry);
        if (entry.summary.status === "error") {
            entry.summary = {
                ...entry.summary,
                status: "idle",
            };
            this.changed({
                type: "updated",
                id: entry.summary.id,
            });
        }
    }
    async prompt(text: string, id?: string): Promise<void> {

        const entry = await this.#resolve(id);
        if (entry.stopped || entry.summary.status === "running") {
            throw new Error("This session is stopped or already responding.");
        }
        entry.summary = {
            ...entry.summary,
            status: "running",
        };
        this.#record(entry, {
            type: "userMessage",
            text,
        });
        this.#record(entry, { type: "turnStarted" });
        try {
            if ([...this.#entries.values()].filter(item => {

                return item.summary.status === "running";
            }).length > 8) {
                throw new Error("At most eight agent tasks can run concurrently.");
            }
            const host = await this.#prepare(entry);
            if (this.#ended(entry)) {
                return;
            }
            await host.prompt(text);
            if (!this.#ended(entry)) {
                entry.summary = {
                    ...entry.summary,
                    status: "completed",
                };
            }
        } catch {
            if (!this.#ended(entry)) {
                entry.summary = {
                    ...entry.summary,
                    status: "error",
                };
                if (entry.settings?.status !== "error") {
                    this.#record(entry, {
                        type: "status",
                        status: "error",
                        message: "Agent task failed. Check the configured ACP, model, effort and local login.",
                    });
                }
            }
            throw new Error("Agent task failed.");
        } finally {
            if (this.#entries.has(entry.summary.id)) {
                this.changed({
                    type: "updated",
                    id: entry.summary.id,
                });
            }
        }
    }
    async cancel(id?: string): Promise<void> {

        const entry = await this.#resolve(id);
        this.#stop(entry);
        this.#record(entry, {
            type: "status",
            status: "disconnected",
        });
    }
    #stop(entry: Entry): void {

        entry.stopped = true;
        entry.summary = {
            ...entry.summary,
            status: "stopped",
        };
        // Termination also covers adapters that never acknowledge ACP cancellation.
        void entry.host?.cancel().catch(() => {
        });
        entry.host?.dispose(); entry.release?.(); entry.host = undefined; entry.release = undefined;
    }
    async remove(id: string): Promise<void> {

        const entry = this.#entry(id);
        this.#stop(entry); this.#entries.delete(id);
        if (this.#selectedId === id) {
            this.#selectedId = undefined;
        }
        this.changed({
            type: "removed",
            id,
        });
    }
    async getSettings(): Promise<AgentSettings> {

        const entry = await this.#resolve();

        return (await this.#host(entry)).getSettings();
    }
    async selectProvider(id: string): Promise<void> {

        await (await this.#host(await this.#resolve())).selectProvider(id);
    }
    async selectModel(id: string): Promise<void> {

        await (await this.#prepare(await this.#resolve())).selectModel(id);
    }
    async selectEffort(id: string): Promise<void> {

        await (await this.#prepare(await this.#resolve())).selectEffort(id);
    }
    async configureProvider(id: string, save: () => Promise<void>): Promise<void> {

        if ([...this.#entries.values()].some(entry => {

            return entry.route.providerId === id && (entry.summary.status === "running" || !!entry.preparing);
        })) {
            throw new Error("Stop sessions using this ACP before changing its installation.");
        }
        await save();
        for (const entry of this.#entries.values()) {
            if (entry.route.providerId === id && entry.host) {
                await this.cancel(entry.summary.id);
            }
        }
        this.publishSettings();
    }
    publishSettings(): void {

        for (const entry of this.#entries.values()) {entry.host?.publishSettings();}
    }
    subscribe(listener: (event: AgentEvent) => void): () => void {

        this.#listeners.add(listener);

        return () => {

            this.#listeners.delete(listener);
        };
    }
    dispose(): void {

        this.#disposed = true;
        for (const entry of this.#entries.values()) { entry.stopped = true; entry.host?.dispose(); entry.release?.(); }
        this.#entries.clear(); this.#listeners.clear();
    }
    #ended(entry: Entry): boolean {

        return entry.stopped || this.#disposed;
    }
    #entry(id: string): Entry {

        const entry = this.#entries.get(id);
        if (!entry) {
            throw new Error("Agent session is unavailable.");
        }

        return entry;
    }
    async #resolve(id?: string): Promise<Entry> {

        return this.#entry(id ?? this.#selectedId ?? (await this.create()).id);
    }
    async #host(entry: Entry): Promise<SessionHost> {

        if (this.#ended(entry)) {
            throw new Error("Agent session has ended.");
        }
        if (entry.host) {
            return entry.host;
        }
        const created = await this.factory(entry.origin, entry.route);
        if (this.#ended(entry)) {
            created.host.dispose(); created.release(); throw new Error("Agent session has ended.");
        }
        // A simultaneous settings query may have created the host first.
        const existing = this.#entries.get(entry.summary.id)?.host;
        if (existing) {
            created.host.dispose(); created.release();

            return existing;
        }
        entry.host = created.host; entry.release = created.release;
        created.host.subscribe(event => {

            if (!this.#ended(entry)) {
                this.#record(entry, event);
            }
        });

        return created.host;
    }
    #prepare(entry: Entry): Promise<SessionHost> {

        if (entry.ready && entry.host) {
            return Promise.resolve(entry.host);
        }
        if (!entry.preparing) {
            entry.preparing = (async () => {

                const host = await this.#host(entry);
                await host.connect();
                const settings = await host.getSettings();
                if (entry.route.modelId && settings.modelId !== entry.route.modelId) {
                    await host.selectModel(entry.route.modelId);
                }
                if (entry.route.effortId && (await host.getSettings()).effortId !== entry.route.effortId) {
                    await host.selectEffort(entry.route.effortId);
                }
                entry.ready = true;

                return host;
            })().finally(() => {

                entry.preparing = undefined;
            });
        }

        return entry.preparing;
    }
    #legacy(event: AgentEvent): void {

        for (const listener of this.#listeners) {listener(event);}
    }
    #record(entry: Entry, event: AgentEvent): void {

        if (this.#entries.get(entry.summary.id) !== entry) {
            return;
        }
        if (event.type === "settings") {
            entry.settings = event.settings;
        }
        if (event.type === "status" && entry.settings) {
            entry.settings = {
                ...entry.settings,
                status: event.status,
            };
        }
        if (event.type === "status" && (event.status === "error" || event.status === "disconnected")) {
            entry.ready = false;
        }
        if (event.type === "sessionReset") {
            entry.events.length = 0; entry.bytes = 0;
        }
        entry.events.push({
            sequence: ++entry.sequence,
            event,
        });
        entry.bytes += JSON.stringify(event).length;
        while (entry.bytes > 524288 && entry.events.length > 1) {entry.bytes -= JSON.stringify(entry.events.shift()!.event).length;}
        if (entry.summary.id === this.#selectedId) {
            this.#legacy(event);
        }
        this.changed({
            type: "updated",
            id: entry.summary.id,
        });
    }
}
