import { defineContributionPoint } from "@avesd/plugin-api";
import type { Dispose } from "@avesd/plugin-api";
import type {
  DashboardId,
  JsonObject,
  JsonValue,
  WidgetInstanceId,
  WidgetSize,
  WidgetSizePolicy,
  WorkspaceId,
} from "@avesd/workspace-model";

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

export interface WidgetMountContext {
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
  readonly configuration: WidgetConfigurationDefinition;
  readonly description?: string;
  readonly displayName: string;
  readonly inputs?: readonly WidgetInputDefinition[];
  mount(root: ShadowRoot, context: WidgetMountContext): WidgetController;
  readonly sizing: {
    readonly default: WidgetSize;
    readonly policy: WidgetSizePolicy;
  };
  readonly widgetTypeId: string;
}

export const dashboardWidgetContribution = defineContributionPoint<WidgetContribution>(
  "dashboard.widget",
);
