/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Shared Resources
 */

import type { PluginStorageRequest, PluginStorageResult } from "./plugin-storage";
import { parsePluginStorageRequest, storagePath } from "./plugin-storage";
import type { ResourcePublication, ResourceQuery, SharedResource } from "@avesd/workspace-model";

type WithoutPath<T> = T extends {
    readonly path: string;
} ? Omit<T, "path"> : never;
export type SharedStorageRequest = WithoutPath<PluginStorageRequest>;
export type ResourceRequest =
  | {
      readonly type: "resources";
      readonly operation: "publish";
      readonly publication: ResourcePublication;
  }
  | {
      readonly type: "resources";
      readonly operation: "list";
      readonly query: ResourceQuery;
  }
  | {
      readonly type: "resources";
      readonly operation: "unpublish";
      readonly resourceId: string;
  }
  | {
      readonly type: "resources";
      readonly operation: "open";
      readonly resourceId: string;
      readonly kind: "file" | "sqlite";
  }
  | {
      readonly type: "resources";
      readonly operation: "access";
      readonly resourceId: string;
      readonly request: SharedStorageRequest;
  };
export type ResourceResult = PluginStorageResult | SharedResource | readonly SharedResource[];

const record = (input: unknown): Record<string, unknown> => {

    if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw new Error("Invalid resource request.");
    }

    return input as Record<string, unknown>;
};
const label = (value: unknown, limit: number): string => {

    if (typeof value !== "string" || !value.trim() || value.length > limit) {
        throw new Error("Invalid resource metadata.");
    }

    return value;
};
const version = (value: unknown): number => {

    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
        throw new Error("Invalid contract version.");
    }

    return value;
};
export function parsePublication(input: unknown): ResourcePublication {

    const value = record(input);
    if (value.kind !== "file" && value.kind !== "sqlite") {
        throw new Error("Invalid resource kind.");
    }
    const path = storagePath(value.path);
    if (value.kind === "sqlite" && (path.includes("/") || !path.endsWith(".sqlite"))) {
        throw new Error("Invalid database name.");
    }
    const contract = record(value.contract);
    const schema = record(contract.schema);
    // Use JSON round-trip only after verifying JSON values; never silently coerce unsupported values.
    const validate = (item: unknown, depth: number): void => {

        if (depth > 16) {
            throw new Error("Contract schema is too deep.");
        }
        if (item === null || typeof item === "string" || typeof item === "boolean" || typeof item === "number" && Number.isFinite(item)) {
            return;
        }
        if (Array.isArray(item)) {
            for (const child of item) {validate(child, depth + 1);}

            return;
        }
        if (item && typeof item === "object" && Object.getPrototypeOf(item) === Object.prototype) {
            for (const child of Object.values(item)) {validate(child, depth + 1);}

            return;
        }
        throw new Error("Invalid contract schema.");
    };
    validate(schema, 0);
    const serialized = JSON.stringify(schema);
    if (new TextEncoder().encode(serialized).byteLength > 16_384) {
        throw new Error("Contract schema is too large.");
    }

    return {
        key: label(value.key, 80),
        name: label(value.name, 120),
        kind: value.kind,
        path,
        contract: {
            id: label(contract.id, 160),
            version: version(contract.version),
            schema: JSON.parse(serialized) as ResourcePublication["contract"]["schema"],
        },
    };
}
export function parseResourceQuery(input: unknown): ResourceQuery {

    const value = record(input ?? {});
    if (value.kind !== undefined && value.kind !== "file" && value.kind !== "sqlite") {
        throw new Error("Invalid resource kind.");
    }

    return {
        kind: value.kind,
        contractId: value.contractId === undefined ? undefined : label(value.contractId, 160),
        version: value.version === undefined ? undefined : version(value.version),
    };
}
export function parseResourceRequest(input: unknown): ResourceRequest {

    const value = record(input);
    if (value.type !== "resources") {
        throw new Error("Invalid resource request.");
    }
    if (value.operation === "publish") {
        return {
            type: "resources",
            operation: "publish",
            publication: parsePublication(value.publication),
        };
    }
    if (value.operation === "list") {
        return {
            type: "resources",
            operation: "list",
            query: parseResourceQuery(value.query),
        };
    }
    const resourceId = label(value.resourceId, 128);
    if (value.operation === "unpublish") {
        return {
            type: "resources",
            operation: "unpublish",
            resourceId,
        };
    }
    if (value.operation === "open" && (value.kind === "file" || value.kind === "sqlite")) {
        return {
            type: "resources",
            operation: "open",
            resourceId,
            kind: value.kind,
        };
    }
    if (value.operation === "access") {
        const nested = record(value.request);
        // The caller never chooses a publisher path. Reject rather than silently accept a forged locator.
        if ("path" in nested) {
            throw new Error("Shared access cannot specify a storage path.");
        }
        const request = parsePluginStorageRequest({
            ...nested,
            path: nested.type === "sqlite" ? "resource.sqlite" : "resource",
        });
        if (request.operation === "open" || request.operation === "list" || request.operation === "remove") {
            throw new Error("Unsupported shared operation.");
        }
        const access = Object.fromEntries(Object.entries(request).filter(([key]) => {

            return key !== "path";
        })) as SharedStorageRequest;

        return {
            type: "resources",
            operation: "access",
            resourceId,
            request: access,
        };
    }
    throw new Error("Invalid resource request.");
}
