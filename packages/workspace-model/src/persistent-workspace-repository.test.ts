import { describe, expect, it } from "vitest";

import { PersistentWorkspaceRepository } from "./persistent-workspace-repository";
import type { WorkspacePersistenceDriver } from "./persistent-workspace-repository";
import type { WorkspaceId, WorkspaceSnapshot } from "./workspace-model";

describe("PersistentWorkspaceRepository", () => {
  it("hydrates a saved snapshot and persists later mutations", async () => {
    let stored: WorkspaceSnapshot | undefined;
    const driver: WorkspacePersistenceDriver = {
      async load() {
        return stored;
      },
      async save(snapshot) {
        stored = structuredClone(snapshot);
      },
    };
    const workspaceId = "persisted" as WorkspaceId;
    const first = await PersistentWorkspaceRepository.open(driver);
    await first.createWorkspace({ id: workspaceId, name: "Persisted" });

    const reopened = await PersistentWorkspaceRepository.open(driver);

    await expect(reopened.listWorkspaces()).resolves.toEqual([
      { id: workspaceId, name: "Persisted" },
    ]);
    expect(stored?.version).toBe(1);
  });
});
