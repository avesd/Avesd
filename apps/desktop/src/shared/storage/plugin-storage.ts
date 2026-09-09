/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Plugin Storage
 */

import type { PluginFileEntry, SqlMutationResult, SqlStatement, SqlValue } from "@avesd/workspace-model";

export const MAX_FILE_BYTES = 4 * 1024 * 1024;
export type PluginStorageRequest =
  | {
      readonly type: "files";
      readonly operation: "read" | "list" | "remove";
      readonly path: string;
  }
  | {
      readonly type: "files";
      readonly operation: "write";
      readonly path: string;
      readonly value: Uint8Array;
  }
  | {
      readonly type: "sqlite";
      readonly operation: "open";
      readonly path: string;
  }
  | {
      readonly type: "sqlite";
      readonly operation: "query" | "execute";
      readonly path: string;
      readonly statement: SqlStatement;
  }
  | {
      readonly type: "sqlite";
      readonly operation: "transaction";
      readonly path: string;
      readonly statements: readonly SqlStatement[];
  };
export type PluginStorageResult = void | Uint8Array | readonly PluginFileEntry[] | SqlMutationResult
  | readonly SqlMutationResult[] | readonly Readonly<Record<string, SqlValue>>[];

export function storagePath(input: unknown, allowEmpty = false): string {
    if (allowEmpty && input === "") {
        return "";
    }
    if (typeof input !== "string" || input.length > 512 || !input.length) {
        throw new Error("Invalid storage path.");
    }
    const parts = input.split("/");
    if (parts.length > 16 || parts.some(part => {
        return !/^[a-zA-Z0-9_. -]{1,100}$/.test(part)
    || part === "." || part === ".." || part.endsWith(".") || part.endsWith(" ");
    })) {
        throw new Error("Invalid storage path.");
    }
    return input;
}
const record = (input: unknown): Record<string, unknown> => {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw new Error("Invalid storage request.");
    }
    return input as Record<string, unknown>;
};
function statement(input: unknown): SqlStatement {
    const value = record(input);
    if (typeof value.sql !== "string" || !value.sql.trim() || value.sql.length > 16_384) {
        throw new Error("Invalid SQL statement.");
    }
    const parameters = value.parameters ?? [];
    if (!Array.isArray(parameters) || parameters.length > 128 || parameters.some(item =>
    {
        return !(item === null || typeof item === "string" && item.length <= 65_536
      || typeof item === "number" && Number.isFinite(item)
      || typeof item === "bigint" && item >= -(2n ** 63n) && item < 2n ** 63n
      || item instanceof Uint8Array && item.byteLength <= 65_536);
    })) {
        throw new Error("Invalid SQL parameters.");
    }
    if (parameters.reduce((size, item) => {
        return size + (typeof item === "string" ? new TextEncoder().encode(item).byteLength : item instanceof Uint8Array ? item.byteLength : 8);
    }, 0) > MAX_FILE_BYTES) {
        throw new Error("SQL parameters exceed the request limit.");
    }
    return {
        sql: value.sql,
        parameters: parameters.map(item => {
            return item instanceof Uint8Array ? new Uint8Array(item) : item;
        }) as SqlValue[],
    };
}
export function parsePluginStorageRequest(input: unknown): PluginStorageRequest {
    const value = record(input);
    const path = storagePath(value.path, value.type === "files" && value.operation === "list");
    if (value.type === "files") {
        if (value.operation === "read" || value.operation === "list" || value.operation === "remove") {
            return {
                type: "files",
                operation: value.operation,
                path,
            };
        }
        if (value.operation === "write" && value.value instanceof Uint8Array && value.value.byteLength <= MAX_FILE_BYTES) {
            return {
                type: "files",
                operation: "write",
                path,
                value: new Uint8Array(value.value),
            };
        }
    }
    if (value.type === "sqlite" && !path.includes("/") && path.endsWith(".sqlite")) {
        if (value.operation === "open") {
            return {
                type: "sqlite",
                operation: "open",
                path,
            };
        }
        if (value.operation === "query" || value.operation === "execute") {
            return {
                type: "sqlite",
                operation: value.operation,
                path,
                statement: statement(value.statement),
            };
        }
        if (value.operation === "transaction" && Array.isArray(value.statements) && value.statements.length > 0 && value.statements.length <= 64) {
            const statements = value.statements.map(statement);
            const bytes = statements.reduce((total, entry) => {
                return total + new TextEncoder().encode(entry.sql).byteLength
        + (entry.parameters ?? []).reduce<number>((size, item) => {
            return size + (typeof item === "string" ? new TextEncoder().encode(item).byteLength : item instanceof Uint8Array ? item.byteLength : 8);
        }, 0);
            }, 0);
            if (bytes > MAX_FILE_BYTES) {
                throw new Error("SQL batch exceeds the request limit.");
            }
            return {
                type: "sqlite",
                operation: "transaction",
                path,
                statements,
            };
        }
    }
    throw new Error("Invalid storage request.");
}
