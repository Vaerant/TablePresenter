const { app, BrowserWindow } = require('electron');
const path = require('path');
// const isDev = process.env.NODE_ENV === 'development';
const isDev = true;

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
  });

  // Load Next.js app
  if (isDev) {
    win.loadURL('http://localhost:3000/sermons');
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, '../out/index.html'));
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
