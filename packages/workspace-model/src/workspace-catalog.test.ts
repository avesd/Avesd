/**
 * @author Avesd
 * @package Workspace Model
 * @namespace Root
 * @description Workspace Catalog Test
 */

import { readWorkspaceCatalog } from "./workspace-catalog";
import { navigateWorkspace } from "./workspace-navigation";
import { expect, it } from "vitest";

it("queries another workspace without switching and returns only independent metadata projections", async () => {
    let sequence = 0;
    const createId = () => {
        return `synthetic-${++sequence}`;
    };
    const first = await navigateWorkspace(undefined, { type: "inspect" }, createId);
    const second = await navigateWorkspace(first.snapshot, {
        type: "createWorkspace",
        name: "Second",
    }, createId);
    const dashboard = first.snapshot.dashboards[0]!;
    const snapshot = {
        ...second.snapshot,
        dashboards: second.snapshot.dashboards.map((item) => {
            return {
                ...item,
                viewState: { syntheticPrivate: "hidden" },
            };
        }),
    };
    const result = readWorkspaceCatalog(snapshot, {
        type: "dashboards",
        workspaceId: first.state.scope.workspaceId,
    });
    expect(result).toEqual([
        {
            id: dashboard.id,
            workspaceId: dashboard.workspaceId,
            name: dashboard.name,
        },
    ]);
    expect(readWorkspaceCatalog(snapshot, { type: "current" })).toEqual(second.state.scope);
    expect(result).not.toContainEqual(expect.objectContaining({ viewState: expect.anything() }));
    expect(readWorkspaceCatalog(snapshot, { type: "workspaces" })).toEqual(second.snapshot.workspaces);
    expect(readWorkspaceCatalog(snapshot, { type: "workspaces" })).not.toBe(snapshot.workspaces);
});
