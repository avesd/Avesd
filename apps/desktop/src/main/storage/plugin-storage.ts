/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Plugin Storage
 */

import type { PluginStorageRequest, PluginStorageResult } from "../../shared/storage/plugin-storage";
import { MAX_FILE_BYTES, parsePluginStorageRequest } from "../../shared/storage/plugin-storage";
import { pluginSqliteWorker } from "./plugin-sqlite-worker";
import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, realpath, rename, unlink } from "node:fs/promises";
import { join } from "node:path";

const sqliteProcesses = new Set<ChildProcess>();
export function closePluginStorageProcesses(): void {

    for (const child of sqliteProcesses) {child.kill("SIGKILL");}
}
process.once("exit", closePluginStorageProcesses);

interface StorageIdentity {
    readonly workspaceId: string;
    readonly pluginId: string;
}
const hash = (value: string) => {

    return createHash("sha256").update(value)
        .digest("hex");
};
const missing = (error: unknown) => {

    return !!error && typeof error === "object" && "code" in error && error.code === "ENOENT";
};

/** The configured data directory is trusted; every component beneath it is host-owned. */
export class PluginStorage {
    #queue: Promise<unknown> = Promise.resolve();
    constructor(private readonly dataDirectory: string) {}

    invoke(identity: StorageIdentity, input: PluginStorageRequest, isActive: () => boolean): Promise<PluginStorageResult> {

        const request = parsePluginStorageRequest(input);
        const work = this.#queue.then(async () => {

            const active = () => {

                if (!isActive()) {
                    throw new Error("Storage context is no longer active.");
                }
            };
            active();
            try {
                const root = await this.#root(identity, request.type);
                active();
                if (request.type === "sqlite") {
                    const path = join(root, request.path);
                    for (const suffix of [
                        "",
                        "-journal",
                        "-wal",
                        "-shm",
                    ]) {await this.#checkFile(path + suffix);}
                    active();

                    return await this.#sqlite(path, request, isActive);
                }
                const parts = request.path.split("/").filter(Boolean);
                let parent = root;
                const directories = request.operation === "list" ? parts : parts.slice(0, -1);
                for (const part of directories) {parent = await this.#directory(parent, part, request.operation === "write");}
                active();
                if (request.operation === "list") {
                    const entries = await readdir(parent, { withFileTypes: true });
                    if (entries.length > 1000) {
                        throw new Error("Directory entry limit exceeded.");
                    }

                    return entries.filter(entry => {

                        return !entry.name.startsWith(".avesd-") && (entry.isFile() || entry.isDirectory());
                    })
                        .map(entry => {

                            return {
                                name: entry.name,
                                kind: entry.isDirectory() ? "directory" as const : "file" as const,
                            };
                        });
                }
                const path = join(parent, parts.at(-1)!);
                await this.#checkFile(path);
                active();
                if (request.operation === "remove") {
                    await unlink(path);

                    return;
                }
                if (request.operation === "write") {
                    const temporary = join(parent, `.avesd-${randomUUID()}`);
                    const file = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
                    try {
                        await file.writeFile(request.value);
                        await file.sync();
                        active();
                        await rename(temporary, path);
                    } finally {
                        await file.close();
                        await unlink(temporary).catch(() => {
                        });
                    }

                    return;
                }
                const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
                try {
                    const stat = await file.stat();
                    if (!stat.isFile() || stat.nlink !== 1 || stat.size > MAX_FILE_BYTES) {
                        throw new Error("File limit exceeded.");
                    }
                    const buffer = Buffer.alloc(MAX_FILE_BYTES + 1);
                    let count = 0;
                    while (count < buffer.length) {
                        const { bytesRead } = await file.read(buffer, count, buffer.length - count, null);
                        if (!bytesRead) {
                            break;
                        }
                        count += bytesRead;
                    }
                    if (count > MAX_FILE_BYTES) {
                        throw new Error("File limit exceeded.");
                    }
                    active();

                    return new Uint8Array(buffer.subarray(0, count));
                } finally { await file.close(); }
            } catch (error) {

                if (!isActive()) {
                    throw new Error("Storage context is no longer active.");
                }
                if (missing(error)) {
                    throw new Error("Storage entry was not found.");
                }
                throw new Error("Storage operation failed or was denied.");

            }
        });
        this.#queue = work.catch(() => {

            return undefined;
        });

        return work;
    }

    async #root(identity: StorageIdentity, kind: "files" | "sqlite"): Promise<string> {

        let root = await realpath(this.dataDirectory);
        for (const part of [
            "plugin-storage-v1",
            hash(identity.workspaceId),
            hash(identity.pluginId),
            kind,
        ]) {root = await this.#directory(root, part, true);}

        return root;
    }
    async #directory(parent: string, name: string, create: boolean): Promise<string> {

        const path = join(parent, name);
        if (create) {
            await mkdir(path, { mode: 0o700 }).catch(error => {

                if (!(error && typeof error === "object" && "code" in error && error.code === "EEXIST")) {
                    throw error;
                }
            });
        }
        const stat = await lstat(path);
        if (!stat.isDirectory() || stat.isSymbolicLink()) {
            throw new Error("Unsafe storage directory.");
        }

        return path;
    }
    async #checkFile(path: string): Promise<void> {

        const stat = await lstat(path).catch(error => {

            if (!missing(error)) {
                throw error;
            }
        });
        if (stat && (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1)) {
            throw new Error("Unsafe storage file.");
        }
    }
    #sqlite(path: string, request: PluginStorageRequest, isActive: () => boolean): Promise<PluginStorageResult> {

        return new Promise((resolve, reject) => {

            const worker = spawn(process.execPath, [
                "--max-old-space-size=64",
                "-e",
                pluginSqliteWorker,
            ], {
                env: {
                    ...process.env,
                    ELECTRON_RUN_AS_NODE: "1",
                },
                stdio: [
                    "ignore",
                    "ignore",
                    "ignore",
                    "ipc",
                ],
                serialization: "advanced",
            });
            sqliteProcesses.add(worker);
            worker.once("close", () => {

                return sqliteProcesses.delete(worker);
            });
            let settled = false;
            const finish = (ok: boolean, value?: PluginStorageResult) => {

                if (settled) {
                    return;
                }
                settled = true;
                clearTimeout(timeout); clearInterval(revocation);
                worker.once("close", () => {

                    if (ok && isActive()) {
                        resolve(value);
                    }
                    else {
                        reject(new Error("SQLite operation failed, exceeded a limit, or was denied."));
                    }
                });
                worker.kill("SIGKILL");
            };
            const timeout = setTimeout(() => {

                return void finish(false);
            }, 2000);
            const revocation = setInterval(() => {

                if (!isActive()) {
                    finish(false);
                }
            }, 25);
            worker.once("message", (message: {
                ok: boolean;
                value?: PluginStorageResult;
            }) => {

                return void finish(message.ok, message.value);
            });
            worker.once("error", () => {

                return void finish(false);
            });
            worker.once("exit", () => {

                if (!settled) {
                    finish(false);
                }
            });
            worker.send({
                path,
                request,
            }, error => {

                if (error) {
                    finish(false);
                }
            });
        });
    }
}
