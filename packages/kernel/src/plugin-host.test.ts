/**
 * @author Avesd
 * @package Kernel
 * @namespace Root
 * @description Plugin Host Test
 */

import { CapabilityBroker } from "./capability-broker";
import { ContributionBroker } from "./contribution-broker";
import { ContributionRegistry } from "./contribution-registry";
import { PluginHost } from "./plugin-host";
import { describe, expect, it, vi } from "vitest";

describe("PluginHost", () => {
    it("replaces a plugin and disposes its effects in reverse order", async () => {
        const events: string[] = [];
        const host = new PluginHost();

        await host.replace({
            activate(context) {
                context.effect(() => {
                    events.push("first:activate");
                    return () => {
                        events.push("first:dispose-a");
                    };
                });
                context.onDispose(() => {
                    events.push("first:dispose-b");
                });
            },
            apiVersion: 1,
            id: "example",
            version: "1.0.0",
        });

        await host.replace({
            activate() {
                events.push("second:activate");
            },
            apiVersion: 1,
            id: "example",
            version: "2.0.0",
        });

        expect(events).toEqual([
            "first:activate",
            "second:activate",
            "first:dispose-b",
            "first:dispose-a",
        ]);
    });

    it("rolls back candidate effects when activation fails", async () => {
        const registry = new ContributionRegistry<string>();
        const host = new PluginHost();

        await host.replace({
            activate(context) {
                context.effect(() => {
                    return registry.contribute("main", "stable");
                });
            },
            apiVersion: 1,
            id: "example",
            version: "1.0.0",
        });

        await expect(host.replace({
            activate(context) {
                context.effect(() => {
                    return registry.contribute("main", "candidate");
                });
                throw new Error("activation failed");
            },
            apiVersion: 1,
            id: "example",
            version: "2.0.0",
        })).rejects.toThrow("activation failed");

        expect(registry.get("main")).toBe("stable");
        expect(host.activePluginIds).toEqual(["example"]);
    });

    it("injects only requested and authorized plugin-scoped capabilities", async () => {
        const capabilities = new CapabilityBroker((pluginId, capability) => {
            return pluginId === "example" && capability === "commands";
        });
        capabilities.register("commands", ({ pluginId }) => {
            return {
                async execute(commandId) {
                    return `${pluginId}:${commandId}`;
                },
            };
        });
        const host = new PluginHost({ capabilities });

        await host.replace({
            async activate(context) {
                expect(context.services.storage).toBeUndefined();
                await expect(context.services.commands?.execute("open"))
                    .resolves.toBe("example:open");
            },
            apiVersion: 1,
            capabilities: ["commands"],
            id: "example",
            version: "1.0.0",
        });
    });

    it("rejects an unauthorized capability before plugin activation", async () => {
        const activate = vi.fn();
        const host = new PluginHost({
            capabilities: new CapabilityBroker(() => {
                return false;
            }),
        });

        await expect(host.replace({
            activate,
            apiVersion: 1,
            capabilities: ["externalOpen"],
            id: "example",
            version: "1.0.0",
        })).rejects.toThrow("Plugin example is not authorized for capability: externalOpen");
        expect(activate).not.toHaveBeenCalled();
    });

    it("routes typed contributions through registered contribution points", async () => {
        const point = { id: "example.message" } as const;
        const registry = new ContributionRegistry<string>();
        const contributions = new ContributionBroker();
        contributions.register(point, registry);
        const host = new PluginHost({ contributions });

        await host.replace({
            activate(context) {
                context.effect(() => {
                    return context.contributions.contribute(point, "hello");
                });
            },
            apiVersion: 1,
            id: "example",
            version: "1.0.0",
        });

        expect(registry.get(point.id)).toBe("hello");
        expect(registry.getAll(point.id)).toEqual([
            {
                pluginId: "example",
                value: "hello",
            },
        ]);
        await host.remove("example");
        expect(registry.get(point.id)).toBeUndefined();
    });

    it("notifies contribution subscribers when the active layer changes", () => {
        const listener = vi.fn();
        const registry = new ContributionRegistry<string>();
        registry.subscribe(listener);

        const removeFirst = registry.contribute("main", "first");
        const removeSecond = registry.contribute("main", "second");
        expect(registry.get("main")).toBe("second");

        void removeSecond();
        expect(registry.get("main")).toBe("first");
        void removeFirst();
        expect(listener).toHaveBeenCalledTimes(4);
    });
});
