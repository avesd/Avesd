/**
 * @author Avesd
 * @package Desktop
 * @namespace TestE2e
 * @description Browser sessions, plugin authority and visible authentication
 */

import { createDesktopHarness, expect } from "./support/desktop.mjs";
import assert from "node:assert/strict";
import { createServer } from "node:http";

const harness = await createDesktopHarness("browser-auth");
const server = createServer((req, res) => {

    if (req.url === "/redirect") {
        res.writeHead(302, { Location: `http://localhost:${server.address().port}/login` }); res.end();

        return;
    }
    res.end(`<!doctype html><title>Synthetic authentication</title><body style="font:20px system-ui;padding:32px;background:#edf4ef"><h1>Synthetic account</h1><p id="value">${req.url === "/login" ? "Login page" : "Ready"}</p><button id="remember" onclick="localStorage.setItem('synthetic','remembered'); document.querySelector('#value').textContent='Remembered'">Remember synthetic state</button><button id="popup" onclick="window.open('/login','login')">Open login popup</button></body>`);
});
await new Promise(resolve => {

    return server.listen(0, "127.0.0.1", resolve);
});
const origin = `http://127.0.0.1:${server.address().port}`;
const content = id => {

    return {
        manifest: {
            apiVersion: 1,
            id,
            version: "1.0.0",
            displayName: "Synthetic browser plugin",
            widgetTypeId: "browser",
            size: {
                width: 8,
                height: 8,
            },
            browser: {
                origins: [origin],
                session: {
                    name: "synthetic",
                    shared: true,
                },
            },
        },
        source: "export function mount(root, context) { window.__browser = context.browser; root.innerHTML='<p>Browser ready</p>'; return { update() {}, dispose() {} }; }",
        tests: [
            {
                type: "expectText",
                selector: "p",
                text: "Browser ready",
            },
        ],
    };
};
try {
    let { app } = await harness.launch();
    // Synthetic approval exercises the real host boundary without granting any real account.
    const approve = () => {

        return app.evaluate(({ dialog }) => {

            dialog.showMessageBox = async () => {

                return {
                    response: 1,
                    checkboxChecked: false,
                };
            };
        });
    };
    await approve();
    for (const id of [
        "avesd.local.browser-one",
        "avesd.local.browser-two",
    ]) {
        await harness.install(content(id));
        await harness.tool("avesd_add_widget", {
            pluginId: id,
            widgetTypeId: "browser",
        });
    }
    const guest = id => {

        return harness.guest(id, "!!window.__browser");
    };
    const first = await guest("avesd.local.browser-one");
    const second = await guest("avesd.local.browser-two");
    const navigate = id => {

        return harness.native(id, `window.__browser.navigate(${JSON.stringify(origin)})`);
    };
    await navigate(first);
    await expect.poll(() => {

        return harness.native(first, "window.__browser.status()");
    }).toMatchObject({ status: "ready" });
    const firstBrowser = await app.evaluate(({ webContents }, origin) => {

        return webContents.getAllWebContents().find(item => {

            return item.getURL() === `${origin}/`;
        }).id;
    }, origin);
    await harness.native(first, "window.__browser.click('#remember')");
    await navigate(second);
    await expect.poll(() => {

        return harness.native(second, "window.__browser.status()");
    }).toMatchObject({ status: "ready" });
    const browsers = await app.evaluate(({ webContents }, origin) => {

        return webContents.getAllWebContents().filter(item => {

            return item.getURL() === `${origin}/`;
        })
            .map(item => {

                return item.id;
            });
    }, origin);
    browsers.sort((a, b) => {

        return a === firstBrowser ? -1 : b === firstBrowser ? 1 : 0;
    });
    assert.equal(browsers.length, 2);
    assert.equal(await app.evaluate(({ webContents }, ids) => {

        return webContents.fromId(ids[0]).session === webContents.fromId(ids[1]).session;
    }, browsers), true);
    assert.equal(await harness.native(browsers[1], "localStorage.getItem('synthetic')"), "remembered");
    await assert.rejects(harness.native(first, "window.__browser.navigate('https://example.com')"));
    // A local widget without a browser declaration cannot invoke the browser bridge.
    const undeclared = content("avesd.local.browser-denied");
    delete undeclared.manifest.browser;
    await harness.install(undeclared);
    await harness.tool("avesd_add_widget", {
        pluginId: undeclared.manifest.id,
        widgetTypeId: "browser",
    });
    const denied = await harness.guest(undeclared.manifest.id, "true");
    await assert.rejects(harness.native(denied, `window.avesdWidget.browser.navigate(${JSON.stringify(origin)})`));
    assert.equal(await harness.native(browsers[0], "typeof window.avesdWidget"), "undefined");
    await harness.native(first, "window.__browser.show()");
    await expect.poll(() => {

        return app.evaluate(({ BrowserWindow }) => {

            return BrowserWindow.getAllWindows().length;
        });
    }).toBe(2);
    await harness.native(first, "window.__browser.hide()");
    await expect.poll(() => {

        return app.evaluate(({ BrowserWindow }) => {

            return BrowserWindow.getAllWindows().length;
        });
    }).toBe(1);
    assert.equal(await harness.native(browsers[0], "localStorage.getItem('synthetic')"), "remembered");
    await harness.native(first, "window.__browser.click('#popup')");
    await expect.poll(() => {

        return app.evaluate(({ BrowserWindow }) => {

            return BrowserWindow.getAllWindows().length;
        });
    }).toBe(2);
    const popup = await app.evaluate(({ BrowserWindow, webContents }, parentId) => {

        const child = BrowserWindow.getAllWindows().find(window => {

            return window.webContents.getURL().endsWith("/login");
        });

        return child ? {
            id: child.webContents.id,
            partitionMatches: child.webContents.session === webContents.fromId(parentId).session,
            sandbox: child.webContents.getLastWebPreferences().sandbox,
        } : null;
    }, browsers[0]);
    assert.equal(popup.sandbox, true); assert.equal(popup.partitionMatches, true);
    await harness.native(popup.id, "window.close()");
    await expect.poll(() => {

        return app.evaluate(({ BrowserWindow }) => {

            return BrowserWindow.getAllWindows().length;
        });
    }).toBe(1);
    // A hidden cross-origin redirect is handed to the user, not to plugin extraction.
    await harness.native(first, `window.__browser.navigate(${JSON.stringify(`${origin}/redirect`)})`);
    await expect.poll(() => {

        return app.evaluate(({ BrowserWindow }) => {

            return BrowserWindow.getAllWindows().length;
        });
    }).toBe(2);
    await expect.poll(() => {

        return harness.native(browsers[0], "location.hostname");
    }).toBe("localhost");
    await assert.rejects(harness.native(first, "window.__browser.extract({ heading:'h1' })"));
    await harness.native(first, "window.__browser.close()");
    await expect.poll(() => {

        return app.evaluate(({ BrowserWindow }) => {

            return BrowserWindow.getAllWindows().length;
        });
    }).toBe(1);
    await harness.close();
    ({ app } = await harness.launch());
    await approve();
    const restarted = await guest("avesd.local.browser-two");
    await navigate(restarted);
    await expect.poll(() => {

        return harness.native(restarted, "window.__browser.status()");
    }).toMatchObject({ status: "ready" });
    const restored = await app.evaluate(({ webContents }, origin) => {

        return webContents.getAllWebContents().find(item => {

            return item.getURL() === `${origin}/`;
        }).id;
    }, origin);
    assert.equal(await harness.native(restored, "localStorage.getItem('synthetic')"), "remembered");
    console.log("PASS browser-auth: scoped plugins, shared persistent sessions, native handoff, popup session and restart");
} finally {
    server.closeAllConnections();
    await new Promise(resolve => {

        return server.close(resolve);
    });
    await harness.dispose();
}
