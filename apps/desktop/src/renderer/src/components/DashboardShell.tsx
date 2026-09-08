import type { ContributionRegistry } from "@avesd/kernel";
import { dataSourceContribution } from "@avesd/plugin-data";
import type { DataSourceContribution } from "@avesd/plugin-data";
import { dashboardWidgetContribution } from "@avesd/plugin-ui";
import type { WidgetContribution } from "@avesd/plugin-ui";
import type {
  DashboardLayoutService,
  DashboardLayoutSnapshot,
  DashboardScope,
  DataSource,
  DataSourceId,
  DataSourceService,
  WidgetInstanceId,
} from "@avesd/workspace-model";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { BrowserControlsApi } from "../../../shared/browser-controls";
import { DashboardLayoutEditor } from "./DashboardLayoutEditor";
import { WidgetSurface } from "./WidgetSurface";
import { resolveWidget } from "./dashboard-widgets";
import type { WidgetServiceFactory } from "../workbench/widget-services";

interface DashboardShellProps {
  readonly widgetServices: WidgetServiceFactory;
  readonly browserControls?: BrowserControlsApi;
  readonly dataSources: DataSourceService;
  readonly layouts: DashboardLayoutService;
  readonly scope: DashboardScope;
  readonly sourceTypes: ContributionRegistry<DataSourceContribution>;
  readonly widgets: ContributionRegistry<WidgetContribution>;
}

const EMPTY_WIDGETS: readonly ReturnType<ContributionRegistry<WidgetContribution>["getAll"]>[number][] = [];
const EMPTY_SOURCE_TYPES: readonly ReturnType<ContributionRegistry<DataSourceContribution>["getAll"]>[number][] = [];

export const DashboardShell = ({
  widgetServices,
  browserControls,
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
        (cause: unknown) => {
          if (active) setError(cause instanceof Error ? cause.message : "The dashboard could not be loaded.");
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
            widgetServices={widgetServices}
            apply={apply}
            definition={resolveWidget(availableWidgets, instance)}
            instance={instance}
            isEditing={isEditing}
            key={instance.id}
          />
        ))}
      </div>

      {isEditing && (
        <DashboardLayoutEditor
          availableWidgets={availableWidgets}
          availableSourceTypes={availableSourceTypes}
          snapshot={snapshot}
          sources={sources}
          browserControls={browserControls}
          onDone={() => setIsEditing(false)}
          addWidget={addWidget}
          createSource={createSource}
          apply={apply}
        />
      )}
    </section>
  );
};
