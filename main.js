const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const http = require("http");
const WebSocket = require("ws");
const os = require("os");
const fs = require('fs').promises;

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
  httpServer = http.createServer(async (req, res) => {
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
    } else if (req.url.startsWith('/templates/')) {
      // Serve template files
      try {
        const urlPath = req.url.replace('/templates/', '');
        
        // If requesting the main HTML file, inject CSS and JS
        if (urlPath.endsWith('/index.html')) {
          const stage = urlPath.split('/')[0];
          const templateDir = path.join(__dirname, 'templates', stage);
          const indexPath = path.join(templateDir, 'index.html');
          const cssPath = path.join(templateDir, 'styles.css');
          const jsPath = path.join(templateDir, 'script.js');
          
          let htmlContent = await fs.readFile(indexPath, 'utf8');
          
          // Try to inject CSS
          try {
            const cssContent = await fs.readFile(cssPath, 'utf8');
            if (htmlContent.includes('</head>')) {
              htmlContent = htmlContent.replace('</head>', `<style>\n${cssContent}\n</style>\n</head>`);
            } else {
              htmlContent = htmlContent.replace('<html>', `<html><head><style>\n${cssContent}\n</style></head>`);
            }
          } catch (error) {
            console.log('No CSS file found for template:', stage);
          }
          
          // Try to inject JS
          try {
            const jsContent = await fs.readFile(jsPath, 'utf8');
            if (htmlContent.includes('</body>')) {
              htmlContent = htmlContent.replace('</body>', `<script>\n${jsContent}\n</script>\n</body>`);
            } else {
              htmlContent += `<script>\n${jsContent}\n</script>`;
            }
          } catch (error) {
            console.log('No JS file found for template:', stage);
          }
          
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(htmlContent);
        } else {
          // Serve other files (CSS, JS, images, etc.) directly
          const templatePath = path.join(__dirname, 'templates', urlPath);
          
          // Check if file exists
          await fs.access(templatePath);
          
          // Determine content type
          let contentType = 'text/plain';
          if (templatePath.endsWith('.html')) contentType = 'text/html';
          else if (templatePath.endsWith('.css')) contentType = 'text/css';
          else if (templatePath.endsWith('.js')) contentType = 'application/javascript';
          else if (templatePath.endsWith('.png')) contentType = 'image/png';
          else if (templatePath.endsWith('.jpg') || templatePath.endsWith('.jpeg')) contentType = 'image/jpeg';
          else if (templatePath.endsWith('.gif')) contentType = 'image/gif';
          else if (templatePath.endsWith('.svg')) contentType = 'image/svg+xml';
          
          const content = await fs.readFile(templatePath);
          res.writeHead(200, { 'Content-Type': contentType });
          res.end(content);
        }
      } catch (error) {
        console.error('Template file not found:', error.message);
        res.writeHead(404);
        res.end('Template not found');
      }
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

// Template handlers - simplify these since we're serving files directly via HTTP
const setupTemplateHandlers = () => {
  ipcMain.handle('template:checkTemplate', async (event, stage) => {
    try {
      const templateDir = path.join(__dirname, 'templates', stage);
      const indexPath = path.join(templateDir, 'index.html');
      
      await fs.access(indexPath);
      return true;
    } catch (error) {
      return false;
    }
  });

  ipcMain.handle('template:listTemplates', async () => {
    try {
      const templatesDir = path.join(__dirname, 'templates');
      
      // Create templates directory if it doesn't exist
      try {
        await fs.access(templatesDir);
      } catch (error) {
        await fs.mkdir(templatesDir, { recursive: true });
        console.log('Created templates directory:', templatesDir);
      }
      
      const entries = await fs.readdir(templatesDir, { withFileTypes: true });
      
      const templates = [];
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const indexPath = path.join(templatesDir, entry.name, 'index.html');
          try {
            await fs.access(indexPath);
            templates.push(entry.name);
          } catch (error) {
            // Skip directories without index.html
          }
        }
      }
      
      return templates;
    } catch (error) {
      console.error('Error listing templates:', error);
      return [];
    }
  });

  // Create default template if templates directory is empty
  ipcMain.handle('template:createDefault', async () => {
    try {
      const templatesDir = path.join(__dirname, 'templates');
      const defaultDir = path.join(templatesDir, 'default');
      
      // Create directories
      await fs.mkdir(defaultDir, { recursive: true });
      
      // Create default HTML
      const defaultHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Display - Default Template</title>
</head>
<body>
    <div id="app">
        <div id="header">
            <h1 id="sermon-title"></h1>
            <p id="sermon-date"></p>
        </div>
        
        <div id="content">
            <div id="paragraph-text"></div>
        </div>
        
        <div id="connection-status">
            <span id="connection-type"></span>
            <span id="connection-count"></span>
        </div>
    </div>
</body>
</html>`;

      // Create default CSS
      const defaultCss = `* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    background-color: #000;
    color: #fff;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    height: 100vh;
    overflow: hidden;
}

#app {
    height: 100vh;
    display: flex;
    flex-direction: column;
    padding: 2rem;
}

#header {
    text-align: center;
    margin-bottom: 2rem;
    flex-shrink: 0;
}

#sermon-title {
    font-size: 2rem;
    font-weight: bold;
    color: #e5e7eb;
    margin-bottom: 0.5rem;
}

#sermon-date {
    font-size: 1.2rem;
    color: #9ca3af;
}

#content {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 2rem;
}

#paragraph-text {
    font-size: 3rem;
    line-height: 1.4;
    text-align: center;
    max-width: 100%;
    word-wrap: break-word;
    overflow-wrap: break-word;
    hyphens: auto;
}

.editor-comment {
    font-style: italic;
    color: #9ca3af;
}

#connection-status {
    position: fixed;
    bottom: 1rem;
    right: 1rem;
    background: rgba(0, 0, 0, 0.7);
    padding: 0.5rem;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    color: #9ca3af;
}

.hidden {
    display: none !important;
}`;

      // Create default JavaScript
      const defaultJs = `let currentParagraph = null;
let currentDisplaySettings = null;
let connectionType = 'unknown';
let ws = null;
let pollInterval = null;

// DOM elements
const sermonTitle = document.getElementById('sermon-title');
const sermonDate = document.getElementById('sermon-date');
const paragraphText = document.getElementById('paragraph-text');
const connectionStatus = document.getElementById('connection-status');
const connectionTypeSpan = document.getElementById('connection-type');
const connectionCountSpan = document.getElementById('connection-count');
const header = document.getElementById('header');
const content = document.getElementById('content');

// Initialize the display
function initialize() {
    console.log('Initializing default template...');
    initializeBrowser();
    updateDisplay();
}

// Browser initialization
function initializeBrowser() {
    const serverHost = window.location.hostname;
    const wsUrl = \`ws://\${serverHost}:3001\`;
    const httpUrl = \`http://\${serverHost}:3001/api/current-paragraph\`;
    
    console.log('Connecting to:', wsUrl);
    
    try {
        ws = new WebSocket(wsUrl);
        connectionType = 'websocket';
        
        ws.onopen = () => {
            console.log('WebSocket connected');
            connectionType = 'websocket-connected';
            updateConnectionStatus();
        };
        
        ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                handleMessage(message);
            } catch (error) {
                console.error('Error parsing message:', error);
            }
        };
        
        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            fallbackToHttp(httpUrl);
        };
        
        ws.onclose = () => {
            console.log('WebSocket closed');
            fallbackToHttp(httpUrl);
        };
    } catch (error) {
        console.error('WebSocket not supported:', error);
        fallbackToHttp(httpUrl);
    }
}

// Handle WebSocket messages
function handleMessage(message) {
    console.log('Received message:', message);
    
    switch (message.type) {
        case 'paragraph:updated':
            if (message.data.paragraphData) {
                currentParagraph = message.data.paragraphData;
            }
            if (message.data.displaySettings) {
                currentDisplaySettings = message.data.displaySettings;
            }
            updateDisplay();
            break;
            
        case 'display:settingsUpdated':
            currentDisplaySettings = message.data;
            updateDisplay();
            break;
            
        case 'paragraph:cleared':
            currentParagraph = null;
            updateDisplay();
            break;
    }
}

// Fallback to HTTP polling
function fallbackToHttp(httpUrl) {
    connectionType = 'http-polling';
    updateConnectionStatus();
    
    // Initial fetch
    fetchCurrentState(httpUrl);
    
    // Poll every second
    pollInterval = setInterval(() => fetchCurrentState(httpUrl), 1000);
}

// Fetch current state via HTTP
async function fetchCurrentState(url) {
    try {
        const response = await fetch(url);
        const data = await response.json();
        
        if (data) {
            if (data.paragraphData) {
                currentParagraph = data.paragraphData;
            } else if (currentParagraph) {
                currentParagraph = null;
            }
            
            if (data.displaySettings) {
                currentDisplaySettings = data.displaySettings;
            }
            
            updateDisplay();
        }
    } catch (error) {
        console.error('Error fetching state:', error);
    }
}

// Update the display
function updateDisplay() {
    const shouldShowContent = currentParagraph && 
        currentDisplaySettings?.enabled && 
        currentDisplaySettings?.showContent;
    
    const shouldShowTitle = currentParagraph && 
        currentDisplaySettings?.enabled && 
        currentDisplaySettings?.showTitle;
    
    const shouldShowDate = currentParagraph && 
        currentDisplaySettings?.enabled && 
        currentDisplaySettings?.showDate;
    
    // Update title
    if (shouldShowTitle && currentParagraph.sermonTitle) {
        sermonTitle.textContent = currentParagraph.sermonTitle;
        sermonTitle.classList.remove('hidden');
    } else {
        sermonTitle.classList.add('hidden');
    }
    
    // Update date
    if (shouldShowDate && currentParagraph.sermonDate) {
        sermonDate.textContent = currentParagraph.sermonDate;
        sermonDate.classList.remove('hidden');
    } else {
        sermonDate.classList.add('hidden');
    }
    
    // Update content
    if (shouldShowContent) {
        renderParagraphContent();
        content.classList.remove('hidden');
    } else {
        content.classList.add('hidden');
    }
    
    // Hide header if nothing to show
    if (!shouldShowTitle && !shouldShowDate) {
        header.classList.add('hidden');
    } else {
        header.classList.remove('hidden');
    }
}

// Render paragraph content
function renderParagraphContent() {
    if (!currentParagraph?.paragraph?.orderedBlockIds) {
        paragraphText.innerHTML = '';
        return;
    }
    
    let html = '';
    currentParagraph.paragraph.orderedBlockIds.forEach(blockId => {
        const block = currentParagraph.paragraph.blocks[blockId];
        if (block && block.text) {
            const className = block.type === 'ed' ? 'editor-comment' : '';
            html += \`<span class="\${className}">\${escapeHtml(block.text)} </span>\`;
        }
    });
    
    paragraphText.innerHTML = html;
    adjustFontSize();
}

// Adjust font size based on content length
function adjustFontSize() {
    const textLength = paragraphText.textContent.length;
    let fontSize;
    
    if (textLength < 30) {
        fontSize = '4rem';
    } else if (textLength < 60) {
        fontSize = '3.5rem';
    } else if (textLength < 120) {
        fontSize = '3rem';
    } else if (textLength < 200) {
        fontSize = '2.5rem';
    } else if (textLength < 300) {
        fontSize = '2rem';
    } else {
        fontSize = '1.5rem';
    }
    
    paragraphText.style.fontSize = fontSize;
}

// Update connection status
function updateConnectionStatus() {
    connectionTypeSpan.textContent = connectionType;
}

// Update connection count
function updateConnectionCount(count) {
    connectionCountSpan.textContent = \`Connections: \${count}\`;
}

// Utility function to escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (ws) {
        ws.close();
    }
    if (pollInterval) {
        clearInterval(pollInterval);
    }
});

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}`;

      // Write files
      await fs.writeFile(path.join(defaultDir, 'index.html'), defaultHtml, 'utf8');
      await fs.writeFile(path.join(defaultDir, 'styles.css'), defaultCss, 'utf8');
      await fs.writeFile(path.join(defaultDir, 'script.js'), defaultJs, 'utf8');
      
      console.log('Created default template in:', defaultDir);
      return true;
    } catch (error) {
      console.error('Error creating default template:', error);
      return false;
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
    setupTemplateHandlers();
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