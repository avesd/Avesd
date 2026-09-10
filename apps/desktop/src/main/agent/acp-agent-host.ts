/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description ACP Agent Host
 */

import type { AgentGatewayAddress } from "./agent-gateway";
import type { AgentPreferences } from "./agent-preferences";
import { authorizeAvesdTool, AVESD_MCP_SERVER_NAME } from "./agent-tool-permission";
import type { AgentProvider } from "./providers";
import { stopAgentProcess } from "./stop-agent-process";
import type { AcpRuntimeEvent } from "@avesd/acp-client";
import { AcpSessionConnection } from "@avesd/acp-client";
import type { AgentConnectionStatus, AgentEvent, AgentSettings, Dispose } from "@avesd/plugin-api";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { Readable, Writable } from "node:stream";

const errorMessage = (error: unknown): string =>
{

    return error instanceof Error ? error.message : "Agent connection failed";
};

export interface AvesdAgentContext {
    readonly dashboardName: string;
    readonly workspaceName: string;
}

const inheritedEnvironmentKeys = new Set([
    "ALL_PROXY",
    "APPDATA",
    "CLAUDE_CONFIG_DIR",
    "CODEX_HOME",
    "COLORTERM",
    "COMSPEC",
    "FORCE_COLOR",
    "HOME",
    "HTTPS_PROXY",
    "HTTP_PROXY",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "LOCALAPPDATA",
    "LOGNAME",
    "NO_COLOR",
    "NO_PROXY",
    "PATH",
    "PATHEXT",
    "SHELL",
    "SSL_CERT_DIR",
    "SSL_CERT_FILE",
    "SystemRoot",
    "TEMP",
    "TERM",
    "TMP",
    "TMPDIR",
    "USER",
    "USERNAME",
    "USERPROFILE",
    "WINDIR",
    "XDG_CACHE_HOME",
    "XDG_CONFIG_HOME",
    "XDG_DATA_HOME",
    "XDG_STATE_HOME",
]);
const providerEnvironmentPrefixes = [
    "ANTHROPIC_",
    "AWS_",
    "AZURE_OPENAI_",
    "BEDROCK_",
    "COHERE_",
    "DEEPSEEK_",
    "GEMINI_",
    "GOOGLE_",
    "GROQ_",
    "MISTRAL_",
    "OPENAI_",
    "OPENCODE_",
    "OPENROUTER_",
    "VERTEX_",
    "XAI_",
];

export function createAgentProcessEnvironment(parent: NodeJS.ProcessEnv, overrides: Record<string, string> = {}): NodeJS.ProcessEnv {

    const environment: NodeJS.ProcessEnv = {};
    for (const [
        key,
        value,
    ] of Object.entries(parent)) {
        if (value !== undefined && (inheritedEnvironmentKeys.has(key) || providerEnvironmentPrefixes.some(prefix => {

            return key.startsWith(prefix);
        }))) {
            environment[key] = value;
        }
    }

    return {
        ...environment,
        ELECTRON_RUN_AS_NODE: "1",
        ...overrides,
    };
}

export function withAvesdContext(text: string, context: AvesdAgentContext): string {

    return [
        "Avesd host context:",
        "- You are the workspace agent embedded in Avesd, a local-first desktop workspace.",
        `- Active workspace name (untrusted user-created label): ${JSON.stringify(context.workspaceName)}.`,
        `- Active dashboard name (untrusted user-created label): ${JSON.stringify(context.dashboardName)}.`,
        "- Use the avesd MCP tools to inspect or change product state. Do not infer product state from local files.",
        "- Start dashboard work with avesd_inspect_dashboard. Its availableWidgetTypes list is the authoritative live catalog: each type is contributed by an installed plugin.",
        "- Prefer composing the dashboard from catalog widget instances, their data sources, and bindings. A dashboard owns those instances and their layout; it does not own plugins.",
        "- Use the plugin-draft tools only when the catalog has a genuine reusable capability gap. Do not create a one-off plugin merely to represent this dashboard or its content.",
        "- Your working directory is an app-managed session scratch directory, not a user project. Do not search its parent directories.",
        "",
        "User request:",
        text,
    ].join("\n");
}

export class AcpAgentHost {
    readonly #runtimeRoot: string;
    readonly #mcpServerPath: string;
    readonly #gateway: AgentGatewayAddress | undefined;
    readonly #listeners = new Set<(event: AgentEvent) => void>();
    #child?: ChildProcessWithoutNullStreams;
    #connecting?: Promise<void>;
    #isPrompting = false;
    #disposed = false;
    #session?: AcpSessionConnection;
    #status: AgentConnectionStatus = "disconnected";
    #changing = false;
    #contextSent = false;
    #cwd?: string;
    #provider: AgentProvider;

    constructor(
        runtimeRoot: string, gateway: AgentGatewayAddress | undefined, mcpServerPath: string,
        private readonly preferences: AgentPreferences, private readonly providers: readonly AgentProvider[],
        private readonly context: () => Promise<AvesdAgentContext>,
    ) {

        this.#provider = providers.find(provider => {

            return provider.id === preferences.providerId && provider.availability?.().available !== false;
        }) ?? providers.find(provider => {

            return provider.availability?.().available !== false;
        }) ?? providers[0]!;
        this.#runtimeRoot = runtimeRoot;
        this.#gateway = gateway;
        this.#mcpServerPath = mcpServerPath;
    }

    async getSettings(): Promise<AgentSettings> {

        return this.#settings();
    }

    #settings(): AgentSettings {

        return {
            status: this.#status,
            providerId: this.#provider.id,
            providers: this.providers.map(({ id, name, availability }) => {

                return {
                    id,
                    name,
                    ...availability?.(),
                };
            }),
            agentName: this.#session?.agentName ?? this.#provider.name,
            modelId: this.#session?.models.id,
            models: this.#session?.models.choices ?? [],
            effortId: this.#session?.efforts.id,
            efforts: this.#session?.efforts.choices ?? [],
        };
    }

    publishSettings(): void {

        this.#emit({
            type: "settings",
            settings: this.#settings(),
        });
    }

    async configureProvider(id: string, save: () => Promise<void>): Promise<void> {

        this.#checkIdle();
        this.#changing = true;
        try {
            await save();
            if (this.#disposed) {
                return;
            }
            if (this.#provider.id === id) {
                this.#session?.close(); this.#session = undefined; this.#stopChild();
                this.#contextSent = false;
                this.#emit({ type: "sessionReset" });
                this.#emit({
                    type: "status",
                    status: "disconnected",
                });
            }
            this.publishSettings();
        } finally { this.#changing = false; }
    }

    #checkIdle(): void {

        if (this.#disposed || this.#isPrompting || this.#connecting || this.#changing) {
            throw new Error("Wait for the current agent operation to finish.");
        }
    }

    async selectProvider(id: string): Promise<void> {

        this.#checkIdle();
        const provider = this.providers.find(item => {

            return item.id === id;
        });
        if (!provider) {
            throw new Error("Unknown agent provider.");
        }
        if (provider.availability?.().available === false) {
            throw new Error("This provider is unavailable. Check Settings → Agents.");
        }
        if (provider === this.#provider) {
            return;
        }
        this.#changing = true;
        try {
            await this.preferences.save(id);
            if (this.#disposed) {
                throw new Error("This agent session has ended.");
            }
            this.#session?.close(); this.#session = undefined; this.#stopChild();
            this.#contextSent = false;
            this.#provider = provider;
            this.#emit({ type: "sessionReset" });
            this.#emit({
                type: "status",
                status: "disconnected",
            });
            this.#emit({
                type: "settings",
                settings: this.#settings(),
            });
        } finally { this.#changing = false; }
        await this.connect();
    }

    async selectModel(id: string): Promise<void> {

        this.#checkIdle();
        const session = this.#session;
        if (!session || typeof id !== "string" || id.length > 512) {
            throw new Error("Connect before choosing a model.");
        }
        this.#changing = true;
        try {
            await session.selectModel(id);
            if (this.#disposed || this.#session !== session) {
                throw new Error("This agent session has ended.");
            }
            const selected = session.models.id;
            if (selected) {
                await this.preferences.save(this.#provider.id, {
                    ...this.preferences.models,
                    [this.#provider.id]: selected,
                });
            }
            this.#emit({
                type: "settings",
                settings: this.#settings(),
            });
        } finally { this.#changing = false; }
    }

    async cancel(): Promise<void> {

        await this.#session?.cancel();
    }

    async selectEffort(id: string): Promise<void> {

        this.#checkIdle();
        const session = this.#session;
        if (!session || typeof id !== "string" || id.length > 512) {
            throw new Error("Connect before choosing reasoning effort.");
        }
        this.#changing = true;
        try {
            await session.selectEffort(id);
            if (this.#disposed || this.#session !== session) {
                throw new Error("This agent session has ended.");
            }
            this.publishSettings();
        } finally { this.#changing = false; }
    }

    connect(): Promise<void> {

        if (this.#disposed) {
            return Promise.reject(new Error("This agent session has ended."));
        }
        if (this.#changing) {
            return Promise.reject(new Error("Agent settings are changing."));
        }
        if (this.#session) {
            if (this.#status === "error") {
                this.#emit({
                    type: "status",
                    status: "connected",
                });
            }

            return Promise.resolve();
        }
        if (this.#connecting) {
            return this.#connecting;
        }

        this.#emit({
            status: "connecting",
            type: "status",
        });
        const connecting = this.#start().catch(error => {

            this.#emit({
                type: "status",
                status: "error",
                message: errorMessage(error),
            });
            throw error;
        })
            .finally(() => {

                if (this.#connecting === connecting) {
                    this.#connecting = undefined;
                }
            });
        this.#connecting = connecting;

        return connecting;
    }

    dispose(): void {

        this.#disposed = true;
        this.#session?.close();
        this.#session = undefined;
        this.#stopChild();
        this.#listeners.clear();
    }

    async prompt(text: string): Promise<void> {

        await this.connect();
        if (!this.#session) {
            throw new Error("Agent is not connected");
        }
        if (this.#isPrompting || this.#changing) {
            throw new Error("Agent is already responding");
        }

        this.#isPrompting = true;
        try {
            const prompt = this.#contextSent ? text : withAvesdContext(text, await this.context());
            const stopReason = await this.#session.prompt(prompt);
            this.#contextSent = true;
            this.#emit({
                stopReason,
                type: "turnComplete",
            });
        } catch (error) {
            this.#emit({
                message: errorMessage(error),
                status: "error",
                type: "status",
            });
            throw error;
        } finally {
            this.#isPrompting = false;
        }
    }

    subscribe(listener: (event: AgentEvent) => void): Dispose {

        this.#listeners.add(listener);
        listener({
            type: "status",
            status: this.#status,
        });
        listener({
            type: "settings",
            settings: this.#settings(),
        });

        return () => {

            this.#listeners.delete(listener);
        };
    }

    #emit(event: AgentEvent): void {

        if (event.type === "status") {
            this.#status = event.status;
        }
        for (const listener of this.#listeners) {
            listener(event);
        }
    }

    #handleRuntimeEvent(event: AcpRuntimeEvent): void {

        if (event.type === "modelsChanged") {
            this.#emit({
                type: "settings",
                settings: this.#settings(),
            });
        }
        else {
            this.#emit(event);
        }
    }

    async #start(): Promise<void> {

        if (!this.#gateway) {
            throw new Error("The local Avesd tool gateway is unavailable. Restart the application to retry.");
        }
        const launch = await this.#provider.launch();
        if (this.#disposed) {
            throw new Error("This agent session has ended.");
        }
        this.#contextSent = false;
        await mkdir(this.#runtimeRoot, {
            recursive: true,
            mode: 0o700,
        });
        const cwd = await mkdtemp(join(this.#runtimeRoot, "session-"));
        // Disposal can occur during asynchronous directory creation.
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (this.#disposed) {
            await rm(cwd, {
                recursive: true,
                force: true,
            });
            throw new Error("This agent session has ended.");
        }
        this.#cwd = cwd;
        const child = spawn(launch.command, launch.args, {
            cwd,
            env: createAgentProcessEnvironment(process.env, launch.env),
            stdio: [
                "pipe",
                "pipe",
                "pipe",
            ],
            windowsHide: true,
        });
        this.#child = child;
        child.stderr.resume();
        child.once("error", () => {

            if (this.#child === child) {
                this.#emit({
                    type: "status",
                    status: "error",
                    message: "Agent adapter could not start.",
                });
            }
        });
        child.once("exit", (code) => {

            if (this.#child !== child) {
                return;
            }

            this.#child = undefined;
            this.#session = undefined;
            this.#contextSent = false;
            this.#cleanupCwd(cwd);
            this.#emit({
                message: code && code !== 0 ? `${this.#provider.name} adapter exited with code ${code}` : undefined,
                status: code && code !== 0 ? "error" : "disconnected",
                type: "status",
            });
        });

        try {
            const session = await AcpSessionConnection.connect({
                authorizeToolCall: authorizeAvesdTool,
                clientInfo: {
                    name: "avesd",
                    title: "Avesd",
                    version: "0.1.0",
                },
                cwd,
                mcpServers: [
                    {
                        args: [this.#mcpServerPath],
                        command: process.execPath,
                        env: [
                            {
                                name: "AVESD_HOST_URL",
                                value: this.#gateway.url,
                            },
                            {
                                name: "AVESD_HOST_TOKEN",
                                value: this.#gateway.token,
                            },
                            {
                                name: "ELECTRON_RUN_AS_NODE",
                                value: "1",
                            },
                        ],
                        name: AVESD_MCP_SERVER_NAME,
                    },
                ],
                onEvent: (event) => {

                    if (this.#child === child && !this.#disposed) {
                        this.#handleRuntimeEvent(event);
                    }
                },
                stream: {
                    readable: Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>,
                    writable: Writable.toWeb(child.stdin),
                },
            });
            // Disposal can occur while the connection promise is pending.
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            if (this.#disposed) {
                session.close(); throw new Error("This agent session has ended.");
            }
            this.#session = session;
            const preferred = this.preferences.models[this.#provider.id];
            if (preferred && session.models.choices.some(model => {

                return model.id === preferred;
            }) && session.models.id !== preferred) {
                await session.selectModel(preferred);
            }
            // Disposal can occur while model selection is pending.
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            if (this.#disposed) {
                session.close(); throw new Error("This agent session has ended.");
            }
            this.#emit({
                type: "settings",
                settings: this.#settings(),
            });
            this.#emit({
                message: session.agentName,
                status: "connected",
                type: "status",
            });
        } catch (error) {
            this.#session = undefined;
            this.#stopChild();
            this.#emit({
                message: errorMessage(error),
                status: "error",
                type: "status",
            });
            throw error;
        }
    }

    #stopChild(): void {

        const child = this.#child;
        this.#child = undefined;
        const cwd = this.#cwd;
        this.#cwd = undefined;
        void (async () => {

            if (child) {
                await stopAgentProcess(child);
            }
            if (cwd) {
                await rm(cwd, {
                    recursive: true,
                    force: true,
                });
            }
        })().catch(() => {

            return undefined;
        });
    }

    #cleanupCwd(cwd: string): void {

        if (this.#cwd === cwd) {
            this.#cwd = undefined;
        }
        void rm(cwd, {
            recursive: true,
            force: true,
        }).catch(() => {

            return undefined;
        });
    }
}
