import { createRequire } from 'node:module';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const desktop = join(import.meta.dirname, '..');
const require = createRequire(join(desktop, 'package.json'));
const { _electron: electron } = createRequire(require.resolve('@vitest/browser-playwright'))('playwright');
const { expect } = createRequire(require.resolve('@vitest/browser-playwright'))('playwright/test');
const directory = await mkdtemp(join(tmpdir(), 'avesd-widget-navigation-'));
await mkdir(join(directory, '.avesd'));
await writeFile(join(directory, '.avesd/config.json'), JSON.stringify({ dataDirectory: join(directory, 'data') }));
let app;
let page;
const errors = [];
const launch = async () => {
  app = await electron.launch({ executablePath: require('electron'), args: [join(desktop, 'tests/local-plugins-bootstrap.mjs')],
    env: { ...process.env, AVESD_WEB_TEST_PROFILE: directory }, timeout: 15000 });
  page = await app.firstWindow();
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  await page.locator('.dashboard-grid').waitFor();
  await expect(page.locator('.dashboard-navigation')).toHaveCount(0);
};
const close = async () => {
  if (!app) return;
  const closing = app.close();
  const timer = setTimeout(() => app.process().kill('SIGTERM'), 5000);
  await closing.catch(() => {}); clearTimeout(timer); app = undefined;
};
const snapshot = () => page.evaluate(() => window.avesd.workspaceStorage.load());
const gateway = () => app.evaluate(() => globalThis.__avesdTestGateway);
const request = async (address, name, input = {}) => fetch(address.url, { method: 'POST', headers: {
  authorization: `Bearer ${address.token}`, 'content-type': 'application/json',
}, body: JSON.stringify({ name, input }) });
const tool = async (name, input = {}) => {
  const response = await request(await gateway(), name, input);
  assert.equal(response.status, 200);
  const output = await response.json();
  assert.ok(!output.isError, output.content?.find(item => item.type === 'text')?.text);
  return JSON.parse(output.content.find(item => item.type === 'text').text);
};
const nativeIds = () => app.evaluate(({ BrowserWindow }) => {
  const window = BrowserWindow.getAllWindows().find(window => window.getTitle() === 'Avesd');
  return window.contentView.children.filter(view => view.webContents && view.webContents.id !== window.webContents.id).map(view => view.webContents.id);
});
const nativeEval = (id, code) => app.evaluate(({ webContents }, { id, code }) => webContents.fromId(id).executeJavaScript(code), { id, code });
const navigatorId = async () => {
  let found;
  await expect.poll(async () => {
    const localIds = await app.evaluate(({ webContents }) => webContents.getAllWebContents().filter(contents => contents.getTitle() === "Local widget").map(contents => contents.id));
    for (const id of localIds) {
      if (await nativeEval(id, '!!window.__syntheticWorkspace').catch(() => false)) { found = id; return true; }
    }
    return false;
  }).toBe(true);
  return found;
};
const invoke = async code => nativeEval(await navigatorId(), code);
const select = async scope => {
  await invoke(`window.__syntheticWorkspace.navigation.select(${JSON.stringify(scope)})`).catch(() => {});
  await expect.poll(async () => (await snapshot()).selection).toEqual(scope);
  await page.locator('.dashboard-grid').waitFor();
};
const install = async content => {
  const before = await snapshot();
  const draft = await tool('avesd_create_plugin_draft', content);
  assert.equal((await tool('avesd_test_plugin', { draftId: draft.id, revision: draft.revision })).passed, true);
  assert.deepEqual(await snapshot(), before, 'preview services must never mutate live data');
  await tool('avesd_activate_plugin', { draftId: draft.id, revision: draft.revision });
  return draft;
};
const navigationContent = {
  manifest: { apiVersion: 1, id: 'avesd.local.synthetic-navigation', version: '0.1.0', displayName: 'Synthetic navigation',
    widgetTypeId: 'navigation', size: { width: 10, height: 8 }, capabilities: ['catalog', 'navigation', 'management'] },
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
  tests: [{ type: 'expectText', selector: 'output', text: '1 dashboards' }, { type: 'click', selector: 'button' }, { type: 'expectText', selector: 'output', text: '2 dashboards' }],
};
const addNavigator = async () => {
  await tool('avesd_add_widget', { pluginId: navigationContent.manifest.id, widgetTypeId: 'navigation' });
  return navigatorId();
};
try {
  await launch();
  const firstScope = (await snapshot()).selection;
  await tool('avesd_manage_workspace', { type: 'rename', ...firstScope, name: 'Overview' });
  assert.deepEqual((await snapshot()).selection, firstScope);
  await page.getByRole('button', { name: 'Configure dashboard', exact: true }).click();
  await page.getByRole('button', { name: 'Shared', exact: true }).click();
  await page.getByRole('button', { name: 'Here', exact: true }).click();
  await page.locator('.layout-editor-list article').filter({ has: page.getByText('Counter', { exact: true }) }).getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByLabel('Bind Counter Count', { exact: true }).selectOption({ label: 'Local counter · shared' });
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Increment', exact: true }).click();
  await expect(page.getByText('1', { exact: true })).toBeVisible();
  const sdk = await tool('avesd_get_widget_sdk');
  const counter = await install(sdk.example);
  await tool('avesd_add_widget', { pluginId: counter.manifest.id, widgetTypeId: counter.manifest.widgetTypeId });
  await expect.poll(nativeIds).toHaveLength(1);
  const unprivileged = (await nativeIds())[0];
  await expect.poll(() => nativeEval(unprivileged, '!!window.__avesdWidget').catch(() => false)).toBe(true);
  assert.equal(await nativeEval(unprivileged, "window.avesdWidget.catalog.listWorkspaces().then(() => false, () => true)"), true);
  assert.equal(await nativeEval(unprivileged, "typeof require === 'undefined' && typeof process === 'undefined' && typeof window.avesd === 'undefined'"), true);
  await tool('avesd_add_widget', { pluginId: 'avesd.builtin.web', widgetTypeId: 'page' });
  await install(navigationContent);
  await addNavigator();
  const listed = await invoke('window.__syntheticWorkspace.catalog.listDashboards(window.__syntheticWorkspace.workspaceId)');
  assert.deepEqual(listed, [{ workspaceId: firstScope.workspaceId, id: firstScope.dashboardId, name: 'Overview' }]);
  const oldNativeIds = await nativeIds();
  const oldGateway = await gateway();
  await invoke("document.querySelector('#widget').shadowRoot.querySelector('button').click()");
  await expect.poll(async () => (await snapshot()).dashboards.length).toBe(2);
  const focusScope = (await snapshot()).selection;
  assert.notEqual(focusScope.dashboardId, firstScope.dashboardId);
  await expect.poll(() => app.evaluate(({ webContents }, ids) => ids.some(id => webContents.fromId(id)), oldNativeIds)).toBe(false);
  assert.equal((await request(oldGateway, 'avesd_inspect_dashboard')).status, 403);
  assert.equal((await tool('avesd_inspect_dashboard')).layout.dashboardId, focusScope.dashboardId);
  assert.equal(await page.evaluate(async oldWidgetId => {
    try { await window.avesd.web.command({ type: 'create', widgetId: oldWidgetId }); return false; } catch { return true; }
  }, (await snapshot()).widgets.find(item => item.widgetTypeId === 'page').id), true);
  await page.getByRole('button', { name: 'Configure dashboard', exact: true }).click();
  await page.locator('.layout-editor-list article').filter({ has: page.getByText('Counter', { exact: true }) }).getByRole('button', { name: 'Add', exact: true }).click();
  const binding = page.getByLabel('Bind Counter Count', { exact: true });
  await expect(binding.locator('option')).toHaveCount(2);
  await binding.selectOption({ label: 'Local counter · shared' });
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByText('1', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Increment', exact: true }).click();
  await addNavigator();
  await select(firstScope);
  await expect(page.getByText('2', { exact: true })).toBeVisible();
  await expect.poll(nativeIds).toHaveLength(3);
  assert.ok((await nativeIds()).every(id => !oldNativeIds.includes(id)));
  await select(focusScope);
  await close();
  await launch();
  assert.deepEqual((await snapshot()).selection, focusScope);
  await expect(page.getByText('2', { exact: true })).toBeVisible();
  await invoke(`window.__syntheticWorkspace.management.execute({type:'delete',scope:${JSON.stringify(firstScope)}})`);
  await expect.poll(() => invoke("document.querySelector('#widget').shadowRoot.querySelector('output').textContent")).toBe('1 dashboards');
  const retained = await snapshot();
  assert.deepEqual(retained.selection, focusScope);
  assert.equal(retained.dataSources.length, 1);
  assert.equal(retained.dataSources[0].scope.kind, 'workspace');
  assert.ok(retained.widgets.every(widget => widget.dashboardId === focusScope.dashboardId));
  assert.equal(await invoke(`window.__syntheticWorkspace.management.execute({type:'delete',scope:${JSON.stringify(focusScope)}}).then(()=>false,()=>true)`), true);
  await invoke("window.__syntheticWorkspace.management.execute({type:'createWorkspace',name:'Synthetic studio'})").catch(() => {});
  await expect.poll(async () => (await snapshot()).workspaces.length).toBe(2);
  const studio = (await snapshot()).selection;
  await addNavigator();
  const otherDashboards = await invoke(`window.__syntheticWorkspace.catalog.listDashboards(${JSON.stringify(focusScope.workspaceId)})`);
  assert.deepEqual(otherDashboards.map(item => Object.keys(item).sort()), [['id', 'name', 'workspaceId']]);
  assert.deepEqual((await snapshot()).selection, studio, 'querying another workspace must not select it');
  assert.deepEqual(await invoke('window.__syntheticWorkspace.navigation.getCurrent()'), studio);
  await invoke(`window.__syntheticWorkspace.management.execute({type:'renameWorkspace',workspaceId:${JSON.stringify(studio.workspaceId)},name:'Studio renamed'})`);
  assert.equal((await invoke('window.__syntheticWorkspace.catalog.listWorkspaces()')).find(item => item.id === studio.workspaceId).name, 'Studio renamed');
  await invoke(`window.__syntheticWorkspace.management.execute({type:'deleteWorkspace',workspaceId:${JSON.stringify(studio.workspaceId)}})`).catch(() => {});
  await expect.poll(async () => (await snapshot()).selection).toEqual(focusScope);
  assert.equal(await invoke(`window.__syntheticWorkspace.management.execute({type:'deleteWorkspace',workspaceId:${JSON.stringify(focusScope.workspaceId)}}).then(()=>false,()=>true)`), true);
  const final = await snapshot();
  assert.deepEqual(final, retained);
  assert.deepEqual(JSON.parse(await readFile(join(directory, 'data/workspace-v1.json'), 'utf8')), final);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, checks: ['no fixed navigation UI', 'real widget service bridge', 'isolated preview data', 'undeclared capability denied', 'metadata-only cross-workspace queries', 'subscription refresh', 'shared/private data', 'native teardown', 'old credentials revoked', 'active agent scope', 'restart selection', 'atomic dashboard/workspace deletion', 'last scope protected'] }));
} finally {
  await close();
  await rm(directory, { recursive: true, force: true });
}
