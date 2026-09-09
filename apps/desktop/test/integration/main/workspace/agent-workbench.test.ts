/**
 * @author Avesd
 * @package Desktop
 * @namespace TestIntegrationMainWorkspace
 * @description Agent Workbench Test
 */

import type { AgentToolResult } from "../../../../src/main/agent/agent-tools";
import { counterExample } from "../../../../src/main/plugins/local-plugin-contract";
import { LocalPluginStore } from "../../../../src/main/plugins/local-plugin-store";
import { WorkspaceFile } from "../../../../src/main/storage/workspace-file";
import { AgentWorkbench } from "../../../../src/main/workspace/agent-workbench";
import type { LocalPluginDraft } from "../../../../src/shared/plugins/local-plugins";
import type { DashboardId, WorkspaceId } from "@avesd/workspace-model";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";

const directories: string[] = [];
afterEach(async () => {

    await Promise.all(directories.splice(0).map((directory) => {

        return rm(directory, {
            recursive: true,
            force: true,
        });
    }));
});
const textResult = (result: AgentToolResult): unknown => {

    return JSON.parse(result.content.find((item) => {

        return item.type === "text";
    })!.text);
};

it("exposes installed types immediately and protects agent writes against stale renderer saves", async () => {

    const directory = await mkdtemp(join(tmpdir(), "avesd-agent-workbench-")); directories.push(directory);
    const file = new WorkspaceFile(join(directory, "workspace.json"));
    const scope = {
        workspaceId: "test-workspace" as WorkspaceId,
        dashboardId: "test-dashboard" as DashboardId,
    };
    await file.save({
        version: 1,
        workspaces: [
            {
                id: scope.workspaceId,
                name: "Test",
            },
        ],
        dashboards: [
            {
                id: scope.dashboardId,
                workspaceId: scope.workspaceId,
                name: "Test",
                layoutRevision: 0,
                viewState: {},
            },
        ],
        widgets: [],
        dataSources: [],
    });
    const changed = vi.fn();
    const pluginsChanged = vi.fn();
    const workbench = new AgentWorkbench(file, new LocalPluginStore(join(directory, "plugins")), {
        async test(draft) {

            return {
                report: {
                    draftId: draft.id,
                    revision: draft.revision,
                    passed: true,
                    checks: [],
                },
            };
        },
        async preview() {

            return "synthetic-image";
        },
    }, changed, pluginsChanged);
    workbench.configure({
        widgetDefinitions: [],
        dataSourceDefinitions: [],
    });
    await workbench.navigate({ type: "inspect" });
    await expect(workbench.agentContext()).resolves.toEqual({
        workspaceName: "Test",
        dashboardName: "Test",
    });
    changed.mockClear();
    const draft = textResult(await workbench.invoke("avesd_create_plugin_draft", counterExample)) as LocalPluginDraft;
    await workbench.invoke("avesd_test_plugin", {
        draftId: draft.id,
        revision: draft.revision,
    });
    await workbench.invoke("avesd_activate_plugin", {
        draftId: draft.id,
        revision: draft.revision,
    });
    expect(pluginsChanged).toHaveBeenCalledOnce();
    const inspection = textResult(await workbench.invoke("avesd_inspect_dashboard", {})) as {
        availableWidgetTypes: {
            pluginId: string;
        }[];
    };
    expect(inspection.availableWidgetTypes[0]?.pluginId).toBe(counterExample.manifest.id);
    const before = await file.load();
    await Promise.all([
        1,
        2,
    ].map(() => {

        return workbench.invoke("avesd_add_widget", {
            pluginId: counterExample.manifest.id,
            widgetTypeId: "counter",
        });
    }));
    expect((await file.load())?.widgets).toHaveLength(2);
    await expect(workbench.save(before!, { snapshot: before })).rejects.toThrow("Workspace changed");
    expect((await file.load())?.widgets).toHaveLength(2);
    expect(changed).toHaveBeenCalledTimes(2);
});

it.each([
    "avesd_test_plugin",
    "avesd_preview_widget",
] as const)(
    "%s releases writes and rejects results if the draft changes during execution",
    async (tool) => {

        const directory = await mkdtemp(join(tmpdir(), "avesd-agent-concurrency-"));
        directories.push(directory);
        const file = new WorkspaceFile(join(directory, "workspace.json"));
        const initial = {
            version: 1 as const,
            workspaces: [],
            dashboards: [],
            widgets: [],
            dataSources: [],
        };
        await file.save(initial);
        const plugins = new LocalPluginStore(join(directory, "plugins"));
        const started = gate();
        const finish = gate();
        const changed = vi.fn();
        const workbench = new AgentWorkbench(file, plugins, {
            async test(draft) {

                started.resolve();
                await finish.promise;

                return {
                    report: {
                        draftId: draft.id,
                        revision: draft.revision,
                        passed: true,
                        checks: [],
                    },
                };
            },
            async preview() {

                started.resolve(); await finish.promise;

                return "synthetic-image";
            },
        }, changed, vi.fn());
        const draft = await plugins.create(counterExample);
        const execution = workbench.invoke(tool, {
            draftId: draft.id,
            revision: draft.revision,
        });
        const outcome = execution.catch((error: unknown) => {

            return error;
        });
        await started.promise;
        try {
            let saved = false;
            const save = workbench.save(initial, { snapshot: initial }).then(() => {

                saved = true;
            });
            await vi.waitFor(() => {

                return void expect(saved).toBe(true);
            });
            await save;
            expect(changed).toHaveBeenCalledOnce();
            let edited = false;
            const write = workbench.invoke("avesd_write_plugin_draft", {
                ...counterExample,
                source: `${counterExample.source}\n// Revised during execution.`,
                draftId: draft.id,
                expectedRevision: draft.revision,
            }).then(() => {

                edited = true;
            });
            await vi.waitFor(() => {

                return void expect(edited).toBe(true);
            });
            await write;
        } finally {
            finish.resolve();
            await outcome;
        }
        expect(await outcome).toBeInstanceOf(Error);
        expect((await outcome as Error).message).toContain("Draft changed");
        const current = await plugins.read(draft.id);
        await expect(workbench.invoke("avesd_activate_plugin", {
            draftId: draft.id,
            revision: current.revision,
        })).rejects.toThrow("passing tests");
        await workbench.invoke("avesd_test_plugin", {
            draftId: draft.id,
            revision: current.revision,
        });
        await expect(workbench.invoke("avesd_activate_plugin", {
            draftId: draft.id,
            revision: current.revision,
        })).resolves.toBeDefined();
    },
);

it("serializes native runner jobs and recovers after a failed execution", async () => {

    const directory = await mkdtemp(join(tmpdir(), "avesd-agent-runner-"));
    directories.push(directory);
    const plugins = new LocalPluginStore(join(directory, "plugins"));
    const started = gate();
    const finish = gate();
    const preview = vi.fn(async () => {

        return "synthetic-image";
    });
    const workbench = new AgentWorkbench(new WorkspaceFile(join(directory, "workspace.json")), plugins, {
        async test() {

            started.resolve(); await finish.promise; throw new Error("Runner failed");
        },
        preview,
    }, vi.fn(), vi.fn());
    const draft = await plugins.create(counterExample);
    const command = {
        draftId: draft.id,
        revision: draft.revision,
    };
    const test = workbench.invoke("avesd_test_plugin", command).catch((error: unknown) => {

        return error;
    });
    await started.promise;
    const next = workbench.invoke("avesd_preview_widget", command);
    await workbench.save({
        version: 1,
        workspaces: [],
        dashboards: [],
        widgets: [],
        dataSources: [],
    });
    expect(preview).not.toHaveBeenCalled();
    finish.resolve();
    expect(await test).toBeInstanceOf(Error);
    await expect(next).resolves.toBeDefined();
    expect(preview).toHaveBeenCalledOnce();
});

function gate(): {
    promise: Promise<void>;
    resolve: () => void;
} {

    let resolve!: () => void;
    const promise = new Promise<void>((done) => {

        resolve = done;
    });

    return {
        promise,
        resolve,
    };
}

it("commits selection with dashboards, rejects queued old-scope tools, and preserves state on save failure", async () => {

    const directory = await mkdtemp(join(tmpdir(), "avesd-navigation-"));
    directories.push(directory);
    const file = new WorkspaceFile(join(directory, "workspace.json"));
    const scopeChanged = vi.fn();
    const workbench = new AgentWorkbench(file, new LocalPluginStore(join(directory, "plugins")), {
        async test(draft) {

            return {
                report: {
                    draftId: draft.id,
                    revision: draft.revision,
                    passed: true,
                    checks: [],
                },
            };
        },
        async preview() {

            return "synthetic-image";
        },
    }, vi.fn(), vi.fn(), scopeChanged);
    workbench.configure({
        dataSourceDefinitions: [],
        widgetDefinitions: [],
    });
    const first = await workbench.navigate({ type: "inspect" });
    const original = await file.load();
    const creating = workbench.navigate({
        type: "create",
        workspaceId: first.scope.workspaceId,
        name: "Focus",
    });
    const staleTool = workbench.invoke("avesd_inspect_dashboard", {}).catch((error: unknown) => {

        return error;
    });
    const second = await creating;
    expect((await staleTool as Error).message).toContain("dashboard changed");
    const inspection = textResult(await workbench.invoke("avesd_inspect_dashboard", {})) as {
        layout: {
            dashboardId: string;
        };
    };
    expect(inspection.layout.dashboardId).toBe(second.scope.dashboardId);
    await expect(workbench.invoke("avesd_inspect_dashboard", {}, first.scope)).rejects.toThrow("Return to this session's dashboard");
    await expect(workbench.invoke("avesd_inspect_dashboard", {}, second.scope)).resolves.toBeDefined();
    expect((await file.load())?.selection).toEqual(second.scope);
    await expect(workbench.save(original!, { snapshot: original })).rejects.toThrow("workspace navigation");
    const beforeFailure = await file.load();
    const save = vi.spyOn(file, "save").mockRejectedValueOnce(new Error("Synthetic disk failure"));
    await expect(workbench.navigate({
        type: "select",
        scope: first.scope,
    })).rejects.toThrow("disk failure");
    save.mockRestore();
    expect(await file.load()).toEqual(beforeFailure);
    expect(scopeChanged).toHaveBeenCalledTimes(2);
    const reopened = await workbench.navigate({ type: "inspect" });
    expect(reopened.scope).toEqual(second.scope);
});

it("authorizes widget capabilities inside the transaction queue and rejects disposed or stale callers", async () => {

    const directory = await mkdtemp(join(tmpdir(), "avesd-widget-services-")); directories.push(directory);
    const file = new WorkspaceFile(join(directory, "workspace.json"));
    const store = new LocalPluginStore(join(directory, "plugins"));
    const workbench = new AgentWorkbench(file, store, {
        async test(draft) {

            return {
                report: {
                    draftId: draft.id,
                    revision: draft.revision,
                    passed: true,
                    checks: [],
                },
            };
        },
        async preview() {

            return "synthetic-image";
        },
    }, () => {
    }, () => {
    });
    workbench.configure({
        widgetDefinitions: [],
        dataSourceDefinitions: [],
    });
    const first = await workbench.navigate({ type: "inspect" });
    const content = {
        ...counterExample,
        manifest: {
            ...counterExample.manifest,
            capabilities: ["catalog" as const],
        },
    };
    const draft = await store.create(content);
    store.record({
        draftId: draft.id,
        revision: draft.revision,
        passed: true,
        checks: [],
    });
    await store.activate(draft.id, draft.revision);
    await workbench.invoke("avesd_add_widget", {
        pluginId: draft.manifest.id,
        widgetTypeId: draft.manifest.widgetTypeId,
    });
    const widgetId = (await file.load())!.widgets[0]!.id;
    await expect(workbench.invokeWidget(widgetId, { type: "workspaces" })).resolves.toEqual(first.workspaces);
    await expect(workbench.invokeWidget(widgetId, { type: "current" })).rejects.toThrow("not granted");
    await expect(workbench.invokeWidget(widgetId, {
        type: "command",
        command: {
            type: "deleteWorkspace",
            workspaceId: first.scope.workspaceId,
        },
    })).rejects.toThrow("not granted");
    await expect(workbench.invokeWidget(widgetId, { type: "workspaces" }, () => {

        return false;
    })).rejects.toThrow("no longer active");
    const switching = workbench.navigate({
        type: "createWorkspace",
        name: "Second",
    });
    const stale = workbench.invokeWidget(widgetId, { type: "workspaces" });
    const rejected = expect(stale).rejects.toThrow("no longer active");
    const second = await switching;
    await rejected;
    await workbench.navigate({
        type: "select",
        scope: first.scope,
    });
    await expect(workbench.invokeWidget(widgetId, {
        type: "dashboards",
        workspaceId: second.scope.workspaceId,
    }))
        .resolves.toEqual(second.dashboards.map(({ id, name, workspaceId }) => {

            return {
                id,
                name,
                workspaceId,
            };
        }));
    const before = await file.load();
    await expect(workbench.invokeWidget(widgetId, {
        type: "command",
        command: {
            type: "select",
            scope: second.scope,
        },
    })).rejects.toThrow("not granted");
    expect(await file.load()).toEqual(before);
});
