import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type { BrowserBindingStorage } from "./browser-bindings";

export function browserBindingFile(path: string): BrowserBindingStorage {
  return {
    async load() {
      try { return JSON.parse(await readFile(path, "utf8")) as unknown; }
      catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
        throw new Error("Browser bindings could not be loaded.", { cause: error });
      }
    },
    async save(bindings) {
      await mkdir(dirname(path), { recursive: true });
      const temporary = `${path}.${randomUUID()}.tmp`;
      await writeFile(temporary, JSON.stringify(bindings), { encoding: "utf8", mode: 0o600 });
      await rename(temporary, path);
    },
  };
}
