/**
 * @author Avesd
 * @package Desktop
 * @namespace TestE2e
 * @description Widget Resize Test
 */

import { createDesktopHarness, expect } from "./support/desktop.mjs";
import assert from "node:assert/strict";

const harness = await createDesktopHarness("widget-resize");
const pluginId = "avesd.local.resize-test";
const content = {
    manifest: {
        apiVersion: 1,
        id: pluginId,
        version: "0.1.0",
        displayName: "Resize test",
        widgetTypeId: "resize",
        size: {
            width: 6,
            height: 6,
        },
    },
    source: `export function mount(root) {
      root.innerHTML = '<style>:host{display:block;height:100%;font:16px system-ui;color:#294731}section{box-sizing:border-box;height:100%;padding:16px;background:#eaf3e8}h2{margin:0 0 12px;font-size:18px}</style><section><h2>Resizable widget</h2><output></output></section>';
      return {update({size}) {window.__resizeSize = size; root.querySelector('output').textContent = size.width + ' × ' + size.height;}, dispose(){root.replaceChildren();}};
    }`,
    tests: [
        {
            type: "expectText",
            selector: "output",
            text: "6 × 6",
        },
    ],
};
let page;
const placement = async () => {

    return (await harness.snapshot()).widgets[0].placement;
};
const resizedGuest = async () => {

    const id = (await harness.snapshot()).widgets[0].id;

    return harness.guest(pluginId, `(async () => (await window.avesdWidget.initialize()).instanceId === ${JSON.stringify(id)} && !!window.__resizeSize)()`);
};
const size = async () => {

    return harness.native(await resizedGuest(), "window.__resizeSize");
};
try {
    ({ page } = await harness.launch());
    await harness.install(content);
    await harness.tool("avesd_add_widget", {
        pluginId,
        widgetTypeId: "resize",
    });
    await expect.poll(size).toMatchObject({
        width: 6,
        height: 6,
    });
    await page.getByRole("button", {
        name: "Unlock dashboard",
        exact: true,
    }).click();
    const handle = page.getByRole("button", {
        name: "Resize Resize test",
        exact: true,
    });
    const grid = await page.locator(".dashboard-grid").boundingBox();
    const box = await handle.boundingBox();
    assert.ok(grid && box);
    const start = {
        x: box.x + box.width / 2,
        y: box.y + box.height / 2,
    };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + grid.width / 24 * 3, start.y + 48, { steps: 12 });
    await expect.poll(size).toMatchObject({
        width: 9,
        height: 8,
    });
    assert.deepEqual(await placement(), {
        x: 0,
        y: 0,
        width: 6,
        height: 6,
    });
    await page.mouse.up();
    await expect.poll(placement).toEqual({
        x: 0,
        y: 0,
        width: 9,
        height: 8,
    });
    await handle.press("ArrowRight");
    await expect.poll(placement).toEqual({
        x: 0,
        y: 0,
        width: 10,
        height: 8,
    });
    await handle.press("ArrowUp");
    await expect.poll(placement).toEqual({
        x: 0,
        y: 0,
        width: 10,
        height: 7,
    });
    const next = await handle.boundingBox();
    await page.mouse.move(next.x + 13, next.y + 13);
    await page.mouse.down();
    await page.mouse.move(next.x - grid.width, next.y - 500, { steps: 8 });
    await expect.poll(size).toMatchObject({
        width: 1,
        height: 1,
    });
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect.poll(size).toMatchObject({
        width: 10,
        height: 7,
    });
    assert.deepEqual(await placement(), {
        x: 0,
        y: 0,
        width: 10,
        height: 7,
    });
    await expect(page.getByRole("button", {
        name: "Unlock dashboard",
        exact: true,
    })).toBeVisible();
    await harness.tool("avesd_add_widget", {
        pluginId,
        widgetTypeId: "resize",
    });
    assert.deepEqual((await harness.snapshot()).widgets[1].placement, {
        x: 10,
        y: 0,
        width: 6,
        height: 6,
    });
    await harness.close();
    ({ page } = await harness.launch());
    assert.deepEqual(await placement(), {
        x: 0,
        y: 0,
        width: 10,
        height: 7,
    });
    await expect.poll(size).toMatchObject({
        width: 10,
        height: 7,
    });
    console.log(JSON.stringify({
        passed: true,
        checks: [
            "native pointer resize",
            "live grid size",
            "save on release",
            "independent keyboard axes",
            "minimum and cancellation",
            "independent defaults",
            "restart",
        ],
    }));
} finally {
    await harness.dispose();
}
