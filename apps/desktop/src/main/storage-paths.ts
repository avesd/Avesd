import { constants } from "node:fs";
import { access, mkdir } from "node:fs/promises";
import { join, normalize } from "node:path";

import { loadAppConfig } from "./app-config";
import type { AppConfig } from "./app-config";

export interface StoragePaths {
  readonly dataDirectory: string;
  readonly workspace: string;
  readonly browserBindings: string;
  readonly plugins: string;
}

export function resolveStoragePaths(userDataDirectory: string, configuration: AppConfig): StoragePaths {
  const dataDirectory = normalize(configuration.dataDirectory ?? userDataDirectory);
  return {
    dataDirectory,
    workspace: join(dataDirectory, "workspace-v1.json"),
    browserBindings: join(dataDirectory, "browser-bindings-v1.json"),
    plugins: join(dataDirectory, "plugins"),
  };
}

export async function loadStoragePaths(userDataDirectory: string, homeDirectory: string): Promise<StoragePaths> {
  const configuration = await loadAppConfig(homeDirectory);
  const paths = resolveStoragePaths(userDataDirectory, configuration);
  try {
    await mkdir(paths.dataDirectory, { recursive: true, mode: 0o700 });
    await access(paths.dataDirectory, constants.R_OK | constants.W_OK | constants.X_OK);
  } catch {
    throw new Error("The configured data directory could not be opened or created.");
  }
  return paths;
}
