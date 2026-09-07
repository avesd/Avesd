import type { ContributionRegistry } from "@avesd/kernel";
import type {
  DashboardLayoutService,
  DashboardLayoutSnapshot,
  DashboardScope,
  GridPlacement,
  WidgetDefinition,
  WidgetInstance,
  WidgetInstanceId,
  WidgetSize,
} from "@avesd/workspace-model";
import { useEffect, useState, useSyncExternalStore } from "react";

import { dashboardWidgetContribution } from "../workbench/types";
import type { DashboardWidget } from "../workbench/types";

interface DashboardShellProps {
  readonly layouts: DashboardLayoutService;
  readonly scope: DashboardScope;
  readonly widgets: ContributionRegistry<DashboardWidget>;
}

const EMPTY_WIDGETS: readonly ReturnType<ContributionRegistry<DashboardWidget>["getAll"]>[number][] = [];

export const DashboardShell = ({ layouts, scope, widgets }: DashboardShellProps) => {
  const availableWidgets = useSyncExternalStore(
    (listener) => widgets.subscribe(listener),
    () => widgets.getAll(dashboardWidgetContribution.id),
    () => EMPTY_WIDGETS,
  );
  const [snapshot, setSnapshot] = useState<DashboardLayoutSnapshot>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    void layouts.inspect(scope).then((next) => {
      if (active) {
        setSnapshot(next);
      }
    });
    return () => {
      active = false;
    };
  }, [layouts, scope]);

  const apply = async (
    operations: Parameters<DashboardLayoutService["apply"]>[1]["operations"],
  ) => {
    if (!snapshot) {
      return;
    }
    try {
      const updated = await layouts.apply(scope, {
        expectedRevision: snapshot.revision,
        operations,
      });
      setSnapshot(updated);
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The layout could not be updated.");
    }
  };

  const addWidget = async (pluginId: string, widget: DashboardWidget) => {
    await apply([{
      id: crypto.randomUUID() as WidgetInstanceId,
      pluginId,
      type: "add",
      widgetTypeId: widget.widgetTypeId,
    }]);
  };

  return (
    <section className="dashboard-shell" aria-label="Dashboard workspace">
      <header className="dashboard-header">
        <div>
          <p className="dashboard-eyebrow">Workspace</p>
          <h1>My dashboard</h1>
        </div>
        <span className="dashboard-grid-label">24-column grid</span>
      </header>

      <aside className="widget-library" aria-label="Widget library">
        <div className="widget-library-heading">
          <h2>Widgets</h2>
          <span>{availableWidgets.length}</span>
        </div>
        <p>Build this dashboard from the capabilities you have installed.</p>
        <div className="widget-library-list">
          {availableWidgets.map(({ pluginId, value }) => pluginId && (
            <article className="widget-library-item" key={`${pluginId}/${value.widgetTypeId}`}>
              <div>
                <strong>{value.displayName}</strong>
                {value.description && <span>{value.description}</span>}
              </div>
              <button type="button" onClick={() => void addWidget(pluginId, value)}>
                Add
              </button>
            </article>
          ))}
        </div>
      </aside>

      <div className="dashboard-canvas-wrap">
        {error && <div className="dashboard-error" role="alert">{error}</div>}
        <div className="dashboard-grid" data-testid="dashboard-grid">
          {snapshot?.widgets.length === 0 && (
            <div className="dashboard-empty">
              <span aria-hidden="true">＋</span>
              <h2>Start with a widget</h2>
              <p>Add one from the library, or ask your agent to arrange this dashboard.</p>
            </div>
          )}
          {snapshot?.widgets.map((instance) => (
            <WidgetCard
              apply={apply}
              definition={resolveWidget(availableWidgets, instance)}
              instance={instance}
              key={instance.id}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

const WidgetCard = ({
  apply,
  definition,
  instance,
}: {
  readonly apply: (
    operations: Parameters<DashboardLayoutService["apply"]>[1]["operations"],
  ) => Promise<void>;
  readonly definition?: DashboardWidget;
  readonly instance: WidgetInstance;
}) => {
  const placementStyle = {
    gridColumn: `${instance.placement.x + 1} / span ${instance.placement.width}`,
    gridRow: `${instance.placement.y + 1} / span ${instance.placement.height}`,
  };

  const move = (x: number, y: number) => apply([{
    id: instance.id,
    type: "move",
    x: Math.max(0, Math.min(24 - instance.placement.width, x)),
    y: Math.max(0, y),
  }]);

  const resize = () => {
    if (!definition) {
      return Promise.resolve();
    }
    const next = nextSize(definition, instance.placement);
    return apply([{
      height: next.height,
      id: instance.id,
      type: "resize",
      width: next.width,
    }]);
  };

  return (
    <article className="dashboard-widget" style={placementStyle}>
      <header className="dashboard-widget-header">
        <strong>{definition?.displayName ?? "Missing widget"}</strong>
        <div className="dashboard-widget-controls">
          <button aria-label="Move widget left" onClick={() => void move(
            instance.placement.x - 1,
            instance.placement.y,
          )} type="button">←</button>
          <button aria-label="Move widget right" onClick={() => void move(
            instance.placement.x + 1,
            instance.placement.y,
          )} type="button">→</button>
          <button aria-label="Move widget up" onClick={() => void move(
            instance.placement.x,
            instance.placement.y - 1,
          )} type="button">↑</button>
          <button aria-label="Move widget down" onClick={() => void move(
            instance.placement.x,
            instance.placement.y + 1,
          )} type="button">↓</button>
          <button aria-label="Change widget size" onClick={() => void resize()} type="button">↗</button>
          <button
            aria-label="Remove widget"
            onClick={() => void apply([{ id: instance.id, type: "remove" }])}
            type="button"
          >×</button>
        </div>
      </header>
      <div className="dashboard-widget-body">
        {definition
          ? definition.render({
              configuration: instance.configuration,
              size: instance.placement,
            })
          : <p>This widget's plugin is not installed. Its layout and configuration are preserved.</p>}
      </div>
    </article>
  );
};

const resolveWidget = (
  available: readonly ReturnType<ContributionRegistry<DashboardWidget>["getAll"]>[number][],
  instance: WidgetInstance,
): DashboardWidget | undefined => available.find(
  ({ pluginId, value }) =>
    pluginId === instance.pluginId && value.widgetTypeId === instance.widgetTypeId,
)?.value;

const nextSize = (
  definition: Omit<WidgetDefinition, "pluginId">,
  current: GridPlacement,
): WidgetSize => {
  if (definition.sizePolicy.kind === "fixed") {
    const index = definition.sizePolicy.sizes.findIndex(
      ({ height, width }) => height === current.height && width === current.width,
    );
    return definition.sizePolicy.sizes[(index + 1) % definition.sizePolicy.sizes.length]
      ?? definition.defaultSize;
  }
  const step = definition.sizePolicy.step ?? { height: 1, width: 1 };
  const width = current.width + step.width <= definition.sizePolicy.maximum.width
    ? current.width + step.width
    : definition.sizePolicy.minimum.width;
  const height = current.height + step.height <= definition.sizePolicy.maximum.height
    ? current.height + step.height
    : definition.sizePolicy.minimum.height;
  return { height, width };
};
