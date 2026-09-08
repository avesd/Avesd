import type { WidgetWorkspaceCapability } from "./workspace-catalog";
import type {
  DashboardLayoutSnapshot,
  DashboardScope,
  DataSourceId,
  GridPlacement,
  JsonObject,
  WidgetInstance,
  WidgetInstanceId,
  WorkspaceRepository,
} from "./workspace-model";

export const DASHBOARD_GRID_COLUMNS = 24;

export interface WidgetSize {
  readonly height: number;
  readonly width: number;
}

export interface FixedWidgetSizePolicy {
  readonly kind: "fixed";
  readonly sizes: readonly WidgetSize[];
}

export interface RangeWidgetSizePolicy {
  readonly kind: "range";
  readonly maximum: WidgetSize;
  readonly minimum: WidgetSize;
  readonly step?: WidgetSize;
}

export type WidgetSizePolicy = FixedWidgetSizePolicy | RangeWidgetSizePolicy;

export interface WidgetDefinition {
  readonly capabilities?: readonly WidgetWorkspaceCapability[];
  readonly defaultConfiguration: JsonObject;
  readonly configurationVersion: number;
  readonly defaultSize: WidgetSize;
  readonly displayName: string;
  readonly inputs: readonly WidgetInputDefinition[];
  readonly pluginId: string;
  readonly sizePolicy: WidgetSizePolicy;
  readonly widgetTypeId: string;
}

export interface WidgetInputDefinition {
  readonly dataType: string;
  readonly id: string;
  readonly multiple?: boolean;
  readonly required?: boolean;
}

export type WidgetDefinitionResolver = (
  pluginId: string,
  widgetTypeId: string,
) => WidgetDefinition | undefined;

export type DashboardLayoutOperation =
  | {
      readonly configuration?: JsonObject;
      readonly id: WidgetInstanceId;
      readonly placement?: GridPlacement;
      readonly pluginId: string;
      readonly type: "add";
      readonly widgetTypeId: string;
    }
  | {
      readonly dataSourceIds: readonly DataSourceId[];
      readonly id: WidgetInstanceId;
      readonly inputId: string;
      readonly type: "bind";
    }
  | {
      readonly configuration: JsonObject;
      readonly id: WidgetInstanceId;
      readonly type: "configure";
    }
  | {
      readonly id: WidgetInstanceId;
      readonly type: "move";
      readonly x: number;
      readonly y: number;
    }
  | {
      readonly height: number;
      readonly id: WidgetInstanceId;
      readonly type: "resize";
      readonly width: number;
    }
  | {
      readonly id: WidgetInstanceId;
      readonly type: "remove";
    };

export interface ApplyDashboardLayout {
  readonly expectedRevision: number;
  readonly operations: readonly DashboardLayoutOperation[];
}

export interface DashboardLayoutService {
  apply(
    scope: DashboardScope,
    command: ApplyDashboardLayout,
  ): Promise<DashboardLayoutSnapshot>;
  inspect(scope: DashboardScope): Promise<DashboardLayoutSnapshot>;
}

export type DashboardLayoutErrorCode =
  | "duplicate-widget"
  | "incompatible-data-source"
  | "input-not-found"
  | "invalid-placement"
  | "invalid-widget-definition"
  | "multiple-sources-unsupported"
  | "overlap"
  | "unsupported-size"
  | "widget-not-found"
  | "widget-unavailable";

export class DashboardLayoutError extends Error {
  constructor(
    readonly code: DashboardLayoutErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DashboardLayoutError";
  }
}

export class DashboardLayoutCoordinator implements DashboardLayoutService {
  readonly #repository: WorkspaceRepository;
  readonly #resolveWidget: WidgetDefinitionResolver;

  constructor(
    repository: WorkspaceRepository,
    resolveWidget: WidgetDefinitionResolver,
    private readonly readBindingSource: WorkspaceRepository["readDataSource"] =
      (scope, id) => repository.readDataSource(scope, id),
  ) {
    this.#repository = repository;
    this.#resolveWidget = resolveWidget;
  }

  inspect(scope: DashboardScope): Promise<DashboardLayoutSnapshot> {
    return this.#repository.readDashboardLayout(scope);
  }

  async apply(
    scope: DashboardScope,
    command: ApplyDashboardLayout,
  ): Promise<DashboardLayoutSnapshot> {
    const current = await this.inspect(scope);
    if (command.operations.length === 0) {
      return current;
    }

    const widgets = [...current.widgets];
    for (const operation of command.operations) {
      switch (operation.type) {
        case "add": {
          if (widgets.some(({ id }) => id === operation.id)) {
            throw new DashboardLayoutError(
              "duplicate-widget",
              `widget instance already exists: ${operation.id}`,
            );
          }
          const definition = this.#resolveWidget(operation.pluginId, operation.widgetTypeId);
          if (!definition) {
            throw new DashboardLayoutError(
              "widget-unavailable",
              `widget type is unavailable: ${operation.pluginId}/${operation.widgetTypeId}`,
            );
          }
          assertWidgetDefinition(definition);
          const placement = operation.placement ?? findAvailablePlacement(
            widgets.map(({ placement: occupied }) => occupied),
            definition.defaultSize,
          );
          assertPlacement(placement);
          assertSupportedSize(definition, placement);
          widgets.push({
            bindings: {},
            configuration: operation.configuration ?? definition.defaultConfiguration,
            configurationVersion: definition.configurationVersion,
            dashboardId: scope.dashboardId,
            id: operation.id,
            placement,
            pluginId: operation.pluginId,
            widgetTypeId: operation.widgetTypeId,
            workspaceId: scope.workspaceId,
          });
          break;
        }
        case "bind": {
          const index = requireWidgetIndex(widgets, operation.id);
          const widget = widgets[index];
          if (!widget) {
            break;
          }
          const definition = this.#resolveWidget(widget.pluginId, widget.widgetTypeId);
          if (!definition) {
            throw new DashboardLayoutError(
              "widget-unavailable",
              `cannot bind unavailable widget: ${widget.pluginId}/${widget.widgetTypeId}`,
            );
          }
          const input = definition.inputs.find(({ id }) => id === operation.inputId);
          if (!input) {
            throw new DashboardLayoutError(
              "input-not-found",
              `widget input is unavailable: ${operation.inputId}`,
            );
          }
          if (!input.multiple && operation.dataSourceIds.length > 1) {
            throw new DashboardLayoutError(
              "multiple-sources-unsupported",
              `widget input accepts one data source: ${operation.inputId}`,
            );
          }
          const sources = await Promise.all(operation.dataSourceIds.map(
            (dataSourceId) => this.readBindingSource(scope, dataSourceId),
          ));
          for (const source of sources) {
            const visible = source.scope.kind === "workspace"
              || source.scope.dashboardId === scope.dashboardId;
            if (!visible || source.dataType !== input.dataType) {
              throw new DashboardLayoutError(
                "incompatible-data-source",
                `data source is incompatible with widget input: ${source.id}`,
              );
            }
          }
          widgets[index] = {
            ...widget,
            bindings: { ...widget.bindings, [operation.inputId]: operation.dataSourceIds },
          };
          break;
        }
        case "configure": {
          const index = requireWidgetIndex(widgets, operation.id);
          const widget = widgets[index];
          if (!widget) {
            break;
          }
          const definition = this.#resolveWidget(widget.pluginId, widget.widgetTypeId);
          if (!definition) {
            throw new DashboardLayoutError(
              "widget-unavailable",
              `cannot configure unavailable widget: ${widget.pluginId}/${widget.widgetTypeId}`,
            );
          }
          widgets[index] = {
            ...widget,
            configuration: operation.configuration,
            configurationVersion: definition.configurationVersion,
          };
          break;
        }
        case "move": {
          const index = requireWidgetIndex(widgets, operation.id);
          const widget = widgets[index];
          if (!widget) {
            break;
          }
          widgets[index] = {
            ...widget,
            placement: { ...widget.placement, x: operation.x, y: operation.y },
          };
          break;
        }
        case "resize": {
          const index = requireWidgetIndex(widgets, operation.id);
          const widget = widgets[index];
          if (!widget) {
            break;
          }
          const definition = this.#resolveWidget(widget.pluginId, widget.widgetTypeId);
          if (!definition) {
            throw new DashboardLayoutError(
              "widget-unavailable",
              `cannot resize unavailable widget: ${widget.pluginId}/${widget.widgetTypeId}`,
            );
          }
          const placement = {
            ...widget.placement,
            height: operation.height,
            width: operation.width,
          };
          assertSupportedSize(definition, placement);
          widgets[index] = { ...widget, placement };
          break;
        }
        case "remove": {
          widgets.splice(requireWidgetIndex(widgets, operation.id), 1);
          break;
        }
      }
    }

    assertDashboardLayout(widgets);
    return this.#repository.writeDashboardLayout(
      scope,
      command.expectedRevision,
      widgets,
    );
  }
}

export const isSupportedWidgetSize = (
  policy: WidgetSizePolicy,
  size: WidgetSize,
): boolean => {
  if (policy.kind === "fixed") {
    return policy.sizes.some(
      ({ height, width }) => height === size.height && width === size.width,
    );
  }

  const step = policy.step ?? { height: 1, width: 1 };
  return size.width >= policy.minimum.width
    && size.width <= policy.maximum.width
    && size.height >= policy.minimum.height
    && size.height <= policy.maximum.height
    && (size.width - policy.minimum.width) % step.width === 0
    && (size.height - policy.minimum.height) % step.height === 0;
};

export const findAvailablePlacement = (
  occupied: readonly GridPlacement[],
  size: WidgetSize,
): GridPlacement => {
  assertPlacement({ ...size, x: 0, y: 0 });
  for (let y = 0; ; y += 1) {
    for (let x = 0; x <= DASHBOARD_GRID_COLUMNS - size.width; x += 1) {
      const placement = { ...size, x, y };
      if (occupied.every((other) => !overlaps(placement, other))) {
        return placement;
      }
    }
  }
};

const assertWidgetDefinition = (definition: WidgetDefinition): void => {
  if (!Number.isInteger(definition.configurationVersion) || definition.configurationVersion < 1) {
    throw new DashboardLayoutError(
      "invalid-widget-definition",
      `widget ${definition.pluginId}/${definition.widgetTypeId} has an invalid configuration version`,
    );
  }
  if (
    definition.sizePolicy.kind === "fixed"
    && definition.sizePolicy.sizes.length === 0
  ) {
    throw new DashboardLayoutError(
      "unsupported-size",
      `widget ${definition.pluginId}/${definition.widgetTypeId} has no supported sizes`,
    );
  }
  if (!isSupportedWidgetSize(definition.sizePolicy, definition.defaultSize)) {
    throw new DashboardLayoutError(
      "unsupported-size",
      `widget ${definition.pluginId}/${definition.widgetTypeId} has an invalid default size`,
    );
  }
  assertPlacement({ ...definition.defaultSize, x: 0, y: 0 });
};

const assertSupportedSize = (
  definition: WidgetDefinition,
  size: WidgetSize,
): void => {
  if (!isSupportedWidgetSize(definition.sizePolicy, size)) {
    throw new DashboardLayoutError(
      "unsupported-size",
      `unsupported size for ${definition.pluginId}/${definition.widgetTypeId}: ${size.width}x${size.height}`,
    );
  }
};

export const assertDashboardLayout = (widgets: readonly WidgetInstance[]): void => {
  for (const widget of widgets) {
    assertPlacement(widget.placement);
  }
  for (let index = 0; index < widgets.length; index += 1) {
    const widget = widgets[index];
    if (!widget) {
      continue;
    }
    for (let otherIndex = index + 1; otherIndex < widgets.length; otherIndex += 1) {
      const other = widgets[otherIndex];
      if (other && overlaps(widget.placement, other.placement)) {
        throw new DashboardLayoutError(
          "overlap",
          `widgets overlap: ${widget.id} and ${other.id}`,
        );
      }
    }
  }
};

const assertPlacement = (placement: GridPlacement): void => {
  const values = [placement.x, placement.y, placement.width, placement.height];
  if (
    values.some((value) => !Number.isInteger(value))
    || placement.x < 0
    || placement.y < 0
    || placement.width < 1
    || placement.height < 1
    || placement.x + placement.width > DASHBOARD_GRID_COLUMNS
  ) {
    throw new DashboardLayoutError(
      "invalid-placement",
      `invalid grid placement: ${JSON.stringify(placement)}`,
    );
  }
};

const requireWidgetIndex = (
  widgets: readonly WidgetInstance[],
  id: WidgetInstanceId,
): number => {
  const index = widgets.findIndex((widget) => widget.id === id);
  if (index < 0) {
    throw new DashboardLayoutError("widget-not-found", `widget instance not found: ${id}`);
  }
  return index;
};

const overlaps = (first: GridPlacement, second: GridPlacement): boolean =>
  first.x < second.x + second.width
  && first.x + first.width > second.x
  && first.y < second.y + second.height
  && first.y + first.height > second.y;
