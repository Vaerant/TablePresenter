const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const http = require("http");
const WebSocket = require("ws");
const os = require("os");
const fs = require("fs").promises;
const crypto = require("crypto");

let appServe = null;
let sermonDatabase = null;
let bibleDatabase = null;
let systemDatabase = null;
let mainWindow = null;

// Add sermon preloading cache
let isPreloading = false;

// Sermon streaming state (avoid sending huge objects in a single IPC payload)
const activeSermonStreams = new Map(); // requestId -> { cancelled: boolean, senderId: number }
const activeStreamBySender = new Map(); // webContents.id -> requestId

const cancelSermonStream = (requestId) => {
  const state = activeSermonStreams.get(requestId);
  if (!state) return false;
  state.cancelled = true;
  activeSermonStreams.set(requestId, state);
  return true;
};

const isStreamCancelled = (requestId) => {
  const state = activeSermonStreams.get(requestId);
  return !state || state.cancelled;
};

const yieldToEventLoop = async () => {
  await new Promise((resolve) => setImmediate(resolve));
};

const streamSermonToSender = async (sender, requestId, uid, options = {}) => {
  const paragraphBatchSizeRaw = Number(options?.paragraphBatchSize ?? 25);
  const paragraphBatchSize = Number.isFinite(paragraphBatchSizeRaw)
    ? Math.max(5, Math.min(200, Math.floor(paragraphBatchSizeRaw)))
    : 25;

  // Stream directly from SQLite to avoid materializing the full sermon in memory.
  // IMPORTANT: use the async variant so we yield to the event loop.
  if (typeof sermonDatabase?.streamSermonAsync !== "function") {
    throw new Error("SermonDatabase.streamSermonAsync is not available");
  }

  let started = false;
  let sermonMeta = null;

  const safeSend = (channel, payload) => {
    if (sender.isDestroyed()) return;
    sender.send(channel, payload);
  };

  await sermonDatabase.streamSermonAsync(uid, {
    paragraphBatchSize,
    yieldEveryRows: 1200,
    isCancelled: () => isStreamCancelled(requestId),
    onStart: (meta) => {
      if (isStreamCancelled(requestId)) return;
      if (!meta) {
        safeSend("db:sermonStreamError", { requestId, message: `Sermon not found: ${uid}` });
        return;
      }
      started = true;
      sermonMeta = meta;
      safeSend("db:sermonStreamStart", {
        requestId,
        totalParagraphs: null,
        sermon: {
          id: meta.id,
          uid: meta.uid,
          title: meta.title,
          date: meta.date,
          orderedSectionIds: meta.orderedSectionIds || [],
          sections: meta.sections || {},
        },
      });
    },
    onChunk: async (chunk) => {
      if (isStreamCancelled(requestId)) return;
      if (!started && sermonMeta) {
        // should not happen, but be defensive
        started = true;
      }
      safeSend("db:sermonStreamChunk", {
        requestId,
        sectionId: chunk.sectionId,
        paragraphIds: chunk.paragraphIds,
        paragraphs: chunk.paragraphs,
        sections: chunk.sections,
        sentParagraphs: chunk.sentParagraphs,
        totalParagraphs: null,
      });
      await yieldToEventLoop();
    },
    onDone: () => {
      if (isStreamCancelled(requestId)) return;
      safeSend("db:sermonStreamDone", { requestId });
    },
  });
};

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

  // Stream a sermon in chunks to reduce UI lag from large IPC payloads.
  ipcMain.handle("db:startSermonStream", async (event, uid, options = {}) => {
    if (!uid) throw new Error("Sermon uid is required");

    const sender = event.sender;
    const senderId = sender.id;

    // Cancel any previous active stream for this renderer.
    const prevRequestId = activeStreamBySender.get(senderId);
    if (prevRequestId) {
      cancelSermonStream(prevRequestId);
      activeSermonStreams.delete(prevRequestId);
      activeStreamBySender.delete(senderId);
    }

    const requestId = typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    activeSermonStreams.set(requestId, { cancelled: false, senderId });
    activeStreamBySender.set(senderId, requestId);

    // Fire and forget: start streaming on the next tick so the renderer can attach listeners.
    setImmediate(() => {
      streamSermonToSender(sender, requestId, uid, options).catch((err) => {
      console.error("Error streaming sermon:", err);
      if (!sender.isDestroyed()) {
        sender.send("db:sermonStreamError", {
          requestId,
          message: err?.message || String(err),
        });
      }
      }).finally(() => {
        activeSermonStreams.delete(requestId);
        // Only clear sender mapping if it still points to this requestId.
        if (activeStreamBySender.get(senderId) === requestId) {
          activeStreamBySender.delete(senderId);
        }
      });
    });

    return { requestId };
  });

  ipcMain.handle("db:cancelSermonStream", async (_event, requestId) => {
    if (!requestId) return false;
    const cancelled = cancelSermonStream(requestId);
    if (cancelled) activeSermonStreams.delete(requestId);
    return cancelled;
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

  // test getSermon
  // (async () => {
  //   try {
  //     const testSermon = await sermonDatabase.getSermon("b5aca7393e97");
  //     console.log("Test getSermon result:", testSermon);
  //   } catch (error) {
  //     console.error("Error during test getSermon:", error);
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

    // Broadcast maximize state so the renderer can update button icon/state
    mainWindow.on("maximize", () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      mainWindow.webContents.send("window:maximize-changed", true);
    });
    mainWindow.on("unmaximize", () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      mainWindow.webContents.send("window:maximize-changed", false);
    });

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
    // Close servers when app closes
    // if (httpServer) {
    //   httpServer.close();
    // }
    app.quit();
  }
});
