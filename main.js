const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const http = require("http");
const WebSocket = require("ws");
const os = require("os");

let appServe = null;
let sermonDatabase = null;
let bibleDatabase = null;
let mainWindow = null;
let currentSelectedParagraph = null;
let currentDisplaySettings = {
  enabled: true,
  showTitle: true,
  showDate: true,
  showContent: true
};
let httpServer = null;
let wss = null;
let activeConnections = 0;

// Initialize databases in main process
const initializeDatabases = async () => {
  try {
    const { SermonDatabase } = require("./database-electron.js");
    const { BibleDatabase } = require("./database-bible.js");
    
    sermonDatabase = new SermonDatabase();
    await sermonDatabase.initialize();
    console.log('Sermon database initialized successfully');
    
    bibleDatabase = new BibleDatabase();
    await bibleDatabase.initialize();
    console.log('Bible database initialized successfully');
  } catch (error) {
    console.error('Failed to initialize databases:', error);
    throw error;
  }
};

// Get local network IP address - prioritize real network interfaces
const getNetworkIP = () => {
  const interfaces = os.networkInterfaces();
  let networkIPs = [];
  
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        // Prioritize real network interfaces over virtual ones
        const priority = getInterfacePriority(name, iface.address);
        networkIPs.push({
          address: iface.address,
          name: name,
          priority: priority
        });
      }
    }
  }
  
  // Sort by priority (lower number = higher priority) and return the best one
  if (networkIPs.length > 0) {
    networkIPs.sort((a, b) => a.priority - b.priority);
    console.log('Available network interfaces:', networkIPs);
    return networkIPs[0].address;
  }
  
  return 'localhost';
};

// Helper function to determine interface priority
const getInterfacePriority = (interfaceName, address) => {
  const name = interfaceName.toLowerCase();
  
  // Highest priority: Wi-Fi and Ethernet connections
  if (name.includes('wi-fi') || name.includes('wifi')) return 1;
  if (name.includes('ethernet') && !name.includes('vethernet')) return 2;
  
  // Medium priority: Other physical network adapters
  if (name.includes('local area connection') && !address.startsWith('169.254.')) return 3;
  
  // Lower priority: Virtual adapters but prefer private network ranges
  if (address.startsWith('192.168.') || address.startsWith('10.') || 
      (address.startsWith('172.') && address.split('.')[1] >= 16 && address.split('.')[1] <= 31)) {
    return 4;
  }
  
  // Lowest priority: Virtual switches, VPN adapters, etc.
  if (name.includes('vethernet') || name.includes('hyper-v') || 
      name.includes('vmware') || name.includes('virtualbox') ||
      name.includes('openvpn') || name.includes('tap-windows')) return 10;
  
  // Default priority for unknown interfaces
  return 5;
};

// Setup HTTP and WebSocket server for browser communication
const setupWebServer = () => {
  // Create HTTP server
  httpServer = http.createServer((req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    if (req.url === '/api/current-paragraph' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      // Return the same structure as WebSocket for consistency
      const responseData = {
        paragraphData: currentSelectedParagraph,
        displaySettings: currentDisplaySettings
      };
      res.end(JSON.stringify(responseData));
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  // Create WebSocket server
  wss = new WebSocket.Server({ server: httpServer });

  wss.on('connection', (ws) => {
    activeConnections++;
    console.log(`Browser connected via WebSocket (${activeConnections} active connections)`);
    
    // Broadcast connection count update
    broadcastConnectionCount();
    
    // Send current paragraph and display settings to new connection
    if (currentSelectedParagraph) {
      ws.send(JSON.stringify({
        type: 'paragraph:updated',
        data: {
          paragraphData: currentSelectedParagraph,
          displaySettings: currentDisplaySettings
        }
      }));
    } else {
      // Send just display settings if no paragraph selected
      ws.send(JSON.stringify({
        type: 'display:settingsUpdated',
        data: currentDisplaySettings
      }));
    }

    ws.on('close', () => {
      activeConnections--;
      console.log(`Browser disconnected from WebSocket (${activeConnections} active connections)`);
      broadcastConnectionCount();
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      // Don't decrement connection count here as 'close' will be called
    });
  });

  // Start server on all network interfaces (0.0.0.0) port 3001
  httpServer.listen(3001, '0.0.0.0', () => {
    const networkIP = getNetworkIP();
    console.log('WebSocket server running on:');
    console.log(`  - Local: http://localhost:3001`);
    console.log(`  - Network: http://${networkIP}:3001`);
  });
};

// Broadcast to both Electron windows and browser clients
const broadcastParagraphUpdate = (data) => {
  currentSelectedParagraph = data.paragraphData;
  if (data.displaySettings) {
    currentDisplaySettings = data.displaySettings;
  }
  
  // Broadcast to Electron windows
  const windows = BrowserWindow.getAllWindows();
  console.log(`Broadcasting paragraph update to ${windows.length} Electron windows`);
  windows.forEach(window => {
    window.webContents.send('paragraph:updated', {
      paragraphData: currentSelectedParagraph,
      displaySettings: currentDisplaySettings
    });
  });

  // Broadcast to WebSocket clients (browsers)
  if (wss) {
    const message = JSON.stringify({
      type: 'paragraph:updated',
      data: {
        paragraphData: currentSelectedParagraph,
        displaySettings: currentDisplaySettings
      }
    });
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
    console.log(`Broadcasted to ${wss.clients.size} WebSocket clients`);
  }
};

const broadcastDisplaySettingsUpdate = (settings) => {
  currentDisplaySettings = settings;
  
  // Broadcast to Electron windows - only send settings, keep current paragraph
  const windows = BrowserWindow.getAllWindows();
  console.log(`Broadcasting display settings update to ${windows.length} Electron windows`);
  windows.forEach(window => {
    window.webContents.send('display:settingsUpdated', settings);
  });

  // Broadcast to WebSocket clients (browsers) - only send settings
  if (wss) {
    const message = JSON.stringify({
      type: 'display:settingsUpdated',
      data: settings
    });
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
    console.log(`Broadcasted settings to ${wss.clients.size} WebSocket clients`);
  }
};

const broadcastParagraphClear = () => {
  currentSelectedParagraph = null;
  
  // Broadcast to Electron windows
  const windows = BrowserWindow.getAllWindows();
  console.log(`Broadcasting paragraph clear to ${windows.length} Electron windows`);
  windows.forEach(window => {
    window.webContents.send('paragraph:cleared');
  });

  // Broadcast to WebSocket clients (browsers)
  if (wss) {
    const message = JSON.stringify({
      type: 'paragraph:cleared'
    });
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
    console.log(`Broadcasted clear to ${wss.clients.size} WebSocket clients`);
  }
};

// Broadcast connection count to all Electron windows
const broadcastConnectionCount = () => {
  const windows = BrowserWindow.getAllWindows();
  windows.forEach(window => {
    window.webContents.send('connections:updated', activeConnections);
  });
};

// IPC handlers for database operations
const setupDatabaseHandlers = () => {
  ipcMain.handle('db:getAllSermons', async () => {
    try {
      return await sermonDatabase.getAllSermons();
    } catch (error) {
      console.error('Error in getAllSermons:', error);
      throw error;
    }
  });

  ipcMain.handle('db:getSermon', async (event, uid) => {
    try {
      return await sermonDatabase.getSermon(uid);
    } catch (error) {
      console.error('Error in getSermon:', error);
      throw error;
    }
  });

  ipcMain.handle('db:getSermonBlocks', async (event, sermonUid) => {
    try {
      return await sermonDatabase.getSermonBlocks(sermonUid);
    } catch (error) {
      console.error('Error in getSermonBlocks:', error);
      throw error;
    }
  });

  ipcMain.handle('db:searchText', async (event, query, limit) => {
    try {
      return await sermonDatabase.searchText(query, limit);
    } catch (error) {
      console.error('Error in searchText:', error);
      throw error;
    }
  });

  ipcMain.handle('db:searchByBlockType', async (event, query, blockType, limit) => {
    try {
      return await sermonDatabase.searchByBlockType(query, blockType, limit);
    } catch (error) {
      console.error('Error in searchByBlockType:', error);
      throw error;
    }
  });

  ipcMain.handle('db:searchSermons', async (event, filters) => {
    try {
      return await sermonDatabase.searchSermons(filters);
    } catch (error) {
      console.error('Error in searchSermons:', error);
      throw error;
    }
  });

  ipcMain.handle('db:getSermonStats', async (event, uid) => {
    try {
      return await sermonDatabase.getSermonStats(uid);
    } catch (error) {
      console.error('Error in getSermonStats:', error);
      throw error;
    }
  });

  ipcMain.handle('db:getParagraphBlocks', async (event, paragraphUid) => {
    try {
      return await sermonDatabase.getParagraphBlocks(paragraphUid);
    } catch (error) {
      console.error('Error in getParagraphBlocks:', error);
      throw error;
    }
  });

  ipcMain.handle('db:getBlockContext', async (event, sermonUid, blockUid) => {
    try {
      return await sermonDatabase.getBlockContext(sermonUid, blockUid);
    } catch (error) {
      console.error('Error in getBlockContext:', error);
      throw error;
    }
  });

  ipcMain.handle('db:getSermonSections', async (event, sermonUid) => {
    try {
      return await sermonDatabase.getSermonSections(sermonUid);
    } catch (error) {
      console.error('Error in getSermonSections:', error);
      throw error;
    }
  });

  ipcMain.handle('db:getSectionParagraphs', async (event, sectionUid) => {
    try {
      return await sermonDatabase.getSectionParagraphs(sectionUid);
    } catch (error) {
      console.error('Error in getSectionParagraphs:', error);
      throw error;
    }
  });

  // Bible database handlers
  ipcMain.handle('bible:getAllBooks', async () => {
    try {
      return await bibleDatabase.getAllBooks();
    } catch (error) {
      console.error('Error in getAllBooks:', error);
      throw error;
    }
  });

  ipcMain.handle('bible:searchVerses', async (event, query, limit) => {
    try {
      return await bibleDatabase.searchVerses(query, limit);
    } catch (error) {
      console.error('Error in searchVerses:', error);
      throw error;
    }
  });

  ipcMain.handle('bible:searchByBook', async (event, query, bookId, limit) => {
    try {
      return await bibleDatabase.searchByBook(query, bookId, limit);
    } catch (error) {
      console.error('Error in searchByBook:', error);
      throw error;
    }
  });

  ipcMain.handle('bible:getChapter', async (event, bookId, chapter) => {
    try {
      return await bibleDatabase.getChapter(bookId, chapter);
    } catch (error) {
      console.error('Error in getChapter:', error);
      throw error;
    }
  });

  ipcMain.handle('bible:getVerse', async (event, bookId, chapter, verse) => {
    try {
      return await bibleDatabase.getVerse(bookId, chapter, verse);
    } catch (error) {
      console.error('Error in getVerse:', error);
      throw error;
    }
  });
};

// Paragraph selection handlers
const setupParagraphHandlers = () => {
  ipcMain.on('paragraph:selected', (event, data) => {
    console.log('Main process received paragraph selection:', data);
    broadcastParagraphUpdate(data);
  });

  ipcMain.on('display:settingsUpdated', (event, settings) => {
    console.log('Main process received display settings update (no paragraph change):', settings);
    broadcastDisplaySettingsUpdate(settings);
  });

  ipcMain.on('paragraph:cleared', (event) => {
    console.log('Main process received paragraph clear');
    broadcastParagraphClear();
  });

  ipcMain.handle('paragraph:getCurrentSelection', async () => {
    console.log('Returning current selection and settings');
    return {
      paragraphData: currentSelectedParagraph,
      displaySettings: currentDisplaySettings
    };
  });
};

// System information handlers
const setupSystemHandlers = () => {
  ipcMain.handle('system:getNetworkInfo', async () => {
    try {
      const networkIP = getNetworkIP();
      return {
        networkIP,
        platform: `${os.type()} ${os.release()}`,
        uptime: os.uptime(),
        hostname: os.hostname(),
        totalMemory: os.totalmem(),
        freeMemory: os.freemem(),
        cpuCount: os.cpus().length,
        activeConnections: activeConnections
      };
    } catch (error) {
      console.error('Error getting network info:', error);
      throw error;
    }
  });

  ipcMain.handle('system:getConnectionCount', async () => {
    return activeConnections;
  });

  ipcMain.handle('system:openExternal', async (event, url) => {
    try {
      await shell.openExternal(url);
      console.log('Opened external URL:', url);
    } catch (error) {
      console.error('Error opening external URL:', error);
      throw error;
    }
  });
};

const createWindow = async () => {
  try {
    mainWindow = new BrowserWindow({
      width: 1400,
      height: 1000,
      autoHideMenuBar: true, // Hide menu bar
      menuBarVisible: false, // Ensure menu bar is hidden
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        webSecurity: false, // Only for development
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    // Hide the menu bar completely
    mainWindow.setMenuBarVisibility(false);

    if (app.isPackaged) {
      if (!appServe) {
        const serve = await import("electron-serve");
        appServe = serve.default({
          directory: path.join(__dirname, "../out")
        });
      }
      await appServe(mainWindow);
      mainWindow.loadURL("app://-");
    } else {
      mainWindow.loadURL("http://localhost:3000");
      mainWindow.webContents.openDevTools();
      mainWindow.webContents.on("did-fail-load", (e, code, desc) => {
        console.log('Page failed to load, reloading...', code, desc);
        mainWindow.webContents.reloadIgnoringCache();
      });
    }

    console.log('Electron window created successfully');
  } catch (error) {
    console.error('Error creating window:', error);
    throw error;
  }
}

app.on("ready", async () => {
  try {
    console.log('App ready, initializing...');
    await initializeDatabases();
    setupDatabaseHandlers();
    setupParagraphHandlers();
    setupSystemHandlers();
    setupWebServer();
    await createWindow();
    console.log('App initialization complete');
  } catch (error) {
    console.error('Failed to initialize app:', error);
    app.quit();
  }
});

app.on("window-all-closed", () => {
    if(process.platform !== "darwin"){
        // Close servers when app closes
        if (httpServer) {
          httpServer.close();
        }
        app.quit();
    }
});