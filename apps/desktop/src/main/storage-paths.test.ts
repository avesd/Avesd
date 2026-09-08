import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { browserBindingFile } from "./browser-binding-file";
import { parseAppConfig } from "./app-config";
import { loadStoragePaths, resolveStoragePaths } from "./storage-paths";
import { WorkspaceFile } from "./workspace-file";

const directories: string[] = [];
const temporaryDirectory = async () => {
  const directory = await mkdtemp(join(tmpdir(), "avesd-storage-"));
  directories.push(directory);
  return directory;
};

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("desktop storage paths", () => {
  it("preserves existing workspace data when no configuration exists", async () => {
    const directory = await temporaryDirectory();
    const snapshot = { version: 1 as const, workspaces: [], dashboards: [], widgets: [], dataSources: [] };
    await new WorkspaceFile(join(directory, "workspace-v1.json")).save(snapshot);

    const paths = await loadStoragePaths(directory, directory);

    expect(paths.dataDirectory).toBe(directory);
    await expect(new WorkspaceFile(paths.workspace).load()).resolves.toEqual(snapshot);
    expect(paths.browserBindings).toBe(join(directory, "browser-bindings-v1.json"));
  });

  it("keeps bootstrap configuration separate and reopens both stores in the selected directory", async () => {
    const directory = await temporaryDirectory();
    const profile = join(directory, "profile");
    const homeDirectory = join(directory, "home");
    const dataDirectory = join(directory, "custom data", "nested");
    await mkdir(profile);
    await mkdir(join(homeDirectory, ".avesd"), { recursive: true });
    await writeFile(join(homeDirectory, ".avesd", "config.json"), JSON.stringify({ dataDirectory }));
    const legacyPath = join(profile, "workspace-v1.json");
    await writeFile(legacyPath, "legacy data remains untouched");
    const paths = await loadStoragePaths(profile, homeDirectory);
    const snapshot = { version: 1 as const, workspaces: [], dashboards: [], widgets: [], dataSources: [] };
    await new WorkspaceFile(paths.workspace).save(snapshot);
    await browserBindingFile(paths.browserBindings).save([]);

    const reopened = await loadStoragePaths(profile, homeDirectory);
    expect(reopened.dataDirectory).toBe(dataDirectory);
    await expect(new WorkspaceFile(reopened.workspace).load()).resolves.toEqual(snapshot);
    await expect(browserBindingFile(reopened.browserBindings).load()).resolves.toEqual([]);
    await expect(readFile(legacyPath, "utf8")).resolves.toBe("legacy data remains untouched");
    await expect(readFile(join(profile, "browser-bindings-v1.json"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each([null, [], "directory", { dataDirectory: "relative" }, { dataDirectory: "~/data" },
    { dataDirectory: "" }, { dataDirectory: null }, { dataDirectory: 1 }, { dataDirectory: "/bad\0path" },
    { dataDiretory: "/misspelled" }])("rejects invalid configuration without falling back: %j", (configuration) => {
    expect(() => parseAppConfig(configuration)).toThrow();
  });

  it("accepts an empty configuration as the default", () => {
    expect(resolveStoragePaths(tmpdir(), {}).workspace).toBe(join(tmpdir(), "workspace-v1.json"));
  });

  it("rejects malformed JSON without including its contents in the error", async () => {
    const directory = await temporaryDirectory();
    await mkdir(join(directory, ".avesd"));
    await writeFile(join(directory, ".avesd", "config.json"), "invalid synthetic content");
    await expect(loadStoragePaths(directory, directory)).rejects.toThrow("Avesd configuration must contain valid JSON.");
  });

  it("does not treat unreadable configuration as missing", async () => {
    const directory = await temporaryDirectory();
    await mkdir(join(directory, ".avesd", "config.json"), { recursive: true });
    await expect(loadStoragePaths(directory, directory)).rejects.toThrow("Avesd configuration could not be read.");
  });

  it("rejects a data path that is a file", async () => {
    const directory = await temporaryDirectory();
    const dataDirectory = join(directory, "file");
    await writeFile(dataDirectory, "synthetic file");
    await mkdir(join(directory, ".avesd"));
    await writeFile(join(directory, ".avesd", "config.json"), JSON.stringify({ dataDirectory }));
    await expect(loadStoragePaths(directory, directory)).rejects.toThrow("The configured data directory could not be opened or created.");
  });
});
