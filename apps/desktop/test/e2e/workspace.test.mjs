/**
 * @author Avesd
 * @package Desktop
 * @namespace TestE2e
 * @description Workspace Test
 */

import { createDesktopHarness, expect, request } from "./support/desktop.mjs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const harness = await createDesktopHarness("workspace");
const { dataDirectory, snapshot, tool, native, close, install } = harness;
let app;
let page;
const launch = async () => {

    ({ app, page } = await harness.launch());
};
const { gateway, errors } = harness;
const nativeIds = () => {

    return app.evaluate(({ BrowserWindow }) => {

        const window = BrowserWindow.getAllWindows().find(window => {

            return window.getTitle() === "Avesd";
        });

        return window.contentView.children.filter(view => {

            return view.webContents && view.webContents.id !== window.webContents.id;
        }).map(view => {

            return view.webContents.id;
        });
    });
};
const nativeEval = native;
const navigatorId = () => {

    return harness.guest("avesd.local.synthetic-navigation", "!!window.__syntheticWorkspace");
};
const invoke = async code => {

    return nativeEval(await navigatorId(), code);
};
const select = async scope => {

    await invoke(`window.__syntheticWorkspace.navigation.select(${JSON.stringify(scope)})`).catch(() => {
    });
    await expect.poll(async () => {

        return (await snapshot()).selection;
    }).toEqual(scope);
    await page.locator(".dashboard-grid").waitFor();
};
const navigationContent = {
    manifest: {
        apiVersion: 1,
        id: "avesd.local.synthetic-navigation",
        version: "0.1.0",
        displayName: "Synthetic navigation",
        widgetTypeId: "navigation",
        size: {
            width: 10,
            height: 8,
        },
        capabilities: [
            "catalog",
            "navigation",
            "management",
        ],
    },
    source: `export function mount(root, context) {
    window.__syntheticWorkspace = context;
    root.innerHTML = '<style>:host{display:block;height:100%;font:14px system-ui;color:#334233}section{box-sizing:border-box;height:100%;padding:20px;border-radius:16px;background:#eaf1e5}h2{font-size:18px}output{display:block;margin:12px 0}button{padding:10px;border:0;border-radius:8px;background:#36543a;color:white}</style><section><h2>Workspace tools</h2><output>Loading</output><button>Create dashboard</button></section>';
    const refresh = async () => {
      try {
        const items = await context.catalog.listDashboards(context.workspaceId);
        if (!context.signal.aborted) root.querySelector('output').textContent = items.length + ' dashboards';
      } catch { if (!context.signal.aborted) root.querySelector('output').textContent = 'Unavailable'; }
    };
    context.catalog.subscribe(refresh);
    root.querySelector('button').onclick = async () => {
      try { await context.management.execute({type:'create', workspaceId:context.workspaceId, name:'Focus'}); await refresh(); }
      catch { if (!context.signal.aborted) root.querySelector('output').textContent = 'Unavailable'; }
    };
    void refresh();
    return {update(){},dispose(){root.replaceChildren();}};
  }`,
    tests: [
        {
            type: "expectText",
            selector: "output",
            text: "1 dashboards",
        },
        {
            type: "click",
            selector: "button",
        },
        {
            type: "expectText",
            selector: "output",
            text: "2 dashboards",
        },
    ],
};
const addNavigator = async () => {

    await tool("avesd_add_widget", {
        pluginId: navigationContent.manifest.id,
        widgetTypeId: "navigation",
    });

    return navigatorId();
};
try {
    await launch();
    await expect(page.locator(".dashboard-navigation")).toHaveCount(0);
    const firstScope = (await snapshot()).selection;
    await tool("avesd_manage_workspace", {
        type: "rename",
        ...firstScope,
        name: "Overview",
    });
    assert.deepEqual((await snapshot()).selection, firstScope);
    await tool("avesd_add_widget", {
        pluginId: "avesd.builtin.counter",
        widgetTypeId: "counter",
    });
    const sharedCounter = await tool("avesd_create_data_source", {
        pluginId: "avesd.builtin.counter",
        sourceTypeId: "counter",
        scope: "workspace",
        name: "Shared counter",
    });
    await tool("avesd_create_data_source", {
        pluginId: "avesd.builtin.counter",
        sourceTypeId: "counter",
        scope: "dashboard",
        name: "Dashboard counter",
    });
    await tool("avesd_bind_widget_input", {
        widgetId: (await snapshot()).widgets[0].id,
        inputId: "count",
        dataSourceId: sharedCounter.id,
    });
    await expect(page.getByRole("button", {
        name: "Add widget",
        exact: true,
    })).toHaveCount(0);
    await expect(page.getByRole("button", {
        name: "Done",
        exact: true,
    })).toHaveCount(0);
    await page.getByRole("button", {
        name: "Increment",
        exact: true,
    }).click();
    await expect(page.getByText("1", { exact: true })).toBeVisible();
    const sdk = await tool("avesd_get_widget_sdk");
    const counter = await install(sdk.example);
    await tool("avesd_add_widget", {
        pluginId: counter.manifest.id,
        widgetTypeId: counter.manifest.widgetTypeId,
    });
    await expect.poll(nativeIds).toHaveLength(1);
    const unprivileged = (await nativeIds())[0];
    await expect.poll(() => {

        return nativeEval(unprivileged, "!!window.__avesdWidget").catch(() => {

            return false;
        });
    }).toBe(true);
    assert.equal(await nativeEval(unprivileged, "window.avesdWidget.catalog.listWorkspaces().then(() => false, () => true)"), true);
    assert.equal(await nativeEval(unprivileged, "typeof require === 'undefined' && typeof process === 'undefined' && typeof window.avesd === 'undefined'"), true);
    await tool("avesd_add_widget", {
        pluginId: "avesd.builtin.web",
        widgetTypeId: "page",
    });
    const beforePreview = await snapshot();
    await install(navigationContent);
    assert.deepEqual(await snapshot(), beforePreview, "preview management must not mutate the live workspace");
    await addNavigator();
    const listed = await invoke("window.__syntheticWorkspace.catalog.listDashboards(window.__syntheticWorkspace.workspaceId)");
    assert.deepEqual(listed, [
        {
            workspaceId: firstScope.workspaceId,
            id: firstScope.dashboardId,
            name: "Overview",
        },
    ]);
    const oldNativeIds = await nativeIds();
    const oldGateway = await gateway();
    await invoke("document.querySelector('#widget').shadowRoot.querySelector('button').click()");
    await expect.poll(async () => {

        return (await snapshot()).dashboards.length;
    }).toBe(2);
    const focusScope = (await snapshot()).selection;
    assert.notEqual(focusScope.dashboardId, firstScope.dashboardId);
    await page.getByRole("button", {
        name: "Open workspaces",
        exact: true,
    }).click();
    const tree = page.getByRole("tree", {
        name: "Workspaces and dashboards",
        exact: true,
    });
    await expect(tree.getByRole("treeitem", {
        name: "Local workspace 2",
        exact: true,
    })).toBeVisible();
    await tree.getByRole("treeitem", {
        name: "Overview",
        exact: true,
    }).click();
    await expect.poll(async () => {

        return (await snapshot()).selection;
    }).toEqual(firstScope);
    await expect(page.getByRole("dialog", {
        name: "Workspaces",
        exact: true,
    })).toHaveCount(0);
    await page.getByRole("button", {
        name: "Open workspaces",
        exact: true,
    }).click();
    await page.getByRole("tree", {
        name: "Workspaces and dashboards",
        exact: true,
    })
        .getByRole("treeitem", {
            name: "Focus",
            exact: true,
        })
        .click();
    await expect.poll(async () => {

        return (await snapshot()).selection;
    }).toEqual(focusScope);
    await expect.poll(() => {

        return app.evaluate(({ webContents }, ids) => {

            return ids.some(id => {

                return webContents.fromId(id);
            });
        }, oldNativeIds);
    }).toBe(false);
    assert.equal((await request(oldGateway, "avesd_inspect_dashboard")).status, 403);
    assert.equal((await tool("avesd_inspect_dashboard")).layout.dashboardId, focusScope.dashboardId);
    assert.equal(await page.evaluate(async oldWidgetId => {

        try {
            await window.avesd.web.command({
                type: "create",
                widgetId: oldWidgetId,
            });

            return false;
        } catch { return true; }
    }, (await snapshot()).widgets.find(item => {

        return item.widgetTypeId === "page";
    }).id), true);
    await tool("avesd_add_widget", {
        pluginId: "avesd.builtin.counter",
        widgetTypeId: "counter",
    });
    const focusCounter = (await snapshot()).widgets.find(widget => {

        return widget.dashboardId === focusScope.dashboardId && widget.widgetTypeId === "counter";
    });
    assert.equal((await tool("avesd_inspect_dashboard")).dataSources.length, 1);
    await tool("avesd_bind_widget_input", {
        widgetId: focusCounter.id,
        inputId: "count",
        dataSourceId: sharedCounter.id,
    });
    await expect(page.getByText("1", { exact: true })).toBeVisible();
    await page.getByRole("button", {
        name: "Increment",
        exact: true,
    }).click();
    await addNavigator();
    await select(firstScope);
    await expect(page.getByText("2", { exact: true })).toBeVisible();
    await expect.poll(nativeIds).toHaveLength(3);
    assert.ok((await nativeIds()).every(id => {

        return !oldNativeIds.includes(id);
    }));
    await select(focusScope);
    await page.getByRole("button", {
        name: "Open settings",
        exact: true,
    }).click();
    await page.getByRole("checkbox", {
        name: "Enable OpenCode",
        exact: true,
    }).click();
    await expect.poll(() => {

        return page.evaluate(async () => {

            return (await window.avesd.agentProviders.list()).find(provider => {

                return provider.id === "opencode";
            }).enabled;
        });
    }).toBe(false);
    await page.getByRole("radio", {
        name: "Left",
        exact: true,
    }).click();
    await expect(page.locator(".app-shell")).toHaveAttribute("data-sidebar-side", "left");
    assert.equal(await page.evaluate(() => {

        return window.avesd.preferences.setSidebarSide("bottom").then(() => {

            return false;
        }, () => {

            return true;
        });
    }), true);
    await close();
    await launch();
    await expect(page.locator(".app-shell")).toHaveAttribute("data-sidebar-side", "left");
    assert.deepEqual((await snapshot()).selection, focusScope);
    assert.equal(await page.evaluate(async () => {

        return (await window.avesd.agentProviders.list()).find(provider => {

            return provider.id === "opencode";
        }).enabled;
    }), false);
    await expect(page.getByText("2", { exact: true })).toBeVisible();
    await invoke(`window.__syntheticWorkspace.management.execute({type:'delete',scope:${JSON.stringify(firstScope)}})`);
    await expect.poll(() => {

        return invoke("document.querySelector('#widget').shadowRoot.querySelector('output').textContent");
    }).toBe("1 dashboards");
    const retained = await snapshot();
    assert.deepEqual(retained.selection, focusScope);
    assert.equal(retained.dataSources.length, 1);
    assert.equal(retained.dataSources[0].scope.kind, "workspace");
    assert.ok(retained.widgets.every(widget => {

        return widget.dashboardId === focusScope.dashboardId;
    }));
    assert.equal(await invoke(`window.__syntheticWorkspace.management.execute({type:'delete',scope:${JSON.stringify(focusScope)}}).then(()=>false,()=>true)`), true);
    await invoke("window.__syntheticWorkspace.management.execute({type:'createWorkspace',name:'Synthetic studio'})").catch(() => {
    });
    await expect.poll(async () => {

        return (await snapshot()).workspaces.length;
    }).toBe(2);
    const studio = (await snapshot()).selection;
    await addNavigator();
    const otherDashboards = await invoke(`window.__syntheticWorkspace.catalog.listDashboards(${JSON.stringify(focusScope.workspaceId)})`);
    assert.deepEqual(otherDashboards.map(item => {

        return Object.keys(item).sort();
    }), [
        [
            "id",
            "name",
            "workspaceId",
        ],
    ]);
    assert.deepEqual((await snapshot()).selection, studio, "querying another workspace must not select it");
    assert.deepEqual(await invoke("window.__syntheticWorkspace.navigation.getCurrent()"), studio);
    await invoke(`window.__syntheticWorkspace.management.execute({type:'renameWorkspace',workspaceId:${JSON.stringify(studio.workspaceId)},name:'Studio renamed'})`);
    assert.equal((await invoke("window.__syntheticWorkspace.catalog.listWorkspaces()")).find(item => {

        return item.id === studio.workspaceId;
    }).name, "Studio renamed");
    await invoke(`window.__syntheticWorkspace.management.execute({type:'deleteWorkspace',workspaceId:${JSON.stringify(studio.workspaceId)}})`).catch(() => {
    });
    await expect.poll(async () => {

        return (await snapshot()).selection;
    }).toEqual(focusScope);
    assert.equal(await invoke(`window.__syntheticWorkspace.management.execute({type:'deleteWorkspace',workspaceId:${JSON.stringify(focusScope.workspaceId)}}).then(()=>false,()=>true)`), true);
    const final = await snapshot();
    assert.deepEqual(final, retained);
    assert.deepEqual(JSON.parse(await readFile(join(dataDirectory, "workspace-v1.json"), "utf8")), final);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({
        passed: true,
        checks: [
            "persistent sidebar position",
            "no fixed workspace navigation UI",
            "real widget service bridge",
            "isolated preview data",
            "undeclared capability denied",
            "metadata-only cross-workspace queries",
            "subscription refresh",
            "shared/private data",
            "native teardown",
            "old credentials revoked",
            "active agent scope",
            "restart selection",
            "atomic dashboard/workspace deletion",
            "last scope protected",
        ],
    }));
} finally {
    await harness.dispose();
}
