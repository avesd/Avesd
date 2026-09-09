/**
 * @author Avesd
 * @package Desktop
 * @namespace TestE2eSupport
 * @description Desktop
 */

import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export const desktop = resolve(import.meta.dirname, "../../..");
const require = createRequire(join(desktop, "package.json"));
const { _electron: electron } = createRequire(require.resolve("@vitest/browser-playwright"))("playwright");
export const { expect } = createRequire(require.resolve("@vitest/browser-playwright"))("playwright/test");

export const request = (address, name, input = {}) => {

    return fetch(address.url, {
        method: "POST",
        signal: AbortSignal.timeout(20000),
        headers: {
            authorization: `Bearer ${address.token}`,
            "content-type": "application/json",
        },
        body: JSON.stringify({
            name,
            input,
        }),
    });
};

/** Each scenario owns one synthetic profile, reused only for its restart checks. */
export async function createDesktopHarness(name) {

    const directory = await mkdtemp(join(tmpdir(), `avesd-${name}-`));
    const dataDirectory = join(directory, "custom data");
    await mkdir(join(directory, ".avesd"));
    await writeFile(join(directory, ".avesd/config.json"), JSON.stringify({ dataDirectory }));
    let app;
    let page;
    const errors = [];
    const close = async () => {

        const current = app;
        if (!current) {
            return;
        }
        app = undefined;
        page = undefined;
        const timer = setTimeout(() => {

            return current.process().kill("SIGKILL");
        }, 5000);
        try { await current.close(); } finally { clearTimeout(timer); }
    };
    const stop = () => {

        void dispose().finally(() => {

            return process.exit(1);
        });
    };
    process.once("SIGTERM", stop);
    process.once("SIGINT", stop);
    const dispose = async () => {

        process.removeListener("SIGTERM", stop);
        process.removeListener("SIGINT", stop);
        try { await close(); } finally {
            await rm(directory, {
                recursive: true,
                force: true,
            });
        }
        assert.deepEqual(errors, [], "Unexpected host renderer errors");
    };
    const snapshot = () => {

        return page.evaluate(() => {

            return window.avesd.workspaceStorage.load();
        });
    };
    const gateway = () => {

        return app.evaluate(() => {

            return globalThis.__avesdTestGateway;
        });
    };
    const tool = async (name, input = {}) => {

        const response = await request(await gateway(), name, input);
        assert.equal(response.status, 200);
        const output = await response.json();
        assert.ok(!output.isError, output.content?.find(item => {

            return item.type === "text";
        })?.text);

        return JSON.parse(output.content.find(item => {

            return item.type === "text";
        }).text);
    };
    const native = (id, code) => {

        return app.evaluate(({ webContents }, { id, code }) =>
        {

            return webContents.fromId(id).executeJavaScript(code);
        }, {
            id,
            code,
        });
    };
    const guestIds = () => {

        return app.evaluate(({ webContents }) => {

            return webContents.getAllWebContents()
                .filter(item => {

                    return item.getTitle() === "Local widget";
                })
                .map(item => {

                    return item.id;
                });
        });
    };

    return {
        directory,
        dataDirectory,
        errors,
        close,
        dispose,
        snapshot,
        gateway,
        tool,
        native,
        guestIds,
        async launch() {

            assert.ok(!app, "Close the current desktop before restarting");
            app = await electron.launch({
                executablePath: require("electron"),
                args: [join(import.meta.dirname, "bootstrap.mjs")],
                env: {
                    ...process.env,
                    AVESD_WEB_TEST_PROFILE: directory,
                },
                timeout: 15000,
            });
            page = await app.firstWindow();
            page.setDefaultTimeout(10000);
            page.on("pageerror", error => {

                return errors.push(error.message);
            });
            await page.locator(".dashboard-grid").waitFor();

            return {
                app,
                page,
            };
        },
        async install(content) {

            const draft = await tool("avesd_create_plugin_draft", content);
            const report = await tool("avesd_test_plugin", {
                draftId: draft.id,
                revision: draft.revision,
            });
            assert.equal(report.passed, true, JSON.stringify(report));
            await tool("avesd_activate_plugin", {
                draftId: draft.id,
                revision: draft.revision,
            });

            return draft;
        },
        async guest(pluginId, ready) {

            let result;
            await expect.poll(async () => {

                const state = await snapshot();
                for (const id of await guestIds()) {
                    const identity = await native(id, "window.avesdWidget.initialize()").catch(() => {

                        return undefined;
                    });
                    if (state.widgets.some(widget => {

                        return widget.id === identity?.instanceId && widget.pluginId === pluginId;
                    })
            && await native(id, ready).catch(() => {

                return false;
            })) {
                        result = id;

                        return true;
                    }
                }

                return false;
            }).toBe(true);

            return result;
        },
    };
}
