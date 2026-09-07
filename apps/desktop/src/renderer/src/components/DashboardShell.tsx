import type { ContributionRegistry } from "@avesd/kernel";
import { dataSourceContribution } from "@avesd/plugin-data";
import type { DataSourceContribution } from "@avesd/plugin-data";
import { dashboardWidgetContribution } from "@avesd/plugin-ui";
import type {
  WidgetContribution,
  WidgetController,
  WidgetRenderState,
} from "@avesd/plugin-ui";
import type {
  DashboardLayoutService,
  DashboardLayoutSnapshot,
  DashboardScope,
  DataSource,
  DataSourceId,
  DataSourceService,
  GridPlacement,
  JsonObject,
  JsonValue,
  WidgetInstance,
  WidgetInstanceId,
  WidgetSize,
} from "@avesd/workspace-model";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

interface DashboardShellProps {
  readonly dataSources: DataSourceService;
  readonly layouts: DashboardLayoutService;
  readonly scope: DashboardScope;
  readonly sourceTypes: ContributionRegistry<DataSourceContribution>;
  readonly widgets: ContributionRegistry<WidgetContribution>;
}

const EMPTY_WIDGETS: readonly ReturnType<ContributionRegistry<WidgetContribution>["getAll"]>[number][] = [];
const EMPTY_SOURCE_TYPES: readonly ReturnType<ContributionRegistry<DataSourceContribution>["getAll"]>[number][] = [];

export const DashboardShell = ({
  dataSources,
  layouts,
  scope,
  sourceTypes,
  widgets,
}: DashboardShellProps) => {
  const availableWidgets = useSyncExternalStore(
    (listener) => widgets.subscribe(listener),
    () => widgets.getAll(dashboardWidgetContribution.id),
    () => EMPTY_WIDGETS,
  );
  const availableSourceTypes = useSyncExternalStore(
    (listener) => sourceTypes.subscribe(listener),
    () => sourceTypes.getAll(dataSourceContribution.id),
    () => EMPTY_SOURCE_TYPES,
  );
  const [snapshot, setSnapshot] = useState<DashboardLayoutSnapshot>();
  const [sources, setSources] = useState<readonly DataSource[]>([]);
  const [error, setError] = useState<string>();
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void Promise.all([layouts.inspect(scope), dataSources.list(scope)]).then(
        ([nextSnapshot, nextSources]) => {
          if (active) {
            setSnapshot(nextSnapshot);
            setSources(nextSources);
          }
        },
      );
    };
    refresh();
    const unsubscribe = dataSources.subscribe(refresh);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [dataSources, layouts, scope]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "e") {
        event.preventDefault();
        setIsEditing((current) => !current);
      } else if (event.key === "Escape") {
        setIsEditing(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

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

  const addWidget = async (pluginId: string, widget: WidgetContribution) => {
    await apply([{
      id: crypto.randomUUID() as WidgetInstanceId,
      pluginId,
      type: "add",
      widgetTypeId: widget.widgetTypeId,
    }]);
  };

  const createSource = async (
    pluginId: string,
    source: DataSourceContribution,
    kind: "dashboard" | "workspace",
  ) => {
    try {
      await dataSources.create(
        kind === "dashboard" ? { ...scope, kind } : { workspaceId: scope.workspaceId, kind },
        {
          id: crypto.randomUUID() as DataSourceId,
          name: source.displayName,
          pluginId,
          sourceTypeId: source.sourceTypeId,
        },
      );
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The data source could not be created.");
    }
  };

  return (
    <section
      className={`dashboard-shell${isEditing ? " is-editing" : ""}`}
      aria-label="Dashboard workspace"
      onContextMenu={(event) => {
        event.preventDefault();
        setIsEditing(true);
      }}
    >
      {error && <div className="dashboard-error" role="alert">{error}</div>}
      <div className="dashboard-grid" data-testid="dashboard-grid">
        {snapshot?.widgets.length === 0 && !isEditing && (
          <div className="dashboard-empty">
            <button type="button" onClick={() => setIsEditing(true)}>
              Configure dashboard
            </button>
            <p>Or ask your agent to build it.</p>
          </div>
        )}
        {snapshot?.widgets.map((instance) => (
          <WidgetSurface
            apply={apply}
            dataSources={dataSources}
            definition={resolveWidget(availableWidgets, instance)}
            instance={instance}
            isEditing={isEditing}
            key={instance.id}
          />
        ))}
      </div>

      {isEditing && (
        <aside className="layout-editor" aria-label="Widget library">
          <header>
            <div>
              <span>Dashboard</span>
              <h2>Edit layout</h2>
            </div>
            <button type="button" onClick={() => setIsEditing(false)}>Done</button>
          </header>
          <p>Choose a widget, then position it on the 24-column canvas.</p>
          <div className="layout-editor-list">
            {availableWidgets.map(({ pluginId, value }) => pluginId && (
              <article key={`${pluginId}/${value.widgetTypeId}`}>
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
          <h3>Data sources</h3>
          <div className="layout-editor-list">
            {availableSourceTypes.map(({ pluginId, value }) => pluginId && (
              <article className="source-type-item" key={`${pluginId}/${value.sourceTypeId}`}>
                <div>
                  <strong>{value.displayName}</strong>
                  <span>{value.description ?? value.dataType}</span>
                </div>
                <div className="source-actions">
                  <button type="button" onClick={() => void createSource(pluginId, value, "workspace")}>Shared</button>
                  <button type="button" onClick={() => void createSource(pluginId, value, "dashboard")}>Here</button>
                </div>
              </article>
            ))}
          </div>
          {snapshot?.widgets.some((instance) =>
            (resolveWidget(availableWidgets, instance)?.inputs?.length ?? 0) > 0) && (
            <div className="binding-editor">
              <h3>Bindings</h3>
              {snapshot.widgets.map((instance) => {
                const definition = resolveWidget(availableWidgets, instance);
                return definition?.inputs?.map((input) => (
                  <label key={`${instance.id}/${input.id}`}>
                    <span>{definition.displayName} · {input.displayName}</span>
                    <select
                      aria-label={`Bind ${definition.displayName} ${input.displayName}`}
                      onChange={(event) => void apply([{
                        dataSourceIds: event.target.value
                          ? [event.target.value as DataSourceId]
                          : [],
                        id: instance.id,
                        inputId: input.id,
                        type: "bind",
                      }])}
                      value={instance.bindings[input.id]?.[0] ?? ""}
                    >
                      <option value="">Not connected</option>
                      {sources.filter(({ dataType }) => dataType === input.dataType).map((source) => (
                        <option key={source.id} value={source.id}>
                          {source.name} · {source.scope.kind === "workspace" ? "shared" : "this dashboard"}
                        </option>
                      ))}
                    </select>
                  </label>
                ));
              })}
            </div>
          )}
          {snapshot?.widgets.some((instance) =>
            configurationFields(resolveWidget(availableWidgets, instance)).length > 0) && (
            <div className="configuration-editor">
              <h3>Configuration</h3>
              {snapshot.widgets.flatMap((instance) => {
                const definition = resolveWidget(availableWidgets, instance);
                return configurationFields(definition).map((field) => (
                  <label key={`${instance.id}/${field.id}`}>
                    <span>{definition?.displayName} · {field.title}</span>
                    {field.type === "boolean" ? (
                      <input
                        checked={instance.configuration[field.id] === true}
                        onChange={(event) => void apply([{
                          configuration: {
                            ...instance.configuration,
                            [field.id]: event.target.checked,
                          },
                          id: instance.id,
                          type: "configure",
                        }])}
                        type="checkbox"
                      />
                    ) : (
                      <input
                        defaultValue={String(instance.configuration[field.id] ?? "")}
                        key={`${instance.id}/${field.id}/${String(instance.configuration[field.id])}`}
                        onBlur={(event) => {
                          const value: JsonValue = field.type === "number"
                            ? Number(event.target.value)
                            : event.target.value;
                          void apply([{
                            configuration: { ...instance.configuration, [field.id]: value },
                            id: instance.id,
                            type: "configure",
                          }]);
                        }}
                        type={field.type === "number" ? "number" : "text"}
                      />
                    )}
                  </label>
                ));
              })}
            </div>
          )}
        </aside>
      )}
    </section>
  );
};

const WidgetSurface = ({
  apply,
  dataSources,
  definition,
  instance,
  isEditing,
}: {
  readonly apply: (
    operations: Parameters<DashboardLayoutService["apply"]>[1]["operations"],
  ) => Promise<void>;
  readonly dataSources: DataSourceService;
  readonly definition?: WidgetContribution;
  readonly instance: WidgetInstance;
  readonly isEditing: boolean;
}) => {
  const [preview, setPreview] = useState<{ readonly x: number; readonly y: number }>();
  const placementStyle = {
    gridColumn: `${(preview?.x ?? instance.placement.x) + 1} / span ${instance.placement.width}`,
    gridRow: `${(preview?.y ?? instance.placement.y) + 1} / span ${instance.placement.height}`,
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

  const beginDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const grid = event.currentTarget.closest(".dashboard-grid");
    if (!(grid instanceof HTMLElement)) {
      return;
    }
    event.preventDefault();
    const start = { clientX: event.clientX, clientY: event.clientY };
    const cellWidth = grid.getBoundingClientRect().width / 24;
    let next = { x: instance.placement.x, y: instance.placement.y };
    const handleMove = (moveEvent: PointerEvent) => {
      next = {
        x: Math.max(0, Math.min(
          24 - instance.placement.width,
          instance.placement.x + Math.round((moveEvent.clientX - start.clientX) / cellWidth),
        )),
        y: Math.max(
          0,
          instance.placement.y + Math.round((moveEvent.clientY - start.clientY) / 24),
        ),
      };
      setPreview(next);
    };
    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      setPreview(undefined);
      void move(next.x, next.y);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp, { once: true });
  };

  return (
    <article className="dashboard-widget" style={placementStyle}>
      {definition
        ? <MountedWidget
            apply={apply}
            dataSources={dataSources}
            definition={definition}
            instance={instance}
          />
        : <p className="dashboard-widget-missing">This widget's plugin is not installed.</p>}
      {isEditing && (
        <div className="dashboard-widget-editor">
          <span
            aria-label={`Drag ${definition?.displayName ?? "missing widget"}`}
            onPointerDown={beginDrag}
            role="button"
            tabIndex={0}
          >{definition?.displayName ?? "Missing widget"}</span>
          <div>
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
        </div>
      )}
    </article>
  );
};

const MountedWidget = ({
  apply,
  dataSources,
  definition,
  instance,
}: {
  readonly apply: (
    operations: Parameters<DashboardLayoutService["apply"]>[1]["operations"],
  ) => Promise<void>;
  readonly dataSources: DataSourceService;
  readonly definition: WidgetContribution;
  readonly instance: WidgetInstance;
}) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<WidgetController | undefined>(undefined);
  const applyRef = useRef(apply);
  const {
    bindings,
    dashboardId,
    id: instanceId,
    workspaceId,
  } = instance;
  const bindingsKey = JSON.stringify(bindings);

  useEffect(() => {
    applyRef.current = apply;
  }, [apply]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }
    const root = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    const abortController = new AbortController();
    const showError = () => {
      root.replaceChildren();
      const message = document.createElement("p");
      message.className = "avesd-widget-error";
      message.textContent = "This widget could not be rendered.";
      root.append(message);
    };

    try {
      const activeBindings = JSON.parse(bindingsKey) as WidgetInstance["bindings"];
      const controller = definition.mount(root, {
        configuration: {
          update: (configuration) => applyRef.current([{
            configuration,
            id: instanceId,
            type: "configure",
          }]),
        },
        dashboardId,
        data: {
          async read(inputId) {
            const ids = activeBindings[inputId] ?? [];
            const scope: DashboardScope = { dashboardId, workspaceId };
            return Promise.all(ids.map(async (id) => (
              await dataSources.read(scope, id)
            ).value));
          },
          subscribe(_inputId, listener) {
            return dataSources.subscribe(listener);
          },
          async update(inputId, value) {
            const ids = activeBindings[inputId] ?? [];
            if (ids.length !== 1 || !ids[0]) {
              throw new Error(`widget input must have exactly one data source: ${inputId}`);
            }
            const scope: DashboardScope = { dashboardId, workspaceId };
            const source = await dataSources.read(scope, ids[0]);
            await dataSources.update(scope, source.id, source.revision, value);
          },
        },
        instanceId,
        signal: abortController.signal,
        workspaceId,
      });
      controllerRef.current = controller;
    } catch {
      controllerRef.current = undefined;
      showError();
    }

    return () => {
      abortController.abort();
      try {
        controllerRef.current?.dispose();
      } catch {
        // A widget cannot prevent its host surface from being cleaned up.
      } finally {
        controllerRef.current = undefined;
        root.replaceChildren();
      }
    };
  }, [bindingsKey, dashboardId, dataSources, definition, instanceId, workspaceId]);

  useEffect(() => {
    try {
      controllerRef.current?.update(toRenderState(instance));
    } catch {
      const controller = controllerRef.current;
      controllerRef.current = undefined;
      try {
        controller?.dispose();
      } catch {
        // The stable host fallback below takes precedence over plugin failures.
      }
      const root = hostRef.current?.shadowRoot;
      if (root) {
        root.replaceChildren();
        const message = document.createElement("p");
        message.textContent = "This widget could not be updated.";
        root.append(message);
      }
    }
  }, [instance]);

  return <div className="dashboard-widget-content" ref={hostRef} />;
};

const toRenderState = (instance: WidgetInstance): WidgetRenderState => ({
  configuration: instance.configuration,
  size: instance.placement,
});

const resolveWidget = (
  available: readonly ReturnType<ContributionRegistry<WidgetContribution>["getAll"]>[number][],
  instance: WidgetInstance,
): WidgetContribution | undefined => available.find(
  ({ pluginId, value }) =>
    pluginId === instance.pluginId && value.widgetTypeId === instance.widgetTypeId,
)?.value;

const nextSize = (
  definition: WidgetContribution,
  current: GridPlacement,
): WidgetSize => {
  if (definition.sizing.policy.kind === "fixed") {
    const index = definition.sizing.policy.sizes.findIndex(
      ({ height, width }) => height === current.height && width === current.width,
    );
    return definition.sizing.policy.sizes[(index + 1) % definition.sizing.policy.sizes.length]
      ?? definition.sizing.default;
  }
  const step = definition.sizing.policy.step ?? { height: 1, width: 1 };
  const width = current.width + step.width <= definition.sizing.policy.maximum.width
    ? current.width + step.width
    : definition.sizing.policy.minimum.width;
  const height = current.height + step.height <= definition.sizing.policy.maximum.height
    ? current.height + step.height
    : definition.sizing.policy.minimum.height;
  return { height, width };
};

interface ConfigurationField {
  readonly id: string;
  readonly title: string;
  readonly type: "boolean" | "number" | "string";
}

const configurationFields = (
  definition: WidgetContribution | undefined,
): readonly ConfigurationField[] => {
  const properties = definition?.configuration.schema?.properties;
  if (!isJsonObject(properties)) {
    return [];
  }
  return Object.entries(properties).flatMap(([id, schema]) => {
    if (!isJsonObject(schema)) {
      return [];
    }
    const type = schema.type;
    if (type !== "boolean" && type !== "number" && type !== "string") {
      return [];
    }
    return [{ id, title: typeof schema.title === "string" ? schema.title : id, type }];
  });
};

const isJsonObject = (value: JsonValue | undefined): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);
