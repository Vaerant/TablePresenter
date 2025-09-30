'use client';

import { useState, useEffect } from 'react';
import { FiMonitor, FiGlobe, FiServer, FiCpu, FiClock, FiExternalLink, FiUsers } from 'react-icons/fi';

export default function StatusBar() {
  const [networkInfo, setNetworkInfo] = useState(null);
  const [isElectron, setIsElectron] = useState(false);
  const [activeConnections, setActiveConnections] = useState(0);

  useEffect(() => {
    // Check if running in Electron
    const checkElectron = typeof window !== 'undefined' && window.electronAPI;
    setIsElectron(checkElectron);

    // Get network information
    const fetchNetworkInfo = async () => {
      if (checkElectron && window.electronAPI.system) {
        try {
          const info = await window.electronAPI.system.getNetworkInfo();
          console.log('Network info fetched:', info); // Debug log
          setNetworkInfo(info);
          setActiveConnections(info.activeConnections || 0);
        } catch (error) {
          console.error('Error fetching network info:', error);
        }
      }
    };

    fetchNetworkInfo();

    // Listen for connection count updates
    if (checkElectron) {
      const handleConnectionUpdate = (event, count) => {
        console.log('Connection count updated:', count); // Debug log
        setActiveConnections(count);
      };

      window.electronAPI.on('connections:updated', handleConnectionUpdate);

      // Update every 30 seconds for other info
      const interval = setInterval(fetchNetworkInfo, 30000);
      
      return () => {
        clearInterval(interval);
        if (window.electronAPI.off) {
          window.electronAPI.off('connections:updated', handleConnectionUpdate);
        }
      };
    }
  }, []);

  const formatUptime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hours}h ${minutes}m ${secs}s`;
  };

  const formatMemory = (bytes) => {
    const gb = bytes / (1024 * 1024 * 1024);
    return `${gb.toFixed(1)}GB`;
  };

  const handleUrlClick = (url, event) => {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      
      if (isElectron && window.electronAPI && window.electronAPI.system) {
        // In Electron, open in default browser
        window.electronAPI.system.openExternal(url);
      } else {
        // In browser, open in new tab
        window.open(url, '_blank');
      }
    }
  };

  if (!isElectron) {
    return (
      <div className="bg-neutral-800 text-gray-300 text-xs px-4 py-2 border-t border-gray-700 h-[40px]">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <FiGlobe className="w-3 h-3" />
            <span>Running in browser</span>
          </div>
          <div className="flex items-center space-x-1">
            <FiExternalLink className="w-3 h-3" />
            <span 
              className="font-mono cursor-pointer hover:text-blue-400 transition-colors"
              onClick={(e) => handleUrlClick('http://localhost:3000/display', e)}
              title="Ctrl+click to open in new tab"
            >
              localhost:3000/display
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-neutral-800 text-gray-300 text-xs px-4 py-2 border-t border-gray-700">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-2">
            <FiMonitor className="w-3 h-3 text-green-400" />
            <span className="font-medium text-white">Display Access:</span>
            <div className="flex items-center space-x-1">
              <FiExternalLink className="w-3 h-3" />
              <span 
                className="text-green-400 font-mono cursor-pointer hover:text-green-300 transition-colors"
                onClick={(e) => handleUrlClick('http://localhost:3000/display', e)}
                title="Ctrl+click to open in browser"
              >
                localhost:3000/display
              </span>
            </div>
            {networkInfo?.networkIP && networkInfo.networkIP !== 'localhost' && (
              <>
                <span className="text-gray-500">|</span>
                <div className="flex items-center space-x-1">
                  <FiGlobe className="w-3 h-3 text-blue-400" />
                  <span 
                    className="text-blue-400 font-mono cursor-pointer hover:text-blue-300 transition-colors"
                    onClick={(e) => handleUrlClick(`http://${networkInfo.networkIP}:3000/display`, e)}
                    title="Ctrl+click to open in browser"
                  >
                    {networkInfo.networkIP}:3000/display
                  </span>
                </div>
                <span className="text-yellow-400">(Network)</span>
              </>
            )}
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 text-xs">
              <FiServer className="w-3 h-3 text-gray-500" />
              <span className="text-gray-500">WebSocket:</span>
              <span className="text-gray-400 font-mono">localhost:3001</span>
              {networkInfo?.networkIP && networkInfo.networkIP !== 'localhost' && (
                <span className="text-gray-400 font-mono">{networkInfo.networkIP}:3001</span>
              )}
            </div>
            
            <div className="flex items-center space-x-2">
              <FiUsers className={`w-3 h-3 ${activeConnections > 0 ? 'text-green-400' : 'text-gray-500'}`} />
              <span className="text-gray-500">Connections:</span>
              <span className={`font-mono ${activeConnections > 0 ? 'text-green-400' : 'text-gray-400'}`}>
                {activeConnections}
              </span>
            </div>
          </div>
          
          {networkInfo?.hostname && (
            <div className="flex items-center space-x-1">
              <FiServer className="w-3 h-3 text-gray-400" />
              <span className="text-gray-400">Host:</span>
              <span className="text-gray-300">{networkInfo.hostname}</span>
            </div>
          )}
        </div>
        
        <div className="flex items-center space-x-4">
          {networkInfo?.platform && (
            <div className="flex items-center space-x-1">
              <FiCpu className="w-3 h-3 text-gray-400" />
              <span className="text-gray-400">{networkInfo.platform}</span>
            </div>
          )}
          {networkInfo?.uptime && (
            <div className="flex items-center space-x-1">
              <FiClock className="w-3 h-3 text-gray-400" />
              <span className="text-gray-400">Up: {formatUptime(networkInfo.uptime)}</span>
            </div>
          )}
          {networkInfo?.freeMemory && networkInfo?.totalMemory && (
            <span className="text-gray-400">
              RAM: {formatMemory(networkInfo.totalMemory - networkInfo.freeMemory)}/{formatMemory(networkInfo.totalMemory)}
            </span>
          )}
          <span className="text-gray-500">|</span>
          <span className="text-gray-400">v1.0.0</span>
        </div>
      </div>
    </div>
  );
}