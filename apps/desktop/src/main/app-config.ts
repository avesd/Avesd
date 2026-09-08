import { readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

export interface AppConfig {
  readonly dataDirectory?: string;
}

export function parseAppConfig(input: unknown): AppConfig {
  if (!input || typeof input !== "object" || Array.isArray(input)
    || Object.keys(input).some((key) => key !== "dataDirectory")) {
    throw new Error("Avesd configuration must be an object with an optional dataDirectory field.");
  }
  if (!("dataDirectory" in input)) return {};
  const directory = input.dataDirectory;
  if (typeof directory !== "string" || directory.includes("\0") || !isAbsolute(directory)) {
    throw new Error("Avesd dataDirectory must be an absolute directory path.");
  }
  return { dataDirectory: directory };
}

/** Application configuration has a stable home, independent of product data. */
export async function loadAppConfig(homeDirectory: string): Promise<AppConfig> {
  let serialized: string;
  try {
    serialized = await readFile(join(homeDirectory, ".avesd", "config.json"), "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return {};
    throw new Error("Avesd configuration could not be read.", { cause: error });
  }
  let input: unknown;
  try {
    input = JSON.parse(serialized) as unknown;
  } catch {
    throw new Error("Avesd configuration must contain valid JSON.");
  }
  return parseAppConfig(input);
}
