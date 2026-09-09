/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Shared Resources
 */

import type { ResourceRequest, ResourceResult } from "../../shared/storage/shared-resources";
import { parsePublication, parseResourceRequest } from "../../shared/storage/shared-resources";
import type { PluginStorage } from "./plugin-storage";
import type { ResourceAccess, ResourceIdentity, ResourceRecord, SharedResource } from "@avesd/workspace-model";
import { describeResource, resourceAccess } from "@avesd/workspace-model";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface ResourceDirectoryStorage {
    load(): Promise<unknown>;
    save(resources: readonly ResourceRecord[]): Promise<void>;
}
export function resourceDirectoryFile(path: string): ResourceDirectoryStorage {
    return {
        async load() {
            try { return JSON.parse(await readFile(path, "utf8")) as unknown; }
            catch (error) {
                if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
                    return undefined;
                }
                // Deliberately omit private filesystem causes from IPC and host error logs.
                return Promise.reject(new Error("Resource directory could not be loaded."));
            }
        },
        async save(resources) {
            await mkdir(dirname(path), {
                recursive: true,
                mode: 0o700,
            });
            const temporary = `${path}.${randomUUID()}.tmp`;
            try {
                await writeFile(temporary, JSON.stringify({
                    version: 1,
                    resources,
                }), {
                    encoding: "utf8",
                    mode: 0o600,
                });
                await rename(temporary, path);
            } finally {
                await unlink(temporary).catch(() => {
                });
            }
        },
    };
}
const identifier = (input: unknown): string => {
    if (typeof input !== "string" || !input.trim() || input.length > 128) {
        throw new Error("Invalid resource directory identity.");
    }
    return input;
};
const grantAccess = (input: unknown): ResourceAccess => {
    if (input !== "read" && input !== "read-write") {
        throw new Error("Invalid resource grant.");
    }
    return input;
};
function parseRecords(input: unknown): readonly ResourceRecord[] {
    if (input === undefined) {
        return [];
    }
    if (!input || typeof input !== "object" || !("version" in input) || input.version !== 1 || !("resources" in input) || !Array.isArray(input.resources) || input.resources.length > 4096) {
        throw new Error("Invalid resource directory.");
    }
    const ids = new Set<string>();
    const keys = new Set<string>();
    return input.resources.map((value: unknown) => {
        if (!value || typeof value !== "object") {
            throw new Error("Invalid resource record.");
        }
        const item = value as Record<string, unknown>;
        const publication = parsePublication(item);
        const id = identifier(item.id);
        const workspaceId = identifier(item.workspaceId);
        const publisherPluginId = identifier(item.publisherPluginId);
        const key = JSON.stringify([
            workspaceId,
            publisherPluginId,
            publication.key,
        ]);
        if (ids.has(id) || keys.has(key) || !Array.isArray(item.grants) || item.grants.length > 256) {
            throw new Error("Invalid resource grants or duplicate resource.");
        }
        ids.add(id); keys.add(key);
        const recipients = new Set<string>();
        const grants = item.grants.map((input: unknown) => {
            if (!input || typeof input !== "object" || !("pluginId" in input) || !("access" in input)) {
                throw new Error("Invalid resource grant.");
            }
            const pluginId = identifier(input.pluginId);
            const access = grantAccess(input.access);
            if (recipients.has(pluginId) || pluginId === publisherPluginId) {
                throw new Error("Invalid resource grant.");
            }
            recipients.add(pluginId);
            return {
                pluginId,
                access,
            };
        });
        return {
            ...publication,
            id,
            workspaceId,
            publisherPluginId,
            grants,
        };
    });
}

/** Host-only authority. Plugin RPC intentionally contains no grant or revoke operation. */
export class SharedResources {
    #queue: Promise<unknown> = Promise.resolve();
    constructor(
        private readonly directory: ResourceDirectoryStorage, private readonly storage: PluginStorage,
        private readonly changed: () => void = () => {
        },
    ) {}

    invoke(caller: ResourceIdentity, input: ResourceRequest, isActive: () => boolean): Promise<ResourceResult> {
        const request = parseResourceRequest(input);
        return this.#serial(async () => {
            const active = () => {
                if (!isActive()) {
                    throw new Error("Resource context is no longer active.");
                }
            };
            active();
            const records = parseRecords(await this.directory.load());
            active();
            if (request.operation === "list") {
                const query = request.query;
                return records.filter(record => {
                    return record.workspaceId === caller.workspaceId
          && (!query.kind || record.kind === query.kind) && (!query.contractId || record.contract.id === query.contractId)
          && (!query.version || record.contract.version === query.version);
                }).map(record => {
                    return describeResource(record, caller);
                });
            }
            if (request.operation === "publish") {
                const publication = request.publication;
                const existing = records.find(record => {
                    return record.workspaceId === caller.workspaceId && record.publisherPluginId === caller.pluginId && record.key === publication.key;
                });
                if (existing) {
                    if (existing.path !== publication.path || existing.kind !== publication.kind || existing.name !== publication.name || JSON.stringify(existing.contract) !== JSON.stringify(publication.contract)) {
                        throw new Error("Publication is immutable; unpublish it before changing its source or contract.");
                    }
                    return describeResource(existing, caller);
                }
                await this.#verifySource(caller, publication.kind, publication.path, isActive);
                active();
                if (records.length >= 4096) {
                    throw new Error("Resource directory limit reached.");
                }
                const published: ResourceRecord = {
                    ...publication,
                    id: randomUUID(),
                    workspaceId: caller.workspaceId,
                    publisherPluginId: caller.pluginId,
                    grants: [],
                };
                await this.#save([
                    ...records,
                    published,
                ]);
                return describeResource(published, caller);
            }
            const resource = records.find(record => {
                return record.id === request.resourceId && record.workspaceId === caller.workspaceId;
            });
            if (!resource) {
                throw new Error("Resource is unavailable.");
            }
            if (request.operation === "unpublish") {
                if (resource.publisherPluginId !== caller.pluginId) {
                    throw new Error("Only the publisher can unpublish this resource.");
                }
                await this.#save(records.filter(record => {
                    return record !== resource;
                }));
                return;
            }
            const access = resourceAccess(resource, caller);
            if (access === "none") {
                throw new Error("Resource access was not granted.");
            }
            const publisher = {
                workspaceId: caller.workspaceId,
                pluginId: resource.publisherPluginId,
            };
            if (request.operation === "open") {
                if (request.kind !== resource.kind) {
                    throw new Error("Resource kind does not match.");
                }
                await this.#verifySource(publisher, resource.kind, resource.path, isActive);
                return describeResource(resource, caller);
            }
            const operation = request.request;
            if ((resource.kind === "file" ? "files" : "sqlite") !== operation.type) {
                throw new Error("Resource kind does not match.");
            }
            if (access !== "read-write" && operation.operation !== "read" && operation.operation !== "query") {
                throw new Error("Resource is read-only.");
            }
            return this.storage.invoke(publisher, {
                ...operation,
                path: resource.path,
            }, isActive);
        });
    }

    /** Exposes only public metadata and explicit recipients to the trusted workspace Agent. */
    listForHost(workspaceId: string): Promise<readonly (SharedResource & {
        readonly grants: ResourceRecord["grants"];
    })[]> {
        return this.#serial(async () => {
            return parseRecords(await this.directory.load()).filter(record => {
                return record.workspaceId === workspaceId;
            })
                .map(record => {
                    return {
                        ...describeResource(record, {
                            workspaceId,
                            pluginId: record.publisherPluginId,
                        }),
                        grants: record.grants,
                    };
                });
        });
    }
    grant(workspaceId: string, resourceId: string, pluginId: string, access: ResourceAccess | "none"): Promise<void> {
        identifier(workspaceId); identifier(resourceId); identifier(pluginId);
        // This persisted-data boundary validates values supplied outside TypeScript.
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (access !== "read" && access !== "read-write" && access !== "none") {
            return Promise.reject(new Error("Invalid resource access."));
        }
        return this.#serial(async () => {
            const records = parseRecords(await this.directory.load());
            const resource = records.find(record => {
                return record.workspaceId === workspaceId && record.id === resourceId;
            });
            if (!resource || resource.publisherPluginId === pluginId) {
                throw new Error("Resource or recipient is unavailable.");
            }
            const grants = [
                ...resource.grants.filter(grant => {
                    return grant.pluginId !== pluginId;
                }),
                ...(access === "none" ? [] : [
                    {
                        pluginId,
                        access,
                    },
                ]),
            ];
            if (grants.length > 256) {
                throw new Error("Resource grant limit reached.");
            }
            await this.#save(records.map(record => {
                return record === resource ? {
                    ...record,
                    grants,
                } : record;
            }));
        });
    }
    async #verifySource(caller: ResourceIdentity, kind: "file" | "sqlite", path: string, isActive: () => boolean): Promise<void> {
        await this.storage.invoke(caller, kind === "file" ? {
            type: "files",
            operation: "read",
            path,
        }
            : {
                type: "sqlite",
                operation: "query",
                path,
                statement: { sql: "SELECT 1" },
            }, isActive);
    }
    async #save(records: readonly ResourceRecord[]): Promise<void> {
        try { await this.directory.save(records); }
        catch { throw new Error("Resource directory could not be saved."); }
        this.changed();
    }
    #serial<T>(work: () => Promise<T>): Promise<T> {
        const pending = this.#queue.then(work); this.#queue = pending.catch(() => {
            return undefined;
        }); return pending;
    }
}
