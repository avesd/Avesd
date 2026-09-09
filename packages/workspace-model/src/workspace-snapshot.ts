/**
 * @author Avesd
 * @package Workspace Model
 * @namespace Root
 * @description Workspace Snapshot
 */

import { assertDashboardLayout } from "./dashboard-layout";
import type { WorkspaceSnapshot } from "./workspace-model";

/** Validate persisted data independently of installed plugins or a concrete driver. */
export const parseWorkspaceSnapshot = (input: unknown): WorkspaceSnapshot | undefined => {

    if (input === undefined || input === null) {
        return undefined;
    }
    const snapshot = record(input);
    if (snapshot.version !== 1) {
        throw new Error("Unsupported workspace data format");
    }
    assertJson(snapshot, new Set());

    const workspaces = entities(snapshot.workspaces);
    const dashboards = entities(snapshot.dashboards);
    const widgets = entities(snapshot.widgets);
    const sources = entities(snapshot.dataSources);

    const requireWorkspace = (id: unknown) => {

        identifier(id);
        if (!workspaces.has(id)) {
            invalid("workspace reference");
        }
    };
    const requireDashboard = (workspaceId: unknown, dashboardId: unknown) => {

        requireWorkspace(workspaceId);
        identifier(dashboardId);
        if (dashboards.get(dashboardId)?.workspaceId !== workspaceId) {
            invalid("dashboard ownership");
        }
    };

    for (const workspace of workspaces.values()) {text(workspace.name);}
    if (snapshot.selection !== undefined) {
        const selection = record(snapshot.selection);
        requireDashboard(selection.workspaceId, selection.dashboardId);
    }
    for (const dashboard of dashboards.values()) {
        text(dashboard.name);
        requireWorkspace(dashboard.workspaceId);
        integer(dashboard.layoutRevision, 0);
        record(dashboard.viewState);
    }
    for (const source of sources.values()) {
        text(source.name);
        identifier(source.pluginId);
        identifier(source.sourceTypeId);
        identifier(source.dataType);
        integer(source.revision, 0);
        record(source.configuration);
        if (!Object.hasOwn(source, "value")) {
            invalid("data source value");
        }
        const scope = record(source.scope);
        requireWorkspace(scope.workspaceId);
        if (scope.kind === "dashboard") {
            requireDashboard(scope.workspaceId, scope.dashboardId);
        }
        else if (scope.kind !== "workspace") {
            invalid("data source scope");
        }
    }
    for (const widget of widgets.values()) {
        requireDashboard(widget.workspaceId, widget.dashboardId);
        identifier(widget.pluginId);
        identifier(widget.widgetTypeId);
        integer(widget.configurationVersion, 1);
        record(widget.configuration);
        const placement = record(widget.placement);
        integer(placement.x, 0);
        integer(placement.y, 0);
        integer(placement.width, 1);
        integer(placement.height, 1);
        const bindings = record(widget.bindings);
        for (const [
            inputId,
            ids,
        ] of Object.entries(bindings)) {
            identifier(inputId);
            if (!Array.isArray(ids)) {
                invalid("widget bindings");
            }
            const seen = new Set<string>();
            for (const id of ids) {
                identifier(id);
                if (seen.has(id)) {
                    invalid("duplicate binding");
                }
                seen.add(id);
                // Temporary/plugin-provided sources are resolved by the live data service.
                // Keep their identifiers without persisting their values or requiring a plugin.
                const source = sources.get(id);
                if (!source) {
                    continue;
                }
                const scope = record(source.scope);
                if (scope.workspaceId !== widget.workspaceId
          || (scope.kind === "dashboard" && scope.dashboardId !== widget.dashboardId)) {
                    invalid("binding visibility");
                }
            }
        }
    }

    const validated = snapshot as unknown as WorkspaceSnapshot;
    try {
        for (const dashboard of validated.dashboards) {
            assertDashboardLayout(validated.widgets.filter((widget) => {

                return widget.dashboardId === dashboard.id;
            }));
        }
    } catch {
        invalid("dashboard layout");
    }

    // Detach the validated snapshot from callers that might mutate it while a save waits.
    return structuredClone(validated);
};

function invalid(field: string): never {

    throw new Error(`Invalid workspace data: ${field}`);
}

function record(value: unknown): Record<string, unknown> {

    if (value === null || typeof value !== "object" || Array.isArray(value)
    || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
        invalid("expected an object");
    }

    return value as Record<string, unknown>;
}

function text(value: unknown): asserts value is string {

    if (typeof value !== "string") {
        invalid("expected a string");
    }
}

function identifier(value: unknown): asserts value is string {

    text(value);
    if (!value.trim()) {
        invalid("empty identifier");
    }
}

function integer(value: unknown, minimum: number): void {

    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) {
        invalid("invalid integer");
    }
}

function entities(value: unknown): Map<string, Record<string, unknown>> {

    if (!Array.isArray(value)) {
        invalid("expected an array");
    }
    const result = new Map<string, Record<string, unknown>>();
    for (const item of value) {
        const entity = record(item);
        identifier(entity.id);
        if (result.has(entity.id)) {
            invalid("duplicate identifier");
        }
        result.set(entity.id, entity);
    }

    return result;
}

function assertJson(value: unknown, ancestors: Set<object>): void {

    if (value === null || typeof value === "string" || typeof value === "boolean") {
        return;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
        return;
    }
    if (typeof value !== "object") {
        invalid("expected JSON data");
    }
    if (ancestors.has(value)) {
        invalid("cyclic JSON data");
    }
    ancestors.add(value);
    const children = Array.isArray(value) ? value : Object.values(record(value));
    for (const child of children) {assertJson(child, ancestors);}
    ancestors.delete(value);
}
