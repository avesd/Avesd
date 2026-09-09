/**
 * @author Avesd
 * @package Desktop
 * @namespace TestIntegrationMainStorage
 * @description Shared Resources Test
 */

import { PluginStorage } from "../../../../src/main/storage/plugin-storage";
import { resourceDirectoryFile, SharedResources } from "../../../../src/main/storage/shared-resources";
import { createResourceServices } from "../../../../src/shared/storage/resource-services";
import { parseResourceRequest } from "../../../../src/shared/storage/shared-resources";
import type { ResourcePublication, ResourceRecord, SharedResource } from "@avesd/workspace-model";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";

const directories: string[] = [];
afterEach(async () => {

    await Promise.all(directories.splice(0).map(path => {

        return rm(path, {
            recursive: true,
            force: true,
        });
    }));
});
const producer = {
    workspaceId: "synthetic-workspace",
    pluginId: "avesd.local.producer",
};
const consumer = {
    ...producer,
    pluginId: "avesd.local.consumer",
};
const publication: ResourcePublication = {
    key: "tasks",
    name: "Synthetic tasks",
    kind: "file",
    path: "private/tasks.json",
    contract: {
        id: "example.tasks",
        version: 1,
        schema: { type: "array" },
    },
};
const setup = async () => {

    const directory = await mkdtemp(join(tmpdir(), "avesd-shared-test-")); directories.push(directory);
    const storage = new PluginStorage(directory);
    const path = join(directory, "resources.json");
    const changed = vi.fn();
    const resources = new SharedResources(resourceDirectoryFile(path), storage, changed);
    const client = (identity = consumer) => {

        return createResourceServices({
            invoke: request => {

                if (request.type !== "resources") {
                    throw new Error("Unexpected transport request.");
                }

                return resources.invoke(identity, request, () => {

                    return true;
                });
            },
            subscribe: () => {

                return () => {
                };
            },
        });
    };
    await storage.invoke(producer, {
        type: "files",
        operation: "write",
        path: publication.path,
        value: new TextEncoder().encode('[{"synthetic":true}]'),
    }, () => {

        return true;
    });

    return {
        resources,
        storage,
        path,
        directory,
        changed,
        publisher: client(producer),
        reader: client(),
    };
};

it("publishes metadata without contents and persists explicit read/write grants", async () => {

    const { resources, path, storage, publisher, reader } = await setup();
    const published = await publisher.publish(publication);
    expect((await publisher.publish(publication)).id).toBe(published.id);
    expect(await reader.list({
        contractId: "example.tasks",
        version: 2,
    })).toEqual([]);
    const listed = await reader.list({
        contractId: "example.tasks",
        version: 1,
        kind: "file",
    });
    expect(listed).toHaveLength(1);
    expect(listed[0]?.access).toBe("none");
    expect(listed[0]).not.toHaveProperty("path");
    expect(listed[0]).not.toHaveProperty("grants");
    expect(JSON.stringify(listed)).not.toContain("synthetic\":true");
    await expect(reader.openFile(published.id)).rejects.toThrow("not granted");
    await resources.grant(producer.workspaceId, published.id, consumer.pluginId, "read");
    const file = await reader.openFile(published.id);
    expect(await file.readText()).toBe('[{"synthetic":true}]');
    await expect(file.write("forbidden")).rejects.toThrow("read-only");
    const reopened = new SharedResources(resourceDirectoryFile(path), storage);
    expect(await reopened.invoke(consumer, {
        type: "resources",
        operation: "access",
        resourceId: published.id,
        request: {
            type: "files",
            operation: "read",
        },
    }, () => {

        return true;
    })).toEqual(new TextEncoder().encode('[{"synthetic":true}]'));
    await resources.grant(producer.workspaceId, published.id, consumer.pluginId, "read-write");
    await file.write("updated");
    expect(await (await publisher.openFile(published.id)).readText()).toBe("updated");
    await resources.grant(producer.workspaceId, published.id, consumer.pluginId, "none");
    await expect(file.read()).rejects.toThrow("not granted");
    await expect(file.write("forbidden")).rejects.toThrow("not granted");
});

it("blocks workspace escapes, locator forgery, kind confusion and grant laundering", async () => {

    const { resources, publisher, reader } = await setup();
    const resource = await publisher.publish(publication);
    await resources.grant(producer.workspaceId, resource.id, consumer.pluginId, "read-write");
    const foreign = {
        ...consumer,
        workspaceId: "other-workspace",
    };
    expect(await resources.invoke(foreign, {
        type: "resources",
        operation: "list",
        query: {},
    }, () => {

        return true;
    })).toEqual([]);
    await expect(resources.invoke(foreign, {
        type: "resources",
        operation: "open",
        resourceId: resource.id,
        kind: "file",
    }, () => {

        return true;
    })).rejects.toThrow("unavailable");
    await expect(resources.grant(foreign.workspaceId, resource.id, consumer.pluginId, "read")).rejects.toThrow("unavailable");
    await expect(reader.unpublish(resource.id)).rejects.toThrow("publisher");
    await expect(reader.openDatabase(resource.id)).rejects.toThrow("kind");
    expect(() => {

        return parseResourceRequest({
            type: "resources",
            operation: "grant",
            resourceId: resource.id,
            pluginId: consumer.pluginId,
            access: "read-write",
        });
    }).toThrow();
    expect(() => {

        return parseResourceRequest({
            type: "resources",
            operation: "access",
            resourceId: resource.id,
            request: {
                type: "files",
                operation: "read",
                path: "private/other",
            },
        });
    }).toThrow("path");
    expect(() => {

        return parseResourceRequest({
            type: "resources",
            operation: "access",
            resourceId: resource.id,
            request: {
                type: "files",
                operation: "remove",
            },
        });
    }).toThrow();
    await expect(publisher.publish({
        ...publication,
        path: "different",
    })).rejects.toThrow("immutable");
    await expect(publisher.publish({
        ...publication,
        contract: {
            ...publication.contract,
            version: 2,
        },
    })).rejects.toThrow("immutable");
    const old = await reader.openFile(resource.id);
    await publisher.unpublish(resource.id);
    const replacement = await publisher.publish(publication);
    expect(replacement.id).not.toBe(resource.id);
    await expect(old.read()).rejects.toThrow("unavailable");
    await expect(reader.openFile(replacement.id)).rejects.toThrow("not granted");
});

it("shares SQLite with read-only enforcement, parameterized writes, and revoked existing facades", async () => {

    const { resources, storage, publisher, reader } = await setup();
    await storage.invoke(producer, {
        type: "sqlite",
        operation: "execute",
        path: "tasks.sqlite",
        statement: { sql: "CREATE TABLE tasks (title TEXT)" },
    }, () => {

        return true;
    });
    const resource = await publisher.publish({
        ...publication,
        kind: "sqlite",
        path: "tasks.sqlite",
    });
    await resources.grant(producer.workspaceId, resource.id, consumer.pluginId, "read");
    const db = await reader.openDatabase(resource.id);
    expect(await db.query("SELECT count(*) AS count FROM tasks")).toEqual([{ count: 0 }]);
    await expect(db.execute("INSERT INTO tasks VALUES (?)", ["synthetic"])).rejects.toThrow("read-only");
    await expect(db.query("INSERT INTO tasks VALUES ('forbidden') RETURNING title")).rejects.toThrow("denied");
    await resources.grant(producer.workspaceId, resource.id, consumer.pluginId, "read-write");
    await db.transaction([
        {
            sql: "INSERT INTO tasks VALUES (?)",
            parameters: ["synthetic"],
        },
    ]);
    expect(await db.query("SELECT title FROM tasks")).toEqual([{ title: "synthetic" }]);
    await resources.grant(producer.workspaceId, resource.id, consumer.pluginId, "read");
    await expect(db.transaction([{ sql: "DELETE FROM tasks" }])).rejects.toThrow("read-only");
    await resources.grant(producer.workspaceId, resource.id, consumer.pluginId, "none");
    await expect(db.query("SELECT * FROM tasks")).rejects.toThrow("not granted");
});

it("fails closed on corrupt grants and failed persistence; refuses inactive publishers", async () => {

    const { resources, path, storage, publisher, changed } = await setup();
    const resource = await publisher.publish(publication);
    await expect(resources.invoke(producer, {
        type: "resources",
        operation: "unpublish",
        resourceId: resource.id,
    }, () => {

        return false;
    })).rejects.toThrow("no longer active");
    const records: ResourceRecord[] = [
        {
            ...publication,
            id: resource.id,
            workspaceId: producer.workspaceId,
            publisherPluginId: producer.pluginId,
            grants: [],
        },
    ];
    const failing = new SharedResources({
        load: async () => {

            return {
                version: 1,
                resources: records,
            };
        },
        save: async () => {

            throw new Error("Synthetic write failure");
        },
    }, storage, changed);
    changed.mockClear();
    await expect(failing.grant(producer.workspaceId, resource.id, consumer.pluginId, "read-write")).rejects.toThrow("could not be saved");
    const listing = await failing.invoke(consumer, {
        type: "resources",
        operation: "list",
        query: {},
    }, () => {

        return true;
    }) as SharedResource[];
    expect(listing[0]?.access).toBe("none"); expect(changed).not.toHaveBeenCalled();
    await writeFile(path, JSON.stringify({
        version: 1,
        resources: [
            {
                ...records[0],
                grants: [
                    {
                        pluginId: consumer.pluginId,
                        access: "admin",
                    },
                ],
            },
        ],
    }));
    await expect(resources.invoke(consumer, {
        type: "resources",
        operation: "list",
        query: {},
    }, () => {

        return true;
    })).rejects.toThrow("Invalid resource grant");
});
