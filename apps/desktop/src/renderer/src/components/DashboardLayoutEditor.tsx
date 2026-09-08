import type { DataSourceContribution } from "@avesd/plugin-data";
import type { WidgetContribution } from "@avesd/plugin-ui";
import type { DashboardLayoutSnapshot, DataSource, DataSourceId, JsonObject, JsonValue } from "@avesd/workspace-model";
import type { ContributionRegistry } from "@avesd/kernel";
import type { BrowserControlsApi } from "../../../shared/browser-controls";
import { BrowserControlBindings } from "./BrowserControlBindings";
import { resolveWidget } from "./dashboard-widgets";
import type { ApplyLayout, RegisteredWidgets } from "./dashboard-widgets";

export function DashboardLayoutEditor({
  availableWidgets, availableSourceTypes, snapshot, sources, browserControls,
  onDone, addWidget, createSource, apply,
}: {
  readonly availableWidgets: RegisteredWidgets;
  readonly availableSourceTypes: ReturnType<ContributionRegistry<DataSourceContribution>["getAll"]>;
  readonly snapshot?: DashboardLayoutSnapshot;
  readonly sources: readonly DataSource[];
  readonly browserControls?: BrowserControlsApi;
  readonly onDone: () => void;
  readonly addWidget: (pluginId: string, widget: WidgetContribution) => Promise<void>;
  readonly createSource: (pluginId: string, source: DataSourceContribution, kind: "dashboard" | "workspace") => Promise<void>;
  readonly apply: ApplyLayout;
}) {
  return (
    <aside className="layout-editor" aria-label="Widget library">
      <header>
        <div>
          <span>Dashboard</span>
          <h2>Edit layout</h2>
        </div>
        <button type="button" onClick={onDone}>Done</button>
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
      {browserControls && snapshot && <BrowserControlBindings api={browserControls} widgets={snapshot.widgets} />}
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
  );
}

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
