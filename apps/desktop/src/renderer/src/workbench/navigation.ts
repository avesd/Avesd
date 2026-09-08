import type { WorkspaceNavigationCommand, WorkspaceNavigationState } from "@avesd/workspace-model";
import { sameDashboard } from "@avesd/workspace-model";
import type { WorkspaceNavigationApi } from "../../../shared/workspace-navigation";

/** One selected scope shared by the dashboard and agent views. */
export class WorkbenchNavigation {
  #state: WorkspaceNavigationState;
  #queue: Promise<unknown> = Promise.resolve();
  readonly #listeners = new Set<() => void>();
  constructor(
    private readonly api: WorkspaceNavigationApi,
    private readonly refreshRepository: (notify: boolean) => Promise<void>,
    initial: WorkspaceNavigationState,
  ) { this.#state = initial; }

  getSnapshot = (): WorkspaceNavigationState => this.#state;
  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  };

  command(command: WorkspaceNavigationCommand): Promise<void> {
    const operation = this.#queue.then(async () => {
      const state = await this.api.command(command);
      // Refresh before rendering the new dashboard so no view reads an old replica.
      await this.refreshRepository(sameDashboard(this.#state.scope, state.scope));
      this.#state = state;
      this.#listeners.forEach((listener) => listener());
    });
    this.#queue = operation.catch(() => undefined);
    return operation;
  }
}
