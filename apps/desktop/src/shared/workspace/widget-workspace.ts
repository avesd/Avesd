/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Widget Workspace
 */

import type { PluginStorageRequest, PluginStorageResult } from "../storage/plugin-storage";
import { parsePluginStorageRequest } from "../storage/plugin-storage";
import { createResourceServices } from "../storage/resource-services";
import type { ResourceRequest, ResourceResult } from "../storage/shared-resources";
import { parseResourceRequest } from "../storage/shared-resources";
import { parseWorkspaceNavigation } from "./workspace-navigation";
import type { PluginFileEntry, SqlMutationResult, SqlValue } from "@avesd/workspace-model";
import type { WidgetWorkspaceCapability, WidgetWorkspaceServices } from "@avesd/workspace-model";
import type { DashboardScope, DashboardSummary, WidgetInstanceId, Workspace, WorkspaceCatalogQuery, WorkspaceCatalogResult, WorkspaceNavigationCommand } from "@avesd/workspace-model";

export const widgetWorkspaceChannels = {
    invoke: "widget-workspace:invoke",
    renderer: "widget-workspace:renderer",
    changed: "widget-workspace:changed",
} as const;
export interface WidgetWorkspaceIdentity extends DashboardScope {
    readonly instanceId: WidgetInstanceId;
    readonly capabilities: readonly WidgetWorkspaceCapability[];
}
export type WidgetWorkspaceRequest = ResourceRequest | PluginStorageRequest | WorkspaceCatalogQuery | {
    readonly type: "command";
    readonly command: Exclude<WorkspaceNavigationCommand, {
        type: "inspect";
    }>;
};
export type WidgetWorkspaceResult = ResourceResult | PluginStorageResult | WorkspaceCatalogResult | void;
export interface DesktopWidgetWorkspaceApi {
    invoke(instanceId: WidgetInstanceId, request: WidgetWorkspaceRequest): Promise<WidgetWorkspaceResult>;
    subscribe(listener: () => void): () => void;
}

export interface WidgetWorkspaceTransport {
    invoke(request: WidgetWorkspaceRequest): Promise<WidgetWorkspaceResult>;
    subscribe(listener: () => void): () => void;
}

export function parseWidgetWorkspaceRequest(input: unknown): WidgetWorkspaceRequest {
    if (!input || typeof input !== "object") {
        throw new Error("Invalid widget workspace request.");
    }
    const request = input as Record<string, unknown>;
    if (request.type === "resources") {
        return parseResourceRequest(input);
    }
    if (request.type === "files" || request.type === "sqlite") {
        return parsePluginStorageRequest(input);
    }
    if (request.type === "workspaces" || request.type === "current") {
        return { type: request.type };
    }
    if (request.type === "dashboards" && typeof request.workspaceId === "string" && request.workspaceId.trim() && request.workspaceId.length <= 128) {
        return {
            type: request.type,
            workspaceId: request.workspaceId as DashboardScope["workspaceId"],
        };
    }
    if (request.type === "command") {
        const command = parseWorkspaceNavigation(request.command);
        if (command.type !== "inspect") {
            return {
                type: request.type,
                command,
            };
        }
    }
    throw new Error("Invalid widget workspace request.");
}

export function requiredWorkspaceCapability(request: WidgetWorkspaceRequest): WidgetWorkspaceCapability {
    if (request.type === "files" || request.type === "sqlite" || request.type === "resources") {
        return request.type;
    }
    if (request.type === "command") {
        return request.command.type === "select" ? "navigation" : "management";
    }
    return request.type === "current" ? "navigation" : "catalog";
}

/** Fixed methods only; transports authenticate the caller independently of arguments. */
export function createWidgetWorkspaceServices(capabilities: readonly WidgetWorkspaceCapability[], transport: WidgetWorkspaceTransport): WidgetWorkspaceServices {
    return {
        resources: capabilities.includes("resources") ? createResourceServices(transport) : undefined,
        files: capabilities.includes("files") ? {
            read: path => {
                return transport.invoke({
                    type: "files",
                    operation: "read",
                    path,
                }) as Promise<Uint8Array>;
            },
            readText: async path => {
                return new TextDecoder().decode(await transport.invoke({
                    type: "files",
                    operation: "read",
                    path,
                }) as Uint8Array);
            },
            write: async (path, value) => {
                await transport.invoke({
                    type: "files",
                    operation: "write",
                    path,
                    value: typeof value === "string" ? new TextEncoder().encode(value) : value,
                });
            },
            list: (path = "") => {
                return transport.invoke({
                    type: "files",
                    operation: "list",
                    path,
                }) as Promise<readonly PluginFileEntry[]>;
            },
            remove: async path => {
                await transport.invoke({
                    type: "files",
                    operation: "remove",
                    path,
                });
            },
        } : undefined,
        sqlite: capabilities.includes("sqlite") ? {
            async open(path) {
                await transport.invoke({
                    type: "sqlite",
                    operation: "open",
                    path,
                });
                return {
                    query: (sql, parameters = []) => {
                        return transport.invoke({
                            type: "sqlite",
                            operation: "query",
                            path,
                            statement: {
                                sql,
                                parameters,
                            },
                        }) as Promise<readonly Readonly<Record<string, SqlValue>>[]>;
                    },
                    execute: (sql, parameters = []) => {
                        return transport.invoke({
                            type: "sqlite",
                            operation: "execute",
                            path,
                            statement: {
                                sql,
                                parameters,
                            },
                        }) as Promise<SqlMutationResult>;
                    },
                    transaction: statements => {
                        return transport.invoke({
                            type: "sqlite",
                            operation: "transaction",
                            path,
                            statements,
                        }) as Promise<readonly SqlMutationResult[]>;
                    },
                };
            },
        } : undefined,
        catalog: capabilities.includes("catalog") ? {
            listWorkspaces: () => {
                return transport.invoke({ type: "workspaces" }) as Promise<readonly Workspace[]>;
            },
            listDashboards: (workspaceId) => {
                return transport.invoke({
                    type: "dashboards",
                    workspaceId,
                }) as Promise<readonly DashboardSummary[]>;
            },
            subscribe: transport.subscribe,
        } : undefined,
        navigation: capabilities.includes("navigation") ? {
            getCurrent: () => {
                return transport.invoke({ type: "current" }) as Promise<DashboardScope>;
            },
            select: async (scope) => {
                await transport.invoke({
                    type: "command",
                    command: {
                        type: "select",
                        scope,
                    },
                });
            },
            subscribe: transport.subscribe,
        } : undefined,
        management: capabilities.includes("management") ? {
            execute: async (command) => {
                await transport.invoke({
                    type: "command",
                    command,
                });
            },
        } : undefined,
    };
}
