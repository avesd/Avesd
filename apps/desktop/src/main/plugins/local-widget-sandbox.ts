/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Local Widget Sandbox
 */

import type { LocalPluginDraft, PluginTestReport, WidgetTestStep } from "../../shared/plugins/local-plugins";
import { widgetWorkspaceChannels } from "../../shared/workspace/widget-workspace";
import { PluginStorage } from "../storage/plugin-storage";
import { resourceDirectoryFile, SharedResources } from "../storage/shared-resources";
import type { WidgetWorkspaceBridge } from "../workspace/widget-workspace-bridge";
import type { DashboardId, WidgetInstanceId, WorkspaceId, WorkspaceSnapshot } from "@avesd/workspace-model";
import { navigateWorkspace, readWorkspaceCatalog } from "@avesd/workspace-model";
import type { WebContents, WebPreferences } from "electron";
import { BrowserWindow, session } from "electron";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function localWidgetPreferences(): WebPreferences {

    const isolatedSession = session.fromPartition(`avesd-local-widget-${randomUUID()}`);
    isolatedSession.setPermissionRequestHandler((_contents, _permission, callback) => {

        return void callback(false);
    });
    isolatedSession.setPermissionCheckHandler(() => {

        return false;
    });
    isolatedSession.setDevicePermissionHandler(() => {

        return false;
    });
    isolatedSession.on("will-download", (event) => {

        return void event.preventDefault();
    });
    isolatedSession.webRequest.onBeforeRequest((details, callback) =>
    {

        return void callback({ cancel: !details.url.startsWith("data:") && !details.url.startsWith("blob:") });
    });

    return {
        preload: join(__dirname, "../preload/local-widget.cjs"),
        session: isolatedSession,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        nodeIntegrationInSubFrames: false,
        webSecurity: true,
        allowRunningInsecureContent: false,
        navigateOnDragDrop: false,
        safeDialogs: true,
        disableDialogs: true,
        webviewTag: false,
    };
}

const literal = (input: unknown) => {

    return JSON.stringify(input).replaceAll("<", "\\u003c");
};

export async function loadLocalWidget(contents: WebContents, draft: LocalPluginDraft): Promise<void> {

    contents.setWindowOpenHandler(() => {

        return { action: "deny" };
    });
    contents.on("will-navigate", (event) => {

        return void event.preventDefault();
    });
    contents.on("will-frame-navigate", (event) => {

        return void event.preventDefault();
    });
    contents.on("will-redirect", (event) => {

        return void event.preventDefault();
    });
    const nonce = randomUUID().replaceAll("-", "");
    const html = `<!doctype html><html><head><meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}' blob:; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
    <title>Local widget</title><style>html,body,#widget { margin:0; width:100%; height:100%; overflow:hidden; } body { background:#fafaf6; }</style>
    </head><body><div id="widget"></div><script nonce="${nonce}">
    window.__avesdReady = (async () => {
      const errors = [];
      addEventListener('error', () => errors.push('Uncaught widget error.'));
      addEventListener('unhandledrejection', () => errors.push('Unhandled widget promise rejection.'));
      addEventListener('securitypolicyviolation', () => errors.push('Widget attempted a blocked capability.'));
      const root = document.querySelector('#widget').attachShadow({mode:'open'});
      const signal = new AbortController();
      const url = URL.createObjectURL(new Blob([${literal(draft.source)}], {type:'text/javascript'}));
      try {
        const module = await import(url);
        if (typeof module.mount !== 'function') throw new Error('Export a mount function.');
        const identity = await window.avesdWidget.initialize();
        const context = {signal:signal.signal, instanceId:identity.instanceId, workspaceId:identity.workspaceId, dashboardId:identity.dashboardId};
        for (const capability of identity.capabilities) {
          const service = window.avesdWidget[capability];
          context[capability] = Object.freeze({...service, ...(service.subscribe ? {subscribe(listener) {
            if (signal.signal.aborted) return () => {};
            const dispose = service.subscribe(() => { if (!signal.signal.aborted) listener(); });
            const cleanup = () => { dispose(); signal.signal.removeEventListener('abort', cleanup); };
            signal.signal.addEventListener('abort', cleanup, {once:true});
            return cleanup;
          }} : {})});
        }
        if (${literal(!!draft.manifest.browser)}) context.browser = Object.freeze({...window.avesdWidget.browser});
        const controller = module.mount(root, Object.freeze(context));
        if (!controller || typeof controller.update !== 'function' || typeof controller.dispose !== 'function') {
          throw new Error('mount must return update and dispose methods.');
        }
        const state = {configuration:{},size:${literal(draft.manifest.size)}};
        controller.update(state);
        Object.defineProperty(window, '__avesdWidget', { value: Object.freeze({
          errors, update: () => controller.update(state),
          dispose: () => { signal.abort(); controller.dispose(); root.replaceChildren(); }
        }) });
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return true;
      } finally { URL.revokeObjectURL(url); }
    })();
    window.__avesdReady.catch(() => {});
    </script></body></html>`;
    await contents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await contents.executeJavaScript("window.__avesdReady");
}

export async function bounded<T>(work: Promise<T>, milliseconds: number, timeout: () => void = () => {
}): Promise<T> {

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            work,
            new Promise<never>((_resolve, reject) => {

                timer = setTimeout(() => {

                    timeout(); reject(new Error("Widget operation timed out."));
                }, milliseconds);
            }),
        ]);
    } finally { clearTimeout(timer); }
}

export class LocalWidgetRunner {
    readonly #windows = new Set<BrowserWindow>();
    #preview?: BrowserWindow;
    constructor(private readonly bridge: WidgetWorkspaceBridge) {}

    async preview(draft: LocalPluginDraft): Promise<string> {

        if (this.#preview && !this.#preview.isDestroyed()) {
            this.#preview.destroy();
        }
        const window = this.#create(draft);
        this.#preview = window;
        try {
            await bounded(loadLocalWidget(window.webContents, draft), 5000, () => {

                return void window.destroy();
            });
            window.show();

            return (await window.webContents.capturePage()).toPNG().toString("base64");
        } catch (error) {
            if (!window.isDestroyed()) {
                window.destroy();
            }
            throw new Error("Widget preview failed; run tests for diagnostics.", { cause: error });
        }
    }

    async test(draft: LocalPluginDraft): Promise<{
        report: PluginTestReport;
        image?: string;
    }> {

        const window = this.#create(draft);
        const checks: {
            name: string;
            passed: boolean;
            message?: string;
        }[] = [];
        let image: string | undefined;
        const run = async () => {

            await loadLocalWidget(window.webContents, draft);
            checks.push({
                name: "Module, mount, and initial update",
                passed: true,
            });
            const isolation = await window.webContents.executeJavaScript("typeof require === 'undefined' && typeof process === 'undefined' && typeof window.avesd === 'undefined' && location.origin === 'null'") as boolean;
            if (!isolation) {
                throw new Error("Widget environment isolation check failed.");
            }
            checks.push({
                name: "No Node or host API",
                passed: true,
            });
            const rendered = await this.#evaluate(
                window.webContents,
                "const root = document.querySelector('#widget')?.shadowRoot; return !!root?.textContent?.trim() && root.children.length > 0;",
            );
            if (!rendered) {
                throw new Error("Widget rendered no content.");
            }
            checks.push({
                name: "Rendered content",
                passed: true,
            });
            for (const [
                index,
                step,
            ] of draft.tests.entries()) {
                await this.#step(window.webContents, step);
                checks.push({
                    name: `Interaction ${index + 1}: ${step.type}`,
                    passed: true,
                });
            }
            image = (await window.webContents.capturePage()).toPNG().toString("base64");
            await window.webContents.executeJavaScript("window.__avesdWidget.update()");
            const errors = await window.webContents.executeJavaScript("window.__avesdWidget.errors.length") as number;
            if (errors) {
                throw new Error("Widget raised a runtime error or attempted a blocked capability.");
            }
            checks.push({
                name: "Update without runtime errors",
                passed: true,
            });
            await window.webContents.executeJavaScript("window.__avesdWidget.dispose()");
            checks.push({
                name: "Abort and dispose",
                passed: true,
            });
        };
        try {
            await bounded(run(), 10_000, () => {

                return void window.destroy();
            });
        }
        catch (error) {
            checks.push({
                name: "Widget execution",
                passed: false,
                message: error instanceof Error ? error.message.slice(0, 1024) : "Widget execution failed.",
            });
        } finally {
            if (!window.isDestroyed()) {
                window.destroy();
            }
        }

        return {
            report: {
                draftId: draft.id,
                revision: draft.revision,
                passed: checks.every((check) => {

                    return check.passed;
                }),
                checks,
            },
            image,
        };
    }

    #create(draft: LocalPluginDraft): BrowserWindow {

        const window = new BrowserWindow({
            show: false,
            width: draft.manifest.size.width * 40,
            height: draft.manifest.size.height * 24,
            useContentSize: true,
            title: `${draft.manifest.displayName} · Preview`,
            webPreferences: {
                ...localWidgetPreferences(),
                backgroundThrottling: false,
            },
        });
        const workspaceId = "preview-workspace" as WorkspaceId;
        const dashboardId = "preview-dashboard" as DashboardId;
        let snapshot: WorkspaceSnapshot = {
            version: 1,
            selection: {
                workspaceId,
                dashboardId,
            },
            workspaces: [
                {
                    id: workspaceId,
                    name: "Preview workspace",
                },
            ],
            dashboards: [
                {
                    id: dashboardId,
                    workspaceId,
                    name: "Preview dashboard",
                    viewState: {},
                    layoutRevision: 0,
                },
            ],
            widgets: [],
            dataSources: [],
        };
        let queue: Promise<unknown> = Promise.resolve();
        const storageDirectory = mkdtemp(join(tmpdir(), "avesd-preview-storage-"));
        const storage = storageDirectory.then(path => {

            return new PluginStorage(path);
        });
        const resources = storageDirectory.then(async path => {

            return new SharedResources(resourceDirectoryFile(join(path, "shared-resources-v1.json")), await storage, () => {

                if (!window.isDestroyed()) {
                    window.webContents.send(widgetWorkspaceChannels.changed);
                }
            });
        });
        window.once("closed", () => {

            void queue.finally(async () => {

                await rm(await storageDirectory, {
                    recursive: true,
                    force: true,
                });
            }).catch(() => {
            });
        });
        const disposeServices = this.bridge.register(window.webContents, {
            identity: {
                workspaceId,
                dashboardId,
                instanceId: "preview-widget" as WidgetInstanceId,
                capabilities: draft.manifest.capabilities ?? [],
            },
            invoke: (request, isActive) => {

                const work = queue.then(async () => {

                    if (!isActive()) {
                        throw new Error("Preview is closed.");
                    }
                    if (request.type === "resources") {
                        if (request.operation === "publish" && !draft.manifest.capabilities?.includes(request.publication.kind === "file" ? "files" : "sqlite")) {
                            throw new Error("Publishing requires the private storage capability.");
                        }

                        return (await resources).invoke({
                            workspaceId,
                            pluginId: draft.manifest.id,
                        }, request, isActive);
                    }
                    if (request.type === "files" || request.type === "sqlite") {
                        return (await storage).invoke({
                            workspaceId,
                            pluginId: draft.manifest.id,
                        }, request, isActive);
                    }
                    if (request.type !== "command") {
                        return readWorkspaceCatalog(snapshot, request);
                    }
                    const updated = await navigateWorkspace(snapshot, request.command, randomUUID);
                    if (!isActive()) {
                        throw new Error("Preview is closed.");
                    }
                    snapshot = updated.snapshot;
                    window.webContents.send(widgetWorkspaceChannels.changed);
                });
                queue = work.catch(() => {

                    return undefined;
                });

                return work;
            },
        });
        window.once("closed", disposeServices);
        window.setMenu(null);
        this.#windows.add(window);
        window.on("closed", () => {

            this.#windows.delete(window);
        });

        return window;
    }

    async #evaluate(contents: WebContents, body: string): Promise<unknown> {

        return contents.executeJavaScriptInIsolatedWorld(1001, [{ code: `(() => { ${body} })()` }]);
    }

    async #step(contents: WebContents, step: WidgetTestStep): Promise<void> {

        const query = `const root = document.querySelector('#widget')?.shadowRoot;
      const matches = root?.querySelectorAll(${literal(step.selector)});
      if (matches?.length !== 1) throw new Error('Test selector must match exactly one element.');
      const element = matches[0];`;
        if (step.type === "click") {
            await this.#evaluate(contents, `${query} if (!(element instanceof HTMLElement)) throw new Error('Element is not clickable.'); element.click();`);
        } else if (step.type === "fill") {
            await this.#evaluate(contents, `${query} if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) throw new Error('Element is not an input.');
        element.value = ${literal(step.value)}; element.dispatchEvent(new Event('input', {bubbles:true})); element.dispatchEvent(new Event('change', {bubbles:true}));`);
        } else {
            const deadline = Date.now() + 1000;
            while (true) {
                const matches = await this.#evaluate(contents, `${query} return element.textContent.trim() === ${literal(step.text)};`);
                if (matches) {
                    return;
                }
                if (Date.now() >= deadline) {
                    throw new Error(`Text assertion failed for ${step.selector}.`);
                }
                await new Promise((resolve) => {

                    return setTimeout(resolve, 25);
                });
            }
        }
    }

    dispose(): void {

        for (const window of this.#windows) {
            if (!window.isDestroyed()) {
                window.destroy();
            }
        }
    }
}
