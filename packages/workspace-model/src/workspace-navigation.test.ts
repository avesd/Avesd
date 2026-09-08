/**
 * @author Avesd
 * @package Workspace Model
 * @namespace Root
 * @description Workspace Navigation Test
 */

import { InMemoryWorkspaceRepository } from "./in-memory-workspace-repository";
import type { DashboardId, DataSourceId, WidgetInstanceId, WorkspaceId, WorkspaceSnapshot } from "./workspace-model";
import { navigateWorkspace } from "./workspace-navigation";
import { parseWorkspaceSnapshot } from "./workspace-snapshot";
import { expect, it } from "vitest";

let sequence = 0;
const id = () => {
    return `synthetic-${++sequence}`;
};
const initialize = () => {
    return navigateWorkspace(undefined, { type: "inspect" }, id);
};

it("restores existing identities and selects a dashboard from legacy v1 data", async () => {
    const first = await initialize();
    const legacy = { ...first.snapshot };
    delete legacy.selection;
    const restored = await navigateWorkspace(legacy, { type: "inspect" }, id);
    expect(restored.state.scope).toEqual(first.state.scope);
    expect(restored.snapshot.workspaces).toEqual(legacy.workspaces);
    expect(restored.snapshot.dashboards).toEqual(legacy.dashboards);
    expect(parseWorkspaceSnapshot(restored.snapshot)).toEqual(restored.snapshot);
});

it("creates, renames and selects dashboards without changing their identity or layout", async () => {
    const first = await initialize();
    const created = await navigateWorkspace(first.snapshot, {
        type: "create",
        workspaceId: first.state.scope.workspaceId,
        name: "  Focus  ",
    }, id);
    expect(created.state.dashboards).toHaveLength(2);
    const renamed = await navigateWorkspace(created.snapshot, {
        type: "rename",
        scope: created.state.scope,
        name: "Planning",
    }, id);
    expect(renamed.state.dashboards[1]).toMatchObject({
        id: created.state.scope.dashboardId,
        name: "Planning",
        layoutRevision: 0,
    });
    const selected = await navigateWorkspace(renamed.snapshot, {
        type: "select",
        scope: first.state.scope,
    }, id);
    expect(selected.snapshot.selection).toEqual(first.state.scope);
    expect(selected.snapshot.dashboards).toEqual(renamed.snapshot.dashboards);
    const repository = new InMemoryWorkspaceRepository(selected.snapshot);
    expect((await repository.snapshot()).selection).toEqual(first.state.scope);
});

it("atomically deletes private content and selects a sibling while preserving shared workspace data", async () => {
    const first = await initialize();
    const created = await navigateWorkspace(first.snapshot, {
        type: "create",
        workspaceId: first.state.scope.workspaceId,
        name: "Disposable",
    }, id);
    const repository = new InMemoryWorkspaceRepository(created.snapshot);
    const source = {
        configuration: {},
        dataType: "number",
        name: "Synthetic",
        pluginId: "synthetic.plugin",
        sourceTypeId: "number",
        value: 0,
    };
    await repository.createDataSource({
        kind: "workspace",
        workspaceId: first.state.scope.workspaceId,
    }, {
        ...source,
        id: "shared" as DataSourceId,
    });
    await repository.createDataSource({
        ...created.state.scope,
        kind: "dashboard",
    }, {
        ...source,
        id: "private" as DataSourceId,
    });
    await repository.writeDashboardLayout(created.state.scope, 0, [
        {
            ...created.state.scope,
            id: "widget" as WidgetInstanceId,
            pluginId: "synthetic.plugin",
            widgetTypeId: "test",
            placement: {
                x: 0,
                y: 0,
                width: 6,
                height: 4,
            },
            bindings: {},
            configuration: {},
            configurationVersion: 1,
        },
    ]);
    const removed = await navigateWorkspace(await repository.snapshot(), {
        type: "delete",
        scope: created.state.scope,
    }, id);
    expect(removed.snapshot.selection).toEqual(first.state.scope);
    expect(removed.snapshot.widgets).toHaveLength(0);
    expect(removed.snapshot.dataSources.map((item) => {
        return item.id;
    })).toEqual(["shared"]);
    expect(parseWorkspaceSnapshot(removed.snapshot)).toEqual(removed.snapshot);
    await expect(navigateWorkspace(removed.snapshot, {
        type: "delete",
        scope: first.state.scope,
    }, id)).rejects.toThrow("at least one");
});

it("supports explicit workspace selection and rejects mismatched dashboard ownership", async () => {
    const first = await initialize();
    const repository = new InMemoryWorkspaceRepository(first.snapshot);
    const other = {
        workspaceId: "other-workspace" as WorkspaceId,
        dashboardId: "other-dashboard" as DashboardId,
    };
    await repository.createWorkspace({
        id: other.workspaceId,
        name: "Other synthetic workspace",
    });
    await repository.createDashboard(other, {
        id: other.dashboardId,
        name: "Other overview",
        viewState: {},
    });
    const switched = await navigateWorkspace(await repository.snapshot(), {
        type: "select",
        scope: other,
    }, id);
    expect(switched.state.scope).toEqual(other);
    expect(switched.state.dashboards.map((item) => {
        return item.id;
    })).toEqual([other.dashboardId]);
    await expect(navigateWorkspace(switched.snapshot, {
        type: "select",
        scope: {
            ...other,
            dashboardId: first.state.scope.dashboardId,
        },
    }, id)).rejects.toMatchObject({ code: "scope-mismatch" });
    await expect(navigateWorkspace(switched.snapshot, {
        type: "rename",
        scope: other,
        name: "  ",
    }, id)).rejects.toThrow("dashboard name");
});

it("initializes an existing empty workspace and rejects invalid persisted selections", async () => {
    const input: WorkspaceSnapshot = {
        version: 1,
        workspaces: [
            {
                id: "existing" as WorkspaceId,
                name: "Existing",
            },
        ],
        dashboards: [],
        widgets: [],
        dataSources: [],
    };
    const initialized = await navigateWorkspace(input, { type: "inspect" }, id);
    expect(initialized.state.scope.workspaceId).toBe("existing");
    expect(initialized.snapshot.dashboards).toHaveLength(1);
    expect(() => {
        return parseWorkspaceSnapshot({
            ...initialized.snapshot,
            selection: {
                ...initialized.state.scope,
                dashboardId: "missing",
            },
        });
    }).toThrow("dashboard ownership");
});

it("creates, renames and deletes workspaces with atomic selection and owned-data cleanup", async () => {
    const first = await initialize();
    const created = await navigateWorkspace(first.snapshot, {
        type: "createWorkspace",
        name: "  Studio  ",
    }, id);
    expect(created.snapshot.workspaces).toHaveLength(2);
    expect(created.state.scope.workspaceId).not.toBe(first.state.scope.workspaceId);
    const renamed = await navigateWorkspace(created.snapshot, {
        type: "renameWorkspace",
        workspaceId: created.state.scope.workspaceId,
        name: "Projects",
    }, id);
    expect(renamed.state.workspaces[1]).toEqual({
        id: created.state.scope.workspaceId,
        name: "Projects",
    });
    expect(renamed.state.scope).toEqual(created.state.scope);
    const repository = new InMemoryWorkspaceRepository(renamed.snapshot);
    await repository.createDataSource({
        kind: "workspace",
        workspaceId: created.state.scope.workspaceId,
    }, {
        id: "owned" as DataSourceId,
        configuration: {},
        dataType: "number",
        name: "Synthetic",
        pluginId: "synthetic",
        sourceTypeId: "number",
        value: 0,
    });
    const deleted = await navigateWorkspace(await repository.snapshot(), {
        type: "deleteWorkspace",
        workspaceId: created.state.scope.workspaceId,
    }, id);
    expect(deleted.snapshot).toEqual(first.snapshot);
    await expect(navigateWorkspace(deleted.snapshot, {
        type: "deleteWorkspace",
        workspaceId: first.state.scope.workspaceId,
    }, id)).rejects.toThrow("at least one workspace");
});
