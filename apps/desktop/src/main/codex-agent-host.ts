import { spawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { createRequire } from "node:module";
import { Readable, Writable } from "node:stream";

import { AcpSessionConnection } from "@avesd/acp-client";
import type { AcpRuntimeEvent } from "@avesd/acp-client";
import type { AgentEvent, Dispose } from "@avesd/plugin-api";
import type { AgentWorkbenchContext } from "../shared/desktop-api";

const moduleRequire = createRequire(import.meta.url);

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown Codex connection error";

export class CodexAgentHost {
  readonly #cwd: string;
  readonly #mcpServerPath: string;
  readonly #workspacePath: string;
  readonly #listeners = new Set<(event: AgentEvent) => void>();
  #child?: ChildProcessWithoutNullStreams;
  #connecting?: Promise<void>;
  #isPrompting = false;
  #session?: AcpSessionConnection;
  #workbenchContext?: AgentWorkbenchContext;

  constructor(cwd: string, workspacePath: string, mcpServerPath: string) {
    this.#cwd = cwd;
    this.#workspacePath = workspacePath;
    this.#mcpServerPath = mcpServerPath;
  }

  configureWorkbench(context: AgentWorkbenchContext): void {
    this.#workbenchContext = context;
  }

  async cancel(): Promise<void> {
    await this.#session?.cancel();
  }

  connect(): Promise<void> {
    if (this.#session) {
      return Promise.resolve();
    }
    if (this.#connecting) {
      return this.#connecting;
    }

    this.#emit({ status: "connecting", type: "status" });
    const connecting = this.#start().finally(() => {
      if (this.#connecting === connecting) {
        this.#connecting = undefined;
      }
    });
    this.#connecting = connecting;
    return connecting;
  }

  dispose(): void {
    this.#session?.close();
    this.#session = undefined;
    this.#stopChild();
    this.#listeners.clear();
  }

  async prompt(text: string): Promise<void> {
    await this.connect();
    if (!this.#session) {
      throw new Error("Codex is not connected");
    }
    if (this.#isPrompting) {
      throw new Error("Codex is already responding");
    }

    this.#isPrompting = true;
    try {
      const stopReason = await this.#session.prompt(text);
      this.#emit({ stopReason, type: "turnComplete" });
    } catch (error) {
      this.#emit({ message: errorMessage(error), status: "error", type: "status" });
      throw error;
    } finally {
      this.#isPrompting = false;
    }
  }

  subscribe(listener: (event: AgentEvent) => void): Dispose {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  #emit(event: AgentEvent): void {
    for (const listener of this.#listeners) {
      listener(event);
    }
  }

  #handleRuntimeEvent(event: AcpRuntimeEvent): void {
    this.#emit(event);
  }

  async #start(): Promise<void> {
    const adapterPath = moduleRequire.resolve("@agentclientprotocol/codex-acp");
    const child = spawn(process.execPath, [adapterPath], {
      cwd: this.#cwd,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        INITIAL_AGENT_MODE: "read-only",
      },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    this.#child = child;
    child.stderr.resume();
    child.once("exit", (code) => {
      if (this.#child !== child) {
        return;
      }

      this.#child = undefined;
      this.#session = undefined;
      this.#emit({
        message: code && code !== 0 ? `Codex adapter exited with code ${code}` : undefined,
        status: code && code !== 0 ? "error" : "disconnected",
        type: "status",
      });
    });

    try {
      this.#session = await AcpSessionConnection.connect({
        clientInfo: { name: "avesd", title: "Avesd", version: "0.1.0" },
        cwd: this.#cwd,
        mcpServers: this.#workbenchContext ? [{
          args: [this.#mcpServerPath],
          command: process.execPath,
          env: [
            { name: "AVESD_MCP_CONTEXT", value: JSON.stringify(this.#workbenchContext) },
            { name: "AVESD_WORKSPACE_PATH", value: this.#workspacePath },
            { name: "ELECTRON_RUN_AS_NODE", value: "1" },
          ],
          name: "Avesd workspace",
        }] : [],
        onEvent: (event) => this.#handleRuntimeEvent(event),
        stream: {
          readable: Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>,
          writable: Writable.toWeb(child.stdin),
        },
      });
      this.#emit({
        message: this.#session.agentName,
        status: "connected",
        type: "status",
      });
    } catch (error) {
      this.#session = undefined;
      this.#stopChild();
      this.#emit({ message: errorMessage(error), status: "error", type: "status" });
      throw error;
    }
  }

  #stopChild(): void {
    const child = this.#child;
    this.#child = undefined;
    if (child && !child.killed) {
      child.kill();
    }
  }
}
