const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
    on: (channel, callback) => {
        ipcRenderer.on(channel, callback);
    },
    off: (channel, callback) => {
        ipcRenderer.removeListener(channel, callback);
    },
    send: (channel, args) => {
        ipcRenderer.send(channel, args);
    },

    // Database API
    database: {
        getAllSermons: () => ipcRenderer.invoke('db:getAllSermons'),
        getSermon: (uid) => ipcRenderer.invoke('db:getSermon', uid),
        startSermonStream: (uid, options = {}) => ipcRenderer.invoke('db:startSermonStream', uid, options),
        cancelSermonStream: (requestId) => ipcRenderer.invoke('db:cancelSermonStream', requestId),
        search: (query, limit, type = 'phrase', sermonUid = null, page = 1) => ipcRenderer.invoke('db:searchSermons', query, limit, type, sermonUid, page),
    },

    // Bible API
    bible: {
        getAllBooks: () => ipcRenderer.invoke('bible:getAllBooks'),
        searchVerses: (query, limit) => ipcRenderer.invoke('bible:searchVerses', query, limit),
        searchByBook: (query, bookId, limit) => ipcRenderer.invoke('bible:searchByBook', query, bookId, limit),
        getChapter: (bookId, chapter) => ipcRenderer.invoke('bible:getChapter', bookId, chapter),
        getVerse: (bookId, chapter, verse) => ipcRenderer.invoke('bible:getVerse', bookId, chapter, verse),
        getBook: (bookId) => ipcRenderer.invoke('bible:getBook', bookId)
    },

    // System information API
    system: {
        getNetworkInfo: () => ipcRenderer.invoke('system:getNetworkInfo'),
        getConnectionCount: () => ipcRenderer.invoke('system:getConnectionCount'),
        openExternal: (url) => ipcRenderer.invoke('system:openExternal', url),
        
        // Screen management
        getAllScreens: () => ipcRenderer.invoke('system:getAllScreens'),
        getScreen: (id) => ipcRenderer.invoke('system:getScreen', id),
        createScreen: (screenData) => ipcRenderer.invoke('system:createScreen', screenData),
        updateScreen: (id, screenData) => ipcRenderer.invoke('system:updateScreen', id, screenData),
        deleteScreen: (id) => ipcRenderer.invoke('system:deleteScreen', id),
        
        // Screen space management
        getScreenSpaces: (screenId) => ipcRenderer.invoke('system:getScreenSpaces', screenId),
        createScreenSpace: (spaceData) => ipcRenderer.invoke('system:createScreenSpace', spaceData),
        updateScreenSpace: (id, spaceData) => ipcRenderer.invoke('system:updateScreenSpace', id, spaceData),
        deleteScreenSpace: (id) => ipcRenderer.invoke('system:deleteScreenSpace', id),
        updateScreenSpaceSettings: (spaceId, settings) => ipcRenderer.invoke('system:updateScreenSpaceSettings', spaceId, settings)
    },

    // Window controls for custom title bar
    windowControls: {
        minimize: () => ipcRenderer.invoke('window:minimize'),
        toggleMaximize: () => ipcRenderer.invoke('window:toggleMaximize'),
        isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
        close: () => ipcRenderer.invoke('window:close'),
        onMaximizeChanged: (callback) => {
            const listener = (_event, isMaximized) => callback(isMaximized);
            ipcRenderer.on('window:maximize-changed', listener);
            return () => ipcRenderer.removeListener('window:maximize-changed', listener);
        }
    },

    // Template API
    template: {
        checkTemplate: (stage) => ipcRenderer.invoke('template:checkTemplate', stage),
        getTemplate: (stage) => ipcRenderer.invoke('template:getTemplate', stage),
        listTemplates: () => ipcRenderer.invoke('template:listTemplates'),
        createDefault: () => ipcRenderer.invoke('template:createDefault')
    },
});