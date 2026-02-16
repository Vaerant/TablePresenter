const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const http = require("http");
const WebSocket = require("ws");
const os = require("os");
const fs = require("fs").promises;
const { spawn } = require("child_process");

let appServe = null;
let sermonDatabase = null;
let mainWindow = null;
let serverProcess = null;

// Add sermon preloading cache
let isPreloading = false;

const createWindow = async () => {
  try {
    mainWindow = new BrowserWindow({
      width: 1300,
      height: 700,
      minWidth: 200,
      frame: false,
      autoHideMenuBar: true, // Hide menu bar
      menuBarVisible: false, // Ensure menu bar is hidden
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        webSecurity: false, // Only for development
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    // Hide the menu bar completely
    mainWindow.setMenuBarVisibility(false);

    if (app.isPackaged) {
      if (!appServe) {
        const serve = await import("electron-serve");
        appServe = serve.default({
          directory: path.join(__dirname, "../out"),
        });
      }
      await appServe(mainWindow);
      mainWindow.loadURL("app://-");
    } else {
      mainWindow.loadURL("http://localhost:3000");
      mainWindow.webContents.openDevTools();
      mainWindow.webContents.on("did-fail-load", (e, code, desc) => {
        console.log("Page failed to load, reloading...", code, desc);
        mainWindow.webContents.reloadIgnoringCache();
      });
    }

    console.log("Electron window created successfully");
  } catch (error) {
    console.error("Error creating window:", error);
    throw error;
  }
};

const startApiServer = () => {
  return;
  console.log("Starting API server...");
  if (process.env.START_API_SERVER !== "1") return;
  if (serverProcess) return;

  const serverPath = path.join(__dirname, "server.js");
  serverProcess = spawn(process.execPath, [serverPath], {
    stdio: "inherit",
    env: { ...process.env, PORT: process.env.PORT || "3001" }
  });

  serverProcess.on("exit", (code, signal) => {
    console.log(`API server exited (code=${code}, signal=${signal})`);
    serverProcess = null;
  });
};

const setupWindowHandlers = () => {
  ipcMain.handle("window:minimize", async () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.minimize();
  });

  ipcMain.handle("window:toggleMaximize", async () => {
    if (!mainWindow || mainWindow.isDestroyed()) return false;
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
      return false;
    }
    mainWindow.maximize();
    return true;
  });

  ipcMain.handle("window:isMaximized", async () => {
    if (!mainWindow || mainWindow.isDestroyed()) return false;
    return mainWindow.isMaximized();
  });

  ipcMain.handle("window:close", async () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.close();
  });
};

app.on("ready", async () => {
  try {
    console.log("App ready, initializing...");
    startApiServer();
    setupWindowHandlers();
    await createWindow();
    console.log("App initialization complete");
  } catch (error) {
    console.error("Failed to initialize app:", error);
    app.quit();
  }
});

app.on("before-quit", () => {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});