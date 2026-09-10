/**
 * @author Avesd
 * @package Plugin UI
 * @namespace Root
 * @description Widget Contribution
 */

import type { AgentTaskService, Dispose } from "@avesd/plugin-api";
import { defineContributionPoint } from "@avesd/plugin-api";
import type { DashboardId,
    JsonObject,
    JsonValue,
    WidgetInstanceId,
    WidgetSize,
    WidgetWorkspaceCapability,
    WidgetWorkspaceServices,
    WorkspaceId } from "@avesd/workspace-model";

export interface WidgetConfigurationDefinition {
    readonly default: JsonObject;
    readonly schema?: JsonObject;
    readonly version: number;
}

export interface WidgetInputDefinition {
    readonly dataType: string;
    readonly displayName: string;
    readonly id: string;
    readonly multiple?: boolean;
    readonly required?: boolean;
}

export interface WidgetRenderState {
    readonly configuration: JsonObject;
    readonly size: WidgetSize;
}

export interface WidgetConfigurationService {
    update(configuration: JsonObject): Promise<void>;
}

export interface WidgetDataService {
    read(inputId: string): Promise<readonly JsonValue[]>;
    subscribe(inputId: string, listener: () => void): Dispose;
    update(inputId: string, value: JsonValue): Promise<void>;
}

/** Host-scoped browser controls. Binding names are resolved by the host, not the caller. */
export interface WidgetBrowserService {
    extract(inputId: string, fields: Readonly<Record<string, string>>): Promise<JsonObject>;
    navigate(inputId: string, url: string): Promise<void>;
    click(inputId: string, selector: string): Promise<void>;
}

export interface WidgetMountContext extends WidgetWorkspaceServices {
    readonly browser?: WidgetBrowserService;
    readonly agent?: AgentTaskService;
    readonly configuration: WidgetConfigurationService;
    readonly dashboardId: DashboardId;
    readonly data: WidgetDataService;
    readonly instanceId: WidgetInstanceId;
    readonly signal: AbortSignal;
    readonly workspaceId: WorkspaceId;
}

export interface WidgetController {
    dispose(): void;
    update(state: WidgetRenderState): void;
}

export interface WidgetContribution {
    readonly capabilities?: readonly WidgetWorkspaceCapability[];
    readonly configuration: WidgetConfigurationDefinition;
    readonly description?: string;
    readonly displayName: string;
    readonly inputs?: readonly WidgetInputDefinition[];
    mount(root: ShadowRoot, context: WidgetMountContext): WidgetController;
    readonly sizing: {
        readonly default: WidgetSize;
    };
    readonly widgetTypeId: string;
}

export const dashboardWidgetContribution = defineContributionPoint<WidgetContribution>("dashboard.widget");
