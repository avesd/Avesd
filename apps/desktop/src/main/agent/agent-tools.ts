/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Agent Tools
 */

import { draftContentSchema, draftIdSchema, revisionSchema } from "../plugins/local-plugin-contract";
import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod";

export interface AgentToolResult {
    readonly content: ({
        type: "text";
        text: string;
    } | {
        type: "image";
        data: string;
        mimeType: "image/png";
    })[];
    readonly isError?: boolean;
}

export const agentToolDefinitions = {
    avesd_list_resources: {
        description: "List intentionally published resource metadata and explicit grants in the active workspace. Returns no storage paths, file contents or SQL rows.",
        schema: z.strictObject({}),
    },
    avesd_set_resource_access: {
        description: "Explicitly grant or revoke access to one published resource for one installed plugin in the active workspace. Use only after the user authorizes the resource, recipient and read/read-write access; never grant automatically based on discovered metadata. Access applies to the entire file/database and all instances of that plugin in this workspace. Set none to revoke; later calls through existing facades will fail.",
        schema: z.strictObject({
            resourceId: z.string().min(1)
                .max(128),
            pluginId: z.string().min(1)
                .max(128),
            access: z.enum([
                "read",
                "read-write",
                "none",
            ]),
        }),
    },
    avesd_query_workspace: {
        description: "Read workspace directory metadata, dashboards in a workspace, or the current selection. Does not switch dashboards or expose their contents.",
        schema: z.object({
            type: z.enum([
                "workspaces",
                "dashboards",
                "current",
            ]),
            workspaceId: z.string().optional(),
        }),
    },
    avesd_manage_workspace: {
        description: "Create, rename, delete, or select local workspaces and dashboards. Deletion removes owned content. Switching ends this Agent session; continue from the floating Agent in the selected dashboard.",
        schema: z.object({
            type: z.enum([
                "select",
                "create",
                "rename",
                "delete",
                "createWorkspace",
                "renameWorkspace",
                "deleteWorkspace",
            ]),
            workspaceId: z.string().optional(),
            dashboardId: z.string().optional(),
            name: z.string().optional(),
        }),
    },
    avesd_inspect_dashboard: {
        description: "Inspect the current dashboard, the authoritative live widget catalog contributed by installed plugins, and visible data sources. Call this before designing or changing a dashboard: reuse a catalog widget type by adding an instance and configuring its bindings. Create a plugin draft only when no available type can provide the requested reusable capability.",
        schema: z.object({}),
    },
    avesd_add_widget: {
        description: "Create one instance of a widget type from the inspected installed-plugin catalog on the active dashboard. This creates dashboard layout state; it does not create or modify a plugin.",
        schema: z.object({
            pluginId: z.string(),
            widgetTypeId: z.string(),
            configuration: z.record(z.string(), z.unknown()).optional(),
        }),
    },
    avesd_move_widget: {
        description: "Move a widget on the dashboard grid.",
        schema: z.object({
            id: z.string(),
            x: z.number().int()
                .min(0)
                .max(23),
            y: z.number().int()
                .min(0),
        }),
    },
    avesd_resize_widget: {
        description: "Resize a widget to an allowed size.",
        schema: z.object({
            id: z.string(),
            width: z.number().int()
                .min(1)
                .max(24),
            height: z.number().int()
                .min(1),
        }),
    },
    avesd_remove_widget: {
        description: "Remove a widget from the dashboard.",
        schema: z.object({ id: z.string() }),
    },
    avesd_create_data_source: {
        description: "Create an available local data source.",
        schema: z.object({
            name: z.string().min(1),
            pluginId: z.string(),
            scope: z.enum([
                "workspace",
                "dashboard",
            ]),
            sourceTypeId: z.string(),
        }),
    },
    avesd_bind_widget_input: {
        description: "Bind a visible compatible source to an input, or omit dataSourceId to disconnect it.",
        schema: z.object({
            widgetId: z.string(),
            inputId: z.string(),
            dataSourceId: z.string().optional(),
        }),
    },
    avesd_update_data_source: {
        description: "Update the JSON value of a visible source.",
        schema: z.object({
            dataSourceId: z.string(),
            // MCP arguments arrive over JSON-RPC, so every representable value is already JSON-safe.
            // z.json() emits a recursive $ref schema, which some OpenCode providers reject.
            value: z.unknown().describe("Any JSON value."),
        }),
    },
    avesd_get_widget_sdk: {
        description: "Read the local widget authoring contract, restrictions, workflow, and a working counter example. Start here before writing a plugin.",
        schema: z.object({}),
    },
    avesd_create_plugin_draft: {
        description: "Create a local single-widget plugin draft with JavaScript source and declarative interaction tests. Does not install or execute it.",
        schema: draftContentSchema,
    },
    avesd_read_plugin_draft: {
        description: "Read a plugin draft's manifest, source, tests, and current revision.",
        schema: z.object({ draftId: draftIdSchema }),
    },
    avesd_write_plugin_draft: {
        description: "Replace the draft contents at an expected revision. Invalidates earlier test results.",
        schema: draftContentSchema.extend({
            draftId: draftIdSchema,
            expectedRevision: revisionSchema,
        }),
    },
    avesd_test_plugin: {
        description: "Run this exact draft revision in an isolated browser with fixed lifecycle checks and declared interaction tests. Returns a report and a rendered image when available.",
        schema: z.object({
            draftId: draftIdSchema,
            revision: revisionSchema,
        }),
    },
    avesd_preview_widget: {
        description: "Open an isolated preview of this draft revision and return its rendered image. Does not install the plugin or alter the dashboard.",
        schema: z.object({
            draftId: draftIdSchema,
            revision: revisionSchema,
        }),
    },
    avesd_activate_plugin: {
        description: "Install exactly the draft revision that passed tests in this application session. Updates the live widget catalog; then use avesd_add_widget.",
        schema: z.object({
            draftId: draftIdSchema,
            revision: revisionSchema,
        }),
    },
} as const;

export const agentToolNames = Object.keys(agentToolDefinitions);

export function createAgentMcpServer(invoke: (name: string, input: unknown) => Promise<AgentToolResult>): McpServer {

    const server = new McpServer({
        name: "avesd-workspace",
        version: "0.2.0",
    });
    for (const [
        name,
        definition,
    ] of Object.entries(agentToolDefinitions)) {
        server.registerTool(name, {
            description: definition.description,
            inputSchema: definition.schema,
        }, async (input: unknown) => {

            return { ...await invoke(name, input) };
        });
    }

    return server;
}
