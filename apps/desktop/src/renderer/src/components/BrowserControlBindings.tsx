import { useEffect, useState } from "react";
import type { WidgetInstance } from "@avesd/workspace-model";
import { BROWSER_INPUT, BROWSER_OPERATIONS } from "../../../shared/browser-controls";
import type { BrowserBinding, BrowserControlsApi, BrowserOperation } from "../../../shared/browser-controls";
import { WEB_PLUGIN_ID } from "../../../shared/web-surface";

export function BrowserControlBindings({ api, widgets }: {
  readonly api: BrowserControlsApi;
  readonly widgets: readonly WidgetInstance[];
}) {
  const [bindings, setBindings] = useState<readonly BrowserBinding[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void api.list().then((next) => { if (active) setBindings(next); })
      .catch(() => { if (active) setError("Browser bindings could not be loaded."); });
    return () => { active = false; };
  }, [api, widgets]);
  const sources = widgets.filter((widget) => widget.pluginId === WEB_PLUGIN_ID && widget.widgetTypeId === "controls");
  if (!sources.length) return null;
  return <div className="binding-editor">
    <h3>Browser control bindings</h3>
    <p>Choose the target instance, allowed website and actions. Moving a widget preserves its binding.</p>
    {error && <p role="alert">{error}</p>}
    {sources.map((source) => {
      const binding = bindings.find((item) => item.sourceId === source.id && item.inputId === BROWSER_INPUT);
      return <BindingForm api={api} binding={binding}
        key={`${source.id}/${JSON.stringify(binding)}`} source={source}
        targets={widgets.filter((widget) => widget.pluginId === WEB_PLUGIN_ID && widget.widgetTypeId === "page")}
        changed={async () => setBindings(await api.list())} />;
    })}
  </div>;
}

function BindingForm({ api, binding, source, targets, changed }: {
  readonly api: BrowserControlsApi;
  readonly binding?: BrowserBinding;
  readonly source: WidgetInstance;
  readonly targets: readonly WidgetInstance[];
  readonly changed: () => Promise<void>;
}) {
  const [target, setTarget] = useState(binding?.targetId ?? "");
  const [origin, setOrigin] = useState(binding?.origin ?? "");
  const [operations, setOperations] = useState<readonly BrowserOperation[]>(binding?.operations ?? []);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  return <form aria-label={`Browser binding ${source.id}`} onSubmit={(event) => {
    event.preventDefault(); setBusy(true); setStatus("");
    void (target ? api.bind({ type: "bind", sourceId: source.id, inputId: BROWSER_INPUT,
      targetId: target, origin, operations }) : api.unbind(source.id, BROWSER_INPUT))
      .then(async () => { await changed(); setStatus("Saved"); })
      .catch(() => setStatus("Could not save. Choose a browser and a valid HTTPS or loopback origin."))
      .finally(() => setBusy(false));
  }}>
    <strong>Browser controls · {source.id.slice(0, 8)}</strong>
    <label>Target browser
      <select aria-label="Control target" value={target} onChange={(event) => setTarget(event.target.value)}>
        <option value="">Not connected</option>
        {targets.map((widget) => <option key={widget.id} value={widget.id}>Web page · {widget.id.slice(0, 8)}</option>)}
      </select>
    </label>
    <label>Allowed website origin
      <input aria-label="Allowed website origin" placeholder="https://example.com" value={origin}
        onChange={(event) => setOrigin(event.target.value)} />
    </label>
    {BROWSER_OPERATIONS.map((operation) => <label className="browser-control-permission" key={operation}>
      <input type="checkbox" aria-label={`Allow ${operation}`} checked={operations.includes(operation)}
        onChange={(event) => setOperations(event.target.checked ? [...operations, operation] : operations.filter((item) => item !== operation))} />
      {operation}
    </label>)}
    <button type="submit" disabled={busy}>Save browser binding</button>
    <p role="status">{status}</p>
  </form>;
}
