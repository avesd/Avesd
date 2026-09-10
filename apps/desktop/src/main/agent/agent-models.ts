/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Isolated ACP model discovery and explicit connection tests
 */

import type { AgentRouteProbeResult, AgentTierRoute } from "../../shared/agent/sessions";
import { createAgentProcessEnvironment } from "./acp-agent-host";
import type { AgentProvider } from "./providers";
import { AcpSessionConnection } from "@avesd/acp-client";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { Readable, Writable } from "node:stream";

export class AgentModels {
    private readonly active = new Set<() => void>();
    private disposed = false;
    constructor(private readonly runtimeRoot: string, private readonly providers: () => readonly AgentProvider[]) {}

    async probe(route: AgentTierRoute, test: boolean): Promise<AgentRouteProbeResult> {

        if (this.disposed || this.active.size >= 3) {
            return {
                ok: false,
                message: "Model discovery is busy. Try again shortly.",
            };
        }
        const provider = this.providers().find(item => {

            return item.id === route.providerId;
        });
        if (!provider || provider.availability?.().available === false) {
            return {
                ok: false,
                message: "This ACP is unavailable. Check its installation and enable it in Settings → Agents.",
            };
        }
        let child: ChildProcessWithoutNullStreams | undefined;
        let session: AcpSessionConnection | undefined;
        let directory: string | undefined;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let fail!: (error: Error) => void;
        let stopped = false;
        const isStopped = () => {

            return stopped || this.disposed;
        };
        let message = "Could not connect to this ACP. Check its CLI installation and local login, then refresh.";
        const failure = new Promise<never>((_resolve, reject) => {

            fail = reject;
        });
        const stop = () => {

            stopped = true;
            fail(new Error("Probe stopped"));
        };
        this.active.add(stop);
        const work = async (): Promise<AgentRouteProbeResult> => {

            await mkdir(this.runtimeRoot, {
                recursive: true,
                mode: 0o700,
            });
            directory = await mkdtemp(join(this.runtimeRoot, "model-probe-"));
            const launch = await provider.launch();
            if (isStopped()) {
                throw new Error("Probe stopped");
            }
            child = spawn(launch.command, launch.args, {
                cwd: directory,
                env: createAgentProcessEnvironment(process.env, launch.env),
                stdio: [
                    "pipe",
                    "pipe",
                    "pipe",
                ],
                windowsHide: true,
            });
            child.stderr.resume();
            child.once("error", fail);
            child.once("exit", () => {

                return void fail(new Error("ACP exited"));
            });
            session = await AcpSessionConnection.connect({
                clientInfo: {
                    name: "avesd-model-settings",
                    version: "0.1.0",
                },
                cwd: directory,
                mcpServers: [],
                allowedToolNames: [],
                onEvent() {},
                stream: {
                    readable: Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>,
                    writable: Writable.toWeb(child.stdin),
                },
            });
            if (isStopped()) {
                session.close();
                throw new Error("Probe stopped");
            }
            const defaultModelId = session.models.id;
            const modelOffered = !route.modelId || session.models.choices.some(item => {

                return item.id === route.modelId;
            });
            if (modelOffered && route.modelId && route.modelId !== session.models.id) {
                message = "This ACP could not select the model. Refresh its options and choose another model.";
                await session.selectModel(route.modelId);
            }
            const defaultEffortId = session.efforts.id;
            if (test) {
                if (!modelOffered) {
                    return {
                        ok: false,
                        message: "The selected model is no longer offered by this ACP. Refresh and choose another model.",
                    };
                }
                if (route.effortId && !session.efforts.choices.some(item => {

                    return item.id === route.effortId;
                })) {
                    return {
                        ok: false,
                        message: "The selected effort is unavailable for this model. Choose another effort or use its default.",
                    };
                }
                if (route.effortId && route.effortId !== session.efforts.id) {
                    message = "This ACP could not select the effort. Refresh its options and choose another effort.";
                    await session.selectEffort(route.effortId);
                }
                message = "The test request failed. Check the selected model, CLI version, local login and usage limits, then retry.";
                const reason = await session.prompt("Connection test. Reply with OK only. Do not use tools, access files, or delegate.");
                if (reason !== "end_turn") {
                    return {
                        ok: false,
                        message: "The test request did not finish. Retry or choose another model.",
                    };
                }
            }

            return {
                ok: true,
                tested: test,
                options: {
                    models: session.models.choices,
                    efforts: modelOffered ? session.efforts.choices : [],
                    defaultModelId,
                    defaultEffortId,
                    modelId: session.models.id,
                    effortId: session.efforts.id,
                },
            };
        };
        const pending = work();
        try {
            timer = setTimeout(() => {

                message = "The ACP check timed out. Check its installation and connection, then retry.";
                stop();
            }, 45000);

            return await Promise.race([
                pending,
                failure,
            ]);
        } catch {
            return {
                ok: false,
                message,
            };
        } finally {
            clearTimeout(timer);
            session?.close();
            if (child && child.exitCode === null && child.signalCode === null) {
                const current = child;
                await new Promise<void>(resolve => {

                    const killTimer = setTimeout(() => {

                        current.kill("SIGKILL"); resolve();
                    }, 1500);
                    current.once("exit", () => {

                        clearTimeout(killTimer); resolve();
                    });
                    current.kill();
                });
            }
            // A timed-out connection must settle before its scratch directory is removed.
            await pending.catch(() => {
            });
            try {
                if (directory) {
                    await rm(directory, {
                        recursive: true,
                        force: true,
                    });
                }
            } finally { this.active.delete(stop); }
        }
    }

    dispose(): void {

        this.disposed = true;
        for (const stop of this.active) { stop(); }
    }
}
