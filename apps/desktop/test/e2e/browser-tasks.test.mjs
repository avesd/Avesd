/**
 * @author Avesd
 * @package Desktop
 * @namespace TestE2e
 * @description Task-owned background browser acceptance
 */

import { createDesktopHarness, expect } from "./support/desktop.mjs";
import assert from "node:assert/strict";
import { createServer } from "node:http";

const harness = await createDesktopHarness("browser-tasks");
let count = 17;
let delay = 0;
const server = createServer((_req, res) => {

    const body = `<!doctype html><title>Synthetic orders</title><body style="font:20px system-ui;padding:32px;background:#edf4ef"><h1>Synthetic orders</h1><p id="orders">${count}</p><button onclick="localStorage.setItem('synthetic-login','remembered')">Remember synthetic login</button></body>`;
    if (delay) {
        setTimeout(() => {

            res.end(body);
        }, delay);
    } else {
        res.end(body);
    }
});
await new Promise(resolve => {

    server.listen(0, "127.0.0.1", resolve);
});
const url = `http://127.0.0.1:${server.address().port}/`;
let app;
let page;
const list = () => {

    return page.evaluate(() => {

        return window.avesd.browserTasks.command({ type: "list" });
    });
};
const command = input => {

    return page.evaluate(input => {

        return window.avesd.browserTasks.command(input);
    }, input);
};
const guest = () => {

    return app.evaluate(({ webContents }, url) => {

        return webContents.getAllWebContents().find(item => {

            return item.getURL() === url;
        })?.id;
    }, url);
};
try {
    ({ app, page } = await harness.launch());
    const [created] = await harness.tool("avesd_browser_task", {
        type: "save",
        recipe: {
            name: "Order count",
            url,
            fields: { total: "#orders" },
            intervalMinutes: 0,
        },
    });
    const id = created.id;
    assert.equal("result" in created, false);
    await harness.tool("avesd_browser_task", {
        type: "refresh",
        id,
    });
    assert.deepEqual((await list())[0].result, { total: "17" });
    await harness.tool("avesd_add_widget", {
        pluginId: "avesd.builtin.collections",
        widgetTypeId: "result",
        configuration: { taskId: id },
    });
    await expect(page.getByText("total: 17", { exact: true })).toBeVisible();
    await harness.tool("avesd_remove_widget", { id: (await harness.snapshot()).widgets[0].id });
    count = 23;
    await command({
        type: "refresh",
        id,
    });
    assert.deepEqual((await list())[0].result, { total: "23" });
    const nativeId = await guest();
    assert.ok(nativeId);
    await command({
        type: "open",
        id,
    });
    await expect.poll(async () => {

        return (await list())[0].presented;
    }).toBe(true);
    assert.equal(await page.evaluate(async id => {

        return window.avesd.browserTasks.command({
            type: "refresh",
            id,
        }).then(() => {

            return false;
        }, () => {

            return true;
        });
    }, id), true);
    await harness.native(nativeId, "document.querySelector('button').click()");
    await app.evaluate(({ BrowserWindow }) => {

        BrowserWindow.getAllWindows().find(window => {

            return window.getTitle().includes("close to return");
        })
            ?.close();
    });
    await command({
        type: "close",
        id,
    });
    assert.equal((await list())[0].pageOpen, false);
    assert.equal(await app.evaluate(({ webContents }, id) => {

        return !!webContents.fromId(id);
    }, nativeId), false);
    await command({
        type: "refresh",
        id,
    });
    assert.equal(await harness.native(await guest(), "localStorage.getItem('synthetic-login')"), "remembered");
    count = 99; delay = 1000;
    const pending = command({
        type: "refresh",
        id,
    });
    await expect.poll(async () => {

        return (await list())[0].state;
    }).toBe("refreshing");
    await command({
        type: "close",
        id,
    });
    await pending;
    assert.deepEqual((await list())[0].result, { total: "23" });
    delay = 0;
    await command({
        type: "pause",
        id,
    });
    await harness.tool("avesd_add_widget", {
        pluginId: "avesd.builtin.collections",
        widgetTypeId: "result",
        configuration: { taskId: id },
    });
    await harness.close();
    ({ app, page } = await harness.launch());
    assert.equal((await list())[0].paused, true);
    assert.equal((await list())[0].pageOpen, false);
    await expect(page.getByText("total: 23", { exact: true })).toBeVisible();
    await page.getByRole("button", {
        name: "Open background browsers",
        exact: true,
    }).click();
    const panel = page.getByRole("dialog", {
        name: "Background browsers",
        exact: true,
    });
    await expect(panel.getByText("Order count", { exact: true })).toBeVisible();
    await panel.getByRole("button", {
        name: "Resume",
        exact: true,
    }).click();
    await panel.getByRole("button", {
        name: "Refresh",
        exact: true,
    }).click();
    await expect.poll(async () => {

        return (await list())[0].result;
    }).toEqual({ total: "99" });
    assert.equal("result" in (await harness.tool("avesd_browser_task", { type: "list" }))[0], false);
    await panel.getByRole("button", {
        name: "Close background browsers",
        exact: true,
    }).click();
    await expect(page.getByText("total: 99", { exact: true })).toBeVisible();
    const before = (await harness.snapshot()).selection;
    const pageId = await guest();
    await harness.tool("avesd_manage_workspace", {
        type: "create",
        workspaceId: before.workspaceId,
        name: "Other dashboard",
    });
    assert.equal(await guest(), pageId, "dashboard navigation must not destroy task pages");
    await harness.tool("avesd_manage_workspace", {
        type: "createWorkspace",
        name: "Other workspace",
    });
    assert.deepEqual(await list(), []);
    assert.equal(await page.evaluate(async id => {

        return window.avesd.browserTasks.command({
            type: "open",
            id,
        }).then(() => {

            return false;
        }, () => {

            return true;
        });
    }, id), true);
    console.log(JSON.stringify({
        passed: true,
        checks: [
            "Agent recipe configuration",
            "persistent result widget",
            "widget-independent collection",
            "visible page exclusion",
            "private login survives page close",
            "in-flight cancellation",
            "restart",
            "management UI",
            "dashboard-independent page",
            "workspace isolation",
            "no collected data in tool responses",
        ],
    }));
} finally {
    await harness.dispose();
    await new Promise(resolve => {

        server.close(resolve);
    });
}
