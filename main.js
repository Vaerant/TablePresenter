const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const http = require("http");
const WebSocket = require("ws");
const os = require("os");
const fs = require("fs").promises;

let appServe = null;
let sermonDatabase = null;
let bibleDatabase = null;
let systemDatabase = null;
let mainWindow = null;

// Add sermon preloading cache
let isPreloading = false;

// Initialize databases in main process
const initializeDatabases = async () => {
  try {
    const { SermonDatabase } = require("./database-table.js");
    const { BibleDatabase } = require("./database-bible.js");
    const { SystemDatabase } = require("./database-system.js");

    sermonDatabase = new SermonDatabase();
    await sermonDatabase.initialize();
    console.log("Sermon database initialized successfully");

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
      const result = await sermonDatabase.getAllSermons();

      return result;
    } catch (error) {
      console.error("Error in getAllSermons:", error);
      throw error;
    }
  });

  ipcMain.handle("db:getSermon", async (event, uid) => {
    try {
  
      const result = await sermonDatabase.getSermon(uid);

      return result;
    } catch (error) {
      console.error("Error in getSermon:", error);
      throw error;
    }
  });

  ipcMain.handle(
    "db:searchSermons",
    async (event, query, limit, type = "phrase", sermonUid = null, page = 1) => {
      try {
        return await sermonDatabase.search(query, limit, type, sermonUid, page);
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
      width: 1400,
      height: 900,
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

app.on("ready", async () => {
  try {
    console.log("App ready, initializing...");
    await initializeDatabases();
    setupDatabaseHandlers();
    await createWindow();
    console.log("App initialization complete");
  } catch (error) {
    console.error("Failed to initialize app:", error);
    app.quit();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    // Close servers when app closes
    // if (httpServer) {
    //   httpServer.close();
    // }
    app.quit();
  }
});
