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
        getSermonBlocks: (sermonUid) => ipcRenderer.invoke('db:getSermonBlocks', sermonUid),
        searchText: (query, limit) => ipcRenderer.invoke('db:searchText', query, limit),
        searchByBlockType: (query, blockType, limit) => ipcRenderer.invoke('db:searchByBlockType', query, blockType, limit),
        searchSermons: (filters) => ipcRenderer.invoke('db:searchSermons', filters),
        getSermonStats: (uid) => ipcRenderer.invoke('db:getSermonStats', uid),
        getParagraphBlocks: (paragraphUid) => ipcRenderer.invoke('db:getParagraphBlocks', paragraphUid),
        getBlockContext: (sermonUid, blockUid) => ipcRenderer.invoke('db:getBlockContext', sermonUid, blockUid),
        getSermonSections: (sermonUid) => ipcRenderer.invoke('db:getSermonSections', sermonUid),
        getSectionParagraphs: (sectionUid) => ipcRenderer.invoke('db:getSectionParagraphs', sectionUid)
    },

    // Bible API
    bible: {
        getAllBooks: () => ipcRenderer.invoke('bible:getAllBooks'),
        searchVerses: (query, limit) => ipcRenderer.invoke('bible:searchVerses', query, limit),
        searchByBook: (query, bookId, limit) => ipcRenderer.invoke('bible:searchByBook', query, bookId, limit),
        getChapter: (bookId, chapter) => ipcRenderer.invoke('bible:getChapter', bookId, chapter),
        getVerse: (bookId, chapter, verse) => ipcRenderer.invoke('bible:getVerse', bookId, chapter, verse)
    },

    // Paragraph selection API
    paragraph: {
        getCurrentSelection: () => ipcRenderer.invoke('paragraph:getCurrentSelection')
    },

    // System information API
    system: {
        getNetworkInfo: () => ipcRenderer.invoke('system:getNetworkInfo'),
        getConnectionCount: () => ipcRenderer.invoke('system:getConnectionCount'),
        openExternal: (url) => ipcRenderer.invoke('system:openExternal', url)
    },

    // Template API
    template: {
        checkTemplate: (stage) => ipcRenderer.invoke('template:checkTemplate', stage),
        getTemplate: (stage) => ipcRenderer.invoke('template:getTemplate', stage),
        listTemplates: () => ipcRenderer.invoke('template:listTemplates'),
        createDefault: () => ipcRenderer.invoke('template:createDefault')
    }
});