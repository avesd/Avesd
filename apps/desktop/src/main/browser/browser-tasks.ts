/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Task-owned background browser lifecycle and collection
 */

import type { BrowserTask, BrowserTaskCommand, BrowserTaskSummary } from "../../shared/browser/browser-tasks";
import { browserTaskRecipeSchema } from "../../shared/browser/browser-tasks";
import type { WebSurfaceManager } from "./web-surface-manager";
import type { WorkspaceSnapshot } from "@avesd/workspace-model";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import * as z from "zod";

const storedTask = browserTaskRecipeSchema.extend({
    id: z.uuid(),
    workspaceId: z.string().min(1)
        .max(128),
    paused: z.boolean(),
    lastSuccess: z.iso.datetime().optional(),
    result: z.record(z.string(), z.string().max(4096)).refine(value => {

        return Object.keys(value).length <= 16;
    })
        .optional(),
    error: z.string().max(256)
        .optional(),
});
type Pages = Pick<WebSurfaceManager, "command" | "isPresented" | "dispose">;
interface Runtime {
    page?: string;
    opening?: Promise<string>;
    work?: Promise<void>;
    state: BrowserTaskSummary["state"];
    due: number;
}

export class BrowserTasks {
    #tasks: BrowserTask[] = [];
    readonly #runtime = new Map<string, Runtime>();
    readonly #slots = new Set<Runtime>();
    readonly #waiting = new Set<() => void>();
    #pages?: Pages;
    #timer?: ReturnType<typeof setInterval>;
    #writes: Promise<unknown> = Promise.resolve();

    private constructor(private readonly path: string, private readonly load: () => Promise<WorkspaceSnapshot | undefined>, private readonly changed: () => void) {}

    static async open(path: string, load: () => Promise<WorkspaceSnapshot | undefined>, changed: () => void): Promise<BrowserTasks> {

        const service = new BrowserTasks(path, load, changed);
        try {
            const stored = z.strictObject({
                version: z.literal(1),
                tasks: z.array(storedTask).max(100),
            }).parse(JSON.parse(await readFile(path, "utf8")));
            if (new Set(stored.tasks.map(task => {

                return task.id;
            })).size !== stored.tasks.length) {
                throw new Error("Duplicate browser tasks.");
            }
            service.#tasks = stored.tasks;
        } catch (error) {
            if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
                throw new Error("Background browser storage could not be loaded.");
            }
        }

        return service;
    }

    attach(pages: Pages): void {

        this.detach(); this.#pages = pages;
        this.#timer = setInterval(() => {

            void this.#tick();
        }, 1000);
        this.changed();
    }

    detach(): void {

        clearInterval(this.#timer); this.#timer = undefined;
        const pages = this.#pages; this.#pages = undefined; this.#runtime.clear(); pages?.dispose();
        this.#slots.clear(); this.#wake();
    }

    #wake(): void {

        for (const resume of this.#waiting) { resume(); }
        this.#waiting.clear();
    }

    async #reserve(task: BrowserTask, runtime: Runtime, pages: Pages): Promise<void> {

        while (this.#runtime.get(task.id) === runtime && this.#pages === pages) {
            if (this.#slots.size < 8) {
                this.#slots.add(runtime);

                return;
            }
            await new Promise<void>(resolve => {

                this.#waiting.add(resolve);
            });
        }
        throw new Error("Browser task was closed while waiting for a page.");
    }

    #getRuntime(task: BrowserTask): Runtime {

        let runtime = this.#runtime.get(task.id);
        if (!runtime) {
            runtime = {
                state: task.error ? "error" : "closed",
                due: Date.now() + Math.max(1, task.intervalMinutes) * 60_000,
            };
            this.#runtime.set(task.id, runtime);
        }

        return runtime;
    }

    async list(workspaceId: string): Promise<readonly BrowserTaskSummary[]> {

        const snapshot = await this.load();
        if (!snapshot?.workspaces.some(item => {

            return item.id === workspaceId;
        })) {
            throw new Error("Workspace is unavailable.");
        }

        return this.#tasks.filter(task => {

            return task.workspaceId === workspaceId;
        }).map(task => {

            const runtime = this.#getRuntime(task);
            const presented = !!runtime.page && !!this.#pages?.isPresented(runtime.page);

            return {
                ...task,
                state: presented ? "interaction-required" : runtime.state,
                pageOpen: !!runtime.page,
                presented,
            };
        });
    }

    async command(workspaceId: string, command: BrowserTaskCommand): Promise<readonly BrowserTaskSummary[]> {

        await this.list(workspaceId);
        if (command.type === "list") {
            return this.list(workspaceId);
        }
        if (command.type === "save") {
            await this.#write(() => {

                const existing = command.id ? this.#require(workspaceId, command.id) : undefined;
                if (existing && (this.#getRuntime(existing).work || this.#getRuntime(existing).opening)) {
                    throw new Error("Wait for the current browser operation to finish.");
                }
                if (!existing && this.#tasks.length >= 100) {
                    throw new Error("At most 100 browser tasks can be saved.");
                }
                const task: BrowserTask = {
                    ...command.recipe,
                    id: existing?.id ?? randomUUID(),
                    workspaceId,
                    paused: existing?.paused ?? false,
                };

                return [
                    ...this.#tasks.filter(item => {

                        return item.id !== task.id;
                    }),
                    task,
                ];
            });
            if (command.id) {
                await this.#close(this.#require(workspaceId, command.id));
            }
        } else {
            const task = this.#require(workspaceId, command.id);
            const runtime = this.#getRuntime(task);
            if (command.type === "refresh") {
                const waitingForPage = !runtime.page && this.#slots.size >= 8;
                const refresh = this.#refresh(task);
                if (waitingForPage) {
                    // Return control so queued work can still be paused or removed.
                    void refresh.catch(() => {

                        return undefined;
                    });
                } else {
                    await refresh;
                }
            }
            if (command.type === "open") {
                if (runtime.work) {
                    throw new Error("Wait for the refresh to finish, or close the page to cancel it.");
                }
                if (!runtime.page && this.#slots.size >= 8) {
                    throw new Error("Close an existing browser page before opening another.");
                }
                const pages = this.#pages;
                const page = await this.#page(task, runtime);
                if (!pages || this.#pages !== pages || this.#runtime.get(task.id) !== runtime) {
                    throw new Error("Browser task was closed while opening.");
                }
                await pages.command({
                    type: "show",
                    id: page,
                });
                const state = await pages.command({
                    type: "inspect",
                    id: page,
                });
                if (!state.url) {
                    await pages.command({
                        type: "navigate",
                        id: page,
                        url: task.url,
                    });
                }
            }
            if (command.type === "close") {
                await this.#close(task);
            }
            if (command.type === "pause" || command.type === "resume") {
                await this.#write(() => {

                    return this.#tasks.map(item => {

                        return item.id === task.id ? {
                            ...item,
                            paused: command.type === "pause",
                        } : item;
                    });
                });
                // Revoke any in-flight collection before a pause returns.
                await this.#close(this.#require(workspaceId, task.id));
            }
            if (command.type === "remove") {
                await this.#close(task);
                await this.#write(() => {

                    return this.#tasks.filter(item => {

                        return item.id !== task.id;
                    });
                });
            }
        }
        this.changed();

        return this.list(workspaceId);
    }

    #require(workspaceId: string, id: string): BrowserTask {

        const task = this.#tasks.find(item => {

            return item.id === id && item.workspaceId === workspaceId;
        });
        if (!task) {
            throw new Error("Browser task is unavailable in this workspace.");
        }

        return task;
    }

    async #page(task: BrowserTask, runtime: Runtime): Promise<string> {

        if (runtime.page) {
            return runtime.page;
        }
        if (runtime.opening) {
            return runtime.opening;
        }
        const pages = this.#pages;
        if (!pages) {
            throw new Error("Background browser is unavailable.");
        }
        const authorize = async () => {

            const snapshot = await this.load();
            if (this.#pages !== pages || this.#runtime.get(task.id) !== runtime || !this.#tasks.some(item => {

                return item.id === task.id;
            })
                || !snapshot?.workspaces.some(item => {

                    return item.id === task.workspaceId;
                })) {
                throw new Error("Browser task authority changed.");
            }
        };
        runtime.opening = this.#reserve(task, runtime, pages).then(async () => {

            await authorize();

            return pages.command({
                type: "create",
                widgetId: task.id,
            }, authorize, undefined, {
                id: task.id,
                workspaceId: task.workspaceId,
            });
        })
            .then(async state => {

                if (this.#runtime.get(task.id) !== runtime || this.#pages !== pages) {
                    await pages.command({
                        type: "destroy",
                        id: state.id,
                    }).catch(() => {

                        return undefined;
                    });
                    throw new Error("Browser task was closed while opening its page.");
                }
                runtime.page = state.id; runtime.state = "idle"; this.changed();

                return state.id;
            })
            .catch(error => {

                this.#slots.delete(runtime); this.#wake();
                throw error;
            })
            .finally(() => {

                runtime.opening = undefined;
            });

        return runtime.opening;
    }

    async #close(task: BrowserTask): Promise<void> {

        const runtime = this.#runtime.get(task.id);
        this.#runtime.delete(task.id);
        this.#wake();
        if (runtime?.page && this.#pages) {
            const page = runtime.page;
            runtime.page = undefined;
            await this.#pages.command({
                type: "destroy",
                id: page,
            }).catch(() => {

                return undefined;
            });
        }
        if (runtime && !runtime.opening) {
            this.#slots.delete(runtime); this.#wake();
        }
        this.changed();
    }

    #refresh(task: BrowserTask): Promise<void> {

        const runtime = this.#getRuntime(task);
        if (runtime.work) {
            return runtime.work;
        }
        if (runtime.opening) {
            return Promise.reject(new Error("Wait for the page to open before refreshing."));
        }
        if (runtime.page && this.#pages?.isPresented(runtime.page)) {
            return Promise.reject(new Error("Close the browser window before refreshing."));
        }
        const pages = this.#pages;
        if (!pages) {
            return Promise.reject(new Error("Background browser is unavailable."));
        }
        runtime.state = "refreshing"; this.changed();
        const current = () => {

            return this.#runtime.get(task.id) === runtime && this.#pages === pages && this.#tasks.includes(task);
        };
        runtime.work = (async () => {

            try {
                const page = await this.#page(task, runtime);
                runtime.state = "refreshing"; this.changed();
                if (!current() || pages.isPresented(page)) {
                    return;
                }
                await pages.command({
                    type: "navigate",
                    id: page,
                    url: task.url,
                });
                const deadline = Date.now() + 20_000;
                let value: Record<string, string> | undefined;
                while (Date.now() < deadline) {
                    if (!current()) {
                        return;
                    }
                    const state = await pages.command({
                        type: "inspect",
                        id: page,
                    });
                    if (pages.isPresented(page) || (state.url && new URL(state.url).origin !== new URL(task.url).origin)) {
                        runtime.state = "interaction-required";
                        throw new Error("Open the page to complete login, then close its window and refresh.");
                    }
                    if (state.status === "error") {
                        throw new Error("The page could not load. Check the connection and retry.");
                    }
                    if (state.status === "ready") {
                        const output = await pages.command({
                            type: "run",
                            id: page,
                            document: state.document,
                            origin: new URL(task.url).origin,
                            mode: "isolated",
                            code: `(() => { const result = {}; for (const [key, selector] of Object.entries(${JSON.stringify(task.fields)})) { const nodes = document.querySelectorAll(selector); if (nodes.length !== 1) return null; result[key] = nodes[0].textContent.slice(0,4096); } return result; })()`,
                        });
                        if (output.result && typeof output.result === "object" && !Array.isArray(output.result)) {
                            value = output.result as Record<string, string>; break;
                        }
                    }
                    await new Promise(resolve => {

                        return setTimeout(resolve, 250);
                    });
                }
                if (!value) {
                    throw new Error("Expected fields were not found. Check login or repair the extraction rules.");
                }
                await this.#write(() => {

                    if (!current()) {
                        return this.#tasks;
                    }

                    return this.#tasks.map(item => {

                        return item === task ? {
                            ...item,
                            result: value,
                            lastSuccess: new Date().toISOString(),
                            error: undefined,
                        } : item;
                    });
                });
                if (this.#runtime.get(task.id) === runtime) {
                    runtime.state = "idle";
                }
            } catch (error) {
                if (!current()) {
                    return;
                }
                const message = error instanceof Error && /^(Open the page|The page could not|Expected fields)/.test(error.message)
                    ? error.message : "Collection failed. Open the page and check its rules before retrying.";
                if (runtime.state !== "interaction-required") {
                    runtime.state = "error";
                }
                await this.#write(() => {

                    return current() ? this.#tasks.map(item => {

                        return item === task ? {
                            ...item,
                            error: message,
                        } : item;
                    }) : this.#tasks;
                });
            } finally {
                if (runtime.page && runtime.state !== "interaction-required" && !pages.isPresented(runtime.page)) {
                    const page = runtime.page;
                    runtime.page = undefined;
                    await pages.command({
                        type: "destroy",
                        id: page,
                    }).catch(() => {

                        return undefined;
                    });
                    this.#slots.delete(runtime); this.#wake();
                }
                runtime.work = undefined; runtime.due = Date.now() + Math.max(1, task.intervalMinutes) * 60_000; this.changed();
            }
        })();

        return runtime.work;
    }

    async #tick(): Promise<void> {

        try {
            const snapshot = await this.load();
            for (const task of this.#tasks) {
                if (!snapshot) {
                    return;
                }
                if (!snapshot.workspaces.some(item => {

                    return item.id === task.workspaceId;
                })) {
                    await this.#close(task);
                    await this.#write(() => {

                        return this.#tasks.filter(item => {

                            return item.id !== task.id;
                        });
                    });
                    continue;
                }
                const runtime = this.#getRuntime(task);
                if (!task.paused && task.intervalMinutes > 0 && Date.now() >= runtime.due && !runtime.work
                    && runtime.state !== "interaction-required" && !(runtime.page && this.#pages?.isPresented(runtime.page))) {
                    void this.#refresh(task).catch(() => {

                        return undefined;
                    });
                }
            }
        } catch { /* Keep local work usable when storage is temporarily unavailable. */ }
    }

    #write(update: () => BrowserTask[]): Promise<void> {

        const work = this.#writes.then(async () => {

            const tasks = update();
            await mkdir(dirname(this.path), { recursive: true });
            const temporary = `${this.path}.${randomUUID()}.tmp`;
            try {
                await writeFile(temporary, JSON.stringify({
                    version: 1,
                    tasks,
                }), { mode: 0o600 });
                await rename(temporary, this.path);
            } finally { await rm(temporary, { force: true }); }
            this.#tasks = tasks; this.changed();
        });
        this.#writes = work.catch(() => {

            return undefined;
        });

        return work;
    }
}
