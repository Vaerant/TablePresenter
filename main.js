const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const http = require("http");
const WebSocket = require("ws");
const os = require("os");
const fs = require("fs").promises;
const { Worker } = require("worker_threads");

let appServe = null;
let sermonDatabase = null;
let bibleDatabase = null;
let systemDatabase = null;
let mainWindow = null;

// Add sermon preloading cache
let isPreloading = false;

/**
 * Proxy that forwards all SermonDatabase calls to a worker thread.
 * This keeps the main Electron thread free so the UI never freezes
 * during heavy SQLite reads.
 */
class SermonDatabaseProxy {
  constructor() {
    this.worker = null;
    this.pending = new Map();
    this.nextId = 0;
  }

  initialize() {
    return new Promise((resolve, reject) => {
      this.worker = new Worker(
        path.join(__dirname, 'database-table-worker.js')
      );

      const onReady = (msg) => {
        if (msg.type === 'ready') {
          this.worker.off('message', onReady);
          this._setupHandler();
          resolve();
        } else if (msg.type === 'init-error') {
          reject(new Error(msg.error));
        }
      };

      this.worker.on('message', onReady);
      this.worker.on('error', reject);
    });
  }

  _setupHandler() {
    this.worker.on('message', (msg) => {
      const p = this.pending.get(msg.id);
      if (!p) return;

      switch (msg.type) {
        case 'result':
          this.pending.delete(msg.id);
          p.resolve(msg.result);
          break;
        case 'error':
          this.pending.delete(msg.id);
          p.reject(new Error(msg.error));
          break;
        case 'sermon:structure':
          if (p.onStream) p.onStream(msg);
          if (msg.done) { this.pending.delete(msg.id); p.resolve(null); }
          break;
        case 'sermon:chunk':
          if (p.onStream) p.onStream(msg);
          if (msg.done) { this.pending.delete(msg.id); p.resolve(true); }
          break;
      }
    });
  }

  /** Generic async call – works for any SermonDatabase method */
  call(method, ...args) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, method, args });
    });
  }

  /** Streaming call – onStream receives intermediate messages */
  callStreaming(method, args, onStream) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject, onStream });
      this.worker.postMessage({ id, method, args });
    });
  }

  close() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.pending.clear();
  }
}

// Initialize databases in main process
const initializeDatabases = async () => {
  try {
    const { BibleDatabase } = require("./database-bible.js");
    const { SystemDatabase } = require("./database-system.js");

    sermonDatabase = new SermonDatabaseProxy();
    await sermonDatabase.initialize();
    console.log("Sermon database initialized successfully (worker thread)");

    bibleDatabase = new BibleDatabase();
    await bibleDatabase.initialize();
    console.log("Bible database initialized successfully");

    systemDatabase = new SystemDatabase();
    await systemDatabase.initialize();
    console.log("System database initialized successfully");
  } catch (error) {
    console.error("Failed to initialize databases:", error);
    throw error;
  }
};

// IPC handlers for database operations
const setupDatabaseHandlers = () => {
  ipcMain.handle("db:getAllSermons", async () => {
    try {
      return await sermonDatabase.call('getAllSermons');
    } catch (error) {
      console.error("Error in getAllSermons:", error);
      throw error;
    }
  });

  ipcMain.handle("db:getSermon", async (event, uid) => {
    try {
      await sermonDatabase.call('getSermon', uid);
      console.log("Sermon data retrieved successfully for UID:", uid);
      return {};
    } catch (error) {
      console.error("Error in getSermon:", error);
      throw error;
    }
  });

  ipcMain.handle("db:getSermonStructure", async (event, uid) => {
    try {
      const result = await sermonDatabase.call('getSermonStructure', uid);
      console.log("Sermon structure retrieved for UID:", uid);
      return result;
    } catch (error) {
      console.error("Error in getSermonStructure:", error);
      throw error;
    }
  });

  ipcMain.handle("db:getSermonSectionData", async (event, sermonUid, sectionUids) => {
    try {
      return await sermonDatabase.call('getSermonSectionData', sermonUid, sectionUids);
    } catch (error) {
      console.error("Error in getSermonSectionData:", error);
      throw error;
    }
  });

  // Streaming sermon loader: pushes structure + section chunks to renderer via events
  ipcMain.handle("db:loadSermonStreaming", async (event, uid) => {
    try {
      const result = await sermonDatabase.callStreaming(
        'loadSermonStreaming',
        [uid],
        (msg) => {
          if (!event.sender || event.sender.isDestroyed()) return;
          if (msg.type === 'sermon:structure') {
            event.sender.send('sermon:structure', { uid, structure: msg.data });
          } else if (msg.type === 'sermon:chunk') {
            event.sender.send('sermon:chunk', { uid, data: msg.data, done: msg.done });
          }
        }
      );
      return result; // null if not found, true if streamed successfully
    } catch (error) {
      console.error("Error in loadSermonStreaming:", error);
      throw error;
    }
  });

  ipcMain.handle(
    "db:searchSermons",
    async (event, query, limit, type = "phrase", sermonUid = null, page = 1) => {
      try {
        return await sermonDatabase.call('search', query, limit, type, sermonUid, page);
      } catch (error) {
        console.error("Error in searchSermons:", error);
        throw error;
      }
    }
  );

  // test searchSermons
  // (async () => {
  //   try {
  //     // const testResults = await sermonDatabase.search("faith", 5, "phrase");
  //     // console.log("Test searchSermons results:", testResults);
  //     // const testResults2 = await sermonDatabase.search("love", 5, "general");
  //     // console.log("Test searchSermons results (general):", testResults2);
  //     const testResults3 = await sermonDatabase.search("grace", 5, "similar");
  //     console.log("Test searchSermons results (similar):", testResults3);
  //   } catch (error) {
  //     console.error("Error during test searchSermons:", error);
  //   }
  // })();

  // Bible database handlers
  ipcMain.handle("bible:getAllBooks", async () => {
    try {
      return await bibleDatabase.getAllBooks();
    } catch (error) {
      console.error("Error in getAllBooks:", error);
      throw error;
    }
  });

  ipcMain.handle("bible:searchVerses", async (event, query, limit) => {
    try {
      return await bibleDatabase.searchVerses(query, limit);
    } catch (error) {
      console.error("Error in searchVerses:", error);
      throw error;
    }
  });

  ipcMain.handle("bible:searchByBook", async (event, query, bookId, limit) => {
    try {
      return await bibleDatabase.searchByBook(query, bookId, limit);
    } catch (error) {
      console.error("Error in searchByBook:", error);
      throw error;
    }
  });

  ipcMain.handle("bible:getChapter", async (event, bookId, chapter) => {
    try {
      return await bibleDatabase.getChapter(bookId, chapter);
    } catch (error) {
      console.error("Error in getChapter:", error);
      throw error;
    }
  });

  ipcMain.handle("bible:getVerse", async (event, bookId, chapter, verse) => {
    try {
      return await bibleDatabase.getVerse(bookId, chapter, verse);
    } catch (error) {
      console.error("Error in getVerse:", error);
      throw error;
    }
  });

  ipcMain.handle("bible:getBook", async (event, bookId) => {
    try {
      return await bibleDatabase.getBook(bookId);
    } catch (error) {
      console.error("Error in getBook:", error);
      throw error;
    }
  });

  // System database handlers
  ipcMain.handle("system:getAllScreens", async () => {
    try {
      return await systemDatabase.getAllScreens();
    } catch (error) {
      console.error("Error in getAllScreens:", error);
      throw error;
    }
  });

  ipcMain.handle("system:getScreen", async (event, id) => {
    try {
      return await systemDatabase.getScreen(id);
    } catch (error) {
      console.error("Error in getScreen:", error);
      throw error;
    }
  });

  ipcMain.handle("system:createScreen", async (event, screenData) => {
    try {
      return await systemDatabase.createScreen(screenData);
    } catch (error) {
      console.error("Error in createScreen:", error);
      throw error;
    }
  });

  ipcMain.handle("system:updateScreen", async (event, id, screenData) => {
    try {
      return await systemDatabase.updateScreen(id, screenData);
    } catch (error) {
      console.error("Error in updateScreen:", error);
      throw error;
    }
  });

  ipcMain.handle("system:deleteScreen", async (event, id) => {
    try {
      return await systemDatabase.deleteScreen(id);
    } catch (error) {
      console.error("Error in deleteScreen:", error);
      throw error;
    }
  });

  ipcMain.handle("system:getScreenSpaces", async (event, screenId) => {
    try {
      return await systemDatabase.getScreenSpaces(screenId);
    } catch (error) {
      console.error("Error in getScreenSpaces:", error);
      throw error;
    }
  });

  ipcMain.handle("system:createScreenSpace", async (event, spaceData) => {
    try {
      return await systemDatabase.createScreenSpace(spaceData);
    } catch (error) {
      console.error("Error in createScreenSpace:", error);
      throw error;
    }
  });

  ipcMain.handle("system:updateScreenSpace", async (event, id, spaceData) => {
    try {
      return await systemDatabase.updateScreenSpace(id, spaceData);
    } catch (error) {
      console.error("Error in updateScreenSpace:", error);
      throw error;
    }
  });

  ipcMain.handle("system:deleteScreenSpace", async (event, id) => {
    try {
      return await systemDatabase.deleteScreenSpace(id);
    } catch (error) {
      console.error("Error in deleteScreenSpace:", error);
      throw error;
    }
  });

  ipcMain.handle("system:updateScreenSpaceSettings", async (event, spaceId, settings) => {
    try {
      return await systemDatabase.updateScreenSpaceSettings(spaceId, settings);
    } catch (error) {
      console.error("Error in updateScreenSpaceSettings:", error);
      throw error;
    }
  });
};

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
    await initializeDatabases();
    setupDatabaseHandlers();
    setupWindowHandlers();
    await createWindow();
    console.log("App initialization complete");
  } catch (error) {
    console.error("Failed to initialize app:", error);
    app.quit();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    if (sermonDatabase) sermonDatabase.close();
    app.quit();
  }
});