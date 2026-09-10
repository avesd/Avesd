/**
 * @author Avesd
 * @package Desktop
 * @namespace TestIntegrationMainAgent
 * @description Isolated model discovery and explicit prompt checks
 */

import { AgentModels } from "../../../../src/main/agent/agent-models";
import { parseAgentRoute } from "../../../../src/shared/agent/sessions";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";

it("reads model-dependent options without prompting, explicitly tests selected settings, and cleans up", async () => {

    const directory = await mkdtemp(join(tmpdir(), "avesd-models-"));
    const trace = join(directory, "synthetic.jsonl");
    const runtime = join(directory, "runtime");
    let fail = false;
    const models = new AgentModels(runtime, () => {

        return [
            {
                id: "codex",
                name: "Synthetic",
                launch: () => {

                    return {
                        command: process.execPath,
                        args: [
                            resolve(import.meta.dirname, "../../../e2e/support/acp-agent.mjs"),
                            "synthetic",
                        ],
                        env: {
                            AVESD_TEST_PROBE_TRACE: trace,
                            AVESD_TEST_PROBE_FAIL: fail ? "1" : "0",
                        },
                    };
                },
            },
        ];
    });
    const route = {
        providerId: "codex" as const,
        modelId: "",
        effortId: "",
    };
    const events = async () => {

        return (await readFile(trace, "utf8")).trim().split("\n")
            .map(line => {

                return JSON.parse(line) as {
                    method: string;
                    model: string;
                    effort: string;
                    mcpCount?: number;
                };
            });
    };
    try {
        expect(await models.probe(route, false)).toMatchObject({
            ok: true,
            tested: false,
            options: {
                defaultModelId: "fast",
                modelId: "fast",
                efforts: [{ id: "medium" }],
            },
        });
        expect(await models.probe({
            ...route,
            modelId: "deep",
        }, false)).toMatchObject({
            ok: true,
            options: {
                defaultModelId: "fast",
                modelId: "deep",
                efforts: [
                    { id: "medium" },
                    { id: "high" },
                ],
            },
        });
        expect((await events()).some(event => {

            return event.method === "session/prompt";
        })).toBe(false);
        expect(await models.probe({
            ...route,
            modelId: "deep",
            effortId: "high",
        }, true)).toMatchObject({
            ok: true,
            tested: true,
            options: {
                modelId: "deep",
                effortId: "high",
            },
        });
        expect((await events()).filter(event => {

            return event.method === "session/prompt";
        })).toEqual([
            {
                method: "session/prompt",
                model: "deep",
                effort: "high",
            },
        ]);
        expect((await events()).filter(event => {

            return event.method === "session/new";
        }).every(event => {

            return event.mcpCount === 0;
        })).toBe(true);
        expect(await models.probe({
            ...route,
            modelId: "missing",
        }, true)).toMatchObject({
            ok: false,
            message: expect.stringContaining("no longer offered"),
        });
        expect(await models.probe({
            ...route,
            effortId: "high",
        }, true)).toMatchObject({
            ok: false,
            message: expect.stringContaining("effort is unavailable"),
        });
        fail = true;
        expect(await models.probe(route, true)).toMatchObject({
            ok: false,
            message: expect.stringContaining("test request failed"),
        });
        fail = false;
        expect(await models.probe(route, true)).toMatchObject({
            ok: true,
            tested: true,
        });
        expect(await readdir(runtime)).toEqual([]);
        models.dispose();
        expect(await models.probe(route, false)).toMatchObject({ ok: false });
    } finally {
        models.dispose(); await rm(directory, {
            recursive: true,
            force: true,
        });
    }
});

it("validates configuration probes at the boundary", () => {

    expect(parseAgentRoute({
        providerId: "codex",
        modelId: " deep ",
        effortId: "",
    })).toEqual({
        providerId: "codex",
        modelId: "deep",
        effortId: "",
    });
    for (const route of [
        null,
        "codex",
        {
            providerId: "shell",
            modelId: "",
            effortId: "",
        },
        {
            providerId: "codex",
            modelId: 1,
            effortId: "",
        },
    ]) {
        expect(() => {

            return parseAgentRoute(route);
        }).toThrow("Invalid agent tier route");
    }
});
