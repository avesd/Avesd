/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Agent Dock Browser Test
 */

import { DashboardEditingProvider, useDashboardEditing } from "../workbench/dashboard-editing";
import { WorkbenchChrome } from "../workbench/WorkbenchChrome";
import { AgentDock } from "./AgentDock";
import type { AgentEvent, AgentService, AgentSettings } from "@avesd/plugin-api";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";

const preferences = {
    getSidebarSide: async () => {
        return "right" as const;
    },
    setSidebarSide: async () => {
    },
};
const EditingState = () => {
    const { isEditing } = useDashboardEditing(); return <output>
        {isEditing ? "Editing" : "Locked"}
    </output>;
};

describe("AgentDock", () => {
    afterEach(() => {
        document.body.replaceChildren();
    });

    it("opens, connects, and renders a streamed Codex response", async () => {
        let listener: ((event: AgentEvent) => void) | undefined;
        const service: AgentService = {
            cancel: vi.fn(async () => {
                return undefined;
            }),
            connect: vi.fn(async () => {
                listener?.({
                    status: "connected",
                    type: "status",
                });
            }),
            prompt: vi.fn(async () => {
                listener?.({
                    type: "thoughtChunk",
                    text: "Inspecting the current dashboard.",
                });
                listener?.({
                    type: "toolCall",
                    id: "inspect",
                    title: "Inspect dashboard",
                    status: "in_progress",
                    input: "{}",
                });
                listener?.({
                    type: "toolCall",
                    id: "inspect",
                    status: "completed",
                    output: "Two widgets",
                });
                listener?.({
                    text: "Hello ",
                    type: "messageChunk",
                });
                listener?.({
                    text: "from Codex\n\n## Summary\n\n- **Ready**\n\n```js\nconst count = 2;\n```\n\n| Widget | State |\n| --- | --- |\n| Counter | Ready |\n\n[Unsafe](javascript:alert(1))\n\n<img src=x onerror=alert(1)>",
                    type: "messageChunk",
                });
                listener?.({
                    stopReason: "end_turn",
                    type: "turnComplete",
                });
            }),
            subscribe(nextListener) {
                listener = nextListener;
                return () => {
                    listener = undefined;
                };
            },
        };
        const container = document.createElement("div");
        document.body.append(container);
        const root = createRoot(container);
        root.render(<DashboardEditingProvider>
            <WorkbenchChrome
                preferences={preferences}
            >
                <AgentDock
                    service={service}
                />
                <EditingState />
            </WorkbenchChrome>
        </DashboardEditingProvider>);

        await page.getByRole("button", { name: "Open agent" }).click();
        await expect.element(page.getByRole("dialog", { name: "Workspace agent" })).toBeVisible();
        expect(service.connect).not.toHaveBeenCalled();
        await expect.element(page.getByRole("combobox", { name: "Agent provider" })).toBeDisabled();
        await expect.element(page.getByRole("combobox", { name: "Agent model" })).toBeDisabled();
        await page.getByRole("button", {
            name: "Unlock dashboard",
            exact: true,
        }).click();
        await expect.element(page.getByText("Editing", { exact: true })).toBeVisible();
        await expect.element(page.getByRole("dialog", { name: "Workspace agent" })).not.toBeInTheDocument();
        expect(service.connect).not.toHaveBeenCalled();
        await page.getByRole("button", {
            name: "Lock dashboard",
            exact: true,
        }).click();
        await expect.element(page.getByText("Locked", { exact: true })).toBeVisible();
        await page.getByRole("button", { name: "Open settings" }).click();
        await page.getByRole("radio", {
            name: "Left",
            exact: true,
        }).click();
        await expect.element(page.getByRole("radio", {
            name: "Left",
            exact: true,
        })).toBeChecked();
        await page.getByRole("button", { name: "Open agent" }).click();
        await page.getByRole("button", {
            name: "Connect",
            exact: true,
        }).click();
        await expect.element(page.getByText("Ready · Avesd workspace")).toBeVisible();

        await page.getByRole("textbox", { name: "Message agent" }).fill("Say hello");
        await page.getByRole("button", { name: "Send message" }).click();

        await expect.element(page.getByText("Say hello")).toBeVisible();
        await expect.element(page.getByText("Hello from Codex")).toBeVisible();
        await expect.element(page.getByRole("heading", { name: "Summary" })).toBeVisible();
        await expect.element(page.getByRole("table")).toBeVisible();
        expect(document.querySelector(".agent-markdown pre code")?.textContent).toContain("const count = 2;");
        expect(document.querySelector(".agent-markdown img, .agent-markdown a[href^='javascript:']")).toBeNull();
        await page.getByText("Thinking", { exact: false }).click();
        await expect.element(page.getByText("Inspecting the current dashboard.")).toBeVisible();
        await page.getByText("Inspect dashboard", { exact: true }).click();
        await expect.element(page.getByText("Two widgets", { exact: true })).toBeVisible();
        await expect.element(page.getByText("Completed", { exact: true })).toBeVisible();
        expect(service.prompt).toHaveBeenCalledWith("Say hello");

        root.unmount();
    });
});

it("applies live model selections and clears the old conversation on provider change", async () => {
    let listener: ((event: AgentEvent) => void) | undefined;
    let settings: AgentSettings = {
        status: "connected",
        providerId: "codex",
        agentName: "Codex",
        providers: [
            {
                id: "codex",
                name: "Codex",
            },
            {
                id: "claude",
                name: "Claude Code",
            },
            {
                id: "opencode",
                name: "OpenCode",
                available: false,
                unavailableReason: "Not installed",
            },
        ],
        modelId: "fast",
        models: [
            {
                id: "fast",
                name: "Fast",
            },
            {
                id: "deep",
                name: "Deep",
            },
        ],
    };
    const service: AgentService = {
        getSettings: async () => {
            return settings;
        },
        selectModel: vi.fn(async id => {
            settings = {
                ...settings,
                modelId: id,
            }; listener?.({
                type: "settings",
                settings,
            });
        }),
        selectProvider: vi.fn(async id => {
            settings = {
                ...settings,
                providerId: id,
                agentName: "Claude Code",
                modelId: "fast",
            };
            listener?.({ type: "sessionReset" }); listener?.({
                type: "settings",
                settings,
            });
        }),
        connect: async () => {
        },
        cancel: async () => {
        },
        prompt: async () => {
            listener?.({
                type: "messageChunk",
                text: "Synthetic response",
            }); listener?.({
                type: "turnComplete",
                stopReason: "end_turn",
            });
        },
        subscribe: next => {
            listener = next; return () => {
                listener = undefined;
            };
        },
    };
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    try {
        root.render(<DashboardEditingProvider>
            <WorkbenchChrome
                preferences={preferences}
            >
                <AgentDock
                    service={service}
                />
            </WorkbenchChrome>
        </DashboardEditingProvider>);
        await page.getByRole("button", { name: "Open agent" }).click();
        await expect.element(page.getByRole("option", { name: "OpenCode · Not installed" })).toBeDisabled();
        await page.getByRole("combobox", { name: "Agent model" }).selectOptions("deep");
        expect(service.selectModel).toHaveBeenCalledWith("deep");
        await expect.element(page.getByRole("combobox", { name: "Agent model" })).toHaveValue("deep");
        await page.getByRole("textbox", { name: "Message agent" }).fill("Synthetic prompt");
        await page.getByRole("button", { name: "Send message" }).click();
        await expect.element(page.getByText("Synthetic response")).toBeVisible();
        await page.getByRole("combobox", { name: "Agent provider" }).selectOptions("claude");
        expect(service.selectProvider).toHaveBeenCalledWith("claude");
        await expect.element(page.getByText("Synthetic response")).not.toBeInTheDocument();
        await expect.element(page.getByRole("combobox", { name: "Agent model" })).toHaveValue("fast");
    } finally { root.unmount(); container.remove(); }
});
