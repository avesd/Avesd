/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Browser Test
 */

import { createDesktopHarness, expect } from "./support/desktop.mjs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";

const harness = await createDesktopHarness("browser");
const { directory, dataDirectory } = harness;
const server = createServer((_req, res) => {
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Content-Security-Policy", "frame-ancestors 'none'");
    res.end('<!doctype html><html><head><title>Synthetic web fixture</title></head><body style="font:20px system-ui;background:#edf4ef;padding:30px"><h1>Synthetic project</h1><p id="count">7</p><button onclick="document.querySelector(\'#count\').textContent=8">Increment</button></body></html>');
});
await new Promise(resolve => {
    return server.listen(0, "127.0.0.1", resolve);
});
const address = `http://127.0.0.1:${server.address().port}`;
let app;
try {
    const launched = await harness.launch();
    app = launched.app;
    const page = launched.page;
    await harness.tool("avesd_add_widget", {
        pluginId: "avesd.builtin.web",
        widgetTypeId: "page",
    });
    await harness.tool("avesd_add_widget", {
        pluginId: "avesd.builtin.web",
        widgetTypeId: "result",
    });
    const initial = await harness.tool("avesd_inspect_dashboard");
    await page.evaluate(async ({ widgetId, dataSourceId }) => {
        const snapshot = await window.avesd.workspaceStorage.load();
        const previous = window.structuredClone(snapshot);
        snapshot.widgets.find(widget => {
            return widget.id === widgetId;
        }).bindings.result = [dataSourceId];
        snapshot.dashboards[0].layoutRevision++;
        await window.avesd.workspaceStorage.save(snapshot, { snapshot: previous });
    }, {
        widgetId: initial.layout.widgets.find(widget=>{
            return widget.widgetTypeId==="result";
        }).id,
        dataSourceId: `web-result:${initial.layout.widgets.find(widget=>{
            return widget.widgetTypeId==="page";
        }).id}`,
    });
    await page.getByLabel("Website URL").fill(address);
    await page.getByRole("button", {
        name: "Go",
        exact: true,
    }).click();
    await page.getByRole("status").filter({ hasText: "Ready" })
        .waitFor();
    const guestInfo = await app.evaluate(({ webContents }) => {
        const guest = webContents.getAllWebContents().find(c => {
            return c.getURL().startsWith("http://127.0.0.1:");
        });
        const prefs = guest.getLastWebPreferences();
        return {
            id: guest.id,
            node: prefs.nodeIntegration,
            sandbox: prefs.sandbox,
            isolation: prefs.contextIsolation,
            preload: prefs.preload,
        };
    });
    const guestVisible = () => {
        return app.evaluate(({ BrowserWindow }, id) =>
        {
            return BrowserWindow.getAllWindows()[0].contentView.children.find(view => {
                return view.webContents?.id === id;
            })?.getVisible();
        }, guestInfo.id);
    };
    await expect.poll(guestVisible).toBe(true);
    assert.equal(guestInfo.node, false); assert.equal(guestInfo.sandbox, true); assert.equal(guestInfo.isolation, true); assert.ok(!guestInfo.preload);
    const isolated = await app.evaluate(async ({ webContents }, id)=>{
        return webContents.fromId(id).executeJavaScript("({ node:typeof require, host:typeof window.avesd })");
    }, guestInfo.id);
    assert.deepEqual(isolated, {
        node: "undefined",
        host: "undefined",
    });
    await page.getByRole("button", {
        name: "Tools",
        exact: true,
    }).click();
    await expect.poll(guestVisible).toBe(false);
    await page.getByLabel("Script", { exact: true }).fill('({ title: document.title, count: Number(document.querySelector("#count").textContent) })');
    await page.locator(".consent").check();
    await page.getByRole("button", {
        name: "Run",
        exact: true,
    }).click();
    await page.locator("pre").filter({ hasText: '"count": 7' })
        .waitFor();
    assert.match(await page.locator("pre").innerText(), /"count": 7/);
    // A layout update must not recreate the guest or erase the live result.
    await page.keyboard.press("Meta+e");
    await page.getByRole("button", { name: /^Drag / }).last()
        .focus();
    await page.keyboard.press("ArrowDown");
    await page.getByRole("button", {
        name: "Lock dashboard",
        exact: true,
    }).click();
    assert.match(await page.locator("pre").innerText(), /"count": 7/);
    const alive = await app.evaluate(({ webContents }, id)=>{
        return !!webContents.fromId(id);
    }, guestInfo.id);
    assert.equal(alive, true);
    // Layout and bindings persist; extracted values and source objects do not.
    const snapshot = await page.evaluate(()=>{
        return window.avesd.workspaceStorage.load();
    });
    assert.deepEqual(JSON.parse(await readFile(join(dataDirectory, "workspace-v1.json"), "utf8")), snapshot);
    await assert.rejects(readFile(join(directory, "workspace-v1.json")), { code: "ENOENT" });
    assert.ok(!JSON.stringify(snapshot).includes("Synthetic web fixture"));
    assert.ok(!snapshot.dataSources.some(s=>{
        return s.dataType==="avesd.web-result";
    }));
    await page.getByLabel("Script mode").selectOption("css");
    await page.getByLabel("Script", { exact: true }).fill("body { background: rgb(220, 240, 255) !important; }");
    await page.locator(".consent").check();
    await page.getByRole("button", {
        name: "Run",
        exact: true,
    }).click();
    await expect.poll(() => {
        return app.evaluate(async ({ webContents }, id)=>{
            return webContents.fromId(id)
                .executeJavaScript("getComputedStyle(document.body).backgroundColor");
        }, guestInfo.id);
    }).toBe("rgb(220, 240, 255)");
    await page.getByLabel("Script mode").selectOption("page");
    await page.getByLabel("Script", { exact: true }).fill('document.querySelector("button").click(); ({ count: Number(document.querySelector("#count").textContent) })');
    await page.locator(".consent").check();
    await page.getByRole("button", {
        name: "Run",
        exact: true,
    }).click();
    await page.locator("pre").filter({ hasText: '"count": 8' })
        .waitFor();
    // Navigation invalidates a pending result and clears the output/authorization.
    await page.getByLabel("Script", { exact: true }).fill("new Promise(resolve => setTimeout(() => resolve({ obsolete: true }), 1000))");
    await page.locator(".consent").check();
    await page.getByRole("button", {
        name: "Run",
        exact: true,
    }).click();
    await page.getByRole("button", {
        name: "Reload",
        exact: true,
    }).click();
    await page.waitForTimeout(1200);
    assert.ok(!(await page.locator("pre").innerText()).includes("obsolete"));
    assert.equal(await page.locator(".consent").isChecked(), false);
    await page.getByRole("button", {
        name: "Clear result",
        exact: true,
    }).click();
    await page.getByText("No web output yet. Run a script in the connected Web page widget.", { exact: true }).waitFor();
    await page.keyboard.press("Meta+e");
    await expect.poll(guestVisible).toBe(false);
    await harness.tool("avesd_add_widget", {
        pluginId: "avesd.builtin.web",
        widgetTypeId: "page",
    });
    await page.getByRole("button", {
        name: "Lock dashboard",
        exact: true,
    }).click();
    await page.getByLabel("Website URL").nth(1)
        .fill(address);
    await page.getByRole("button", {
        name: "Go",
        exact: true,
    }).nth(1)
        .click();
    await page.getByRole("status").filter({ hasText: "Ready" })
        .nth(1)
        .waitFor();
    const independent = await app.evaluate(({ webContents }) => {
        const pages = webContents.getAllWebContents().filter(c=>{
            return c.getURL().startsWith("http://127.0.0.1:");
        });
        return pages.length===2 && pages[0].session!==pages[1].session;
    });
    assert.equal(independent, true);
    // A separate controller has no browser authority until the host binds it.
    await page.keyboard.press("Meta+e");
    await harness.tool("avesd_add_widget", {
        pluginId: "avesd.builtin.web",
        widgetTypeId: "controls",
    });
    await page.getByRole("button", {
        name: "Lock dashboard",
        exact: true,
    }).click();
    const controls = page.locator(".dashboard-widget").filter({ has: page.getByText("Browser controls", { exact: true }) });
    await controls.getByRole("button", {
        name: "Read text",
        exact: true,
    }).click();
    await controls.getByRole("status").filter({ hasText: "Action denied" })
        .waitFor();
    const instances = await page.evaluate(async()=> {
        return (await window.avesd.workspaceStorage.load()).widgets;
    });
    const sourceId = instances.find(widget=>{
        return widget.widgetTypeId==="controls";
    }).id;
    const targetId = instances.find(widget=>{
        return widget.widgetTypeId==="page";
    }).id;
    await page.keyboard.press("Meta+e");
    await page.evaluate(({ sourceId, targetId, address }) => {
        return window.avesd.browserControls.bind({
            type: "bind",
            sourceId,
            inputId: "browser",
            targetId,
            origin: address,
            operations: ["extract"],
        });
    }, {
        sourceId,
        targetId,
        address,
    });
    await expect.poll(()=>{
        return page.evaluate(()=>{
            return window.avesd.browserControls.list();
        });
    }).toHaveLength(1);
    assert.equal(JSON.parse(await readFile(join(dataDirectory, "browser-bindings-v1.json"), "utf8")).length, 1);
    await assert.rejects(readFile(join(directory, "browser-bindings-v1.json")), { code: "ENOENT" });
    await page.getByRole("button", {
        name: "Lock dashboard",
        exact: true,
    }).click();
    await controls.getByRole("button", {
        name: "Read text",
        exact: true,
    }).click();
    await controls.locator("pre").filter({ hasText: "Synthetic project" })
        .waitFor();
    await controls.getByLabel("Control destination URL").fill(`${address}/next`);
    await controls.getByRole("button", {
        name: "Navigate",
        exact: true,
    }).click();
    await controls.getByRole("status").filter({ hasText: "Action denied" })
        .waitFor();
    await page.keyboard.press("Meta+e");
    await page.evaluate(({ sourceId, targetId, address }) => {
        return window.avesd.browserControls.bind({
            type: "bind",
            sourceId,
            inputId: "browser",
            targetId,
            origin: address,
            operations: [
                "extract",
                "navigate",
                "click",
            ],
        });
    }, {
        sourceId,
        targetId,
        address,
    });
    await expect.poll(()=>{
        return page.evaluate(async()=> {
            return (await window.avesd.browserControls.list())[0]?.operations.length;
        });
    }).toBe(3);
    await page.getByRole("button", {
        name: "Lock dashboard",
        exact: true,
    }).click();
    await controls.getByRole("button", {
        name: "Navigate",
        exact: true,
    }).click();
    await expect.poll(()=>{
        return app.evaluate(({ webContents }, id)=>{
            return webContents.fromId(id).getURL();
        }, guestInfo.id);
    }).toBe(`${address}/next`);
    await controls.getByLabel("Control CSS selector").fill("button");
    await controls.getByRole("button", {
        name: "Click element",
        exact: true,
    }).click();
    await controls.getByRole("status").filter({ hasText: "Completed" })
        .waitFor();
    await controls.getByLabel("Control CSS selector").fill("#count");
    await controls.getByRole("button", {
        name: "Read text",
        exact: true,
    }).click();
    await controls.locator("pre").filter({ hasText: '"text": "8"' })
        .waitFor();
    await controls.getByLabel("Control destination URL").fill(address.replace("127.0.0.1", "localhost"));
    await controls.getByRole("button", {
        name: "Navigate",
        exact: true,
    }).click();
    await controls.getByRole("status").filter({ hasText: "Action denied" })
        .waitFor();
    // Source IDs are checked against supported controller instances, not plugin identity alone.
    assert.equal(await page.evaluate(async ({ targetId }) => {
        try {
            await window.avesd.browserControls.invoke(targetId, "browser", {
                type: "extract",
                fields: { text: "h1" },
            }); return false;
        }
        catch { return true; }
    }, { targetId }), true);
    await page.keyboard.press("Meta+e");
    await page.getByRole("button", { name: /^Drag / }).last()
        .focus();
    await page.keyboard.press("ArrowDown");
    await page.getByRole("button", {
        name: "Lock dashboard",
        exact: true,
    }).click();
    assert.equal((await page.evaluate(()=>{
        return window.avesd.browserControls.list();
    }))[0].targetId, targetId);
    await page.keyboard.press("Meta+e");
    await page.getByRole("button", {
        name: "Remove widget",
        exact: true,
    }).first()
        .click();
    await expect.poll(() => {
        return app.evaluate(({ webContents }, id)=>{
            return !!webContents.fromId(id);
        }, guestInfo.id);
    }).toBe(false);
    assert.equal((await page.evaluate(()=>{
        return window.avesd.browserControls.list();
    })).length, 0);
    assert.equal(await page.evaluate(async ({ sourceId }) => {
        try {
            await window.avesd.browserControls.invoke(sourceId, "browser", {
                type: "extract",
                fields: { text: "h1" },
            }); return false;
        }
        catch { return true; }
    }, { sourceId }), true);
    console.log(JSON.stringify({
        passed: true,
        directory,
        checks: [
            "native embed",
            "no host API",
            "isolated JS",
            "page-world click",
            "CSS",
            "live binding",
            "layout preserves session",
            "no persisted result",
            "navigation discards pending result",
            "clear",
            "destroy",
        ],
    }));
} finally {
    try { await harness.dispose(); } finally { server.close(); }
}
