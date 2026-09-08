/**
 * @author Avesd
 * @package Workspace Model
 * @namespace Root
 * @description Plugin Storage
 */

/** Private storage is scoped by the host to the mounting workspace and plugin. */
export interface PluginFileService {
    read(path: string): Promise<Uint8Array>;
    readText(path: string): Promise<string>;
    write(path: string, value: string | Uint8Array): Promise<void>;
    list(path?: string): Promise<readonly PluginFileEntry[]>;
    remove(path: string): Promise<void>;
}
export interface PluginFileEntry {
    readonly name: string;
    readonly kind: "file" | "directory";
}
export type SqlValue = null | string | number | bigint | Uint8Array;
export interface SqlStatement {
    readonly sql: string;
    readonly parameters?: readonly SqlValue[];
}
export interface SqlMutationResult {
    readonly changes: number | bigint;
    readonly lastInsertRowid: number | bigint;
}
export interface PluginDatabase {
    query(sql: string, parameters?: readonly SqlValue[]): Promise<readonly Readonly<Record<string, SqlValue>>[]>;
    execute(sql: string, parameters?: readonly SqlValue[]): Promise<SqlMutationResult>;
    /** All statements commit together or roll back. No callback crosses the IPC boundary. */
    transaction(statements: readonly SqlStatement[]): Promise<readonly SqlMutationResult[]>;
}
export interface PluginSqliteService {
    open(name: string): Promise<PluginDatabase>;
}
