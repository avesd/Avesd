/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Agent Workbench
 */

import { browserTaskCommandSchema } from "../../shared/browser/browser-tasks";
import type { AgentWorkbenchContext } from "../../shared/desktop-api";
import { localWidgetDefinition } from "../../shared/plugins/local-plugins";
import type { WidgetWorkspaceRequest, WidgetWorkspaceResult } from "../../shared/workspace/widget-workspace";
import { parseWidgetWorkspaceRequest } from "../../shared/workspace/widget-workspace";
import { requiredWorkspaceCapability } from "../../shared/workspace/widget-workspace";
import { parseWorkspaceNavigation } from "../../shared/workspace/workspace-navigation";
import type { AgentToolResult } from "../agent/agent-tools";
import { agentToolDefinitions } from "../agent/agent-tools";
import type { BrowserTasks } from "../browser/browser-tasks";
import { localPluginSdk } from "../plugins/local-plugin-contract";
import type { LocalPluginStore } from "../plugins/local-plugin-store";
import type { LocalWidgetRunner } from "../plugins/local-widget-sandbox";
import type { PluginStorage } from "../storage/plugin-storage";
import type { SharedResources } from "../storage/shared-resources";
import type { WorkspaceFile } from "../storage/workspace-file";
import type { DashboardLayoutOperation, DashboardScope, DataSourceId, JsonObject, JsonValue, WidgetInstanceId, WorkspaceNavigationCommand, WorkspaceNavigationState, WorkspaceSnapshot } from "@avesd/workspace-model";
import { DashboardLayoutCoordinator, navigateWorkspace, PersistentWorkspaceRepository, readWorkspaceCatalog, sameDashboard, WorkspaceDataCoordinator } from "@avesd/workspace-model";
import { randomUUID } from "node:crypto";

const result = (value: unknown, image?: string): AgentToolResult => {

    return {
        content: [
            {
                type: "text",
                text: JSON.stringify(value),
            },
            ...(image ? [
                {
                    type: "image" as const,
                    data: image,
                    mimeType: "image/png" as const,
                },
            ] : []),
        ],
    };
};

/** The desktop owns writes and the live catalog; MCP never opens workspace files. */
export class AgentWorkbench {
    #browserTasks?: BrowserTasks;
    setBrowserTasks(tasks: BrowserTasks | undefined): void {

        this.#browserTasks = tasks;
    }
    #context?: AgentWorkbenchContext;
    #scope?: DashboardScope;
    #scopeEpoch = 0;
    #queue: Promise<unknown> = Promise.resolve();
    #executionQueue: Promise<unknown> = Promise.resolve();
    constructor(
        private readonly file: WorkspaceFile, readonly plugins: LocalPluginStore,
        private readonly runner: Pick<LocalWidgetRunner, "test" | "preview">, private readonly workspaceChanged: () => void,
        private readonly pluginsChanged: () => void,
        private readonly scopeChanged: () => void = () => {
        }, private readonly storage?: PluginStorage, private readonly resources?: SharedResources,
    ) {}

    configure(context: AgentWorkbenchContext): void {

        this.#context = context;
    }

    async authorizeAgentWidget(instanceId: string): Promise<{
        widgetId: string;
        pluginId: string;
        workspaceId: string;
        dashboardId: string;
    }> {

        return this.#serial(async () => {

            const snapshot = await this.file.load();
            const widget = snapshot?.widgets.find(item => {

                return item.id === instanceId && sameDashboard(item, snapshot.selection);
            });
            if (!widget) {
                throw new Error("Agent caller is no longer active.");
            }
            const definition = widget.pluginId.startsWith("avesd.local.")
                ? localWidgetDefinition((await this.plugins.installed(widget.pluginId)).manifest)
                : this.#context?.widgetDefinitions.find(item => {

                    return item.pluginId === widget.pluginId && item.widgetTypeId === widget.widgetTypeId;
                });
            if (!definition?.capabilities?.includes("agent")) {
                throw new Error("Widget agent capability was not declared.");
            }

            return {
                widgetId: widget.id,
                pluginId: widget.pluginId,
                workspaceId: widget.workspaceId,
                dashboardId: widget.dashboardId,
            };
        });
    }

    async agentContext(): Promise<{
        readonly dashboardName: string;
        readonly workspaceName: string;
    }> {

        const snapshot = await this.file.load();
        const selection = snapshot?.selection;
        const workspace = snapshot?.workspaces.find(({ id }) => {

            return id === selection?.workspaceId;
        });
        const dashboard = snapshot?.dashboards.find(({ id }) => {

            return id === selection?.dashboardId;
        });
        if (!workspace || !dashboard) {
            throw new Error("The active Avesd workspace is unavailable.");
        }

        return {
            dashboardName: dashboard.name,
            workspaceName: workspace.name,
        };
    }

    save(snapshot: WorkspaceSnapshot, expected?: {
        snapshot: WorkspaceSnapshot | undefined;
    }): Promise<void> {

        return this.#serial(async () => {

            const current = await this.file.load();
            if (!sameDashboard(snapshot.selection, current?.selection)) {
                throw new Error("Use workspace navigation to change dashboards.");
            }
            await this.file.save(snapshot, expected);
            this.workspaceChanged();
        });
    }

    navigate(command: WorkspaceNavigationCommand): Promise<WorkspaceNavigationState> {

        return this.#serial(async () => {

            return this.#navigate(await this.file.load(), command);
        });
    }

    widgetWorkspace(request: WidgetWorkspaceRequest, authorize: (snapshot: WorkspaceSnapshot) => void | Promise<void>, storageOperation?: () => Promise<WidgetWorkspaceResult>): Promise<WidgetWorkspaceResult> {

        return this.#serial(async () => {

            const snapshot = await this.file.load();
            if (!snapshot) {
                throw new Error("Workspace is unavailable.");
            }
            // Authorization runs inside the write queue, including after any preceding switch.
            await authorize(snapshot);
            if (request.type === "files" || request.type === "sqlite" || request.type === "resources") {
                if (!storageOperation) {
                    throw new Error("Plugin storage is unavailable.");
                }

                return storageOperation();
            }
            if (request.type !== "command") {
                return readWorkspaceCatalog(snapshot, request);
            }
            await this.#navigate(snapshot, request.command);
        });
    }

    invokeWidget(instanceId: WidgetInstanceId, request: WidgetWorkspaceRequest, isActive: () => boolean = () => {

        return true;
    }): Promise<WidgetWorkspaceResult> {

        const epoch = this.#scopeEpoch;
        let identity: {
            workspaceId: string;
            pluginId: string;
        } | undefined;

        return this.widgetWorkspace(request, async (snapshot) => {

            const widget = snapshot.widgets.find(({ id }) => {

                return id === instanceId;
            });
            if (!widget || !sameDashboard(widget, snapshot.selection) || epoch !== this.#scopeEpoch || !isActive()) {
                throw new Error("Widget workspace context is no longer active.");
            }
            const definition = widget.pluginId.startsWith("avesd.local.")
                ? localWidgetDefinition((await this.plugins.installed(widget.pluginId)).manifest)
                : this.#context?.widgetDefinitions.find((item) => {

                    return item.pluginId === widget.pluginId && item.widgetTypeId === widget.widgetTypeId;
                });
            if (!definition?.capabilities?.includes(requiredWorkspaceCapability(request))) {
                throw new Error("Widget workspace capability was not granted.");
            }
            if (request.type === "resources" && request.operation === "publish"
        && !definition.capabilities.includes(request.publication.kind === "file" ? "files" : "sqlite")) {
                throw new Error("Publishing requires the private storage capability.");
            }
            if (!isActive()) {
                throw new Error("Widget workspace context is no longer active.");
            }
            identity = {
                workspaceId: widget.workspaceId,
                pluginId: widget.pluginId,
            };
        }, async () => {

            if (identity && request.type === "resources") {
                if (!this.resources) {
                    throw new Error("Resource directory is unavailable.");
                }

                return this.resources.invoke(identity, request, () => {

                    return epoch === this.#scopeEpoch && isActive();
                });
            }
            if (!identity || !this.storage || (request.type !== "files" && request.type !== "sqlite")) {
                throw new Error("Plugin storage is unavailable.");
            }

            return this.storage.invoke(identity, request, () => {

                return epoch === this.#scopeEpoch && isActive();
            });
        });
    }

    async #navigate(current: WorkspaceSnapshot | undefined, command: WorkspaceNavigationCommand): Promise<WorkspaceNavigationState> {

        const { snapshot, state } = await navigateWorkspace(current, command, randomUUID);
        const changed = JSON.stringify(snapshot) !== JSON.stringify(current);
        if (changed) {
            await this.file.save(snapshot, { snapshot: current });
        }
        if (!sameDashboard(this.#scope, state.scope)) {
            this.#scope = state.scope;
            this.#scopeEpoch += 1;
            this.scopeChanged();
        }
        if (changed) {
            this.workspaceChanged();
        }

        return state;
    }

    async invoke(name: string, input: unknown, expectedScope?: DashboardScope): Promise<AgentToolResult> {

        if (expectedScope && !sameDashboard(expectedScope, this.#scope)) {
            throw new Error("Return to this session's dashboard before using workspace tools.");
        }

        if (!Object.hasOwn(agentToolDefinitions, name)) {
            throw new Error("Unknown Avesd tool.");
        }
        const definitions = agentToolDefinitions;
        const parsed: unknown = definitions[name as keyof typeof definitions].schema.parse(input);
        if (name === "avesd_browser_task") {
            const workspaceId = this.#scope?.workspaceId;
            if (!workspaceId || !this.#browserTasks) {
                throw new Error("Background browsers are unavailable.");
            }
            const tasks = await this.#browserTasks.command(workspaceId, browserTaskCommandSchema.parse(parsed));

            return result(tasks.map(task => {

                return Object.fromEntries(Object.entries(task).filter(([key]) => {

                    return key !== "result";
                }));
            }));
        }
        if (name === "avesd_get_widget_sdk") {
            return result(localPluginSdk);
        }
        if (name === "avesd_test_plugin" || name === "avesd_preview_widget") {
            const { draftId, revision } = definitions.avesd_test_plugin.schema.parse(parsed);

            return this.#execute(name, draftId, revision);
        }
        const scopeEpoch = this.#scopeEpoch;

        return this.#serial(async () => {

            if (scopeEpoch !== this.#scopeEpoch || (expectedScope && !sameDashboard(expectedScope, this.#scope))) {
                throw new Error("The active dashboard changed. Retry in the current dashboard.");
            }
            if (name === "avesd_list_resources" || name === "avesd_set_resource_access") {
                const workspaceId = this.#scope?.workspaceId;
                if (!workspaceId || !this.resources) {
                    throw new Error("Resource directory is unavailable.");
                }
                if (name === "avesd_list_resources") {
                    return result(await this.resources.listForHost(workspaceId));
                }
                const command = definitions.avesd_set_resource_access.schema.parse(parsed);
                if (command.access !== "none") {
                    const definition = command.pluginId.startsWith("avesd.local.")
                        ? localWidgetDefinition((await this.plugins.installed(command.pluginId)).manifest)
                        : this.#context?.widgetDefinitions.find(widget => {

                            return widget.pluginId === command.pluginId && widget.capabilities?.includes("resources");
                        });
                    if (!definition?.capabilities?.includes("resources")) {
                        throw new Error("The recipient must be an installed plugin with the resources capability.");
                    }
                }
                await this.resources.grant(workspaceId, command.resourceId, command.pluginId, command.access);

                return result({
                    resourceId: command.resourceId,
                    pluginId: command.pluginId,
                    access: command.access,
                });
            }
            if (name === "avesd_query_workspace") {
                const request = parseWidgetWorkspaceRequest(parsed);
                const snapshot = await this.file.load();
                if (!snapshot || request.type === "command" || request.type === "files" || request.type === "sqlite" || request.type === "resources") {
                    throw new Error("Workspace is unavailable.");
                }

                return result(readWorkspaceCatalog(snapshot, request));
            }
            if (name === "avesd_manage_workspace") {
                const command = definitions.avesd_manage_workspace.schema.parse(parsed);
                const state = await this.#navigate(await this.file.load(), parseWorkspaceNavigation({
                    ...command,
                    scope: {
                        workspaceId: command.workspaceId,
                        dashboardId: command.dashboardId,
                    },
                }));

                return result({ scope: state.scope });
            }
            if (name === "avesd_create_plugin_draft") {
                return result(await this.plugins.create(parsed));
            }
            if (name === "avesd_read_plugin_draft") {
                const command = definitions.avesd_read_plugin_draft.schema.parse(parsed);

                return result(await this.plugins.read(command.draftId));
            }
            if (name === "avesd_write_plugin_draft") {
                const { draftId, expectedRevision, ...content } = definitions.avesd_write_plugin_draft.schema.parse(parsed);

                return result(await this.plugins.write(draftId, expectedRevision, content));
            }
            if (name === "avesd_activate_plugin") {
                const { draftId, revision } = definitions.avesd_activate_plugin.schema.parse(parsed);
                const installed = await this.plugins.activate(draftId, revision);
                this.pluginsChanged();

                return result(installed);
            }
            const context = this.#context;
            const scope = this.#scope;
            if (!context || !scope) {
                throw new Error("The dashboard is not ready.");
            }
            const repository = await PersistentWorkspaceRepository.open({
                load: () => {

                    return this.file.load();
                },
                save: (snapshot) => {

                    return this.file.save(snapshot);
                },
            });
            const widgetDefinitions = [
                ...context.widgetDefinitions.filter((widget) => {

                    return !widget.pluginId.startsWith("avesd.local.");
                }),
                ...(await this.plugins.list()).map(({ manifest }) => {

                    return localWidgetDefinition(manifest);
                }),
            ];
            const layouts = new DashboardLayoutCoordinator(
                repository,
                (pluginId, type) => {

                    return widgetDefinitions.find((widget) => {

                        return widget.pluginId === pluginId && widget.widgetTypeId === type;
                    });
                },
            );
            const data = new WorkspaceDataCoordinator(
                repository,
                (pluginId, type) => {

                    return context.dataSourceDefinitions.find((source) => {

                        return source.pluginId === pluginId && source.sourceTypeId === type;
                    });
                },
            );
            const apply = async (operation: DashboardLayoutOperation) => {

                const current = await layouts.inspect(scope);
                const updated = await layouts.apply(scope, {
                    expectedRevision: current.revision,
                    operations: [operation],
                });
                this.workspaceChanged();

                return result(updated);
            };
            switch (name) {
                case "avesd_inspect_dashboard": return result({
                    availableWidgetTypes: widgetDefinitions,
                    availableDataSourceTypes: context.dataSourceDefinitions,
                    dataSources: await data.list(scope),
                    layout: await layouts.inspect(scope),
                });
                case "avesd_add_widget": return apply({
                    ...definitions.avesd_add_widget.schema.parse(parsed) as {
                        pluginId: string;
                        widgetTypeId: string;
                        configuration?: JsonObject;
                    },
                    type: "add",
                    id: randomUUID() as WidgetInstanceId,
                });
                case "avesd_move_widget": {
                    const command = definitions.avesd_move_widget.schema.parse(parsed);

                    return apply({
                        ...command,
                        id: command.id as WidgetInstanceId,
                        type: "move",
                    });
                }
                case "avesd_resize_widget": {
                    const command = definitions.avesd_resize_widget.schema.parse(parsed);

                    return apply({
                        ...command,
                        id: command.id as WidgetInstanceId,
                        type: "resize",
                    });
                }
                case "avesd_remove_widget": return apply({
                    type: "remove",
                    id: definitions.avesd_remove_widget.schema.parse(parsed).id as WidgetInstanceId,
                });
                case "avesd_bind_widget_input": {
                    const command = definitions.avesd_bind_widget_input.schema.parse(parsed);

                    return apply({
                        type: "bind",
                        id: command.widgetId as WidgetInstanceId,
                        inputId: command.inputId,
                        dataSourceIds: command.dataSourceId ? [command.dataSourceId as DataSourceId] : [],
                    });
                }
                case "avesd_create_data_source": {
                    const command = definitions.avesd_create_data_source.schema.parse(parsed);
                    const created = await data.create(
                        command.scope === "workspace"
                            ? {
                                kind: "workspace",
                                workspaceId: scope.workspaceId,
                            } : {
                                ...scope,
                                kind: "dashboard",
                            },
                        {
                            name: command.name,
                            pluginId: command.pluginId,
                            sourceTypeId: command.sourceTypeId,
                            id: randomUUID() as DataSourceId,
                        },
                    );
                    this.workspaceChanged();

                    return result(created);
                }
                case "avesd_update_data_source": {
                    const command = definitions.avesd_update_data_source.schema.parse(parsed);
                    const id = command.dataSourceId as DataSourceId;
                    const source = (await data.list(scope)).find((source) => {

                        return source.id === id;
                    });
                    if (!source) {
                        throw new Error("Data source is not visible to this dashboard.");
                    }
                    const updated = await data.update(scope, id, source.revision, command.value as JsonValue);
                    this.workspaceChanged();

                    return result(updated);
                }
                default: throw new Error("Unknown Avesd tool.");
            }
        });
    }

    // Keep native runner jobs bounded without holding up workspace or draft writes.
    #execute(name: "avesd_test_plugin" | "avesd_preview_widget", draftId: string, revision: string): Promise<AgentToolResult> {

        const work = this.#executionQueue.then(async () => {

            const readCurrent = async () => {

                const draft = await this.plugins.read(draftId);
                if (draft.revision !== revision) {
                    throw new Error("Draft changed; read its current revision first.");
                }

                return draft;
            };
            const draft = await this.#serial(readCurrent);
            if (name === "avesd_preview_widget") {
                const image = await this.runner.preview(draft);

                return this.#serial(async () => {

                    await readCurrent();

                    return result({
                        draftId,
                        revision,
                    }, image);
                });
            }
            const { report, image } = await this.runner.test(draft);

            return this.#serial(async () => {

                await readCurrent();
                if (report.draftId !== draftId || report.revision !== revision) {
                    throw new Error("Test report does not match the requested draft revision.");
                }
                this.plugins.record(report);

                return result(report, image);
            });
        });
        this.#executionQueue = work.catch(() => {

            return undefined;
        });

        return work;
    }

    #serial<T>(operation: () => Promise<T>): Promise<T> {

        const work = this.#queue.then(operation);
        this.#queue = work.catch(() => {

            return undefined;
        });

        return work;
    }
}
