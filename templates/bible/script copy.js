let currentContent = null;
let currentDisplaySettings = null;
let connectionType = 'unknown';
let ws = null;
let pollInterval = null;
let isManualFontSize = false; // Track if font size was manually set
let calculatedFontSize = 3; // Store calculated font size

let currentBibleDisplaySettings = {
  showDisplay: true,
  showHeader: true,
  verseFontSize: 3,
  headerFontSize: 2,
  verseFontWeight: 400,
  headerFontWeight: 700,
  headerColor: '#ffffff',
  verseColor: '#ffffff',
  verseWidth: 100,
  verseHeight: 100
};

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
                currentContent = message.data.paragraphData;
            }
            if (message.data.displaySettings) {
                currentDisplaySettings = message.data.displaySettings;
            }
            updateDisplay();
            break;
            
        case 'verse:updated':
            if (message.data.paragraphData) {
                currentContent = message.data.paragraphData;
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
            currentContent = null;
            updateDisplay();
            break;
            
        case 'verse:cleared':
            currentContent = null;
            updateDisplay();
            break;
            
        case 'bible:displaySettingsUpdated':
            const oldFontSize = currentBibleDisplaySettings.verseFontSize;
            const oldWidth = currentBibleDisplaySettings.verseWidth;
            const oldHeight = currentBibleDisplaySettings.verseHeight;
            
            currentBibleDisplaySettings = { ...currentBibleDisplaySettings, ...message.data };
            
            // Check if font size was manually changed
            if (message.data.verseFontSize && message.data.verseFontSize !== oldFontSize) {
                isManualFontSize = true;
                console.log('Manual font size change detected:', message.data.verseFontSize);
            }
            
            // Check if width or height changed - trigger recalculation and reset manual font size
            if ((message.data.verseWidth !== undefined && message.data.verseWidth !== oldWidth) || 
                (message.data.verseHeight !== undefined && message.data.verseHeight !== oldHeight)) {
                isManualFontSize = false; // Reset to auto-calculation when dimensions change
                console.log('Viewport dimensions changed, recalculating font size');
                
                // Trigger font size recalculation after applying new dimensions
                setTimeout(() => {
                    if (currentContent && !isManualFontSize) {
                        adjustFontSize();
                    }
                }, 50); // Small delay to ensure styles are applied
            }
            
            console.log('Updated Bible display settings:', currentBibleDisplaySettings);
            updateDisplay();
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

// Update the display
function updateDisplay() {
    const shouldShowContent = currentContent && 
        currentDisplaySettings?.enabled && 
        currentDisplaySettings?.showContent &&
        currentBibleDisplaySettings?.showDisplay;
    
    const shouldShowTitle = currentContent && 
        currentDisplaySettings?.enabled && 
        currentDisplaySettings?.showTitle &&
        currentBibleDisplaySettings?.showHeader;
    
    // Always show/hide elements first, then apply styles
    if (shouldShowTitle && currentContent) {
        if (currentContent.type === 'verse') {
            const verseString = formatVerses(currentContent.verses);
            bibleReference.textContent = `${currentContent.bookName} ${currentContent.chapter}:${verseString}`;
        } else {
            bibleReference.textContent = currentContent.sermonTitle || '';
        }
        bibleReference.classList.remove('hidden');
        header.classList.remove('hidden');
    } else {
        bibleReference.classList.add('hidden');
        header.classList.add('hidden');
    }
    
    // Update content
    if (shouldShowContent) {
        renderContent();
        content.classList.remove('hidden');
    } else {
        content.classList.add('hidden');
    }
    
    // Apply dynamic styles after visibility is set
    applyDynamicStyles();
}

// Apply dynamic styles based on settings
function applyDynamicStyles() {
    // Header styles
    bibleReference.style.fontSize = `${currentBibleDisplaySettings.headerFontSize}rem`;
    bibleReference.style.fontWeight = currentBibleDisplaySettings.headerFontWeight;
    bibleReference.style.color = currentBibleDisplaySettings.headerColor;
    
    // Verse styles - apply manual font size if set, otherwise use calculated
    const fontSizeToUse = isManualFontSize ? currentBibleDisplaySettings.verseFontSize : calculatedFontSize;
    verseText.style.fontSize = `${fontSizeToUse}rem`;
    verseText.style.fontWeight = currentBibleDisplaySettings.verseFontWeight;
    verseText.style.color = currentBibleDisplaySettings.verseColor;
    
    // Apply viewport dimensions to content container
    content.style.width = `${currentBibleDisplaySettings.verseWidth}%`;
    content.style.maxHeight = `${currentBibleDisplaySettings.verseHeight}vh`;
    content.style.height = `${currentBibleDisplaySettings.verseHeight}vh`;
    
    // Center the content container
    content.style.margin = '0 auto';
    
    // Make sure overflow on the content container is hidden so it never snaps bigger
    content.style.overflow = 'hidden';
    
    console.log(`Applied font size: ${fontSizeToUse}rem (manual: ${isManualFontSize})`);
    console.log(`Applied viewport: ${currentBibleDisplaySettings.verseWidth}% x ${currentBibleDisplaySettings.verseHeight}vh`);
}

// Render content
function renderContent() {
    if (!currentContent) {
        verseText.innerHTML = '';
        return;
    }
    
    let text = '';
    console.log('Rendering content:', currentContent);
    
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
    
    verseText.textContent = text;
    
    // Only auto-calculate font size if not manually set
    if (!isManualFontSize) {
        // Hide text during calculations to prevent jittering
        verseText.style.visibility = 'hidden';
        
        // Use setTimeout to ensure DOM is updated before adjusting font size
        setTimeout(() => {
            adjustFontSize();
        }, 10);
    } else {
        // Just make sure it's visible if manual font size
        verseText.style.visibility = 'visible';
    }
}

/** 
 * Find best-fit font size via binary search 
 * el: the <div> or <p> containing text 
 * minSize, maxSize in rem 
 * maxWidth, maxHeight in px 
 */
function autoSizeBinary(el, minSize, maxSize, maxWidth, maxHeight, precision = 0.1) {
  let low = minSize, high = maxSize, mid;
  const testOverflow = (size) => {
    el.style.fontSize = size + 'rem';
    // force reflow
    const ow = el.scrollWidth > maxWidth;
    const oh = el.scrollHeight > maxHeight;
    return ow || oh;
  };

  while (high - low > precision) {
    mid = (low + high) / 2;
    if (testOverflow(mid)) {
      high = mid;  // too big
    } else {
      low = mid;   // fits, try bigger
    }
  }

  const finalSize = Math.max(minSize, low);
  el.style.fontSize = finalSize + 'rem';
  return finalSize;
}

// Adjust font size based on overflow detection only
function adjustFontSize() {
    if (!verseText.textContent.trim()) {
        verseText.style.visibility = 'visible';
        return;
    }

    // compute fixed max dims from the viewport, not the current container size
    const { width: maxWidth, height: maxHeight } = content.getBoundingClientRect();

    let currentSize = 4;   // start large
    const minSize = 0.5;
    const step = 0.1;

    // shrink until it fits within the viewport‐based box
    while (currentSize > minSize) {
        verseText.style.fontSize = currentSize + 'rem';
        // force reflow
        verseText.offsetWidth;
        verseText.offsetHeight;

        const hasOverflow = 
           verseText.scrollWidth  > maxWidth  ||
           verseText.scrollHeight > maxHeight;

        console.log(
          `Testing ${currentSize}rem: text ` +
          `${verseText.scrollWidth}x${verseText.scrollHeight}, ` +
          `viewport-box ${maxWidth}x${maxHeight}, overflow: ${hasOverflow}`
        );

        if (!hasOverflow) break;
        currentSize -= step;
    }

    const finalSize = Math.max(minSize, currentSize);
    calculatedFontSize = finalSize;
    sendFontSizeFeedback(finalSize);
    verseText.style.fontSize = finalSize + 'rem';
    verseText.style.visibility = 'visible';
    console.log(`Final font size: ${finalSize}rem`);
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

// Handle window resize to recalculate font size
window.addEventListener('resize', () => {
    // Debounce resize events
    clearTimeout(window.resizeTimeout);
    window.resizeTimeout = setTimeout(() => {
        if (currentContent && currentDisplaySettings?.enabled && currentDisplaySettings?.showContent && !isManualFontSize) {
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