/**
 * @author Avesd
 * @package Desktop
 * @namespace TestIntegrationMainStorage
 * @description Plugin Storage Test
 */

import { PluginStorage } from "../../../../src/main/storage/plugin-storage";
import type { PluginStorageRequest } from "../../../../src/shared/storage/plugin-storage";
import { parsePluginStorageRequest } from "../../../../src/shared/storage/plugin-storage";
import { createHash } from "node:crypto";
import { link, mkdtemp, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";

const directories: string[] = [];
afterEach(async () => {

    await Promise.all(directories.splice(0).map(path => {

        return rm(path, {
            recursive: true,
            force: true,
        });
    }));
});
const identity = {
    workspaceId: "synthetic-workspace",
    pluginId: "avesd.local.synthetic",
};
const setup = async () => {

    const directory = await mkdtemp(join(tmpdir(), "avesd-storage-test-")); directories.push(directory);
    const storage = new PluginStorage(directory);

    return {
        directory,
        storage,
        invoke: (request: PluginStorageRequest) => {

            return storage.invoke(identity, request, () => {

                return true;
            });
        },
    };
};
const db = (sql: string, operation: "query" | "execute" = "execute"): PluginStorageRequest =>
{

    return {
        type: "sqlite",
        path: "test.sqlite",
        operation,
        statement: { sql },
    };
};

it("persists text and binary atomically and separates both identity dimensions", async () => {

    const { directory, storage, invoke } = await setup();
    await invoke({
        type: "files",
        operation: "write",
        path: "notes/example.json",
        value: new TextEncoder().encode('{"synthetic":true}'),
    });
    const read = {
        type: "files",
        operation: "read",
        path: "notes/example.json",
    } as const;
    expect(new TextDecoder().decode(await new PluginStorage(directory).invoke(identity, read, () => {

        return true;
    }) as Uint8Array)).toBe('{"synthetic":true}');
    for (const other of [
        {
            ...identity,
            workspaceId: "other",
        },
        {
            ...identity,
            pluginId: "other",
        },
    ]) {
        await expect(storage.invoke(other, read, () => {

            return true;
        })).rejects.toThrow();
    }
    await invoke({
        type: "files",
        operation: "write",
        path: read.path,
        value: new Uint8Array([
            0,
            255,
            42,
        ]),
    });
    expect(await invoke(read)).toEqual(new Uint8Array([
        0,
        255,
        42,
    ]));
    expect(await invoke({
        type: "files",
        operation: "list",
        path: "notes",
    })).toEqual([
        {
            name: "example.json",
            kind: "file",
        },
    ]);
    await invoke({
        type: "files",
        operation: "remove",
        path: read.path,
    });
    await expect(invoke(read)).rejects.toThrow("not found");
});

it("rejects traversal, malformed IPC, oversized data, links and revoked operations", async () => {

    const { storage, directory, invoke } = await setup();
    for (const path of [
        "../outside",
        "/tmp/outside",
        "a/../../b",
        "a\\b",
        "a//b",
        "a/./b",
        "file:x",
        "a\u0000b",
    ]) {
        expect(() => {

            return parsePluginStorageRequest({
                type: "files",
                operation: "read",
                path,
            });
        }).toThrow();
    }
    expect(() => {

        return parsePluginStorageRequest({
            type: "files",
            operation: "write",
            path: "large",
            value: new Uint8Array(4 * 1024 * 1024 + 1),
        });
    }).toThrow();
    await expect(storage.invoke(identity, {
        type: "files",
        operation: "write",
        path: "cancelled",
        value: new Uint8Array(),
    }, () => {

        return false;
    })).rejects.toThrow("no longer active");
    expect(await readdir(directory)).toEqual([]);
    await invoke({
        type: "files",
        operation: "write",
        path: "safe",
        value: new Uint8Array(),
    });
    const hash = (value: string) => {

        return createHash("sha256").update(value)
            .digest("hex");
    };
    const root = join(directory, "plugin-storage-v1", hash(identity.workspaceId), hash(identity.pluginId), "files");
    const external = join(directory, "outside"); await writeFile(external, "synthetic private value");
    await symlink(external, join(root, "symlink"));
    await link(external, join(root, "hardlink"));
    await symlink(directory, join(root, "linked-directory"));
    for (const path of [
        "symlink",
        "hardlink",
        "linked-directory/outside",
    ]) {
        await expect(invoke({
            type: "files",
            operation: "read",
            path,
        })).rejects.toThrow("denied");
        await expect(invoke({
            type: "files",
            operation: "write",
            path,
            value: new Uint8Array(),
        })).rejects.toThrow("denied");
    }
});

it("supports parameterized SQLite, rollback, read-only queries and restart persistence", async () => {

    const { directory, invoke, storage } = await setup();
    await invoke({
        type: "sqlite",
        operation: "open",
        path: "test.sqlite",
    });
    await invoke(db("CREATE TABLE tasks (id INTEGER PRIMARY KEY, title TEXT UNIQUE, bytes BLOB)"));
    await invoke({
        type: "sqlite",
        operation: "execute",
        path: "test.sqlite",
        statement: {
            sql: "INSERT INTO tasks (title, bytes) VALUES (?, ?)",
            parameters: [
                "synthetic ' parameter",
                new Uint8Array([
                    1,
                    2,
                    255,
                ]),
            ],
        },
    });
    await expect(invoke({
        type: "sqlite",
        operation: "transaction",
        path: "test.sqlite",
        statements: [
            {
                sql: "INSERT INTO tasks (title) VALUES (?)",
                parameters: ["rollback"],
            },
            { sql: "INSERT INTO missing_table VALUES (1)" },
        ],
    })).rejects.toThrow("denied");
    const rows = db("SELECT title, bytes FROM tasks ORDER BY id", "query");
    expect(await new PluginStorage(directory).invoke(identity, rows, () => {

        return true;
    })).toEqual([
        {
            title: "synthetic ' parameter",
            bytes: new Uint8Array([
                1,
                2,
                255,
            ]),
        },
    ]);
    await expect(invoke(db("DELETE FROM tasks RETURNING id", "query"))).rejects.toThrow("denied");
    for (const other of [
        {
            ...identity,
            workspaceId: "other",
        },
        {
            ...identity,
            pluginId: "other",
        },
    ]) {
        await expect(storage.invoke(other, rows, () => {

            return true;
        })).rejects.toThrow();
    }
    await expect(invoke({
        type: "files",
        operation: "read",
        path: "test.sqlite",
    })).rejects.toThrow("not found");
    await invoke({
        type: "sqlite",
        operation: "transaction",
        path: "test.sqlite",
        statements: [
            { sql: "INSERT INTO tasks (title) VALUES ('one')" },
            { sql: "INSERT INTO tasks (title) VALUES ('two')" },
        ],
    });
    expect(await invoke(db("SELECT count(*) AS count FROM tasks", "query"))).toEqual([{ count: 3 }]);
});

it("denies SQL filesystem escapes, multiple statements, extensions and unbounded results", async () => {

    const { invoke, directory } = await setup();
    await invoke(db("CREATE TABLE example (value TEXT)"));
    for (const sql of [
        `ATTACH DATABASE '${join(directory, "escaped.sqlite")}' AS outside`,
        `VACUUM INTO '${join(directory, "escaped.sqlite")}'`,
        "PRAGMA writable_schema=ON",
        "SELECT load_extension('external')",
        "CREATE VIRTUAL TABLE x USING fts5(value)",
        "BEGIN",
        "SAVEPOINT plugin",
        "INSERT INTO example VALUES ('hidden'); DELETE FROM example",
    ]) {await expect(invoke(db(sql))).rejects.toThrow("denied");}
    expect(await readdir(directory)).toEqual(["plugin-storage-v1"]);
    await expect(invoke(db("WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<1001) SELECT x FROM n", "query"))).rejects.toThrow("denied");
    await expect(invoke(db("WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n) SELECT sum(x) FROM n", "query"))).rejects.toThrow("denied");
    expect(await invoke(db("SELECT count(*) AS count FROM example", "query"))).toEqual([{ count: 0 }]);
}, 10_000);

it("rolls back a terminated mutation before the next read", async () => {

    const { invoke } = await setup();
    await invoke(db("CREATE TABLE events (value INTEGER)"));
    await expect(invoke({
        type: "sqlite",
        operation: "transaction",
        path: "test.sqlite",
        statements: [
            { sql: "WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<1000) INSERT INTO events SELECT zeroblob(4096) FROM n" },
            { sql: "WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n) INSERT INTO events SELECT sum(x) FROM n" },
        ],
    })).rejects.toThrow("denied");
    expect(await invoke(db("SELECT count(*) AS count FROM events", "query"))).toEqual([{ count: 0 }]);
}, 6000);
