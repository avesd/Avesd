/**
 * @author Avesd
 * @package Desktop
 * @namespace TestE2e
 * @description Shared Resources Test
 */

import { createDesktopHarness, expect } from "./support/desktop.mjs";
import assert from "node:assert/strict";

const harness = await createDesktopHarness("shared-resources");
const { snapshot, tool, native, close, install } = harness;
let page;
const launch = async () => {

    ({ page } = await harness.launch());
};
const producer = {
    manifest: {
        apiVersion: 1,
        id: "avesd.local.resource-producer",
        version: "0.1.0",
        displayName: "Synthetic producer",
        widgetTypeId: "producer",
        size: {
            width: 8,
            height: 8,
        },
        capabilities: [
            "files",
            "sqlite",
            "resources",
        ],
    },
    source: `export function mount(root, context) {
    window.__syntheticResources = context;
    root.innerHTML = '<output>Loading</output>';
    void (async () => {
      try {
        try { await context.files.readText('shared.json'); } catch { await context.files.write('shared.json', JSON.stringify({value:'synthetic private content'})); }
        const db = await context.sqlite.open('tasks.sqlite');
        await db.execute('CREATE TABLE IF NOT EXISTS tasks (title TEXT)');
        await context.resources.publish({key:'file',name:'Synthetic file',kind:'file',path:'shared.json',contract:{id:'example.file',version:1,schema:{type:'object'}}});
        await context.resources.publish({key:'tasks',name:'Synthetic tasks',kind:'sqlite',path:'tasks.sqlite',contract:{id:'example.tasks',version:1,schema:{tables:{tasks:{columns:{title:'text'}}}}}});
        root.querySelector('output').textContent = 'Ready';
      } catch { root.querySelector('output').textContent = 'Failed'; }
    })();
    return {update(){},dispose(){root.replaceChildren()}};
  }`,
    tests: [
        {
            type: "expectText",
            selector: "output",
            text: "Ready",
        },
    ],
};
const consumer = {
    manifest: {
        ...producer.manifest,
        id: "avesd.local.resource-consumer",
        displayName: "Synthetic consumer",
        widgetTypeId: "consumer",
        capabilities: ["resources"],
    },
    source: "export function mount(root,context){window.__syntheticResources=context;window.__resourceEvents=0;context.resources.subscribe(()=>window.__resourceEvents++);root.innerHTML='<output>Ready</output>';return {update(){},dispose(){root.replaceChildren()}};}",
    tests: [
        {
            type: "expectText",
            selector: "output",
            text: "Ready",
        },
    ],
};
const guest = pluginId => {

    return harness.guest(
        pluginId,
        "document.querySelector('#widget').shadowRoot.querySelector('output')?.textContent === 'Ready'",
    );
};
const add = content => {

    return tool("avesd_add_widget", {
        pluginId: content.manifest.id,
        widgetTypeId: content.manifest.widgetTypeId,
    });
};
try {
    await launch();
    const firstScope = (await snapshot()).selection;
    const beforePreview = await tool("avesd_list_resources");
    await install(producer); await install(consumer);
    assert.deepEqual(await tool("avesd_list_resources"), beforePreview, "preview publications must not reach the live directory");
    await add(producer); await add(consumer);
    let producerId = await guest(producer.manifest.id);
    let consumerId = await guest(consumer.manifest.id);
    const resources = await native(consumerId, "window.__syntheticResources.resources.list()");
    assert.equal(resources.length, 2);
    assert.ok(resources.every(resource => {

        return resource.access === "none" && !("path" in resource) && !("grants" in resource);
    }));
    assert.ok(!JSON.stringify(resources).includes("synthetic private content"));
    const fileId = resources.find(resource => {

        return resource.kind === "file";
    }).id;
    const databaseId = resources.find(resource => {

        return resource.kind === "sqlite";
    }).id;
    const fileArg = JSON.stringify(fileId); const dbArg = JSON.stringify(databaseId);
    assert.equal((await native(consumerId, "window.__syntheticResources.resources.list({contractId:'example.tasks',version:1,kind:'sqlite'})")).length, 1);
    assert.deepEqual(await native(consumerId, "window.__syntheticResources.resources.list({contractId:'example.tasks',version:2})"), []);
    assert.equal(await native(consumerId, `window.__syntheticResources.resources.openFile(${fileArg}).then(()=>false,()=>true)`), true);
    assert.equal(await native(consumerId, "window.__syntheticResources.resources.publish({key:'sneak',name:'Sneak',kind:'file',path:'shared.json',contract:{id:'x',version:1,schema:{}}}).then(()=>false,()=>true)"), true);
    const grant = (resourceId, access) => {

        return tool("avesd_set_resource_access", {
            resourceId,
            pluginId: consumer.manifest.id,
            access,
        });
    };
    const events = await native(consumerId, "window.__resourceEvents");
    await grant(fileId, "read"); await grant(databaseId, "read");
    await expect.poll(() => {

        return native(consumerId, "window.__resourceEvents");
    }).toBeGreaterThan(events);
    await native(consumerId, `window.__syntheticResources.resources.openFile(${fileArg}).then(file=>{window.__sharedFile=file})`);
    await native(consumerId, `window.__syntheticResources.resources.openDatabase(${dbArg}).then(db=>{window.__sharedDatabase=db})`);
    assert.equal(await native(consumerId, "window.__sharedFile.readText()"), '{"value":"synthetic private content"}');
    assert.equal(await native(consumerId, "window.__sharedFile.write('forbidden').then(()=>false,()=>true)"), true);
    assert.deepEqual(await native(consumerId, "window.__sharedDatabase.query('SELECT count(*) AS count FROM tasks')"), [{ count: 0 }]);
    assert.equal(await native(consumerId, "window.__sharedDatabase.query(\"INSERT INTO tasks VALUES ('forbidden') RETURNING title\").then(()=>false,()=>true)"), true);
    await grant(fileId, "read-write"); await grant(databaseId, "read-write");
    await native(consumerId, "window.__sharedFile.write('synthetic updated')");
    await native(consumerId, "window.__sharedDatabase.transaction([{sql:'INSERT INTO tasks VALUES (?)',parameters:['synthetic task']}])");
    assert.equal(await native(producerId, "window.__syntheticResources.files.readText('shared.json')"), "synthetic updated");
    await grant(fileId, "none"); await grant(databaseId, "none");
    assert.equal(await native(consumerId, "window.__sharedFile.readText().then(()=>false,()=>true)"), true);
    assert.equal(await native(consumerId, "window.__sharedDatabase.query('SELECT * FROM tasks').then(()=>false,()=>true)"), true);
    await grant(fileId, "read"); await grant(databaseId, "read");
    await close(); await launch();
    producerId = await guest(producer.manifest.id); consumerId = await guest(consumer.manifest.id);
    assert.equal(await native(consumerId, `window.__syntheticResources.resources.openFile(${fileArg}).then(file=>file.readText())`), "synthetic updated");
    assert.deepEqual(await native(consumerId, `window.__syntheticResources.resources.openDatabase(${dbArg}).then(db=>db.query('SELECT title FROM tasks'))`), [{ title: "synthetic task" }]);
    const originalInstance = (await native(consumerId, "window.avesdWidget.initialize()")).instanceId;
    await tool("avesd_manage_workspace", {
        type: "createWorkspace",
        name: "Synthetic other workspace",
    });
    await add(consumer); consumerId = await guest(consumer.manifest.id);
    assert.deepEqual(await native(consumerId, "window.__syntheticResources.resources.list()"), []);
    assert.deepEqual(await tool("avesd_list_resources"), []);
    assert.equal(await native(consumerId, `window.__syntheticResources.resources.openFile(${fileArg}).then(()=>false,()=>true)`), true);
    await assert.rejects(grant(fileId, "read-write"));
    assert.equal(await page.evaluate(async instanceId => {

        return window.avesd.widgetWorkspace.invoke(instanceId, {
            type: "resources",
            operation: "list",
            query: {},
        }).then(()=>{

            return false;
        }, ()=>{

            return true;
        });
    }, originalInstance), true);
    await tool("avesd_manage_workspace", {
        type: "select",
        ...firstScope,
    });
    producerId = await guest(producer.manifest.id); consumerId = await guest(consumer.manifest.id);
    await native(consumerId, `window.__syntheticResources.resources.openFile(${fileArg}).then(file=>{window.__sharedFile=file})`);
    assert.equal(await native(consumerId, `window.__syntheticResources.resources.unpublish(${fileArg}).then(()=>false,()=>true)`), true);
    await native(producerId, `window.__syntheticResources.resources.unpublish(${fileArg})`);
    assert.equal(await native(consumerId, "window.__sharedFile.readText().then(()=>false,()=>true)"), true);
    assert.equal(await native(producerId, "window.__syntheticResources.files.readText('shared.json')"), "synthetic updated");
    console.log("PASS: native resource publication/discovery, metadata-only directory, preview isolation, explicit grants, read-only SQL, writes, revocation, restart and workspace isolation");
} finally { await harness.dispose(); }
