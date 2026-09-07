import { createRequire } from 'node:module';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const require = createRequire(import.meta.url);
// Reuse the browser test provider's installed Playwright peer.
const { _electron: electron } = createRequire(require.resolve('@vitest/browser-playwright'))('playwright');
const { expect } = createRequire(require.resolve('@vitest/browser-playwright'))('playwright/test');
import { mkdtemp } from 'node:fs/promises';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
const directory = await mkdtemp(join(tmpdir(), 'avesd-web-qa-'));
const server = createServer((_req, res) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
  res.end('<!doctype html><html><head><title>Synthetic web fixture</title></head><body style="font:20px system-ui;background:#edf4ef;padding:30px"><h1>Synthetic project</h1><p id="count">7</p><button onclick="document.querySelector(\'#count\').textContent=8">Increment</button></body></html>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const address = `http://127.0.0.1:${server.address().port}`;
let app;
try {
  app = await electron.launch({
    executablePath: require('electron'),
    args: [join(import.meta.dirname, 'web-surface-bootstrap.mjs')],
    env: {...process.env, AVESD_WEB_TEST_PROFILE: directory},
  });
  const page = await app.firstWindow();
  page.setDefaultTimeout(10000);
  await page.getByRole('button', {name:'Configure dashboard', exact:true}).click();
  await page.locator('.layout-editor-list article').filter({has:page.getByText('Web page', {exact:true})}).getByRole('button',{name:'Add',exact:true}).click();
  await page.locator('.layout-editor-list article').filter({has:page.getByText('Web result', {exact:true})}).getByRole('button',{name:'Add',exact:true}).click();
  await page.getByLabel('Bind Web result Web output').selectOption({label:'Web result 1 (temporary) · this dashboard'});
  await page.getByRole('button',{name:'Done',exact:true}).click();
  await page.getByLabel('Website URL').fill(address);
  await page.getByRole('button',{name:'Go',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Ready'}).waitFor();
  const guestInfo = await app.evaluate(({webContents}) => {
    const guest = webContents.getAllWebContents().find(c => c.getURL().startsWith('http://127.0.0.1:'));
    const prefs = guest.getLastWebPreferences();
    return {id:guest.id, node:prefs.nodeIntegration, sandbox:prefs.sandbox, isolation:prefs.contextIsolation, preload:prefs.preload};
  });
  const guestVisible = () => app.evaluate(({BrowserWindow}, id) =>
    BrowserWindow.getAllWindows()[0].contentView.children.find(view => view.webContents?.id === id)?.getVisible(), guestInfo.id);
  await expect.poll(guestVisible).toBe(true);
  assert.equal(guestInfo.node,false); assert.equal(guestInfo.sandbox,true); assert.equal(guestInfo.isolation,true); assert.ok(!guestInfo.preload);
  const isolated = await app.evaluate(async ({webContents},id)=>webContents.fromId(id).executeJavaScript('({ node:typeof require, host:typeof window.avesd })'),guestInfo.id);
  assert.deepEqual(isolated,{node:'undefined',host:'undefined'});
  await page.getByRole('button',{name:'Tools',exact:true}).click();
  await expect.poll(guestVisible).toBe(false);
  await page.getByLabel('Script',{exact:true}).fill('({ title: document.title, count: Number(document.querySelector("#count").textContent) })');
  await page.locator('.consent').check();
  await page.getByRole('button',{name:'Run',exact:true}).click();
  await page.locator('pre').filter({hasText:'"count": 7'}).waitFor();
  assert.match(await page.locator('pre').innerText(), /"count": 7/);
  // A layout update must not recreate the guest or erase the live result.
  await page.keyboard.press('Meta+e');
  await page.getByRole('button',{name:'Move widget down',exact:true}).last().click();
  await page.getByRole('button',{name:'Done',exact:true}).click();
  assert.match(await page.locator('pre').innerText(), /"count": 7/);
  const alive = await app.evaluate(({webContents},id)=>!!webContents.fromId(id),guestInfo.id);
  assert.equal(alive,true);
  // Layout and bindings persist; extracted values and source objects do not.
  const snapshot = await page.evaluate(()=>window.avesd.workspaceStorage.load());
  assert.ok(!JSON.stringify(snapshot).includes('Synthetic web fixture'));
  assert.ok(!snapshot.dataSources.some(s=>s.dataType==='avesd.web-result'));
  await page.getByLabel('Script mode').selectOption('css');
  await page.getByLabel('Script',{exact:true}).fill('body { background: rgb(220, 240, 255) !important; }');
  await page.locator('.consent').check();
  await page.getByRole('button',{name:'Run',exact:true}).click();
  await expect.poll(() => app.evaluate(async ({webContents},id)=>webContents.fromId(id)
    .executeJavaScript('getComputedStyle(document.body).backgroundColor'),guestInfo.id)).toBe('rgb(220, 240, 255)');
  await page.getByLabel('Script mode').selectOption('page');
  await page.getByLabel('Script',{exact:true}).fill('document.querySelector("button").click(); ({ count: Number(document.querySelector("#count").textContent) })');
  await page.locator('.consent').check();
  await page.getByRole('button',{name:'Run',exact:true}).click();
  await page.locator('pre').filter({hasText:'"count": 8'}).waitFor();
  // Navigation invalidates a pending result and clears the output/authorization.
  await page.getByLabel('Script',{exact:true}).fill('new Promise(resolve => setTimeout(() => resolve({ obsolete: true }), 1000))');
  await page.locator('.consent').check();
  await page.getByRole('button',{name:'Run',exact:true}).click();
  await page.getByRole('button',{name:'Reload',exact:true}).click();
  await page.waitForTimeout(1200);
  assert.ok(!(await page.locator('pre').innerText()).includes('obsolete'));
  assert.equal(await page.locator('.consent').isChecked(),false);
  await page.getByRole('button',{name:'Clear result',exact:true}).click();
  await page.getByText('Bind a Web output in Edit layout, then run a script in its Web page widget.',{exact:true}).waitFor();
  await page.keyboard.press('Meta+e');
  await expect.poll(guestVisible).toBe(false);
  await page.locator('.layout-editor-list article').filter({has:page.getByText('Web page', {exact:true})}).getByRole('button',{name:'Add',exact:true}).click();
  await page.getByRole('button',{name:'Done',exact:true}).click();
  await page.getByLabel('Website URL').nth(1).fill(address);
  await page.getByRole('button',{name:'Go',exact:true}).nth(1).click();
  await page.getByRole('status').filter({hasText:'Ready'}).nth(1).waitFor();
  const independent = await app.evaluate(({webContents}) => {
    const pages = webContents.getAllWebContents().filter(c=>c.getURL().startsWith('http://127.0.0.1:'));
    return pages.length===2 && pages[0].session!==pages[1].session;
  });
  assert.equal(independent,true);
  // A separate controller has no browser authority until the host binds it.
  await page.keyboard.press('Meta+e');
  await page.locator('.layout-editor-list article').filter({has:page.getByText('Browser controls', {exact:true})}).getByRole('button',{name:'Add',exact:true}).click();
  await page.getByRole('button',{name:'Done',exact:true}).click();
  const controls = page.locator('.dashboard-widget').filter({has:page.getByText('Browser controls',{exact:true})});
  await controls.getByRole('button',{name:'Read text',exact:true}).click();
  await controls.getByRole('status').filter({hasText:'Action denied'}).waitFor();
  const instances = await page.evaluate(async()=> (await window.avesd.workspaceStorage.load()).widgets);
  const sourceId = instances.find(widget=>widget.widgetTypeId==='controls').id;
  const targetId = instances.find(widget=>widget.widgetTypeId==='page').id;
  await page.keyboard.press('Meta+e');
  await page.getByLabel('Control target',{exact:true}).selectOption(targetId);
  await page.getByLabel('Allowed website origin',{exact:true}).fill(address);
  await page.getByLabel('Allow extract',{exact:true}).check();
  await page.getByRole('button',{name:'Save browser binding',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.avesd.browserControls.list())).toHaveLength(1);
  await page.getByRole('button',{name:'Done',exact:true}).click();
  await controls.getByRole('button',{name:'Read text',exact:true}).click();
  await controls.locator('pre').filter({hasText:'Synthetic project'}).waitFor();
  await controls.getByLabel('Control destination URL').fill(`${address}/next`);
  await controls.getByRole('button',{name:'Navigate',exact:true}).click();
  await controls.getByRole('status').filter({hasText:'Action denied'}).waitFor();
  await page.keyboard.press('Meta+e');
  await page.getByLabel('Allow navigate',{exact:true}).check();
  await page.getByLabel('Allow click',{exact:true}).check();
  await page.getByRole('button',{name:'Save browser binding',exact:true}).click();
  await expect.poll(()=>page.evaluate(async()=> (await window.avesd.browserControls.list())[0]?.operations.length)).toBe(3);
  await page.getByRole('button',{name:'Done',exact:true}).click();
  await controls.getByRole('button',{name:'Navigate',exact:true}).click();
  await expect.poll(()=>app.evaluate(({webContents},id)=>webContents.fromId(id).getURL(),guestInfo.id)).toBe(`${address}/next`);
  await controls.getByLabel('Control CSS selector').fill('button');
  await controls.getByRole('button',{name:'Click element',exact:true}).click();
  await controls.getByRole('status').filter({hasText:'Completed'}).waitFor();
  await controls.getByLabel('Control CSS selector').fill('#count');
  await controls.getByRole('button',{name:'Read text',exact:true}).click();
  await controls.locator('pre').filter({hasText:'"text": "8"'}).waitFor();
  await controls.getByLabel('Control destination URL').fill(address.replace('127.0.0.1','localhost'));
  await controls.getByRole('button',{name:'Navigate',exact:true}).click();
  await controls.getByRole('status').filter({hasText:'Action denied'}).waitFor();
  // Source IDs are checked against supported controller instances, not plugin identity alone.
  assert.equal(await page.evaluate(async ({targetId}) => {
    try { await window.avesd.browserControls.invoke(targetId,'browser',{type:'extract',fields:{text:'h1'}}); return false; }
    catch { return true; }
  },{targetId}),true);
  await page.keyboard.press('Meta+e');
  await page.getByRole('button',{name:'Move widget down',exact:true}).last().click();
  await page.getByRole('button',{name:'Done',exact:true}).click();
  assert.equal((await page.evaluate(()=>window.avesd.browserControls.list()))[0].targetId,targetId);
  await page.keyboard.press('Meta+e');
  await page.getByRole('button',{name:'Remove widget',exact:true}).first().click();
  await expect.poll(() => app.evaluate(({webContents},id)=>!!webContents.fromId(id),guestInfo.id)).toBe(false);
  assert.equal((await page.evaluate(()=>window.avesd.browserControls.list())).length,0);
  assert.equal(await page.evaluate(async ({sourceId}) => {
    try { await window.avesd.browserControls.invoke(sourceId,'browser',{type:'extract',fields:{text:'h1'}}); return false; }
    catch { return true; }
  },{sourceId}),true);
  console.log(JSON.stringify({passed:true,directory,checks:['native embed','no host API','isolated JS','page-world click','CSS','live binding','layout preserves session','no persisted result','navigation discards pending result','clear','destroy']}));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  if (app) {
    const closing = app.close();
    const timer = setTimeout(()=>app.process().kill('SIGTERM'),5000);
    await closing.catch(()=>undefined); clearTimeout(timer);
  }
  server.close();
}
