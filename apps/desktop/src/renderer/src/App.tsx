import { useSyncExternalStore } from "react";

import { agentOverlayRegistry, mainViewRegistry } from "./workbench/runtime";
import { agentOverlayContribution, mainViewContribution } from "./workbench/types";

export const App = () => {
  const view = useSyncExternalStore(
    (listener) => mainViewRegistry.subscribe(listener),
    () => mainViewRegistry.get(mainViewContribution.id),
  );
  const overlay = useSyncExternalStore(
    (listener) => agentOverlayRegistry.subscribe(listener),
    () => agentOverlayRegistry.get(agentOverlayContribution.id),
  );

  return (
    <main className="app-shell">
      <div className="plugin-slot">{view?.render()}</div>
      <div className="overlay-slot">{overlay?.render()}</div>
    </main>
  );
};
