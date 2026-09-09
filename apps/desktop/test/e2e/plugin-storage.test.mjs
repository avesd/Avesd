/**
 * @author Avesd
 * @package Desktop
 * @namespace TestE2e
 * @description Plugin Storage Test
 */

import { createDesktopHarness, expect } from "./support/desktop.mjs";
import assert from "node:assert/strict";

const harness = await createDesktopHarness("plugin-storage");
const { snapshot, tool, native, close, install } = harness;
let page;
const launch = async () => {

    ({ page } = await harness.launch());
};
const content = {
    manifest: {
        apiVersion: 1,
        id: "avesd.local.storage-test",
        version: "0.1.0",
        displayName: "Synthetic storage",
        widgetTypeId: "storage",
        size: {
            width: 8,
            height: 8,
        },
        capabilities: [
            "files",
            "sqlite",
        ],
    },
    source: `export function mount(root, context) {
    window.__syntheticStorage = context;
    root.innerHTML = '<output>Loading</output><button>Save</button>';
    let database;
    const refresh = async () => {
      const rows = await database.query('SELECT count(*) AS count FROM events');
      root.querySelector('output').textContent = String(rows[0].count);
    };
    root.querySelector('button').onclick = async () => {
      try {
        await database.execute('INSERT INTO events (value) VALUES (?)', ['synthetic']);
        await context.files.write('notes/state.json', JSON.stringify({ saved: true }));
        await refresh();
      } catch { root.querySelector('output').textContent = 'Save failed'; }
    };
    void (async () => {
      try {
        database = await context.sqlite.open('events.sqlite');
        await database.execute('CREATE TABLE IF NOT EXISTS events (value TEXT)');
        await refresh();
      } catch { root.querySelector('output').textContent = 'Storage failed'; }
    })();
    return { update() {}, dispose() { root.replaceChildren(); } };
  }`,
    tests: [
        {
            type: "expectText",
            selector: "output",
            text: "0",
        },
        {
            type: "click",
            selector: "button",
        },
        {
            type: "expectText",
            selector: "output",
            text: "1",
        },
    ],
};
const readyGuest = (pluginId = content.manifest.id) => {

    return harness.guest(
        pluginId,
        "!!window.__syntheticStorage && document.querySelector('#widget').shadowRoot.querySelector('output').textContent !== 'Loading'",
    );
};
const text = id => {

    return native(id, "document.querySelector('#widget').shadowRoot.querySelector('output').textContent");
};
const add = () => {

    return tool("avesd_add_widget", {
        pluginId: content.manifest.id,
        widgetTypeId: "storage",
    });
};
try {
    await launch();
    const firstScope = (await snapshot()).selection;
    await install(content);
    await add();
    let id = await readyGuest();
    assert.equal(await text(id), "0", "preview writes must not leak into live storage");
    await native(id, "document.querySelector('#widget').shadowRoot.querySelector('button').click()");
    await expect.poll(() => {

        return text(id);
    }).toBe("1");
    assert.equal(await native(id, "window.__syntheticStorage.files.readText('notes/state.json')"), '{"saved":true}');
    assert.equal(await native(id, "window.__syntheticStorage.files.write('binary.dat',new Uint8Array([0,255,42])).then(()=>window.__syntheticStorage.files.read('binary.dat')).then(value=>Array.from(value).join(','))"), "0,255,42");
    const originalInstance = (await native(id, "window.avesdWidget.initialize()")).instanceId;
    // A second plugin uses the same filenames but receives a separate namespace.
    const other = {
        ...content,
        manifest: {
            ...content.manifest,
            id: "avesd.local.storage-other",
        },
    };
    await install(other);
    await tool("avesd_add_widget", {
        pluginId: other.manifest.id,
        widgetTypeId: "storage",
    });
    const otherId = await readyGuest(other.manifest.id);
    assert.equal(await text(otherId), "0");
    assert.equal(await native(otherId, "window.__syntheticStorage.files.readText('notes/state.json').then(()=>false,()=>true)"), true);
    // Calls through the exposed preload still need a declared capability.
    const unprivileged = {
        ...content,
        manifest: {
            ...content.manifest,
            id: "avesd.local.storage-denied",
            capabilities: [],
        },
        source: 'export function mount(root,context){window.__syntheticStorage=context;root.innerHTML="<output>Ready</output>";return{update(){},dispose(){root.replaceChildren()}}}',
        tests: [
            {
                type: "expectText",
                selector: "output",
                text: "Ready",
            },
        ],
    };
    await install(unprivileged);
    await tool("avesd_add_widget", {
        pluginId: unprivileged.manifest.id,
        widgetTypeId: "storage",
    });
    const deniedId = await readyGuest(unprivileged.manifest.id);
    assert.equal(await native(deniedId, "window.avesdWidget.files.readText('notes/state.json').then(()=>false,()=>true)"), true);
    assert.equal(await native(deniedId, "window.avesdWidget.sqlite.open('events.sqlite').then(()=>false,()=>true)"), true);
    await tool("avesd_manage_workspace", {
        type: "createWorkspace",
        name: "Synthetic second workspace",
    });
    await add();
    id = await readyGuest();
    assert.equal(await text(id), "0");
    assert.equal(await native(id, "window.__syntheticStorage.files.readText('notes/state.json').then(()=>false,()=>true)"), true);
    assert.equal(await page.evaluate(async instanceId => {

        return window.avesd.widgetWorkspace.invoke(instanceId, {
            type: "files",
            operation: "read",
            path: "notes/state.json",
        }).then(() => {

            return false;
        }, () => {

            return true;
        });
    }, originalInstance), true);
    await tool("avesd_manage_workspace", {
        type: "select",
        ...firstScope,
    });
    id = await readyGuest(); assert.equal(await text(id), "1");
    const persisted = await snapshot();
    assert.ok(!JSON.stringify(persisted).includes('"saved":true'));
    await close(); await launch();
    id = await readyGuest(); assert.equal(await text(id), "1");
    assert.equal(await native(id, "window.__syntheticStorage.files.readText('notes/state.json')"), '{"saved":true}');
    // Repeat a preview after live writes: it starts empty and leaves live data untouched.
    const draft = await tool("avesd_create_plugin_draft", content);
    assert.equal((await tool("avesd_test_plugin", {
        draftId: draft.id,
        revision: draft.revision,
    })).passed, true);
    assert.equal(await text(id), "1");
    console.log("PASS: native files and SQLite, IPC types, preview isolation, plugin/workspace isolation, capability denial, stale identity, and restart persistence");
} finally { await harness.dispose(); }
