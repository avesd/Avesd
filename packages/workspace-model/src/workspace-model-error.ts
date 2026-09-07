export type WorkspaceModelErrorCode =
  | "already-exists"
  | "not-found"
  | "revision-conflict"
  | "scope-mismatch";

export class WorkspaceModelError extends Error {
  constructor(
    readonly code: WorkspaceModelErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "WorkspaceModelError";
  }
}
