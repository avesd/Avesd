/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Resource Services
 */

import type { WidgetWorkspaceTransport } from "../workspace/widget-workspace";
import type { PluginResourceService, SharedResource, SqlMutationResult, SqlValue } from "@avesd/workspace-model";

export function createResourceServices(transport: WidgetWorkspaceTransport): PluginResourceService {

    return {
        publish: publication => {

            return transport.invoke({
                type: "resources",
                operation: "publish",
                publication,
            }) as Promise<SharedResource>;
        },
        unpublish: async resourceId => {

            await transport.invoke({
                type: "resources",
                operation: "unpublish",
                resourceId,
            });
        },
        list: (query = {}) => {

            return transport.invoke({
                type: "resources",
                operation: "list",
                query,
            }) as Promise<readonly SharedResource[]>;
        },
        subscribe: transport.subscribe,
        async openFile(resourceId) {

            await transport.invoke({
                type: "resources",
                operation: "open",
                resourceId,
                kind: "file",
            });
            const read = () => {

                return transport.invoke({
                    type: "resources",
                    operation: "access",
                    resourceId,
                    request: {
                        type: "files",
                        operation: "read",
                    },
                }) as Promise<Uint8Array>;
            };

            return {
                read,
                readText: async () => {

                    return new TextDecoder().decode(await read());
                },
                write: async value => {

                    await transport.invoke({
                        type: "resources",
                        operation: "access",
                        resourceId,
                        request: {
                            type: "files",
                            operation: "write",
                            value: typeof value === "string" ? new TextEncoder().encode(value) : value,
                        },
                    });
                },
            };
        },
        async openDatabase(resourceId) {

            await transport.invoke({
                type: "resources",
                operation: "open",
                resourceId,
                kind: "sqlite",
            });

            return {
                query: (sql, parameters = []) => {

                    return transport.invoke({
                        type: "resources",
                        operation: "access",
                        resourceId,
                        request: {
                            type: "sqlite",
                            operation: "query",
                            statement: {
                                sql,
                                parameters,
                            },
                        },
                    }) as Promise<readonly Readonly<Record<string, SqlValue>>[]>;
                },
                execute: (sql, parameters = []) => {

                    return transport.invoke({
                        type: "resources",
                        operation: "access",
                        resourceId,
                        request: {
                            type: "sqlite",
                            operation: "execute",
                            statement: {
                                sql,
                                parameters,
                            },
                        },
                    }) as Promise<SqlMutationResult>;
                },
                transaction: statements => {

                    return transport.invoke({
                        type: "resources",
                        operation: "access",
                        resourceId,
                        request: {
                            type: "sqlite",
                            operation: "transaction",
                            statements,
                        },
                    }) as Promise<readonly SqlMutationResult[]>;
                },
            };
        },
    };
}
