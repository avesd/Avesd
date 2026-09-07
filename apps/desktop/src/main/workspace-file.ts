import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { parseWorkspaceSnapshot } from "@avesd/workspace-model";
import type { WorkspaceSnapshot } from "@avesd/workspace-model";

export class WorkspaceFile {
  readonly #path: string;
  #saving = Promise.resolve();

  constructor(path: string) {
    this.#path = path;
  }

  async load(): Promise<WorkspaceSnapshot | undefined> {
    try {
      const input: unknown = JSON.parse(await readFile(this.#path, "utf8"));
      return parseWorkspaceSnapshot(input);
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return undefined;
      }
      throw error;
    }
  }

  save(input: unknown): Promise<void> {
    const snapshot = parseWorkspaceSnapshot(input);
    if (!snapshot) {
      throw new Error("Workspace snapshot is required");
    }
    const save = this.#saving.then(async () => {
      await mkdir(dirname(this.#path), { recursive: true });
      const temporaryPath = `${this.#path}.tmp`;
      await writeFile(temporaryPath, `${JSON.stringify(snapshot)}\n`, {
        encoding: "utf8",
        mode: 0o600,
      });
      await rename(temporaryPath, this.#path);
    });
    this.#saving = save.catch(() => undefined);
    return save;
  }
}

const isNodeError = (error: unknown): error is NodeJS.ErrnoException =>
  error instanceof Error && "code" in error;
