/**
 * @author Avesd
 * @package Desktop
 * @namespace TestUnitMainAgent
 * @description Session isolation, tier snapshots and cancellation
 */

import { AgentPreferences } from "../../../../src/main/agent/agent-preferences";
import { AgentSessions } from "../../../../src/main/agent/agent-sessions";
import { parseAgentRoutes, parseAgentTask } from "../../../../src/shared/agent/sessions";
import type { AgentEvent, AgentSettings } from "@avesd/plugin-api";
import type { DashboardScope } from "@avesd/workspace-model";
import { describe, expect, it, vi } from "vitest";

const origin = {
    workspaceId: "workspace",
    dashboardId: "dashboard",
    kind: "interactive" as const,
    source: "You",
} as DashboardScope & {
    kind: "interactive";
    source: string;
};

describe("unified agent sessions", () => {

    it("publishes one removal after clearing the entry and selection", async () => {

        const changed = vi.fn();
        const manager = new AgentSessions(new AgentPreferences(), async () => {

            return origin;
        }, async () => {

            throw new Error("Unexpected host creation");
        }, changed);
        const { id } = await manager.create();
        changed.mockClear();
        changed.mockImplementation(() => {

            expect(manager.snapshot(id)).toBeNull();
            expect(manager.list()).toEqual({
                selectedId: undefined,
                sessions: [],
            });
        });
        await manager.remove(id);
        expect(changed).toHaveBeenCalledExactlyOnceWith({
            type: "removed",
            id,
        });
    });

    it("runs independent sessions, snapshots routes, and keeps histories when selection changes", async () => {

        const preferences = new AgentPreferences();
        const pending = new Map<string, () => void>();
        const routes: string[] = [];
        const manager = new AgentSessions(preferences, async () => {

            return origin;
        }, async (_origin, route) => {

            routes.push(route.modelId);
            let listener: (event: AgentEvent) => void = () => {
            };
            let settings: AgentSettings = {
                status: "connected",
                providerId: route.providerId,
                agentName: "Synthetic",
                providers: [],
                models: [
                    {
                        id: "deep",
                        name: "Deep",
                    },
                ],
                efforts: [
                    {
                        id: "high",
                        name: "High",
                    },
                ],
            };

            return {
                release() {},
                host: {
                    async connect() {},
                    async getSettings() {

                        return settings;
                    },
                    async selectModel(id) {

                        settings = {
                            ...settings,
                            modelId: id,
                        };
                    },
                    async selectEffort(id) {

                        settings = {
                            ...settings,
                            effortId: id,
                        };
                    },
                    async selectProvider() {},
                    async cancel() {},
                    dispose() {},
                    publishSettings() {},
                    subscribe(value) {

                        listener = value;

                        return () => {
                        };
                    },
                    prompt(text) {

                        listener({
                            type: "messageChunk",
                            text: `answer:${text}`,
                        });

                        return new Promise<void>(resolve => {

                            pending.set(text, resolve);
                        });
                    },
                },
            };
        }, () => {
        });
        const first = await manager.create("flagship");
        await preferences.configureRoutes({
            ...preferences.routes,
            flagship: {
                providerId: "claude",
                modelId: "deep",
                effortId: "high",
            },
        });
        const second = await manager.create("flagship", {
            ...origin,
            kind: "background",
            source: "synthetic",
            widgetId: "widget",
        });
        const a = manager.prompt("first", first.id);
        const b = manager.prompt("second", second.id);
        await vi.waitFor(() => {

            return void expect(pending.size).toBe(2);
        });
        expect(routes).toEqual([
            "",
            "deep",
        ]);
        manager.select(first.id);
        expect(manager.list().selectedId).toBe(first.id);
        expect(manager.read(second.id).status).toBe("running");
        expect(manager.read(first.id).events.some(item => {

            return item.event.type === "messageChunk" && item.event.text === "answer:second";
        })).toBe(false);
        pending.get("first")!(); pending.get("second")!(); await Promise.all([
            a,
            b,
        ]);
        expect(manager.read(second.id).status).toBe("completed");
        expect(manager.read(first.id).events.some(item => {

            return item.event.type === "userMessage" && item.event.text === "first";
        })).toBe(true);
        manager.dispose();
    });
    it("disposes a connection that finishes creating after cancellation", async () => {

        const disposed = vi.fn(); const released = vi.fn();
        let release!: () => void;
        const wait = new Promise<void>(resolve => {

            release = resolve;
        });
        const manager = new AgentSessions(new AgentPreferences(), async () => {

            return origin;
        }, async () => {

            await wait;

            return {
                release: released,
                host: { dispose: disposed } as never,
            };
        }, () => {
        });
        const { id } = await manager.create();
        const connecting = manager.connect(id).catch(() => {
        });
        await manager.cancel(id); release(); await connecting;
        expect(manager.read(id).status).toBe("stopped");
        expect(disposed).toHaveBeenCalledOnce(); expect(released).toHaveBeenCalledOnce();
        manager.dispose();
    });
    it("marks excess background work as failed without opening another ACP", async () => {

        let release!: () => void;
        const waiting = new Promise<void>(resolve => {

            release = resolve;
        });
        const factory = vi.fn(async () => {

            await waiting;

            return {
                release() {},
                host: { dispose() {} } as never,
            };
        });
        const manager = new AgentSessions(new AgentPreferences(), async () => {

            return origin;
        }, factory, () => {
        });
        const tasks: Promise<void>[] = [];
        for (let index = 0; index < 8; index++) {
            const { id } = await manager.create("action", {
                ...origin,
                kind: "background",
            });
            tasks.push(manager.prompt("Synthetic pending task", id).catch(() => {
            }));
        }
        const excess = await manager.create("action", {
            ...origin,
            kind: "background",
        });
        await expect(manager.prompt("Synthetic excess task", excess.id)).rejects.toThrow("Agent task failed");
        expect(manager.read(excess.id).status).toBe("error");
        expect(factory).toHaveBeenCalledTimes(8);
        manager.dispose(); release(); await Promise.all(tasks);
    });
    it("rejects invalid routes and provider-shaped widget requests", () => {

        expect(() => {

            return parseAgentTask({
                tier: "codex",
                prompt: "test",
            });
        }).toThrow();
        expect(() => {

            return parseAgentTask({
                tier: "action",
                prompt: " ",
            });
        }).toThrow();
        expect(() => {

            return parseAgentRoutes({ flagship: { providerId: "unknown" } });
        }).toThrow();
        expect(parseAgentTask({
            tier: "reasoning",
            prompt: " test ",
        })).toEqual({
            tier: "reasoning",
            prompt: "test",
        });
    });
});
