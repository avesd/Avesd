/**
 * @author Avesd
 * @package Desktop
 * @namespace TestUnitMainBrowser
 * @description Background collection lifecycle
 */

import { BrowserTasks } from "../../../../src/main/browser/browser-tasks";
import { browserTaskCommandSchema } from "../../../../src/shared/browser/browser-tasks";
import type { WebSurfaceCommand, WebSurfaceState } from "../../../../src/shared/browser/web-surface";
import type { WorkspaceId, WorkspaceSnapshot } from "@avesd/workspace-model";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";

const disposers: (() => Promise<void>)[] = [];
afterEach(async () => {

    for (const dispose of disposers.splice(0)) { await dispose(); } vi.useRealTimers();
});
const setup = async () => {

    const directory = await mkdtemp(join(tmpdir(), "avesd-browser-tasks-"));
    const path = join(directory, "tasks.json");
    const load = async () => {

        return {
            version: 1,
            dashboards: [],
            dataSources: [],
            widgets: [],
            workspaces: [
                {
                    id: "workspace" as WorkspaceId,
                    name: "Synthetic",
                },
                {
                    id: "other" as WorkspaceId,
                    name: "Other",
                },
            ],
        } as WorkspaceSnapshot;
    };
    const tasks = await BrowserTasks.open(path, load, () => {
    });
    let fail = false;
    let state: WebSurfaceState = {
        id: "page",
        document: 0,
        url: "https://example.com/",
        status: "ready",
        result: null,
    };
    const pages = {
        command: vi.fn(async (command: WebSurfaceCommand) => {

            if (command.type === "navigate") {
                state = {
                    ...state,
                    status: fail ? "error" : "ready",
                };
            }
            if (command.type === "run") {
                state = {
                    ...state,
                    result: { total: "17" },
                };
            }

            return state;
        }),
        isPresented: vi.fn(() => {

            return false;
        }),
        dispose: vi.fn(),
    };
    tasks.attach(pages);
    disposers.push(async () => {

        tasks.detach(); await rm(directory, {
            recursive: true,
            force: true,
        });
    });
    const [task] = await tasks.command("workspace", {
        type: "save",
        recipe: {
            name: "Orders",
            url: "https://example.com/",
            fields: { total: "#orders" },
            intervalMinutes: 1,
        },
    });

    return {
        tasks,
        task: task!,
        pages,
        path,
        load,
        fail: () => {

            fail = true;
        },
    };
};

it("retains the last result on failure, isolates workspaces, and reopens durable tasks", async () => {

    const { tasks, task, fail, path, load, pages } = await setup();
    await tasks.command("workspace", {
        type: "refresh",
        id: task.id,
    });
    expect((await tasks.list("workspace"))[0]).toMatchObject({
        result: { total: "17" },
        state: "idle",
    });
    fail();
    await tasks.command("workspace", {
        type: "refresh",
        id: task.id,
    });
    expect((await tasks.list("workspace"))[0]).toMatchObject({
        result: { total: "17" },
        state: "error",
    });
    await expect(tasks.command("other", {
        type: "close",
        id: task.id,
    })).rejects.toThrow("workspace");
    await tasks.command("workspace", {
        type: "pause",
        id: task.id,
    });
    expect(pages.command).toHaveBeenCalledWith({
        type: "destroy",
        id: "page",
    });
    const reopened = await BrowserTasks.open(path, load, () => {
    });
    expect((await reopened.list("workspace"))[0]).toMatchObject({
        paused: true,
        result: { total: "17" },
        pageOpen: false,
    });
    await writeFile(path, "{}");
    await expect(BrowserTasks.open(path, load, () => {
    })).rejects.toThrow("could not be loaded");
});

it("schedules without an Agent, skips presented pages, and stops on pause", async () => {

    vi.useFakeTimers({
        toFake: [
            "Date",
            "setInterval",
            "clearInterval",
        ],
    });
    const { tasks, task, pages } = await setup();
    await vi.advanceTimersByTimeAsync(60_000);
    await vi.waitFor(async () => {

        expect((await tasks.list("workspace"))[0]?.lastSuccess).toBeDefined();
    });
    await tasks.command("workspace", {
        type: "open",
        id: task.id,
    });
    const count = pages.command.mock.calls.length;
    pages.isPresented.mockReturnValue(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(pages.command).toHaveBeenCalledTimes(count);
    await expect(tasks.command("workspace", {
        type: "refresh",
        id: task.id,
    })).rejects.toThrow("Close the browser");
    await tasks.command("workspace", {
        type: "pause",
        id: task.id,
    });
    pages.command.mockClear();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(pages.command).not.toHaveBeenCalled();
});

it("rejects arbitrary scripts, invalid destinations, and oversized selectors at the IPC boundary", () => {

    expect(() => {

        return browserTaskCommandSchema.parse({
            type: "run",
            code: "document.body",
        });
    }).toThrow();
    for (const url of [
        "file:///tmp/private",
        "javascript:alert(1)",
        "https://user:password@example.com/",
    ]) {
        expect(() => {

            return browserTaskCommandSchema.parse({
                type: "save",
                recipe: {
                    name: "Test",
                    url,
                    fields: { title: "h1" },
                    intervalMinutes: 0,
                },
            });
        }).toThrow();
    }
});

it("queues excess collections and recycles hidden pages without losing results", async () => {

    const { tasks, task, pages } = await setup();
    const ids = [task.id];
    for (let index = 1; index < 12; index++) {
        const listing = await tasks.command("workspace", {
            type: "save",
            recipe: {
                name: `Synthetic ${index}`,
                url: task.url,
                fields: task.fields,
                intervalMinutes: 0,
            },
        });
        ids.push(listing.at(-1)!.id);
    }
    let live = 0; let peak = 0;
    let release!: () => void;
    const gate = new Promise<void>(resolve => {

        release = resolve;
    });
    pages.command.mockImplementation(async command => {

        if (command.type === "create") {
            live++; peak = Math.max(peak, live);
        }
        if (command.type === "destroy") {
            live--;
        }
        if (command.type === "run") {
            await gate;
        }

        return {
            id: "page",
            document: 0,
            url: task.url,
            status: "ready",
            result: { total: "17" },
        };
    });
    const work = ids.map(id => {

        return tasks.command("workspace", {
            type: "refresh",
            id,
        });
    });
    await vi.waitFor(() => {

        expect(live).toBe(8);
    });
    release();
    await Promise.all(work);
    await vi.waitFor(async () => {

        expect((await tasks.list("workspace")).every(item => {

            return !!item.lastSuccess && !item.pageOpen;
        })).toBe(true);
    });
    expect(peak).toBe(8);
    expect(live).toBe(0);
    expect((await tasks.list("workspace")).every(item => {

        return item.result?.total === "17" && !item.pageOpen;
    })).toBe(true);
});

it("revokes a queued refresh when paused without opening another page", async () => {

    const { tasks, task, pages } = await setup();
    for (let index = 0; index < 8; index++) {
        const listing = await tasks.command("workspace", {
            type: "save",
            recipe: {
                name: `Held ${index}`,
                url: task.url,
                fields: task.fields,
                intervalMinutes: 0,
            },
        });
        await tasks.command("workspace", {
            type: "open",
            id: listing.at(-1)!.id,
        });
    }
    pages.command.mockClear();
    const work = tasks.command("workspace", {
        type: "refresh",
        id: task.id,
    });
    await vi.waitFor(async () => {

        expect((await tasks.list("workspace"))[0]?.state).toBe("refreshing");
    });
    await work;
    await tasks.command("workspace", {
        type: "pause",
        id: task.id,
    });
    await work;
    expect(pages.command).not.toHaveBeenCalled();
    expect((await tasks.list("workspace"))[0]).toMatchObject({
        paused: true,
        pageOpen: false,
    });
});
