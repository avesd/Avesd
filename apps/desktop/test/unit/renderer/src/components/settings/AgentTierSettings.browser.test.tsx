/**
 * @author Avesd
 * @package Desktop
 * @namespace TestUnitRendererSettings
 * @description Model discovery, effort reset and explicit connection checks
 */

import "../../../../../../src/renderer/src/styles.css";
import "@avesd/ui/styles.css";
import { AgentTierSettings } from "../../../../../../src/renderer/src/components/settings/AgentTierSettings";
import type { AgentRouteProbeResult, AgentTierRoute, AgentTierRoutes } from "../../../../../../src/shared/agent/sessions";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { page } from "vitest/browser";

it("loads ACP choices, resets effort on model change, tests only on request, and saves", async () => {

    const route = {
        providerId: "codex" as const,
        modelId: "deep",
        effortId: "high",
    };
    const routes: AgentTierRoutes = {
        flagship: route,
        reasoning: route,
        action: route,
    };
    let fail = false;
    const probeRoute = vi.fn(async (selection: AgentTierRoute, test: boolean): Promise<AgentRouteProbeResult> => {

        if (test && fail) {
            return {
                ok: false,
                message: "Synthetic provider rejected the request. Choose another model.",
            };
        }

        return {
            ok: true,
            tested: test,
            options: {
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
                efforts: selection.modelId === "deep" ? [
                    {
                        id: "high",
                        name: "High",
                    },
                ] : [
                    {
                        id: "medium",
                        name: "Medium",
                    },
                ],
                defaultModelId: "fast",
                defaultEffortId: selection.modelId === "deep" ? "high" : "medium",
                modelId: selection.modelId || "fast",
                effortId: selection.effortId || "medium",
            },
        };
    });
    const configure = vi.fn(async () => {
    });
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    root.render(<AgentTierSettings
        api={{
            routes: async () => {

                return routes;
            },
            configure,
            probeRoute,
        }}
    />);
    try {
        await expect.element(page.getByRole("button", {
            name: "Save agent tiers",
            exact: true,
        })).toBeEnabled();
        expect(probeRoute.mock.calls.every(([
            , test,
        ]) => {

            return !test;
        })).toBe(true);
        await page.getByRole("combobox", {
            name: "Flagship model",
            exact: true,
        }).selectOptions("fast");
        await expect.element(page.getByRole("combobox", {
            name: "Flagship effort",
            exact: true,
        })).toHaveValue("");
        await expect.element(page.getByRole("button", {
            name: "Test Flagship connection",
            exact: true,
        })).toBeEnabled();
        fail = true;
        await page.getByRole("button", {
            name: "Test Flagship connection",
            exact: true,
        }).click();
        await expect.element(page.getByRole("alert")).toHaveTextContent("Synthetic provider rejected");
        fail = false;
        await page.getByRole("button", {
            name: "Test Flagship connection",
            exact: true,
        }).click();
        await expect.element(page.getByText("Test passed · Fast", { exact: true })).toBeVisible();
        await page.getByRole("combobox", {
            name: "Flagship effort",
            exact: true,
        }).selectOptions("medium");
        await expect.element(page.getByText("Test passed · Fast", { exact: true })).not.toBeInTheDocument();
        await page.getByRole("button", {
            name: "Save agent tiers",
            exact: true,
        }).click();
        expect(configure).toHaveBeenCalledWith({
            ...routes,
            flagship: {
                ...route,
                modelId: "fast",
                effortId: "medium",
            },
        });
        expect(probeRoute.mock.calls.filter(([
            , test,
        ]) => {

            return test;
        })).toHaveLength(2);
    } finally { root.unmount(); host.remove(); }
});

it("retries discovery and lets a removed effort fall back to the ACP default", async () => {

    const route = {
        providerId: "codex" as const,
        modelId: "fast",
        effortId: "",
    };
    const routes: AgentTierRoutes = {
        flagship: {
            ...route,
            effortId: "retired",
        },
        reasoning: route,
        action: route,
    };
    let offline = true;
    const probeRoute = async (): Promise<AgentRouteProbeResult> => {

        return offline
            ? {
                ok: false,
                message: "ACP unavailable. Refresh to retry.",
            }
            : {
                ok: true,
                tested: false,
                options: {
                    models: [
                        {
                            id: "fast",
                            name: "Fast",
                        },
                    ],
                    efforts: [],
                    defaultModelId: "fast",
                },
            };
    };
    const configure = vi.fn(async () => {
    });
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    root.render(<AgentTierSettings
        api={{
            routes: async () => {

                return routes;
            },
            configure,
            probeRoute,
        }}
    />);
    try {
        const group = page.getByRole("group", {
            name: "Flagship",
            exact: true,
        });
        await expect.element(group.getByRole("alert")).toHaveTextContent("ACP unavailable");
        offline = false;
        await page.getByRole("button", {
            name: "Refresh Flagship models",
            exact: true,
        }).click();
        await expect.element(group.getByRole("alert")).toHaveTextContent("saved effort is unavailable");
        await expect.element(page.getByRole("button", {
            name: "Save agent tiers",
            exact: true,
        })).toBeDisabled();
        await group.getByRole("combobox", {
            name: "Flagship effort",
            exact: true,
        }).selectOptions("");
        await page.getByRole("button", {
            name: "Save agent tiers",
            exact: true,
        }).click();
        expect(configure).toHaveBeenCalledWith({
            ...routes,
            flagship: route,
        });
    } finally { root.unmount(); host.remove(); }
});
