/**
 * @author Avesd
 * @package Desktop
 * @namespace TestE2e
 * @description Tier routing and foreground/background ACP sessions
 */

import { createDesktopHarness, expect } from "./support/desktop.mjs";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const harness = await createDesktopHarness("agent-sessions");
const executable = join(harness.directory, "synthetic-acp.mjs");
await writeFile(executable, `#!${process.execPath}
if (process.argv.includes('--version')) { console.log('synthetic-acp 1.0.0'); process.exit(0); }
process.argv[2] = 'synthetic';
const timer = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms, ...args) => timer(fn, ms === 100 ? 1800 : ms, ...args);
await import(${JSON.stringify(pathToFileURL(join(import.meta.dirname, "support/acp-agent.mjs")).href)});
`, { mode: 0o700 });
const content = (id, enabled) => {

    return {
        manifest: {
            apiVersion: 1,
            id,
            version: "1.0.0",
            displayName: "Synthetic agent widget",
            widgetTypeId: "agent",
            size: {
                width: 8,
                height: 8,
            },
            capabilities: enabled ? ["agent"] : [],
        },
        source: "export function mount(root, context) { window.__task = context.agent; root.innerHTML='<p>Agent widget ready</p>'; return { update() {}, dispose() {} }; }",
        tests: [
            {
                type: "expectText",
                selector: "p",
                text: "Agent widget ready",
            },
        ],
    };
};
try {
    let { page } = await harness.launch();
    await page.evaluate(executable => {

        return window.avesd.agentProviders.configure("opencode", {
            enabled: true,
            executablePath: executable,
        });
    }, executable);
    const routes = {
        flagship: {
            providerId: "opencode",
            modelId: "deep",
            effortId: "high",
        },
        reasoning: {
            providerId: "opencode",
            modelId: "fast",
            effortId: "high",
        },
        action: {
            providerId: "opencode",
            modelId: "fast",
            effortId: "medium",
        },
    };
    // Save through the actual tier settings UI.
    await page.getByRole("button", {
        name: "Open settings",
        exact: true,
    }).click();
    for (const [
        tier,
        label,
    ] of [
            [
                "flagship",
                "Flagship",
            ],
            [
                "reasoning",
                "Reasoning",
            ],
            [
                "action",
                "Action",
            ],
        ]) {
        await page.getByLabel(`${label} ACP`, { exact: true }).selectOption("opencode");
        await page.getByLabel(`${label} model`, { exact: true }).fill(routes[tier].modelId);
        await page.getByLabel(`${label} effort`, { exact: true }).fill(routes[tier].effortId);
    }
    await page.getByRole("button", {
        name: "Save agent tiers",
        exact: true,
    }).click();
    await page.getByText("Tier settings saved.", { exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(() => {

        return window.avesd.agentSessions.routes();
    }), routes);
    await page.getByRole("button", {
        name: "Close settings",
        exact: true,
    }).click();
    await page.getByRole("button", {
        name: "Open agent",
        exact: true,
    }).click();
    await page.getByRole("textbox", {
        name: "Message agent",
        exact: true,
    }).fill("Synthetic foreground prompt");
    await page.getByRole("button", {
        name: "Send message",
        exact: true,
    }).click();
    await expect.poll(() => {

        return page.evaluate(() => {

            return window.avesd.agentSessions.list();
        });
    }).toMatchObject({ sessions: [{ status: "running" }] });
    const first = (await page.evaluate(() => {

        return window.avesd.agentSessions.list();
    })).selectedId;
    await page.getByRole("button", {
        name: "Open agent",
        exact: true,
    }).click();
    await expect(page.getByRole("textbox", {
        name: "Message agent",
        exact: true,
    })).toHaveValue("");
    const second = (await page.evaluate(() => {

        return window.avesd.agentSessions.list();
    })).selectedId;
    assert.notEqual(first, second);
    await expect.poll(() => {

        return page.evaluate(id => {

            return window.avesd.agentSessions.read(id);
        }, first);
    }).toMatchObject({
        status: "completed",
        settings: {
            providerId: "opencode",
            modelId: "deep",
            effortId: "high",
        },
    });
    await page.getByRole("button", {
        name: "Close agent",
        exact: true,
    }).click();
    for (const [
        id,
        enabled,
    ] of [
            [
                "avesd.local.agent-one",
                true,
            ],
            [
                "avesd.local.agent-two",
                true,
            ],
            [
                "avesd.local.agent-denied",
                false,
            ],
        ]) {
        await harness.install(content(id, enabled));
        await harness.tool("avesd_add_widget", {
            pluginId: id,
            widgetTypeId: "agent",
        });
    }
    const one = await harness.guest("avesd.local.agent-one", "!!window.__task");
    const two = await harness.guest("avesd.local.agent-two", "!!window.__task");
    const denied = await harness.guest("avesd.local.agent-denied", "true");
    const task = await harness.native(one, "window.__task.start({tier:'reasoning',prompt:'Synthetic background prompt'})");
    await assert.rejects(harness.native(two, `window.__task.read(${JSON.stringify(task.id)})`));
    await assert.rejects(harness.native(denied, "window.avesdWidget.agent.start({tier:'action',prompt:'Denied'})"));
    await page.getByRole("button", {
        name: "Open sessions",
        exact: true,
    }).click();
    await page.getByRole("button", {
        name: "Background",
        exact: true,
    }).click();
    await page.locator(".session-open").filter({ hasText: "avesd.local.agent-one" })
        .click();
    await page.getByText("Synthetic background prompt", { exact: true }).waitFor();
    await expect.poll(() => {

        return harness.native(one, `window.__task.read(${JSON.stringify(task.id)})`);
    }).toMatchObject({
        status: "completed",
        answer: "synthetic/fast",
    });
    const result = await harness.native(one, `window.__task.read(${JSON.stringify(task.id)})`);
    assert.deepEqual(Object.keys(result).sort(), [
        "answer",
        "id",
        "status",
        "tier",
    ]);
    // Switching the viewed session retains its transcript and does not affect running work.
    await page.evaluate(id => {

        return window.avesd.agentSessions.select(id);
    }, first);
    await page.getByText("Synthetic foreground prompt", { exact: true }).waitFor();
    await page.getByText("synthetic/deep", { exact: true }).waitFor();
    const stopped = await harness.native(one, "window.__task.start({tier:'action',prompt:'Synthetic stop'})");
    await harness.native(one, `window.__task.cancel(${JSON.stringify(stopped.id)})`);
    assert.equal((await harness.native(one, `window.__task.read(${JSON.stringify(stopped.id)})`)).status, "stopped");
    const scope = (await harness.snapshot()).selection;
    const scoped = await harness.native(one, "window.__task.start({tier:'action',prompt:'Synthetic scope retention'})");
    await page.evaluate(() => {

        return window.avesd.navigation.command({
            type: "createWorkspace",
            name: "Synthetic other workspace",
        });
    });
    await expect.poll(() => {

        return page.evaluate(id => {

            return window.avesd.agentSessions.read(id);
        }, scoped.id);
    }).toMatchObject({
        status: "completed",
        workspaceId: scope.workspaceId,
    });
    assert.equal((await page.evaluate(() => {

        return window.avesd.agentSessions.list();
    })).sessions.length, 5);
    await page.evaluate(scope => {

        return window.avesd.navigation.command({
            type: "select",
            scope,
        });
    }, scope);
    // The movable button has a keyboard equivalent and persists independently of sidebar side.
    const sessionButton = page.getByRole("button", {
        name: "Open sessions",
        exact: true,
    });
    await sessionButton.focus(); await page.keyboard.press("Alt+ArrowUp");
    await expect.poll(() => {

        return page.evaluate(() => {

            return window.avesd.preferences.getSessionPosition();
        });
    }).toBe(1);
    assert.deepEqual((await harness.snapshot()).selection, scope);
    await harness.close();
    ({ page } = await harness.launch());
    assert.deepEqual(await page.evaluate(() => {

        return window.avesd.agentSessions.routes();
    }), routes);
    assert.equal(await page.evaluate(() => {

        return window.avesd.preferences.getSessionPosition();
    }), 1);
    assert.equal((await page.evaluate(() => {

        return window.avesd.agentSessions.list();
    })).sessions.length, 0);
    console.log("PASS agent sessions: tier settings, native ACP routing, independent foreground/background histories, widget isolation, cancellation, movable button and restart preferences");
} finally { await harness.dispose(); }
