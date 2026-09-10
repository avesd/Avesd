/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Desktop Application
 */

import { agentProvidersChannels } from "../shared/agent/providers";
import { agentSessionsChannels, parseAgentTier } from "../shared/agent/sessions";
import { browserControlsChannel, parseBrowserControls } from "../shared/browser/browser-controls";
import { parseWebCommand, settleWebSurfaceCommand, webSurfaceChannel, webSurfaceEventChannel } from "../shared/browser/web-surface";
import type { AgentWorkbenchContext } from "../shared/desktop-api";
import { agentIpcChannels,
    parseAgentPrompt,
    workspaceIpcChannels } from "../shared/desktop-api";
import { parseLocalWidgetCommand } from "../shared/plugins/local-plugins";
import { localPluginsChannels } from "../shared/plugins/local-plugins";
import { workbenchPreferencesChannels } from "../shared/workbench/preferences";
import { parseWidgetWorkspaceRequest, widgetWorkspaceChannels } from "../shared/workspace/widget-workspace";
import { parseWorkspaceNavigation, workspaceNavigationChannel } from "../shared/workspace/workspace-navigation";
import { AcpAgentHost } from "./agent/acp-agent-host";
import { openAgentGateway } from "./agent/agent-gateway";
import { AgentPreferences } from "./agent/agent-preferences";
import { AgentSessions } from "./agent/agent-sessions";
import { AgentTaskBridge } from "./agent/agent-task-bridge";
import { parseProviderId, providerDefinitions, ProviderInstallations } from "./agent/provider-installations";
import { createAgentProviders } from "./agent/providers";
import { browserBindingFile } from "./browser/browser-binding-file";
import { BrowserBindings } from "./browser/browser-bindings";
import { BrowserTasks } from "./browser/browser-tasks";
import { PluginBrowserBridge } from "./browser/plugin-browser-bridge";
import { WebSurfaceManager } from "./browser/web-surface-manager";
import { LocalPluginStore } from "./plugins/local-plugin-store";
import { LocalWidgetRunner } from "./plugins/local-widget-sandbox";
import { LocalWidgetSurfaces } from "./plugins/local-widget-surfaces";
import { closePluginStorageProcesses, PluginStorage } from "./storage/plugin-storage";
import { resourceDirectoryFile, SharedResources } from "./storage/shared-resources";
import { loadStoragePaths } from "./storage/storage-paths";
import { WorkspaceFile } from "./storage/workspace-file";
import { WorkbenchPreferences } from "./workbench/preferences";
import { AgentWorkbench } from "./workspace/agent-workbench";
import { WidgetWorkspaceBridge } from "./workspace/widget-workspace-bridge";
import type { WidgetInstanceId } from "@avesd/workspace-model";
import type { WorkspaceSnapshot } from "@avesd/workspace-model";
import { sameDashboard } from "@avesd/workspace-model";
import type { IpcMainInvokeEvent } from "electron";
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { join } from "node:path";

export function startDesktop() {

    let providerInstallations: ProviderInstallations;
    let workbenchPreferences: WorkbenchPreferences;
    let agentPreferences = new AgentPreferences();
    let agentHost: AgentSessions | undefined;
    let mainWindow: BrowserWindow | undefined;
    let workspaceFile: WorkspaceFile | undefined;
    let workbench: AgentWorkbench | undefined;
    let gateway: Awaited<ReturnType<typeof openAgentGateway>> | undefined;
    let localWidgetSurfaces: LocalWidgetSurfaces | undefined;
    const widgetWorkspaceBridge = new WidgetWorkspaceBridge();
    const localWidgetRunner = new LocalWidgetRunner(widgetWorkspaceBridge);
    let webSurfaces: WebSurfaceManager | undefined;
    let browserTasks: BrowserTasks | undefined;
    let browserBindings: BrowserBindings | undefined;
    let agentRuntimeRoot: string | undefined;

    const isTrustedExternalUrl = (url: string): boolean => {

        try {
            const protocol = new URL(url).protocol;

            return protocol === "https:" || protocol === "http:";
        } catch {
            return false;
        }
    };

    const createMainWindow = (): BrowserWindow => {

        const window = new BrowserWindow({
            height: 760,
            minHeight: 560,
            minWidth: 760,
            show: false,
            title: "Avesd",
            webPreferences: {
                contextIsolation: true,
                nodeIntegration: false,
                preload: join(__dirname, "../preload/index.cjs"),
                sandbox: true,
            },
            width: 1120,
        });

        window.once("ready-to-show", () => {

            return void window.show();
        });

        window.webContents.setWindowOpenHandler(({ url }) => {

            if (isTrustedExternalUrl(url)) {
                void shell.openExternal(url);
            }

            return { action: "deny" };
        });

        window.webContents.on("will-navigate", (event) => {

            return void event.preventDefault();
        });

        browserTasks?.attach(new WebSurfaceManager(window, () => {

            return workspaceFile!.load();
        }, () => {

            if (!window.isDestroyed()) {
                window.webContents.send(browserTasksChanged);
            }
        }));
        resetWindowServices(window);
        window.on("close", () => {

            browserTasks?.detach(); webSurfaces?.dispose(); localWidgetSurfaces?.dispose();
        });
        window.webContents.on("render-process-gone", () => {

            browserTasks?.detach(); webSurfaces?.dispose(); localWidgetSurfaces?.dispose();
        });
        window.once("closed", () => {

            if (mainWindow === window) {

                mainWindow = undefined;
                localWidgetRunner.dispose();
            }
        });
        mainWindow = window;

        if (process.env.ELECTRON_RENDERER_URL) {
            void window.loadURL(process.env.ELECTRON_RENDERER_URL);
        } else {
            void window.loadFile(join(__dirname, "../renderer/index.html"));
        }

        return window;
    };

    const agentTaskBridge = new AgentTaskBridge(() => {

        return agentHost;
    }, () => {

        return workbench;
    });

    const pluginBrowserBridge = new PluginBrowserBridge(() => {

        return webSurfaces;
    }, () => {

        return workspaceFile!.load();
    }, () => {

        return workbench?.plugins;
    });

    const resetWindowServices = (window: BrowserWindow): void => {

        webSurfaces?.dispose();
        localWidgetSurfaces?.dispose();
        localWidgetRunner.dispose();
        if (!workbench) {
            throw new Error("Workspace storage is not ready");
        }
        webSurfaces = new WebSurfaceManager(window, () => {

            return workspaceFile!.load();
        }, () => {

            if (!window.isDestroyed()) {
                window.webContents.send(webSurfaceEventChannel);
            }
        });
        localWidgetSurfaces = new LocalWidgetSurfaces(window, workbench.plugins, () => {

            return workspaceFile!.load();
        }, widgetWorkspaceBridge, workbench, pluginBrowserBridge, agentTaskBridge);
        if (!agentRuntimeRoot) {
            throw new Error("Agent runtime storage is not ready");
        }
    };

    const hostForEvent = (event: IpcMainInvokeEvent): AgentSessions => {

        if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame || !agentHost) {
            throw new Error("Agent IPC request did not originate from the active window");
        }

        return agentHost;
    };

    ipcMain.handle(widgetWorkspaceChannels.renderer, (event, instanceId: unknown, input: unknown) => {

        hostForEvent(event);
        if (typeof instanceId !== "string" || !workbench) {
            throw new Error("Widget instance is required.");
        }

        return workbench.invokeWidget(instanceId as WidgetInstanceId, parseWidgetWorkspaceRequest(input));
    });

    ipcMain.handle(workspaceNavigationChannel, (event, input: unknown) => {

        hostForEvent(event);
        if (!workbench) {
            throw new Error("Workspace is unavailable.");
        }

        return workbench.navigate(parseWorkspaceNavigation(input));
    });

    ipcMain.handle(workbenchPreferencesChannels.sessionGet, event => {

        hostForEvent(event);

        return workbenchPreferences.sessionPosition;
    });
    ipcMain.handle(workbenchPreferencesChannels.sessionSet, (event, position: unknown) => {

        hostForEvent(event);

        return workbenchPreferences.setSessionPosition(position);
    });
    ipcMain.handle(workbenchPreferencesChannels.get, event => {

        hostForEvent(event);

        return workbenchPreferences.side;
    });
    ipcMain.handle(workbenchPreferencesChannels.set, (event, side: unknown) => {

        hostForEvent(event);

        return workbenchPreferences.setSide(side);
    });

    ipcMain.handle(agentProvidersChannels.list, async (event, refresh: unknown) => {

        hostForEvent(event);
        if (refresh === true) {
            await providerInstallations.refresh(); agentHost?.publishSettings();
        }

        return providerInstallations.list();
    });
    ipcMain.handle(agentProvidersChannels.configure, (event, id: unknown, configuration: unknown) => {

        const host = hostForEvent(event);

        return host.configureProvider(parseProviderId(id), () => {

            return providerInstallations.configure(id, configuration);
        });
    });
    ipcMain.handle(agentProvidersChannels.setup, (event, id: unknown) => {

        hostForEvent(event);
        const providerId = parseProviderId(id);

        return shell.openExternal(providerDefinitions.find(provider => {

            return provider.id === providerId;
        })!.setupUrl);
    });

    ipcMain.handle(agentSessionsChannels.command, async (event, input: unknown) => {

        const sessions = hostForEvent(event);
        if (!input || typeof input !== "object" || !("type" in input)) {
            throw new Error("Invalid session command.");
        }
        const request = input as Record<string, unknown>;
        if (request.type === "list") {
            return sessions.list();
        }
        if (request.type === "create") {
            return sessions.create(parseAgentTier(request.tier));
        }
        if (request.type === "routes") {
            return agentPreferences.routes;
        }
        if (request.type === "configure") {
            await agentPreferences.configureRoutes(request.routes);

            return;
        }
        if (typeof request.id !== "string" || request.id.length > 128) {
            throw new Error("Invalid session ID.");
        }
        switch (request.type) {
            case "read": return sessions.read(request.id);
            case "select": return void sessions.select(request.id);
            case "connect": return sessions.connect(request.id);
            case "prompt": return sessions.prompt(parseAgentPrompt(request.text), request.id);
            case "cancel": return sessions.cancel(request.id);
            case "remove": return sessions.remove(request.id);
            default: throw new Error("Unknown session command.");
        }
    });
    ipcMain.handle("widget-agent:renderer", (event, widgetId: unknown, input: unknown) => {

        hostForEvent(event);
        if (typeof widgetId !== "string" || widgetId.length > 128) {
            throw new Error("Invalid widget ID.");
        }

        return agentTaskBridge.invoke(widgetId, input);
    });
    ipcMain.handle(agentIpcChannels.settings, event => {

        return hostForEvent(event).getSettings();
    });
    ipcMain.handle(agentIpcChannels.provider, (event, id: unknown) => {

        if (typeof id !== "string" || id.length > 64) {
            throw new Error("Invalid provider.");
        }

        return hostForEvent(event).selectProvider(id);
    });
    ipcMain.handle(agentIpcChannels.model, (event, id: unknown) => {

        if (typeof id !== "string" || id.length > 512) {
            throw new Error("Invalid model.");
        }

        return hostForEvent(event).selectModel(id);
    });
    ipcMain.handle(agentIpcChannels.connect, (event) => {

        return hostForEvent(event).connect();
    });
    ipcMain.handle(agentIpcChannels.effort, (event, id: unknown) => {

        if (typeof id !== "string" || id.length > 512) {
            throw new Error("Invalid reasoning effort.");
        }

        return hostForEvent(event).selectEffort(id);
    });
    ipcMain.handle(webSurfaceChannel, (event, input: unknown) => {

        hostForEvent(event);
        if (event.senderFrame !== mainWindow?.webContents.mainFrame || !webSurfaces) {
            throw new Error("Web commands require the host main frame.");
        }

        return settleWebSurfaceCommand(webSurfaces.command(parseWebCommand(input)));
    });
    ipcMain.handle(browserControlsChannel, async (event, input: unknown) => {

        hostForEvent(event);
        if (event.senderFrame !== mainWindow?.webContents.mainFrame || !browserBindings || !webSurfaces) {
            throw new Error("Browser controls require the host main frame.");
        }
        const command = parseBrowserControls(input);
        const snapshot = await workspaceFile?.load();
        if (!snapshot) {
            throw new Error("Workspace is unavailable.");
        }
        await browserBindings.prune(snapshot);
        switch (command.type) {
            case "list": return browserBindings.list(snapshot).filter((binding) => {

                return sameDashboard(binding, snapshot.selection);
            });
            case "bind":
                if (!snapshot.widgets.some((widget) => {

                    return widget.id === command.sourceId && sameDashboard(widget, snapshot.selection);
                })
            || !snapshot.widgets.some((widget) => {

                return widget.id === command.targetId && sameDashboard(widget, snapshot.selection);
            })) {
                    throw new Error("Browser bindings require the active dashboard.");
                }

                return browserBindings.bind(command, snapshot);
            case "unbind":
                if (!snapshot.widgets.some((widget) => {

                    return widget.id === command.sourceId && sameDashboard(widget, snapshot.selection);
                })) {
                    throw new Error("Browser bindings require the active dashboard.");
                }

                return browserBindings.unbind(command.sourceId, command.inputId);
            case "invoke": return webSurfaces.control(command, browserBindings);
        }
    });
    ipcMain.handle(agentIpcChannels.prompt, (event, input: unknown) =>
    {

        return hostForEvent(event).prompt(parseAgentPrompt(input));
    });
    ipcMain.handle(agentIpcChannels.cancel, (event) => {

        return hostForEvent(event).cancel();
    });
    ipcMain.handle(agentIpcChannels.configureWorkbench, (event, context: unknown) => {

        hostForEvent(event);
        if (!context || typeof context !== "object") {
            throw new TypeError("Agent workbench context must be an object");
        }
        workbench?.configure(context as AgentWorkbenchContext);
    });
    ipcMain.handle(workspaceIpcChannels.load, (event) => {

        hostForEvent(event);

        return workspaceFile?.load();
    });
    ipcMain.handle(workspaceIpcChannels.save, (event, snapshot: WorkspaceSnapshot, expected?: {
        snapshot: WorkspaceSnapshot | undefined;
    }) => {

        hostForEvent(event);
        if (!workbench) {
            throw new Error("Workspace storage is not ready");
        }

        return workbench.save(snapshot, expected);
    });

    ipcMain.handle(browserTasksChannel, async (event, input: unknown) => {

        hostForEvent(event);
        const workspaceId = (await workspaceFile?.load())?.selection?.workspaceId;
        if (!workspaceId || !browserTasks) {
            throw new Error("Background browsers are unavailable.");
        }

        return browserTasks.command(workspaceId, browserTaskCommandSchema.parse(input));
    });

    ipcMain.handle(localPluginsChannels.list, (event) => {

        hostForEvent(event);

        return workbench?.plugins.list() ?? [];
    });
    ipcMain.handle(localPluginsChannels.surface, (event, input: unknown) => {

        hostForEvent(event);
        const command = parseLocalWidgetCommand(input);
        if (!localWidgetSurfaces) {
            throw new Error("Local widgets are not ready.");
        }

        return localWidgetSurfaces.command(command);
    });

    const desktopReady = app.whenReady().then(async () => {

        if (process.platform === "darwin") {
            app.configureWebAuthn({ platformPasskeys: true });
        }

        let storagePaths;
        try {
            storagePaths = await loadStoragePaths(app.getPath("userData"), app.getPath("home"));
        } catch (error) {
            dialog.showErrorBox("Unable to start Avesd", `${error instanceof Error ? error.message : "Storage could not be initialized."}\n\nCheck .avesd/config.json in your home directory and restart Avesd.`);
            app.quit();

            return;
        }
        providerInstallations = await ProviderInstallations.open(join(storagePaths.dataDirectory, "agent-installations.json"));
        agentRuntimeRoot = storagePaths.agentRuntime;
        await providerInstallations.refresh();
        workbenchPreferences = await WorkbenchPreferences.open(join(storagePaths.dataDirectory, "workbench-preferences.json"));
        agentPreferences = await AgentPreferences.open(join(storagePaths.dataDirectory, "agent-preferences.json"));
        const privateStorage = new PluginStorage(storagePaths.dataDirectory);
        const resources = new SharedResources(resourceDirectoryFile(join(storagePaths.dataDirectory, "shared-resources-v1.json")), privateStorage, () => {

            widgetWorkspaceBridge.changed();
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send(widgetWorkspaceChannels.changed);
            }
        });
        workspaceFile = new WorkspaceFile(storagePaths.workspace);
        workbench = new AgentWorkbench(workspaceFile, new LocalPluginStore(storagePaths.plugins), localWidgetRunner, () => {

            widgetWorkspaceBridge.changed();
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send(workspaceIpcChannels.changed);
            }
        }, () => {

            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send(localPluginsChannels.changed);
            }
        }, () => {

            gateway?.rotateToken();
            if (mainWindow && !mainWindow.isDestroyed()) {
                resetWindowServices(mainWindow);
            }
        }, privateStorage, resources);
        await workbench.navigate({ type: "inspect" });
        browserTasks = await BrowserTasks.open(join(storagePaths.dataDirectory, "browser-tasks-v1.json"), () => {

            return workspaceFile!.load();
        }, () => {

            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send(browserTasksChanged);
            }
        }).catch(() => {

            return undefined;
        });
        workbench.setBrowserTasks(browserTasks);
        gateway = await openAgentGateway((name, input) => {

            return workbench!.invoke(name, input);
        }).catch(() => {

            return undefined;
        });
        agentHost = new AgentSessions(agentPreferences, async () => {

            const snapshot = await workspaceFile!.load();
            if (!snapshot?.selection) {
                throw new Error("Workspace unavailable.");
            }

            return {
                ...snapshot.selection,
                kind: "interactive",
                source: "You",
            };
        }, async (origin, route) => {

            const providers = createAgentProviders(providerInstallations);
            const provider = providers.find(item => {

                return item.id === route.providerId;
            });
            if (!provider || provider.availability?.().available === false) {
                throw new Error("Configured ACP is unavailable. Check Settings → Agents.");
            }
            const address = await openAgentGateway(async (name, input) => {

                if (origin.widgetId) {
                    await workbench!.authorizeAgentWidget(origin.widgetId);
                }

                return workbench!.invoke(name, input, origin);
            });
            const preferences = new AgentPreferences();
            preferences.providerId = route.providerId;
            const host = new AcpAgentHost(agentRuntimeRoot!, address, join(__dirname, "workspace-mcp.js"), preferences, providers, async () => {

                const snapshot = await workspaceFile!.load();
                const workspace = snapshot?.workspaces.find(item => {

                    return item.id === origin.workspaceId;
                });
                const dashboard = snapshot?.dashboards.find(item => {

                    return item.id === origin.dashboardId;
                });
                if (!workspace || !dashboard) {
                    throw new Error("Session workspace no longer exists.");
                }

                return {
                    workspaceName: workspace.name,
                    dashboardName: dashboard.name,
                };
            });

            return {
                host,
                release: () => {

                    return void address.close();
                },
            };
        }, () => {

            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send(agentSessionsChannels.changed);
            }
        });
        agentHost.subscribe(event => {

            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send(agentIpcChannels.event, event);
            }
        });
        // Fail closed for browser controls without preventing the local dashboard from opening.
        browserBindings = await BrowserBindings.open(browserBindingFile(storagePaths.browserBindings))
            .catch(() => {

                return undefined;
            });
        createMainWindow();

        app.on("activate", () => {

            if (BrowserWindow.getAllWindows().length === 0) {
                createMainWindow();
            }
        });

        return gateway;
    });

    app.on("window-all-closed", () => {

        if (process.platform !== "darwin") {
            app.quit();
        }
    });

    app.on("before-quit", () => {

        closePluginStorageProcesses();
        agentHost?.dispose();
        localWidgetRunner.dispose();
        localWidgetSurfaces?.dispose();
        gateway?.close();
    });

    return desktopReady;
}
