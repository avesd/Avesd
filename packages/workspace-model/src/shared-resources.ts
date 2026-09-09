/**
 * @author Avesd
 * @package Workspace Model
 * @namespace Root
 * @description Shared Resources
 */

import type { PluginDatabase } from "./plugin-storage";
import type { JsonObject } from "./workspace-model";

export type ResourceAccess = "read" | "read-write";
export type ResourceKind = "file" | "sqlite";
/** Compatibility is an exact contract ID/version match. Schema is descriptive, not executable. */
export interface ResourceContract {
    readonly id: string;
    readonly version: number;
    readonly schema: JsonObject;
}
export interface ResourcePublication {
    readonly key: string;
    readonly name: string;
    readonly kind: ResourceKind;
    readonly path: string;
    readonly contract: ResourceContract;
}
/** Public metadata never includes a storage path, file contents, SQL rows, or other recipients. */
export interface SharedResource {
    readonly id: string;
    readonly key: string;
    readonly name: string;
    readonly kind: ResourceKind;
    readonly publisherPluginId: string;
    readonly contract: ResourceContract;
    readonly access: ResourceAccess | "none";
}
export interface ResourceQuery {
    readonly kind?: ResourceKind;
    readonly contractId?: string;
    readonly version?: number;
}
export interface SharedFile {
    read(): Promise<Uint8Array>;
    readText(): Promise<string>;
    write(value: string | Uint8Array): Promise<void>;
}
export interface PluginResourceService {
    publish(publication: ResourcePublication): Promise<SharedResource>;
    unpublish(resourceId: string): Promise<void>;
    list(query?: ResourceQuery): Promise<readonly SharedResource[]>;
    openFile(resourceId: string): Promise<SharedFile>;
    openDatabase(resourceId: string): Promise<PluginDatabase>;
    /** Directory/access invalidation only, not data-change notification. */
    subscribe(listener: () => void): () => void;
}

export interface ResourceIdentity {
    readonly workspaceId: string;
    readonly pluginId: string;
}
export interface ResourceRecord extends Omit<SharedResource, "access"> {
    readonly workspaceId: string;
    readonly path: string;
    readonly grants: readonly {
        readonly pluginId: string;
        readonly access: ResourceAccess;
    }[];
}
export function resourceAccess(resource: ResourceRecord, caller: ResourceIdentity): ResourceAccess | "none" {

    if (resource.workspaceId !== caller.workspaceId) {
        return "none";
    }
    if (resource.publisherPluginId === caller.pluginId) {
        return "read-write";
    }

    return resource.grants.find(grant => {

        return grant.pluginId === caller.pluginId;
    })?.access ?? "none";
}
export function describeResource(resource: ResourceRecord, caller: ResourceIdentity): SharedResource {

    return {
        id: resource.id,
        key: resource.key,
        name: resource.name,
        kind: resource.kind,
        publisherPluginId: resource.publisherPluginId,
        contract: resource.contract,
        access: resourceAccess(resource, caller),
    };
}
