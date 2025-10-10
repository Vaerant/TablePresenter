let currentContent = null;
let currentDisplaySettings = null;
let currentBibleDisplaySettings = null;
let connectionType = 'unknown';
let ws = null;
let pollInterval = null;
let isManualFontSize = false; // Track if font size was manually set
let calculatedFontSize = 3; // Store calculated font size

let defaultBibleDisplaySettings = {
  showDisplay: true,
  showHeader: true,
  verseFontSize: 3,
  headerFontSize: 2,
  verseFontWeight: 400,
  headerFontWeight: 700,
  headerColor: '#ffffff',
  verseColor: '#ffffff',
  verseWidth: 100,
  verseHeight: 100,
  versePositionX: 50,
  versePositionY: 50,
  headerPositionX: 50,
  headerPositionY: 15,
  verseTextAlign: 'center',
  headerTextAlign: 'center',
  isManualFontSize: false
};

currentBibleDisplaySettings = { ...defaultBibleDisplaySettings };

// DOM elements
const bibleReference = document.getElementById('bible-reference');
const verseText = document.getElementById('verse-text');
const connectionStatus = document.getElementById('connection-status');
const connectionTypeSpan = document.getElementById('connection-type');
const connectionCountSpan = document.getElementById('connection-count');
const header = document.getElementById('header');
const content = document.getElementById('content');

// Initialize the display
function initialize() {
    console.log('Initializing Bible template...');
    initializeBrowser();
    updateDisplay();
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
                console.log('---Received paragraph data:', message.data.paragraphData);
                currentContent = message.data.paragraphData;
            }
            updateDisplay();
            renderContent();
            break;
        case 'bible:displaySettingsUpdated':
            const previousSettings = currentBibleDisplaySettings;
            currentBibleDisplaySettings = message.data;
            console.log('Received Bible display settings:', currentBibleDisplaySettings);
            
            // Update manual font size flag from settings
            isManualFontSize = currentBibleDisplaySettings.isManualFontSize || false;
            console.log('Manual font size mode:', isManualFontSize);
            
            applyBibleDisplaySettings();
            updateDisplay();
            renderContent();
            break;
        case 'bible:recalcFontSize':
            console.log('Received recalc font size request');
            isManualFontSize = false; // Reset manual flag
            // Update the settings to reflect auto mode
            if (currentBibleDisplaySettings) {
                currentBibleDisplaySettings.isManualFontSize = false;
            }
            if (currentContent) {
                setTimeout(() => {
                    adjustFontSize();
                }, 10);
            }
            break;
        default:
            console.warn('Unknown message type:', message.type);
            break;
    }
}

// Fallback to HTTP polling
function fallbackToHttp(httpUrl) {
    connectionType = 'http-polling';
    updateConnectionStatus();
    
    fetchCurrentState(httpUrl);
    pollInterval = setInterval(() => fetchCurrentState(httpUrl), 1000);
}

// Fetch current state via HTTP
async function fetchCurrentState(url) {
    try {
        const response = await fetch(url);
        const data = await response.json();
        
        if (data) {
            if (data.paragraphData) {
                currentContent = data.paragraphData;
                console.log('---Fetched paragraph data:', currentContent);
            } else if (currentContent) {
                currentContent = null;
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

// Add helper function to format verse numbers
function formatVerses(verses) {
    if (!verses || verses.length === 0) return '';
    const verseNumbers = verses.map(v => v.verse).sort((a, b) => a - b);
    let ranges = [];
    let start = verseNumbers[0];
    let end = start;
    for (let i = 1; i < verseNumbers.length; i++) {
        if (verseNumbers[i] === end + 1) {
            end = verseNumbers[i];
        } else {
            ranges.push(start === end ? `${start}` : `${start}-${end}`);
            start = verseNumbers[i];
            end = start;
        }
    }
    ranges.push(start === end ? `${start}` : `${start}-${end}`);
    return ranges.join(', ');
}

// Add helper function to parse verse text for red markup
function parseVerseText(text) {
    const parts = [];
    let currentIndex = 0;
    let partKey = 0;

    const regex = /‹([^›]+)›/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
        // Add text before the match
        if (match.index > currentIndex) {
            parts.push(text.substring(currentIndex, match.index));
        }

        // Add the bracketed text in red (without brackets)
        parts.push(`<span style="color: red;">${match[1]}</span>`);

        currentIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (currentIndex < text.length) {
        parts.push(text.substring(currentIndex));
    }

    return parts.join('');
}

// Apply Bible display settings to the template
function applyBibleDisplaySettings() {
    if (!currentBibleDisplaySettings) return;
    
    const settings = currentBibleDisplaySettings;
    
    // Update manual font size flag
    isManualFontSize = settings.isManualFontSize || false;
    
    // Apply header styles and positioning
    if (bibleReference) {
        bibleReference.style.fontSize = settings.headerFontSize + 'rem';
        bibleReference.style.fontWeight = settings.headerFontWeight;
        bibleReference.style.color = settings.headerColor;
        bibleReference.style.textAlign = settings.headerTextAlign;
        
        // Show/hide header
        if (settings.showHeader) {
            bibleReference.classList.remove('hidden');
            header.classList.remove('hidden');
        } else {
            bibleReference.classList.add('hidden');
            header.classList.add('hidden');
        }
    }
    
    // Apply header positioning
    if (header) {
        header.style.position = 'absolute';
        header.style.left = settings.headerPositionX + '%';
        header.style.top = settings.headerPositionY + '%';
        header.style.transform = 'translate(-50%, -50%)';
        header.style.width = 'auto';
        header.style.zIndex = '10';
    }
    
    // Apply verse text styles
    if (verseText) {
        verseText.style.fontWeight = settings.verseFontWeight;
        verseText.style.color = settings.verseColor;
        verseText.style.textAlign = settings.verseTextAlign;
        
        // Set font size based on manual mode
        if (isManualFontSize) {
            verseText.style.fontSize = settings.verseFontSize + 'rem';
        }
    }
    
    // Apply container size and positioning
    if (content) {
        content.style.width = settings.verseWidth + '%';
        content.style.height = settings.verseHeight + '%';
        
        // Position the content based on X and Y settings
        content.style.left = settings.versePositionX + '%';
        content.style.top = settings.versePositionY + '%';
        
        // Force recalculation of font size when size changes (only if not manual)
        if (!isManualFontSize && currentContent) {
            setTimeout(() => {
                adjustFontSize();
            }, 50);
        }
    }
    
    // Show/hide entire display
    const app = document.getElementById('app');
    if (app) {
        if (settings.showDisplay) {
            app.style.display = 'flex';
        } else {
            app.style.display = 'none';
        }
    }
}

// Update the display
function updateDisplay() {
    // Always show/hide elements first, then apply styles
    console.log('Updating display with currentContent:', currentContent);
    if (currentContent) {
        console.log('Updating display with content:', currentContent);
        if (currentContent.type === 'verse') {
            const verseString = formatVerses(currentContent.verses);
            console.log('###Formatted verse string:', verseString);
            if (bibleReference) {
                bibleReference.textContent = `${currentContent.bookName} ${currentContent.chapter}:${verseString}`;
                console.log('Updated bibleReference to:', bibleReference.textContent);
            } else {
                console.warn('bibleReference element not found');
            }
        }
        if (bibleReference && currentBibleDisplaySettings?.showHeader !== false) {
            bibleReference.classList.remove('hidden');
        }
        if (header && currentBibleDisplaySettings?.showHeader !== false) {
            header.classList.remove('hidden');
        }
    } else {
        if (bibleReference) bibleReference.classList.add('hidden');
        if (header) header.classList.add('hidden');
    }
    
    // Apply Bible display settings if available
    if (currentBibleDisplaySettings) {
        applyBibleDisplaySettings();
    }
}

// Render content
function renderContent() {
    if (!currentContent) {
        if (verseText) verseText.innerHTML = '';
        return;
    }
    
    let text = '';
    console.log('123123Rendering content:', currentContent);
    
    if (currentContent.type === 'verse') {
        // Combine all verses into a single text string
        const verseTexts = currentContent.verses.map(verse => {
            return `${verse.verse} ${verse.text}`;
        });
        text = verseTexts.join(' ');
    } else {
        // Combine sermon paragraph blocks into single text
        if (currentContent.paragraph?.orderedBlockIds) {
            const blockTexts = currentContent.paragraph.orderedBlockIds.map(blockId => {
                const block = currentContent.paragraph.blocks[blockId];
                return block && block.text ? block.text : '';
            }).filter(text => text.trim());
            text = blockTexts.join(' ');
        }
    }
    
    if (verseText) {
        verseText.innerHTML = parseVerseText(text);
        console.log(':::Updated verseText content:::', verseText.innerHTML);
    }
    
    // Only auto-calculate font size if not manually set
    if (!isManualFontSize) {
        // Hide text during calculations to prevent jittering
        if (verseText) verseText.style.visibility = 'hidden';
        
        // Use setTimeout to ensure DOM is updated before adjusting font size
        setTimeout(() => {
            adjustFontSize();
        }, 10);
    } else {
        // Just make sure it's visible if manual font size
        if (verseText) verseText.style.visibility = 'visible';
    }
}

// Adjust font size based on overflow detection only
function adjustFontSize() {
  if (!verseText || !verseText.textContent.trim()) return;

  let min = 0.5;
  let max = 5;
  let current = min;
  const tolerance = 0.01;

  // Reset style first
  verseText.style.visibility = 'visible';
  verseText.style.fontSize = current + 'rem';

  const fits = () => {
    verseText.style.fontSize = current + 'rem';
    verseText.offsetHeight; // force reflow
    const verseRect = verseText.getBoundingClientRect();
    const containerRect = content.getBoundingClientRect();
    return (
      verseRect.width <= containerRect.width * 0.98 &&
      verseRect.height <= containerRect.height * 0.98
    );
  };

  // Binary search for best fit
  while (max - min > tolerance) {
    current = (min + max) / 2;
    if (fits()) {
      min = current; // can still grow
    } else {
      max = current; // too big, shrink
    }
  }

  verseText.style.fontSize = min + 'rem';
  calculatedFontSize = min;
  console.log(`✅ Max fit font size: ${min.toFixed(2)}rem`);
  sendFontSizeFeedback(min);
}

// Send calculated font size back to control panel
function sendFontSizeFeedback(fontSize) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        const message = JSON.stringify({
            type: 'bible:fontSizeFeedback',
            data: {
                calculatedFontSize: fontSize,
                isManual: isManualFontSize
            }
        });
        ws.send(message);
    }
}

// Update connection status
function updateConnectionStatus() {
    if (connectionTypeSpan) {
        connectionTypeSpan.textContent = connectionType;
    } else {
        console.warn('connectionTypeSpan element not found');
    }
}

// Update connection count
function updateConnectionCount(count) {
    if (connectionCountSpan) {
        connectionCountSpan.textContent = `Connections: ${count}`;
    } else {
        console.warn('connectionCountSpan element not found');
    }
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

// Handle window resize to recalculate font size
window.addEventListener('resize', () => {
    // Debounce resize events
    clearTimeout(window.resizeTimeout);
    window.resizeTimeout = setTimeout(() => {
        if (currentContent && currentBibleDisplaySettings?.showDisplay && !isManualFontSize) {
            adjustFontSize();
        }
    }, 150);
});

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}