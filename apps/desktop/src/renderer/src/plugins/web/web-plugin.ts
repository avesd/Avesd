/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Web Plugin
 */

import { parseBrowserSession } from "../../../../shared/browser/plugin-browser";
import type { WebSurfaceApi, WebSurfaceState } from "../../../../shared/browser/web-surface";
import { WEB_PLUGIN_ID, WEB_RESULT_TYPE } from "../../../../shared/browser/web-surface";
import { WEB_VIEW_RADIUS } from "../../../../shared/widget-appearance";
import type { WebResults } from "../../workbench/web-results";
import type { PluginDefinition } from "@avesd/plugin-api";
import type { WidgetContribution } from "@avesd/plugin-ui";
import { dashboardWidgetContribution } from "@avesd/plugin-ui";
import type { JsonObject } from "@avesd/workspace-model";

const styles = `
  :host { display:block; height:100%; color:#253026; font:12px system-ui; }
  * { box-sizing:border-box; }
  section { height:100%; display:flex; flex-direction:column; overflow:hidden;
    background:#f6f8f2; }
  header, .actions { display:flex; align-items:center; gap:6px; padding:8px; flex-wrap:wrap; flex-shrink:0; }
  input { flex:1; min-width:100px; }
  input, select, textarea, button { font:inherit; padding:6px; border:1px solid #bbc5b6;
    border-radius:5px; background:white; color:inherit; }
  button { cursor:pointer; } button:disabled { opacity:.5; cursor:default; }
  .viewport { flex:1; min-height:0; display:grid; place-content:center; padding:0; margin:0 8px 8px; border-radius:${WEB_VIEW_RADIUS}px; overflow:hidden;
    background:#e9eee5; color:#697460; text-align:center; }
  .tools { padding:8px; overflow:auto; flex:1; min-height:0; }
  textarea { width:100%; height:96px; font:12px ui-monospace,monospace; resize:vertical; }
  label { display:block; margin:8px 0; } label input { min-width:0; }
  p { margin:6px 0; } .status { flex-shrink:0; padding:0 8px 6px; overflow-wrap:anywhere; }
  pre { flex:1; min-height:0; white-space:pre-wrap; overflow-wrap:anywhere; overflow:auto; margin:0; padding:12px; }
  [hidden] { display:none !important; }
`;

export function createWebPlugin(api: WebSurfaceApi, results: WebResults): PluginDefinition {

    const page: WidgetContribution = {
        widgetTypeId: "page",
        displayName: "Web page",
        description: "Embedded browser with temporary JS/CSS tools and a local-only result output.",
        configuration: {
            default: {},
            version: 1,
        },
        sizing: {
            default: {
                width: 12,
                height: 20,
            },
        },
        mount(root, context) {

            const style = document.createElement("style"); style.textContent = styles;
            const section = document.createElement("section");
            section.innerHTML = `<header><input aria-label="Website URL" placeholder="https://example.com" />
        <button type="button" class="go">Go</button><button type="button" class="reload">Reload</button>
        <button type="button" class="toggle" aria-expanded="false">Tools</button>
        <button type="button" class="background">Hide page</button><button type="button" class="login">Open login window</button></header>
        <p class="status" role="status">Starting browser session…</p>
        <div class="viewport">Enter a URL to browse. Pages pause visually during layout editing or overlays.</div>
        <div class="tools" hidden>
          <label>Session name <input class="session-name" aria-label="Session name" value="default" maxlength="64" /></label>
          <label><input type="checkbox" class="session-shared" /> Share this session within this workspace</label>
          <button type="button" class="apply-session">Apply session</button>
          <p>Sessions retain website login on this device. Shared sessions require approval. Applying a session reloads this page.</p><p>Scripts can read and change this website using its current login. Run only code you trust.</p>
          <label>Mode <select aria-label="Script mode"><option value="isolated">JavaScript · isolated world</option>
          <option value="page">JavaScript · page world</option><option value="css">CSS</option></select></label>
          <textarea aria-label="Script" spellcheck="false"></textarea>
          <label><input type="checkbox" class="consent" /> Allow this script on <strong class="origin">this page</strong></label>
          <div class="actions"><button type="button" class="run">Run</button>
          <button type="button" class="clear">Clear result</button></div>
          <p>JSON results are shared only with bound widgets in this dashboard. Scripts, URLs and results are not saved; website login is retained locally. Reload resets page changes.</p>
        </div>`;
            root.append(style, section);
            const url = section.querySelector<HTMLInputElement>("input")!;
            const viewport = section.querySelector<HTMLElement>(".viewport")!;
            const status = section.querySelector<HTMLElement>(".status")!;
            const tools = section.querySelector<HTMLElement>(".tools")!;
            const toggle = section.querySelector<HTMLButtonElement>(".toggle")!;
            const run = section.querySelector<HTMLButtonElement>(".run")!;
            const code = section.querySelector<HTMLTextAreaElement>("textarea")!;
            const mode = section.querySelector<HTMLSelectElement>("select")!;
            const consent = section.querySelector<HTMLInputElement>(".consent")!;
            const origin = section.querySelector<HTMLElement>(".origin")!;
            code.value = "({ title: document.title, heading: document.querySelector('h1')?.textContent ?? null })";
            let state: WebSurfaceState | undefined;
            let configuration: JsonObject = {};
            let background = false;
            const backgroundButton = section.querySelector<HTMLButtonElement>(".background")!;
            const sessionName = section.querySelector<HTMLInputElement>(".session-name")!;
            const sessionShared = section.querySelector<HTMLInputElement>(".session-shared")!;
            let disposed = false;
            let frame = 0;
            let lastBounds = "";
            let running = false;
            let refreshVersion = 0;
            const show = (next: WebSurfaceState) => {

                if (disposed) {
                    return;
                }
                if (state?.document !== next.document) {
                    consent.checked = false;
                }
                state = next;
                status.textContent = `${next.status === "ready" ? "Ready" : next.status} · ${next.sharedSession ? "Shared" : "Private"} persistent session: ${next.sessionName ?? "default"}`;
                origin.textContent = next.url && next.url !== "about:blank" ? new URL(next.url).origin : "this page";
                run.disabled = running || next.status !== "ready" || !consent.checked;
            };
            const syncBounds = () => {

                frame = 0;
                if (!state || disposed) {
                    return;
                }
                const rect = viewport.getBoundingClientRect();
                const blocked = !!document.querySelector(".dashboard-shell.is-editing, .agent-panel");
                const fits = rect.top >= 0 && rect.left >= 0 && rect.bottom <= window.innerHeight
          && rect.right <= window.innerWidth;
                const visible = !background && tools.hidden && !blocked && fits && state.status !== "empty";
                viewport.textContent = background ? "Browser runs in the background. Show the page or open its login window to interact." : blocked ? "Browser hidden while layout or agent controls are open."
                    : !fits ? "Scroll this widget fully into view to use the browser." : "Enter a URL to browse.";
                const bounds = {
                    x: rect.x,
                    y: rect.y,
                    width: rect.width,
                    height: rect.height,
                    visible,
                };
                const key = JSON.stringify(bounds);
                if (key === lastBounds) {
                    return;
                }
                lastBounds = key;
                void api.command({
                    type: "bounds",
                    id: state.id,
                    bounds,
                }).catch(() => {

                    return undefined;
                });
            };
            const scheduleBounds = () => {

                if (!frame && !disposed) {
                    frame = requestAnimationFrame(syncBounds);
                }
            };
            const refresh = async () => {

                if (!state) {
                    return;
                }
                const version = ++refreshVersion;
                try {
                    const next = await api.command({
                        type: "inspect",
                        id: state.id,
                    });
                    if (version === refreshVersion) {
                        show(next); lastBounds = ""; scheduleBounds();
                    }
                } catch { /* The instance may have been removed. */ }
            };
            const navigate = async (target: string) => {

                if (!state) {
                    return;
                }
                consent.checked = false;
                try {
                    show(await api.command({
                        type: "navigate",
                        id: state.id,
                        url: target,
                    })); scheduleBounds();
                }
                catch { status.textContent = "Use HTTPS, or HTTP on localhost, without URL credentials."; }
            };
            section.querySelector(".go")!.addEventListener("click", () => {

                return void navigate(url.value);
            });
            url.addEventListener("keydown", (event) => {

                if (event.key === "Enter") {
                    void navigate(url.value);
                }
            });
            section.querySelector(".reload")!.addEventListener("click", () => {

                return void navigate(state?.url || url.value);
            });
            toggle.addEventListener("click", () => {

                tools.hidden = !tools.hidden; viewport.hidden = !tools.hidden;
                toggle.setAttribute("aria-expanded", String(!tools.hidden)); scheduleBounds();
            });
            backgroundButton.addEventListener("click", () => {

                background = !background;
                backgroundButton.textContent = background ? "Show page" : "Hide page";
                scheduleBounds();
            });
            section.querySelector(".login")!.addEventListener("click", () => {

                if (state) {
                    void api.command({
                        type: "show",
                        id: state.id,
                    }).catch(() => {

                        status.textContent = "Login window unavailable.";
                    });
                }
            });
            section.querySelector<HTMLButtonElement>(".apply-session")!.addEventListener("click", () => {

                void (async () => {

                    const button = section.querySelector<HTMLButtonElement>(".apply-session")!;
                    button.disabled = true;
                    try {
                        const browserSession = parseBrowserSession({
                            name: sessionName.value,
                            shared: sessionShared.checked,
                        });
                        await context.configuration.update({
                            ...configuration,
                            browserSession: { ...browserSession },
                        });
                        const target = state?.url;
                        const next = await api.command({
                            type: "create",
                            widgetId: context.instanceId,
                        });
                        if (disposed) {
                            await api.command({
                                type: "destroy",
                                id: next.id,
                            });

                            return;
                        }
                        if (state) {
                            results.detach(context.instanceId, state.id);
                        }
                        show(next); results.attach(context.instanceId, next.id); lastBounds = "";
                        if (target) {
                            await navigate(target);
                        }
                        scheduleBounds();
                    } catch (error) { status.textContent = error instanceof Error ? error.message : "Session could not be changed."; }
                    finally { button.disabled = false; }
                })();
            });
            consent.addEventListener("change", () => {

                if (state) {
                    show(state);
                }
            });
            const revoke = () => {

                consent.checked = false; if (state) {
                    show(state);
                }
            };
            code.addEventListener("input", revoke); mode.addEventListener("change", revoke);
            run.addEventListener("click", () => {

                if (!state || !consent.checked || running) {
                    return;
                }
                running = true; run.disabled = true;
                const target = state;
                void api.command({
                    type: "run",
                    id: target.id,
                    document: target.document,
                    origin: new URL(target.url).origin,
                    code: code.value,
                    mode: mode.value as "isolated" | "page" | "css",
                })
                    .then((next) => {

                        show(next); status.textContent = "Completed · temporary result available to bound widgets";
                    })
                    .catch(() => {

                        status.textContent = "Script failed or page changed. Return JSON; reload if the script is stuck.";
                    })
                    .finally(() => {

                        running = false; consent.checked = false; run.disabled = true;
                    });
            });
            section.querySelector(".clear")!.addEventListener("click", () => {

                if (state) {
                    void api.command({
                        type: "clear",
                        id: state.id,
                    }).then(show);
                }
            });
            const resize = new ResizeObserver(scheduleBounds); resize.observe(viewport);
            const mutation = new MutationObserver(scheduleBounds);
            mutation.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ["class"],
            });
            window.addEventListener("resize", scheduleBounds);
            window.addEventListener("scroll", scheduleBounds, true);
            const unsubscribe = api.subscribe(() => {

                return void refresh();
            });
            void api.command({
                type: "create",
                widgetId: context.instanceId,
            }).then((next) => {

                if (disposed) {
                    void api.command({
                        type: "destroy",
                        id: next.id,
                    }).catch(() => {

                        return undefined;
                    });

                    return;
                }
                show(next); results.attach(context.instanceId, next.id); scheduleBounds();
            })
                .catch(() => {

                    if (!disposed) {
                        status.textContent = "Browser unavailable. Remove and re-add the widget to retry.";
                    }
                });

            return {
                update(next) {

                    configuration = next.configuration;
                    const stored = configuration.browserSession;
                    if (stored) {
                        try { const selected = parseBrowserSession(stored); sessionName.value = selected.name; sessionShared.checked = selected.shared; } catch { /* Host validates before opening. */ }
                    }
                    scheduleBounds();
                },
                dispose() {

                    disposed = true; cancelAnimationFrame(frame); resize.disconnect(); mutation.disconnect(); unsubscribe();
                    window.removeEventListener("resize", scheduleBounds);
                    window.removeEventListener("scroll", scheduleBounds, true);
                    if (state) {
                        results.detach(context.instanceId, state.id);
                        void api.command({
                            type: "destroy",
                            id: state.id,
                        }).catch(() => {

                            return undefined;
                        });
                    }
                    root.replaceChildren();
                },
            };
        },
    };
    const result: WidgetContribution = {
        widgetTypeId: "result",
        displayName: "Web result",
        description: "Displays a bound temporary web output. Never saved or sent to the agent.",
        configuration: {
            default: {},
            version: 1,
        },
        inputs: [
            {
                id: "result",
                displayName: "Web output",
                dataType: WEB_RESULT_TYPE,
            },
        ],
        sizing: {
            default: {
                width: 12,
                height: 10,
            },
        },
        mount(root, context) {

            const style = document.createElement("style"); style.textContent = styles;
            const section = document.createElement("section");
            const header = document.createElement("header"); header.textContent = "Web result · temporary / local only";
            const output = document.createElement("pre"); section.append(header, output); root.append(style, section);
            let version = 0;
            const refresh = async () => {

                const current = ++version;
                try {
                    const [value] = await context.data.read("result");
                    if (current === version) {
                        output.textContent = value === null || value === undefined
                            ? "No web output yet. Run a script in the connected Web page widget."
                            : JSON.stringify(value, null, 2);
                    }
                } catch {
                    if (current === version) {
                        output.textContent = "Web output unavailable. The connected source may no longer exist.";
                    }
                }
            };
            const unsubscribe = context.data.subscribe("result", () => {

                return void refresh();
            });

            return {
                update() {

                    void refresh();
                },
                dispose() {

                    ++version; void unsubscribe(); root.replaceChildren();
                },
            };
        },
    };
    const controls: WidgetContribution = {
        widgetTypeId: "controls",
        displayName: "Browser controls",
        description: "Read, navigate, or click a browser explicitly bound by the dashboard host.",
        configuration: {
            default: {},
            version: 1,
        },
        sizing: {
            default: {
                width: 12,
                height: 14,
            },
        },
        mount(root, context) {

            const style = document.createElement("style"); style.textContent = styles;
            const section = document.createElement("section");
            section.innerHTML = `<header><strong>Browser controls</strong></header>
        <div class="tools"><p>Browser actions require an existing host-authorized target and permissions.</p>
        <label>Destination URL <input class="destination" aria-label="Control destination URL" placeholder="https://example.com" /></label>
        <button class="navigate" type="button">Navigate</button>
        <label>CSS selector <input class="selector" aria-label="Control CSS selector" value="h1" /></label>
        <div class="actions"><button class="read" type="button">Read text</button>
        <button class="click" type="button">Click element</button></div>
        <p>Actions use the bound browser's current page. Click sends a DOM click; some sites require native input.</p>
        <p class="status" role="status">Not run</p><pre></pre></div>`;
            root.append(style, section);
            const status = section.querySelector<HTMLElement>(".status")!;
            const output = section.querySelector("pre")!;
            const selector = section.querySelector<HTMLInputElement>(".selector")!;
            const destination = section.querySelector<HTMLInputElement>(".destination")!;
            let disposed = false;
            let busy = false;
            const act = (action: "extract" | "navigate" | "click") => {

                if (!context.browser || busy) {
                    return;
                }
                busy = true; status.textContent = "Working…";
                section.querySelectorAll("button").forEach((button) => {

                    button.disabled = true;
                });
                const operation = action === "extract" ? context.browser.extract("browser", { text: selector.value })
                    : action === "navigate" ? context.browser.navigate("browser", destination.value)
                        : context.browser.click("browser", selector.value);
                void operation.then((value) => {

                    if (disposed) {
                        return;
                    }
                    output.textContent = value ? JSON.stringify(value, null, 2) : "";
                    status.textContent = "Completed";
                }).catch(() => {

                    if (disposed) {
                        return;
                    }
                    output.textContent = "";
                    status.textContent = "Action denied or failed. Check the binding, allowed website, selector, and current page.";
                })
                    .finally(() => {

                        busy = false;
                        if (!disposed) {
                            section.querySelectorAll("button").forEach((button) => {

                                button.disabled = false;
                            });
                        }
                    });
            };
            section.querySelector(".read")!.addEventListener("click", () => {

                return void act("extract");
            });
            section.querySelector(".navigate")!.addEventListener("click", () => {

                return void act("navigate");
            });
            section.querySelector(".click")!.addEventListener("click", () => {

                return void act("click");
            });

            return {
                update() {},
                dispose() {

                    disposed = true; root.replaceChildren();
                },
            };
        },
    };

    return {
        id: WEB_PLUGIN_ID,
        apiVersion: 1,
        version: "0.1.0",
        activate(context) {

            context.effect(() => {

                return context.contributions.contribute(dashboardWidgetContribution, page);
            });
            context.effect(() => {

                return context.contributions.contribute(dashboardWidgetContribution, result);
            });
            context.effect(() => {

                return context.contributions.contribute(dashboardWidgetContribution, controls);
            });
        },
    };
}
