import { ipcMain } from "electron";
import type { WebContents } from "electron";
import { parseWidgetWorkspaceRequest, requiredWorkspaceCapability, widgetWorkspaceChannels } from "../shared/widget-workspace";
import type { WidgetWorkspaceIdentity, WidgetWorkspaceRequest, WidgetWorkspaceResult } from "../shared/widget-workspace";

interface WidgetSession {
  readonly identity: WidgetWorkspaceIdentity;
  invoke(request: WidgetWorkspaceRequest, isActive: () => boolean): Promise<WidgetWorkspaceResult>;
}

/** Native widget callers are identified by their registered WebContents, never a supplied ID. */
export class WidgetWorkspaceBridge {
  readonly #sessions = new Map<WebContents, WidgetSession>();
  constructor() {
    ipcMain.handle(widgetWorkspaceChannels.invoke, (event, input: unknown) => {
      const session = this.#sessions.get(event.sender);
      if (!session || event.senderFrame !== event.sender.mainFrame) throw new Error("Widget workspace session is unavailable.");
      if (input && typeof input === "object" && "type" in input && input.type === "context") return session.identity;
      const request = parseWidgetWorkspaceRequest(input);
      if (!session.identity.capabilities.includes(requiredWorkspaceCapability(request))) throw new Error("Widget workspace capability was not granted.");
      return session.invoke(request, () => this.#sessions.get(event.sender) === session && !event.sender.isDestroyed());
    });
  }

  register(contents: WebContents, session: WidgetSession): () => void {
    this.#sessions.set(contents, session);
    const dispose = () => { this.#sessions.delete(contents); };
    contents.once("destroyed", dispose);
    return () => { dispose(); contents.off("destroyed", dispose); };
  }

  changed(): void {
    for (const [contents, session] of this.#sessions) {
      if (!contents.isDestroyed() && session.identity.capabilities.some((capability) => capability === "catalog" || capability === "navigation")) {
        contents.send(widgetWorkspaceChannels.changed);
      }
    }
  }
}
