/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Workspace File Test
 */

import { WorkspaceFile } from "./workspace-file";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const temporaryDirectories: string[] = [];

afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((path) =>
    {
        return rm(path, {
            force: true,
            recursive: true,
        });
    }));
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

it("rejects invalid snapshots before replacing a valid workspace file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "avesd-workspace-validation-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "workspace.json");
    const file = new WorkspaceFile(path);
    const snapshot = {
        version: 1 as const,
        workspaces: [],
        dashboards: [],
        widgets: [],
        dataSources: [],
    };
    await file.save(snapshot);
    const before = await readFile(path, "utf8");
    expect(() => {
        return file.save({
            ...snapshot,
            widgets: [{ id: "invalid" }],
        });
    }).toThrow("Invalid workspace data");
    expect(await readFile(path, "utf8")).toBe(before);
    await expect(file.load()).resolves.toEqual(snapshot);
});
