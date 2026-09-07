import { app, BrowserWindow, ipcMain, shell } from "electron";
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

let agentHost: CodexAgentHost | undefined;
let mainWindow: BrowserWindow | undefined;
let workspaceFile: WorkspaceFile | undefined;
let workspacePath: string | undefined;

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

  agentHost?.dispose();
  if (!workspacePath) {
    throw new Error("Workspace storage is not ready");
  }
  agentHost = new CodexAgentHost(
    process.cwd(),
    workspacePath,
    join(__dirname, "workspace-mcp.js"),
  );
  const unsubscribe = agentHost.subscribe((event) => {
    if (!window.isDestroyed()) {
      window.webContents.send(agentIpcChannels.event, event);
    }
  });
  window.once("closed", () => {
    unsubscribe();
    if (mainWindow === window) {
      agentHost?.dispose();
      agentHost = undefined;
      mainWindow = undefined;
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

const hostForEvent = (event: IpcMainInvokeEvent): CodexAgentHost => {
  if (!mainWindow || event.sender !== mainWindow.webContents || !agentHost) {
    throw new Error("Agent IPC request did not originate from the active window");
  }

  return agentHost;
};

ipcMain.handle(agentIpcChannels.connect, (event) => hostForEvent(event).connect());
ipcMain.handle(agentIpcChannels.prompt, (event, input: unknown) =>
  hostForEvent(event).prompt(parseAgentPrompt(input)));
ipcMain.handle(agentIpcChannels.cancel, (event) => hostForEvent(event).cancel());
ipcMain.handle(agentIpcChannels.configureWorkbench, (event, context: unknown) => {
  const host = hostForEvent(event);
  if (!context || typeof context !== "object") {
    throw new TypeError("Agent workbench context must be an object");
  }
  host.configureWorkbench(context as AgentWorkbenchContext);
});
ipcMain.handle(workspaceIpcChannels.load, (event) => {
  hostForEvent(event);
  return workspaceFile?.load();
});
ipcMain.handle(workspaceIpcChannels.save, (event, snapshot: unknown) => {
  hostForEvent(event);
  if (!workspaceFile) {
    throw new Error("Workspace storage is not ready");
  }
  return workspaceFile.save(snapshot);
});

app.whenReady().then(() => {
  workspacePath = join(app.getPath("userData"), "workspace-v1.json");
  workspaceFile = new WorkspaceFile(workspacePath);
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  agentHost?.dispose();
});
