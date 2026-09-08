import { WidgetWorkspaceBridge } from "./widget-workspace-bridge";
import { parseWidgetWorkspaceRequest, widgetWorkspaceChannels } from "../shared/widget-workspace";
import type { WidgetInstanceId } from "@avesd/workspace-model";
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import type { IpcMainInvokeEvent } from "electron";
import { join } from "node:path";

import {
  agentIpcChannels,
  parseAgentPrompt,
  workspaceIpcChannels,
} from "../shared/desktop-api";
import type { AgentWorkbenchContext } from "../shared/desktop-api";
import { CodexAgentHost } from "./codex-agent-host";
import { WorkspaceFile } from "./workspace-file";
import { WebSurfaceManager } from "./web-surface-manager";
import { parseWebCommand, webSurfaceChannel, webSurfaceEventChannel } from "../shared/web-surface";
import { browserControlsChannel, parseBrowserControls } from "../shared/browser-controls";
import { BrowserBindings } from "./browser-bindings";
import { browserBindingFile } from "./browser-binding-file";
import { loadStoragePaths } from "./storage-paths";
import { LocalPluginStore } from "./local-plugin-store";
import { LocalWidgetRunner } from "./local-widget-sandbox";
import { LocalWidgetSurfaces } from "./local-widget-surfaces";
import { AgentWorkbench } from "./agent-workbench";
import { openAgentGateway } from "./agent-gateway";
import { localPluginsChannels } from "../shared/local-plugins";
import { sameDashboard } from "@avesd/workspace-model";
import { parseWorkspaceNavigation, workspaceNavigationChannel } from "../shared/workspace-navigation";
import type { WorkspaceSnapshot } from "@avesd/workspace-model";

let agentHost: CodexAgentHost | undefined;
let mainWindow: BrowserWindow | undefined;
let workspaceFile: WorkspaceFile | undefined;
let workbench: AgentWorkbench | undefined;
let gateway: Awaited<ReturnType<typeof openAgentGateway>> | undefined;
let localWidgetSurfaces: LocalWidgetSurfaces | undefined;
const widgetWorkspaceBridge = new WidgetWorkspaceBridge();
const localWidgetRunner = new LocalWidgetRunner(widgetWorkspaceBridge);
let webSurfaces: WebSurfaceManager | undefined;
let browserBindings: BrowserBindings | undefined;

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

  window.once("ready-to-show", () => window.show());

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isTrustedExternalUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event) => event.preventDefault());

  resetWindowServices(window);
  window.on("close", () => { webSurfaces?.dispose(); localWidgetSurfaces?.dispose(); });
  window.webContents.on("render-process-gone", () => { webSurfaces?.dispose(); localWidgetSurfaces?.dispose(); });
  window.once("closed", () => {
    if (mainWindow === window) {
      agentHost?.dispose();
      agentHost = undefined;
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

const resetWindowServices = (window: BrowserWindow): void => {
  webSurfaces?.dispose();
  localWidgetSurfaces?.dispose();
  agentHost?.dispose();
  localWidgetRunner.dispose();
  if (!workbench) throw new Error("Workspace storage is not ready");
  webSurfaces = new WebSurfaceManager(window, () => workspaceFile!.load(), () => {
    if (!window.isDestroyed()) window.webContents.send(webSurfaceEventChannel);
  });
  localWidgetSurfaces = new LocalWidgetSurfaces(window, workbench.plugins, () => workspaceFile!.load(), widgetWorkspaceBridge, workbench);
  agentHost = new CodexAgentHost(process.cwd(), gateway, join(__dirname, "workspace-mcp.js"));
  agentHost.subscribe((event) => {
    if (!window.isDestroyed()) window.webContents.send(agentIpcChannels.event, event);
  });
};

const hostForEvent = (event: IpcMainInvokeEvent): CodexAgentHost => {
  if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame || !agentHost) {
    throw new Error("Agent IPC request did not originate from the active window");
  }

  return agentHost;
};

ipcMain.handle(widgetWorkspaceChannels.renderer, (event, instanceId: unknown, input: unknown) => {
  hostForEvent(event);
  if (typeof instanceId !== "string" || !workbench) throw new Error("Widget instance is required.");
  return workbench.invokeWidget(instanceId as WidgetInstanceId, parseWidgetWorkspaceRequest(input));
});

ipcMain.handle(workspaceNavigationChannel, (event, input: unknown) => {
  hostForEvent(event);
  if (!workbench) throw new Error("Workspace is unavailable.");
  return workbench.navigate(parseWorkspaceNavigation(input));
});

ipcMain.handle(agentIpcChannels.connect, (event) => hostForEvent(event).connect());
ipcMain.handle(webSurfaceChannel, (event, input: unknown) => {
  hostForEvent(event);
  if (event.senderFrame !== mainWindow?.webContents.mainFrame || !webSurfaces) {
    throw new Error("Web commands require the host main frame.");
  }
  return webSurfaces.command(parseWebCommand(input));
});
ipcMain.handle(browserControlsChannel, async (event, input: unknown) => {
  hostForEvent(event);
  if (event.senderFrame !== mainWindow?.webContents.mainFrame || !browserBindings || !webSurfaces) {
    throw new Error("Browser controls require the host main frame.");
  }
  const command = parseBrowserControls(input);
  const snapshot = await workspaceFile?.load();
  if (!snapshot) throw new Error("Workspace is unavailable.");
  await browserBindings.prune(snapshot);
  switch (command.type) {
    case "list": return browserBindings.list(snapshot).filter((binding) => sameDashboard(binding, snapshot.selection));
    case "bind":
      if (!snapshot.widgets.some((widget) => widget.id === command.sourceId && sameDashboard(widget, snapshot.selection))
        || !snapshot.widgets.some((widget) => widget.id === command.targetId && sameDashboard(widget, snapshot.selection))) {
        throw new Error("Browser bindings require the active dashboard.");
      }
      return browserBindings.bind(command, snapshot);
    case "unbind":
      if (!snapshot.widgets.some((widget) => widget.id === command.sourceId && sameDashboard(widget, snapshot.selection))) {
        throw new Error("Browser bindings require the active dashboard.");
      }
      return browserBindings.unbind(command.sourceId, command.inputId);
    case "invoke": return webSurfaces.control(command, browserBindings);
  }
});
ipcMain.handle(agentIpcChannels.prompt, (event, input: unknown) =>
  hostForEvent(event).prompt(parseAgentPrompt(input)));
ipcMain.handle(agentIpcChannels.cancel, (event) => hostForEvent(event).cancel());
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
ipcMain.handle(workspaceIpcChannels.save, (event, snapshot: WorkspaceSnapshot, expected?: { snapshot: WorkspaceSnapshot | undefined }) => {
  hostForEvent(event);
  if (!workbench) {
    throw new Error("Workspace storage is not ready");
  }
  return workbench.save(snapshot, expected);
});

ipcMain.handle(localPluginsChannels.list, (event) => {
  hostForEvent(event);
  return workbench?.plugins.list() ?? [];
});
ipcMain.handle(localPluginsChannels.surface, (event, input: unknown) => {
  hostForEvent(event);
  const command = parseWebCommand(input);
  if (!localWidgetSurfaces) throw new Error("Local widgets are not ready.");
  if (command.type === "create" || command.type === "bounds") return localWidgetSurfaces.command(command);
  if (command.type === "destroy") return localWidgetSurfaces.command({ type: "destroy", id: command.id });
  throw new Error("Invalid local widget command.");
});

export const desktopReady = app.whenReady().then(async () => {
  let storagePaths;
  try {
    storagePaths = await loadStoragePaths(app.getPath("userData"), app.getPath("home"));
  } catch (error) {
    dialog.showErrorBox("Unable to start Avesd", `${error instanceof Error ? error.message : "Storage could not be initialized."}\n\nCheck .avesd/config.json in your home directory and restart Avesd.`);
    app.quit();
    return;
  }
  workspaceFile = new WorkspaceFile(storagePaths.workspace);
  workbench = new AgentWorkbench(workspaceFile, new LocalPluginStore(storagePaths.plugins), localWidgetRunner,
    () => {
      widgetWorkspaceBridge.changed();
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(workspaceIpcChannels.changed);
    },
    () => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(localPluginsChannels.changed); },
    () => {
      gateway?.rotateToken();
      if (mainWindow && !mainWindow.isDestroyed()) resetWindowServices(mainWindow);
    });
  await workbench.navigate({ type: "inspect" });
  gateway = await openAgentGateway((name, input) => workbench!.invoke(name, input)).catch(() => undefined);
  // Fail closed for browser controls without preventing the local dashboard from opening.
  browserBindings = await BrowserBindings.open(browserBindingFile(storagePaths.browserBindings))
    .catch(() => undefined);
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
  agentHost?.dispose();
  localWidgetRunner.dispose();
  localWidgetSurfaces?.dispose();
  gateway?.close();
});
