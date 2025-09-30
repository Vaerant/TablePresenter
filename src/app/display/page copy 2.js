'use client';

import { useState, useEffect } from 'react';
import useSermonStore from '@/stores/sermonStore';

const BlockView = ({ block, blockId }) => {
  return (
    <span
      key={blockId}
      className={`leading-relaxed ${block.type === 'ed' ? 'italic text-gray-400' : 'text-white'}`}
    >
      {block.text}{' '}
    </span>
  );
};

export default function DisplayPage() {
  const [currentParagraph, setCurrentParagraph] = useState(null);
  const [connectionType, setConnectionType] = useState('unknown');
  const [fontSize, setFontSize] = useState('text-4xl');
  const [customFontSize, setCustomFontSize] = useState(null);
  const [fontSizeCalculated, setFontSizeCalculated] = useState(false);
  const { selectedParagraph } = useSermonStore();

  // Calculate optimal font size based on content length and screen size
  useEffect(() => {
    if (!currentParagraph) return;

    // Reset calculation state when new paragraph arrives
    setFontSizeCalculated(false);

    const calculateOptimalFontSize = () => {
      const totalTextLength = currentParagraph.paragraph.orderedBlockIds.reduce((total, blockId) => {
        const block = currentParagraph.paragraph.blocks[blockId];
        return total + (block.text?.length || 0);
      }, 0);

      const screenHeight = window.innerHeight;
      const screenWidth = window.innerWidth;
      const availableHeight = screenHeight - 330; // Reduced header space accounting
      const availableWidth = screenWidth - 64; // Account for padding

      // More accurate character width estimation (varies by font size)
      const getCharWidth = (fontSize) => fontSize * 0.55; // More precise ratio
      const lineHeight = 1.4;
      
      // Binary search for optimal font size
      let minSize = 16;
      let maxSize = 120; // Reduced from 200
      let optimalSize = minSize;
      
      for (let i = 0; i < 20; i++) { // Max 20 iterations
        const testSize = Math.floor((minSize + maxSize) / 2);
        const charWidth = getCharWidth(testSize);
        const charsPerLine = Math.floor(availableWidth / charWidth);
        const estimatedLines = Math.ceil(totalTextLength / charsPerLine);
        const totalHeight = estimatedLines * testSize * lineHeight;
        
        if (totalHeight <= availableHeight) {
          optimalSize = testSize;
          minSize = testSize + 1;
        } else {
          maxSize = testSize - 1;
        }
        
        if (minSize > maxSize) break;
      }

      // Apply safety margin and content-based adjustments
      optimalSize = Math.floor(optimalSize * 0.95); // 5% safety margin
      
      // Content length based fine-tuning
      if (totalTextLength < 30) {
        optimalSize = Math.min(optimalSize * 1.3, 80); // Reduced from 150
      } else if (totalTextLength < 60) {
        optimalSize = Math.min(optimalSize * 1.2, 70); // Reduced from 120
      } else if (totalTextLength < 120) {
        optimalSize = Math.min(optimalSize * 1.1, 60); // Reduced from 100
      }

      // Ensure minimum readable size
      optimalSize = Math.max(18, optimalSize);

      // Use custom font size for more precise control
      if (optimalSize > 72) { // Reduced from 96
        setCustomFontSize(optimalSize);
        setFontSize('custom');
      } else {
        setCustomFontSize(null);
        // Convert to Tailwind classes
        if (optimalSize >= 72) setFontSize('text-8xl'); // Adjusted threshold
        else if (optimalSize >= 60) setFontSize('text-7xl');
        else if (optimalSize >= 48) setFontSize('text-6xl');
        else if (optimalSize >= 36) setFontSize('text-5xl');
        else if (optimalSize >= 30) setFontSize('text-4xl');
        else if (optimalSize >= 24) setFontSize('text-3xl');
        else if (optimalSize >= 20) setFontSize('text-2xl');
        else if (optimalSize >= 18) setFontSize('text-xl');
        else setFontSize('text-lg');
      }
      
      // Mark calculation as complete
      setFontSizeCalculated(true);
    };

    calculateOptimalFontSize();

    // Recalculate on window resize
    const handleResize = () => calculateOptimalFontSize();
    window.addEventListener('resize', handleResize);
    
    return () => window.removeEventListener('resize', handleResize);
  }, [currentParagraph]);

  useEffect(() => {
    let ws = null;
    let pollInterval = null;
    let isElectron = false;

    // Get the current host (works for localhost, IP addresses, etc.)
    const getServerHost = () => {
      if (typeof window !== 'undefined') {
        const hostname = window.location.hostname;
        // If we're on localhost, the server is also on localhost
        // If we're on an IP address, the server is on the same IP
        return hostname;
      }
      return 'localhost';
    };

    const serverHost = getServerHost();
    const wsUrl = `ws://${serverHost}:3001`;
    const httpUrl = `http://${serverHost}:3001/api/current-paragraph`;

    console.log('Server host determined as:', serverHost);
    console.log('WebSocket URL:', wsUrl);
    console.log('HTTP URL:', httpUrl);

    // Check if we're in Electron
    if (typeof window !== 'undefined' && window.electronAPI) {
      isElectron = true;
      setConnectionType('electron');
      console.log('Running in Electron, using IPC...');

      const handleParagraphUpdate = (event, paragraphData) => {
        console.log('Display received paragraph update via IPC:', paragraphData);
        setCurrentParagraph(paragraphData);
      };

      const handleParagraphClear = () => {
        console.log('Display received paragraph clear via IPC');
        setCurrentParagraph(null);
      };

      window.electronAPI.on('paragraph:updated', handleParagraphUpdate);
      window.electronAPI.on('paragraph:cleared', handleParagraphClear);

      // Get current selection on load
      window.electronAPI.paragraph.getCurrentSelection().then((selection) => {
        console.log('Current selection on load:', selection);
        if (selection) {
          setCurrentParagraph(selection);
        }
      }).catch(error => {
        console.error('Error getting current selection:', error);
      });

      return () => {
        if (window.electronAPI && window.electronAPI.off) {
          window.electronAPI.off('paragraph:updated', handleParagraphUpdate);
          window.electronAPI.off('paragraph:cleared', handleParagraphClear);
        }
      };
    } else {
      // We're in a browser, try WebSocket first
      console.log('Running in browser, attempting WebSocket connection...');
      setConnectionType('browser-websocket');

      try {
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          console.log('WebSocket connected to:', wsUrl);
          setConnectionType('browser-websocket-connected');
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            console.log('Received WebSocket message:', message);
            
            if (message.type === 'paragraph:updated') {
              setCurrentParagraph(message.data);
            } else if (message.type === 'paragraph:cleared') {
              setCurrentParagraph(null);
            }
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          setConnectionType('browser-http-fallback');
          setupHttpPolling();
        };

        ws.onclose = () => {
          console.log('WebSocket closed, falling back to HTTP polling');
          setConnectionType('browser-http-fallback');
          setupHttpPolling();
        };
      } catch (error) {
        console.error('WebSocket not supported, using HTTP polling:', error);
        setConnectionType('browser-http-fallback');
        setupHttpPolling();
      }

      // HTTP polling fallback
      const setupHttpPolling = () => {
        console.log('Setting up HTTP polling to:', httpUrl);
        
        // Initial fetch
        fetchCurrentParagraph();
        
        // Poll every 1 second
        pollInterval = setInterval(fetchCurrentParagraph, 1000);
      };

      const fetchCurrentParagraph = async () => {
        try {
          const response = await fetch(httpUrl);
          const data = await response.json();
          
          if (data && JSON.stringify(data) !== JSON.stringify(currentParagraph)) {
            console.log('HTTP poll received update:', data);
            setCurrentParagraph(data);
          }
        } catch (error) {
          console.error('Error fetching current paragraph from', httpUrl, ':', error);
        }
      };

      return () => {
        if (ws) {
          ws.close();
        }
        if (pollInterval) {
          clearInterval(pollInterval);
        }
      };
    }
  }, []);

  // Fallback sync with Zustand store
  useEffect(() => {
    if (selectedParagraph && !currentParagraph) {
      console.log('Syncing from Zustand store:', selectedParagraph);
      setCurrentParagraph(selectedParagraph);
    }
  }, [selectedParagraph, currentParagraph]);

  if (!currentParagraph) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-6xl font-bold mb-4">Sermon Display</h1>
          <p className="text-2xl text-gray-400">Waiting for paragraph selection...</p>
          <p className="text-sm text-gray-600 mt-4">Connection: {connectionType}</p>
          <p className="text-xs text-gray-700 mt-2">Host: {typeof window !== 'undefined' ? window.location.hostname : 'unknown'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col overflow-hidden">
      {/* Header - Minimized height */}
      <div className="flex-shrink-0 py-2 text-center fixed top-0 left-1/2 transform -translate-x-1/2 w-full z-10 mt-10">
        <h1 className="text-xl font-bold text-gray-300 mb-1">
          {currentParagraph.sermonTitle}
        </h1>
        <p className="text-base text-gray-500">
          {currentParagraph.sermonDate}
        </p>
      </div>
      
      {/* Content - Maximum available height with optimized font size */}
      <div className="flex-1 flex items-center justify-center px-8 py-2">
        {fontSizeCalculated ? (
          <div className={`${fontSize === 'custom' ? '' : fontSize} break-words`}
               style={{
                 fontSize: customFontSize ? `${customFontSize}px` : undefined,
                 wordWrap: 'break-word',
                 overflowWrap: 'break-word',
                 lineHeight: '1.4',
                 maxHeight: '100%',
                 overflow: 'hidden',
                 textAlign: 'center',
                 maxWidth: '100%',
                 hyphens: 'auto'
               }}
              >
            {currentParagraph.paragraph.orderedBlockIds.map((blockId) => {
              const block = currentParagraph.paragraph.blocks[blockId];
              return (
                <BlockView 
                  key={blockId}
                  block={block}
                  blockId={blockId}
                />
              );
            })}
          </div>
        ) : (
          <div className="text-white text-xl">Calculating optimal font size...</div>
        )}
      </div>
    </div>
  );
}

