import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { WorkspaceFile } from "./workspace-file";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) =>
    rm(path, { force: true, recursive: true }),
  ));
});

describe("WorkspaceFile", () => {
  it("atomically round-trips a private JSON snapshot", async () => {
    const directory = await mkdtemp(join(tmpdir(), "avesd-workspace-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "nested", "workspace.json");
    const file = new WorkspaceFile(path);
    const snapshot = {
      dashboards: [],
      dataSources: [],
      version: 1 as const,
      widgets: [],
      workspaces: [],
    };

    await expect(file.load()).resolves.toBeUndefined();
    await file.save(snapshot);

    await expect(file.load()).resolves.toEqual(snapshot);
    await expect(readFile(path, "utf8")).resolves.toContain('"version":1');
  });
});
