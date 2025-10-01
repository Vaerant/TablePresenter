let currentParagraph = null;
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
    console.log('Initializing custom display template...');
    
    // Check if we're in Electron
    if (typeof window !== 'undefined' && window.electronAPI) {
        initializeElectron();
    } else {
        initializeBrowser();
    }
    
    updateDisplay();
}

// Electron initialization
function initializeElectron() {
    connectionType = 'electron';
    updateConnectionStatus();
    
    // Set up Electron IPC listeners
    window.electronAPI.on('paragraph:updated', (event, data) => {
        console.log('Received paragraph update:', data);
        if (data.paragraphData) {
            currentParagraph = data.paragraphData;
        }
        if (data.displaySettings) {
            currentDisplaySettings = data.displaySettings;
        }
        updateDisplay();
    });
    
    window.electronAPI.on('display:settingsUpdated', (event, settings) => {
        console.log('Received settings update:', settings);
        currentDisplaySettings = settings;
        updateDisplay();
    });
    
    window.electronAPI.on('paragraph:cleared', () => {
        console.log('Paragraph cleared');
        currentParagraph = null;
        updateDisplay();
    });
    
    window.electronAPI.on('connections:updated', (event, count) => {
        updateConnectionCount(count);
    });
    
    // Get current selection
    window.electronAPI.paragraph.getCurrentSelection()
        .then((selection) => {
            if (selection) {
                currentParagraph = selection.paragraphData;
                currentDisplaySettings = selection.displaySettings;
                updateDisplay();
            }
        })
        .catch(console.error);
}

// Browser initialization
function initializeBrowser() {
    const serverHost = window.location.hostname;
    const wsUrl = `ws://${serverHost}:3001`;
    const httpUrl = `http://${serverHost}:3001/api/current-paragraph`;
    
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
            html += `<span class="${className}">${escapeHtml(block.text)} </span>`;
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
    connectionCountSpan.textContent = `Connections: ${count}`;
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
}
