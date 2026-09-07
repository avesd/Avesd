import type { DataSource, DataSourceId, DataSourceService, DashboardScope,
  WorkspaceRepository, WorkspaceScope } from "@avesd/workspace-model";
import { WEB_PLUGIN_ID, WEB_RESULT_TYPE } from "../../../shared/web-surface";
import type { WebSurfaceApi, WebSurfaceState } from "../../../shared/web-surface";

/** Only surface handles live here. Extracted values never enter workspace snapshots or MCP. */
export class WebResults {
  readonly #handles = new Map<string, string>();
  readonly #listeners = new Set<() => void>();

  constructor(private readonly api: WebSurfaceApi, private readonly repository: WorkspaceRepository) {}

  attach(widgetId: string, id: string): void { this.#handles.set(widgetId, id); this.changed(); }
  detach(widgetId: string, id: string): void {
    if (this.#handles.get(widgetId) === id) this.#handles.delete(widgetId);
    this.changed();
  }
  changed(): void { this.#listeners.forEach((listener) => listener()); }

  async list(scope: WorkspaceScope): Promise<readonly DataSource[]> {
    const snapshot = await this.repository.snapshot();
    return Promise.all(snapshot.widgets.filter((widget) => widget.workspaceId === scope.workspaceId
      && widget.pluginId === WEB_PLUGIN_ID && widget.widgetTypeId === "page").map(async (widget, index) => {
      let state: WebSurfaceState | undefined;
      const id = this.#handles.get(widget.id);
      if (id) {
        try { state = await this.api.command({ type: "inspect", id }); } catch { /* Detached surface. */ }
      }
      return { id: `web-result:${widget.id}` as DataSourceId, name: `Web result ${index + 1} (temporary)`,
        pluginId: WEB_PLUGIN_ID, sourceTypeId: "result", dataType: WEB_RESULT_TYPE,
        scope: { kind: "dashboard" as const, workspaceId: widget.workspaceId, dashboardId: widget.dashboardId },
        configuration: {}, revision: state?.document ?? 0, value: state?.result ?? null };
    }));
  }

  wrap(base: DataSourceService): DataSourceService {
    const isWeb = (id: DataSourceId) => id.startsWith("web-result:");
    return {
      create: (scope, command) => base.create(scope, command),
      delete: (scope, id) => {
        if (isWeb(id)) return Promise.reject(new Error("Remove the web widget to remove its output."));
        return base.delete(scope, id);
      },
      list: async (scope: DashboardScope) => [...await base.list(scope), ...await this.list(scope)
        .then((sources) => sources.filter((source) => source.scope.kind === "dashboard"
          && source.scope.dashboardId === scope.dashboardId))],
      read: async (scope, id) => {
        if (!isWeb(id)) return base.read(scope, id);
        const source = (await this.list(scope)).find((source) => source.id === id);
        if (!source) throw new Error("Web output is unavailable.");
        return source;
      },
      update: (scope, id, revision, value) => {
        if (isWeb(id)) return Promise.reject(new Error("Web results are read-only."));
        return base.update(scope, id, revision, value);
      },
      subscribe: (listener) => {
        this.#listeners.add(listener);
        const offBase = base.subscribe(listener);
        const offWeb = this.api.subscribe(listener);
        return () => { this.#listeners.delete(listener); offBase(); offWeb(); };
      },
    };
  }
}
