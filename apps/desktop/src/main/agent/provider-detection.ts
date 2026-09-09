/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Provider Detection
 */

import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, isAbsolute, join } from "node:path";

export interface CliProbe {
    status: "installed" | "not-found" | "error";
    resolvedPath?: string;
    version?: string;
    message?: string;
}

/** Resolve without invoking a shell or sourcing user startup scripts. */
export async function resolveUserExecutable(command: string, configuredPath: string, environment = process.env, home = homedir()): Promise<string | undefined> {
    const directories = [
        ...(environment.PATH ?? "").split(delimiter).filter(path => {
            return isAbsolute(path) && !path.includes("node_modules");
        }),
        join(home, ".local", "bin"),
        join(home, ".opencode", "bin"),
        join(home, ".bun", "bin"),
        join(home, ".npm-global", "bin"),
        "/opt/homebrew/bin",
        "/usr/local/bin",
        "/usr/bin",
        ...(process.platform === "win32" && environment.APPDATA ? [join(environment.APPDATA, "npm")] : []),
    ];
    const candidates = configuredPath ? [configuredPath] : [...new Set(directories)].flatMap(directory =>
    {
        return (process.platform === "win32" ? [
            ".exe",
            ".cmd",
            ".bat",
            "",
        ] : [""]).map(extension => {
            return join(directory, command + extension);
        });
    });
    for (const candidate of candidates) {
        try {
            if ((await stat(candidate)).isFile()) {
                await access(candidate, constants.X_OK); return candidate;
            }
        } catch { /* Try the next installation directory. */ }
    }
    return undefined;
}

export async function probeCli(command: string, configuredPath: string): Promise<CliProbe> {
    const resolvedPath = await resolveUserExecutable(command, configuredPath);
    if (!resolvedPath) {
        return {
            status: "not-found",
            message: configuredPath ? "No executable found at the configured path." : "CLI not found in PATH or common installation locations.",
        };
    }
    if (process.platform === "win32" && /\.(cmd|bat)$/i.test(resolvedPath)) {
        return {
            status: "error",
            resolvedPath,
            message: "Select the native executable instead of a Windows command shim.",
        };
    }
    return new Promise(resolve => {
        execFile(resolvedPath, ["--version"], {
            timeout: 8000,
            killSignal: "SIGKILL",
            maxBuffer: 64 * 1024,
            windowsHide: true,
        }, (error, stdout) => {
            if (error) {
                resolve({
                    status: "error",
                    resolvedPath,
                    message: error.killed ? "Version check timed out. Check the executable and refresh." : "CLI was found but could not run. Check the executable and refresh.",
                }); return;
            }
            const version = stdout.match(/\b\d+\.\d+\.\d+(?:[-+][\w.-]+)?\b/)?.[0];
            resolve({
                status: "installed",
                resolvedPath,
                version,
            });
        });
    });
}
