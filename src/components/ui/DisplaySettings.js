'use client';

import { useState, useEffect } from 'react';
import useSermonStore from '@/stores/sermonStore';
import { FiMonitor, FiEye, FiEyeOff, FiSettings, FiX, FiChevronDown, FiType, FiCalendar, FiFileText } from 'react-icons/fi';

export default function DisplaySettings() {
  const { selectedParagraph, displaySettings, setDisplaySettings, clearSelectedParagraph } = useSermonStore();
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Initialize display settings if not set
  useEffect(() => {
    if (!displaySettings) {
      setDisplaySettings({
        enabled: true,
        showTitle: true,
        showDate: true,
        showContent: true
      });
    }
  }, [displaySettings, setDisplaySettings]);

  const handleToggleSetting = (setting) => {
    const newSettings = {
      ...displaySettings,
      [setting]: !displaySettings[setting]
    };
    setDisplaySettings(newSettings);
    
    // Only send display settings update, don't touch paragraph selection
    if (typeof window !== 'undefined' && window.electronAPI) {
      window.electronAPI.send('display:settingsUpdated', newSettings);
    }
  };

  const handleClearDisplay = () => {
    // Clear the selected paragraph from the store
    clearSelectedParagraph();
    
    // Also send clear signal to display
    if (typeof window !== 'undefined' && window.electronAPI) {
      window.electronAPI.send('paragraph:cleared');
    }
  };

  return (
    <div className="bg-neutral-700 border-t border-gray-600">
      {/* Toggle Header */}
      <div 
        className="flex items-center justify-between px-4 py-2 cursor-pointer hover:bg-neutral-600 transition-colors"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center space-x-3">
          <FiSettings className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-medium text-white">Display Settings</span>
          {selectedParagraph && (
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${
                displaySettings?.enabled && displaySettings?.showContent 
                  ? 'bg-green-400' 
                  : 'bg-gray-500'
              }`}></div>
              <span className="text-xs text-gray-300">
                {displaySettings?.enabled && displaySettings?.showContent ? 'Broadcasting' : 'Disabled'}
              </span>
            </div>
          )}
        </div>
        
        <div className="flex items-center space-x-2">
          {selectedParagraph && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleClearDisplay();
              }}
              className="px-2 py-1 text-xs text-white rounded border-red-500 border hover:bg-red-500 transition-colors flex items-center space-x-1 cursor-pointer"
            >
              <FiX className="w-3 h-3" />
              <span>Clear</span>
            </button>
          )}
          <FiChevronDown className={`w-4 h-4 text-gray-400 transform transition-transform ${
            isCollapsed ? 'rotate-180' : ''
          }`} />
        </div>
      </div>

      {/* Settings Panel */}
      {!isCollapsed && (
        <div className="px-4 py-3 border-t border-gray-600">
          <div className="grid grid-cols-2 gap-4">
            {/* Display Controls */}
            <div>
              <h4 className="text-sm font-medium text-white mb-2 flex items-center space-x-2">
                <FiMonitor className="w-4 h-4" />
                <span>Display Controls</span>
              </h4>
              <div className="space-y-2">
                <label className="flex items-center space-x-2 text-sm">
                  <input
                    type="checkbox"
                    checked={displaySettings?.enabled || false}
                    onChange={() => handleToggleSetting('enabled')}
                    className="rounded"
                  />
                  {displaySettings?.enabled ? (
                    <FiEye className="w-4 h-4 text-green-400" />
                  ) : (
                    <FiEyeOff className="w-4 h-4 text-gray-500" />
                  )}
                  <span className="text-gray-300">Enable Display Output</span>
                </label>
                
                <label className="flex items-center space-x-2 text-sm">
                  <input
                    type="checkbox"
                    checked={displaySettings?.showContent || false}
                    onChange={() => handleToggleSetting('showContent')}
                    disabled={!displaySettings?.enabled}
                    className="rounded"
                  />
                  <FiFileText className={`w-4 h-4 ${!displaySettings?.enabled ? 'text-gray-500' : 'text-blue-400'}`} />
                  <span className={`${!displaySettings?.enabled ? 'text-gray-500' : 'text-gray-300'}`}>
                    Show Paragraph Content
                  </span>
                </label>
              </div>
            </div>

            {/* Header Controls */}
            <div>
              <h4 className="text-sm font-medium text-white mb-2 flex items-center space-x-2">
                <FiType className="w-4 h-4" />
                <span>Header Information</span>
              </h4>
              <div className="space-y-2">
                <label className="flex items-center space-x-2 text-sm">
                  <input
                    type="checkbox"
                    checked={displaySettings?.showTitle || false}
                    onChange={() => handleToggleSetting('showTitle')}
                    disabled={!displaySettings?.enabled}
                    className="rounded"
                  />
                  <FiType className={`w-4 h-4 ${!displaySettings?.enabled ? 'text-gray-500' : 'text-purple-400'}`} />
                  <span className={`${!displaySettings?.enabled ? 'text-gray-500' : 'text-gray-300'}`}>
                    Show Sermon Title
                  </span>
                </label>
                
                <label className="flex items-center space-x-2 text-sm">
                  <input
                    type="checkbox"
                    checked={displaySettings?.showDate || false}
                    onChange={() => handleToggleSetting('showDate')}
                    disabled={!displaySettings?.enabled}
                    className="rounded"
                  />
                  <FiCalendar className={`w-4 h-4 ${!displaySettings?.enabled ? 'text-gray-500' : 'text-yellow-400'}`} />
                  <span className={`${!displaySettings?.enabled ? 'text-gray-500' : 'text-gray-300'}`}>
                    Show Sermon Date
                  </span>
                </label>
              </div>
            </div>
          </div>

          {/* Current Selection Info */}
          {selectedParagraph && (
            <div className="mt-3 pt-3 border-t border-gray-600">
              <h4 className="text-sm font-medium text-white mb-1 flex items-center space-x-2">
                <FiFileText className="w-4 h-4 text-blue-400" />
                <span>Selected Paragraph</span>
              </h4>
              <p className="text-xs text-gray-400">
                {selectedParagraph.sermonTitle} • {selectedParagraph.sermonDate}
              </p>
              <p className="text-xs text-gray-500 mt-1 truncate">
                {selectedParagraph.paragraph?.orderedBlockIds?.slice(0, 3).map(blockId => 
                  selectedParagraph.paragraph.blocks[blockId]?.text
                ).join(' ').substring(0, 100)}...
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}