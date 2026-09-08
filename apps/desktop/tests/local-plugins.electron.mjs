import { createRequire } from 'node:module';
import { Buffer } from 'node:buffer';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { _electron: electron } = createRequire(require.resolve('@vitest/browser-playwright'))('playwright');
const { expect } = createRequire(require.resolve('@vitest/browser-playwright'))('playwright/test');
const directory = await mkdtemp(join(tmpdir(), 'avesd-authoring-'));
await mkdir(join(directory, '.avesd'));
await writeFile(join(directory, '.avesd', 'config.json'), JSON.stringify({dataDirectory:join(directory,'data')}));
const relayPath = join(import.meta.dirname,'../out/main/workspace-mcp.js');
let app;
let relay;
let sequence = 0;
const pending = new Map();
const launch = async () => {
  app = await electron.launch({timeout:15000,executablePath:require('electron'),args:[join(import.meta.dirname,'local-plugins-bootstrap.mjs')],
    env:{...process.env,AVESD_WEB_TEST_PROFILE:directory}});
  const page = await app.firstWindow();
  page.setDefaultTimeout(10000);
  await page.getByLabel('Dashboard workspace',{exact:true}).waitFor();
  const gateway = await app.evaluate(() => globalThis.__avesdTestGateway);
  relay = spawn(process.execPath,[relayPath],{env:{...process.env,AVESD_HOST_URL:gateway.url,AVESD_HOST_TOKEN:gateway.token},stdio:['pipe','pipe','pipe']});
  relay.stderr.resume();
  createInterface({input:relay.stdout}).on('line',line=>{
    const message = JSON.parse(line);
    if (!Object.hasOwn(message,'id')) return;
    const waiter=pending.get(message.id); if (!waiter) return;
    pending.delete(message.id); clearTimeout(waiter.timer);
    if (message.error) waiter.reject(new Error(message.error.message)); else waiter.resolve(message.result);
  });
  await request('initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'synthetic-authoring-harness',version:'1.0.0'}});
  relay.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
  return page;
};
const request = (method,params) => new Promise((resolve,reject)=>{
  const id=++sequence;
  const timer=setTimeout(()=>{pending.delete(id);reject(new Error(`MCP request timed out: ${method}`));},20000);
  pending.set(id,{resolve,reject,timer});
  relay.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');
});
const rawTool=(name,args={})=>request('tools/call',{name,arguments:args});
const tool=async(name,args={})=>{
  const response=await rawTool(name,args);
  assert.ok(!response.isError,response.content?.find(item=>item.type==='text')?.text);
  return JSON.parse(response.content.find(item=>item.type==='text').text);
};
const stopRelay=()=>{relay?.kill();relay=undefined;};
try {
  let page=await launch();
  console.log('Local authoring: connected to desktop and MCP');
  const listed=await request('tools/list',{});
  assert.ok(listed.tools.some(tool=>tool.name==='avesd_test_plugin'));
  const sdk=await tool('avesd_get_widget_sdk');
  const content={...sdk.example,manifest:{...sdk.example.manifest,id:'avesd.local.focus-counter',displayName:'Focus sessions'},
    source:sdk.example.source.replace('My counter','Focus sessions')};
  let draft=await tool('avesd_create_plugin_draft',content);
  assert.equal((await tool('avesd_read_plugin_draft',{draftId:draft.id})).source,content.source);
  assert.equal((await rawTool('avesd_activate_plugin',{draftId:draft.id,revision:draft.revision})).isError,true);
  draft=await tool('avesd_write_plugin_draft',{...content,source:content.source.replace('String(++count)','String(count)'),draftId:draft.id,expectedRevision:draft.revision});
  const failed=await tool('avesd_test_plugin',{draftId:draft.id,revision:draft.revision});
  assert.equal(failed.passed,false);
  assert.equal((await rawTool('avesd_activate_plugin',{draftId:draft.id,revision:draft.revision})).isError,true);
  draft=await tool('avesd_write_plugin_draft',{...content,draftId:draft.id,expectedRevision:draft.revision});
  const tested=await rawTool('avesd_test_plugin',{draftId:draft.id,revision:draft.revision});
  assert.ok(!tested.isError);
  const report=JSON.parse(tested.content.find(item=>item.type==='text').text);
  assert.equal(report.passed,true,JSON.stringify(report));
  console.log('Local authoring: interaction failure, repair, and passing report verified');
  assert.ok(tested.content.some(item=>item.type==='image'));
  const oldRevision=draft.revision;
  draft=await tool('avesd_write_plugin_draft',{...content,source:content.source+'\n// Verified revision',draftId:draft.id,expectedRevision:draft.revision});
  assert.equal((await rawTool('avesd_activate_plugin',{draftId:draft.id,revision:oldRevision})).isError,true);
  assert.equal((await rawTool('avesd_activate_plugin',{draftId:draft.id,revision:draft.revision})).isError,true);
  assert.equal((await tool('avesd_test_plugin',{draftId:draft.id,revision:draft.revision})).passed,true);
  const preview=await rawTool('avesd_preview_widget',{draftId:draft.id,revision:draft.revision});
  assert.ok(!preview.isError);
  await writeFile(join(directory,'preview.png'),Buffer.from(preview.content.find(item=>item.type==='image').data,'base64'));
  await app.evaluate(({BrowserWindow}) => {
    BrowserWindow.getAllWindows().find(window=>window.getTitle().endsWith('· Preview'))?.destroy();
  });
  assert.ok(!(await rawTool('avesd_preview_widget',{draftId:draft.id,revision:draft.revision})).isError);
  await tool('avesd_activate_plugin',{draftId:draft.id,revision:draft.revision});
  assert.ok((await tool('avesd_inspect_dashboard')).availableWidgetTypes.some(widget=>widget.pluginId===content.manifest.id));
  await expect.poll(()=>page.evaluate(()=>window.avesd.localPlugins.list())).toHaveLength(1);
  const added=await tool('avesd_add_widget',{pluginId:content.manifest.id,widgetTypeId:content.manifest.widgetTypeId});
  assert.equal(added.widgets.length,1);
  await expect.poll(()=>page.evaluate(async()=> (await window.avesd.workspaceStorage.load()).widgets.length)).toBe(1);
  const guest=async()=>app.evaluate(({BrowserWindow})=>{
    const host=BrowserWindow.getAllWindows().find(window=>window.getTitle()==='Avesd');
    const view=host.contentView.children.find(view=>view.webContents?.getURL().startsWith('data:'));
    return view?.getVisible()?view.webContents.id:null;
  });
  await expect.poll(guest).not.toBeNull();
  console.log('Local authoring: installed widget is visible');
  const id=await guest();
  const probe=await app.evaluate(async({webContents},id)=>{
    const contents=webContents.fromId(id);const prefs=contents.getLastWebPreferences();
    return {sandbox:prefs.sandbox,node:prefs.nodeIntegration,preload:prefs.preload,
      host:await contents.executeJavaScript('typeof window.avesd'),
      network:await contents.executeJavaScript("fetch('https://example.com').then(()=>true,()=>false)"),
      files:await contents.executeJavaScript("fetch('file:///etc/hosts').then(()=>true,()=>false)")};
  },id);
  assert.equal(probe.sandbox,true);assert.equal(probe.node,false);assert.ok(!probe.preload);assert.equal(probe.host,'undefined');
  assert.equal(probe.network,false);assert.equal(probe.files,false);
  await app.evaluate(async({webContents},id)=>webContents.fromId(id).executeJavaScript("document.querySelector('#widget').shadowRoot.querySelector('button').click()"),id);
  assert.equal(await app.evaluate(async({webContents},id)=>webContents.fromId(id).executeJavaScript("document.querySelector('#widget').shadowRoot.querySelector('output').textContent"),id),'1');
  await page.keyboard.press('Meta+e');
  await page.getByRole('heading',{name:'Edit layout'}).waitFor();
  await expect.poll(guest).toBeNull();
  await page.getByRole('button',{name:'Done',exact:true}).click();
  await expect.poll(guest).not.toBeNull();
  const dashboardImage=await app.evaluate(async({BrowserWindow})=>{
    const window=BrowserWindow.getAllWindows().find(window=>window.getTitle()==='Avesd');
    return (await window.capturePage()).toPNG().toString('base64');
  });
  await writeFile(join(directory,'dashboard.png'),Buffer.from(dashboardImage,'base64'));
  // Restart the desktop, without connecting an AI account, to verify installed code and instance persistence.
  stopRelay();await app.close();app=undefined;
  page=await launch();
  await expect.poll(guest).not.toBeNull();
  assert.ok((await tool('avesd_inspect_dashboard')).availableWidgetTypes.some(widget=>widget.pluginId===content.manifest.id));
  await tool('avesd_remove_widget',{id:added.widgets[0].id});
  await expect.poll(guest).toBeNull();
  console.log(JSON.stringify({passed:true,directory,checks:['real MCP relay','draft read/write','failed interaction rejected','stale revision rejected','preview image','live catalog','live dashboard','isolated native widget','interaction','overlay visibility','restart persistence','remove']}));
} finally {
  stopRelay();
  for(const waiter of pending.values())clearTimeout(waiter.timer);
  if(app){const timer=setTimeout(()=>app.process().kill('SIGTERM'),5000);await app.close().catch(()=>undefined);clearTimeout(timer);}
}
