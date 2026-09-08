import { describe, expect, it } from "vitest";

import { PersistentWorkspaceRepository } from "./persistent-workspace-repository";
import type { WorkspacePersistenceDriver } from "./persistent-workspace-repository";
import type { WorkspaceId, WorkspaceSnapshot } from "./workspace-model";

describe("PersistentWorkspaceRepository", () => {
  it("serializes refresh with mutations and restores stored data after a rejected save", async () => {
    let stored: WorkspaceSnapshot | undefined;
    let rejectSave = false;
    const repository = await PersistentWorkspaceRepository.open({
      async load() { return structuredClone(stored); },
      async save(snapshot, expected) {
        expect(expected?.snapshot).toEqual(stored);
        if (rejectSave) throw new Error("Conflict");
        stored = structuredClone(snapshot);
      },
    });
    await Promise.all([
      repository.createWorkspace({ id: "first" as WorkspaceId, name: "First" }),
      repository.refresh(),
      repository.createWorkspace({ id: "second" as WorkspaceId, name: "Second" }),
    ]);
    expect(await repository.listWorkspaces()).toHaveLength(2);
    rejectSave = true;
    await expect(repository.createWorkspace({ id: "rejected" as WorkspaceId, name: "Rejected" })).rejects.toThrow("Conflict");
    expect(await repository.listWorkspaces()).toHaveLength(2);
  });

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
