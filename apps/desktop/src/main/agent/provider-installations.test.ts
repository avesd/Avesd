/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Provider Installations Test
 */

import { probeCli, resolveUserExecutable } from "./provider-detection";
import { ProviderInstallations } from "./provider-installations";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";

it("persists provider configuration independently of installation state and refreshes a new installation", async () => {
    const directory = await mkdtemp(join(tmpdir(), "avesd-installations-"));
    const path = join(directory, "settings.json");
    let installed = false;
    const manager = new ProviderInstallations(path, async (_command, configuredPath) => {
        return installed
            ? {
                status: "installed",
                resolvedPath: configuredPath || "/synthetic/cli",
                version: "1.2.3",
            }
            : { status: "not-found" };
    });
    try {
        await manager.refresh();
        expect(manager.list().every(provider => {
            return provider.status === "not-found";
        })).toBe(true);
        await expect(manager.executable("opencode")).rejects.toThrow("unavailable");
        expect(() => {
            return manager.configure("injected", {
                enabled: true,
                executablePath: "",
            });
        }).toThrow("Unknown");
        expect(() => {
            return manager.configure("codex", {
                enabled: true,
                executablePath: "codex; echo unsafe",
            });
        }).toThrow("absolute");
        await manager.configure("opencode", {
            enabled: false,
            executablePath: join(directory, "Open Code"),
        });
        installed = true;
        await manager.refresh();
        expect(manager.list().find(provider => {
            return provider.id === "opencode";
        })).toMatchObject({
            enabled: false,
            status: "installed",
            version: "1.2.3",
        });
        await expect(manager.executable("opencode")).rejects.toThrow("disabled");
        const reopened = await ProviderInstallations.open(path);
        expect(reopened.list().find(provider => {
            return provider.id === "opencode";
        })).toMatchObject({
            enabled: false,
            executablePath: join(directory, "Open Code"),
            status: "checking",
        });
        await manager.configure("opencode", {
            enabled: true,
            executablePath: "",
        });
        await expect(manager.executable("opencode")).resolves.toBe("/synthetic/cli");
    } finally {
        await rm(directory, {
            recursive: true,
            force: true,
        });
    }
});

it.skipIf(process.platform === "win32")("probes an exact executable path without shell expansion and distinguishes missing and broken binaries", async () => {
    const directory = await mkdtemp(join(tmpdir(), "avesd-cli-probe-"));
    const cli = join(directory, "synthetic cli; literal");
    try {
        await writeFile(cli, '#!/bin/sh\nprintf "Synthetic CLI 1.2.3\\n"\n');
        await chmod(cli, 0o700);
        expect(await probeCli("unused", cli)).toEqual({
            status: "installed",
            resolvedPath: cli,
            version: "1.2.3",
        });
        expect(await resolveUserExecutable("unused", join(directory, "missing"))).toBeUndefined();
        expect(await probeCli("unused", join(directory, "missing"))).toMatchObject({ status: "not-found" });
        await writeFile(cli, "#!/bin/sh\nexit 1\n");
        expect(await probeCli("unused", cli)).toMatchObject({
            status: "error",
            resolvedPath: cli,
        });
    } finally {
        await rm(directory, {
            recursive: true,
            force: true,
        });
    }
});
