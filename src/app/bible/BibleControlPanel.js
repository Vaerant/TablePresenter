'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import useSermonStore from '@/stores/sermonStore';

export default function BibleControlPanel() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [calculatedFontSize, setCalculatedFontSize] = useState(null);
  const [isManualFontSize, setIsManualFontSize] = useState(false);
  
  // Debounce refs
  const debounceTimeoutRef = useRef(null);
  const lastSentSettingsRef = useRef(null);
  
  const { 
    selectedVerses, 
    clearSelectedVerses, 
    bibleDisplaySettings, 
    setBibleDisplaySettings,
    resetBibleDisplaySettings
  } = useSermonStore();

  // Listen for font size feedback from templates
  useEffect(() => {
    if (typeof window !== 'undefined' && window.electronAPI) {
      const handleFontSizeFeedback = (event, data) => {
        setCalculatedFontSize(data.calculatedFontSize);
        setIsManualFontSize(data.isManual);
      };

      window.electronAPI.on('bible:fontSizeFeedback', handleFontSizeFeedback);

      return () => {
        if (window.electronAPI.off) {
          window.electronAPI.off('bible:fontSizeFeedback', handleFontSizeFeedback);
        }
      };
    }
  }, []);

  // Debounced setting change function
  const debouncedSettingChange = useCallback((settings) => {
    // Clear existing timeout
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    
    // Set new timeout
    debounceTimeoutRef.current = setTimeout(() => {
      // Only send if settings actually changed
      const settingsString = JSON.stringify(settings);
      if (lastSentSettingsRef.current !== settingsString) {
        lastSentSettingsRef.current = settingsString;
        
        if (typeof window !== 'undefined' && window.electronAPI) {
          window.electronAPI.send('bible:displaySettingsUpdated', settings);
        }
      }
    }, 50); // 50ms debounce delay
  }, []);

  const handleSettingChange = (key, value) => {
    const newSettings = { ...bibleDisplaySettings, [key]: value };
    setBibleDisplaySettings(newSettings);
    
    // Use debounced function for sending to Electron
    debouncedSettingChange(newSettings);
  };

  const handleClearSelection = () => {
    clearSelectedVerses();
    
    // Send clear message to display
    if (typeof window !== 'undefined' && window.electronAPI) {
      window.electronAPI.send('verse:cleared');
    }
  };

  const handleResetSettings = () => {
    const defaultSettings = resetBibleDisplaySettings();
    
    // Send reset settings to display
    if (typeof window !== 'undefined' && window.electronAPI) {
      window.electronAPI.send('bible:displaySettingsUpdated', defaultSettings);
    }
  };

  const handleRecalcFontSize = () => {
    // Send recalculate trigger to display
    if (typeof window !== 'undefined' && window.electronAPI) {
      window.electronAPI.send('bible:recalcFontSize');
    }
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="bg-neutral-800 border-t border-neutral-700 overflow-y-auto">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-3 py-2 bg-neutral-700 hover:bg-neutral-600 text-white text-sm flex items-center justify-between transition-colors"
      >
        <span>Bible Display Controls</span>
        <span className="transition-transform duration-200" style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
          ▶
        </span>
      </button>
      
      {isExpanded && (
        <div className="p-4 space-y-4">
          {/* Selection Controls */}
          <div className="space-y-2">
            <button
              onClick={handleClearSelection}
              disabled={selectedVerses.length === 0}
              className="w-full px-3 py-2 bg-red-600 hover:bg-red-700 disabled:bg-neutral-600 disabled:text-neutral-400 text-white rounded text-sm"
            >
              Clear Verse Selection ({selectedVerses.length})
            </button>
            
            <button
              onClick={() => handleSettingChange('showDisplay', !bibleDisplaySettings.showDisplay)}
              className={`w-full px-3 py-2 rounded text-sm ${
                bibleDisplaySettings.showDisplay 
                  ? 'bg-green-600 hover:bg-green-700 text-white' 
                  : 'bg-neutral-600 hover:bg-neutral-700 text-white'
              }`}
            >
              {bibleDisplaySettings.showDisplay ? 'Hide Display' : 'Show Display'}
            </button>
            
            <button
              onClick={() => handleSettingChange('showHeader', !bibleDisplaySettings.showHeader)}
              className={`w-full px-3 py-2 rounded text-sm ${
                bibleDisplaySettings.showHeader 
                  ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                  : 'bg-neutral-600 hover:bg-neutral-700 text-white'
              }`}
            >
              {bibleDisplaySettings.showHeader ? 'Hide Header' : 'Show Header'}
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleResetSettings}
                className="px-3 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded text-sm"
              >
                Reset All Settings
              </button>
              
              <button
                onClick={handleRecalcFontSize}
                className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded text-sm"
              >
                Recalc Font Size
              </button>
            </div>
          </div>

          {/* Font Size Controls with Toggle */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-white text-sm">Font Size Mode</label>
              <div className="flex items-center gap-2">
                <span className={`text-xs ${!bibleDisplaySettings.isManualFontSize ? 'text-green-400' : 'text-gray-400'}`}>
                  Auto
                </span>
                <button
                  onClick={() => handleSettingChange('isManualFontSize', !bibleDisplaySettings.isManualFontSize)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    bibleDisplaySettings.isManualFontSize ? 'bg-blue-600' : 'bg-gray-600'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      bibleDisplaySettings.isManualFontSize ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
                <span className={`text-xs ${bibleDisplaySettings.isManualFontSize ? 'text-blue-400' : 'text-gray-400'}`}>
                  Manual
                </span>
              </div>
            </div>
            
            {calculatedFontSize !== null && (
              <div className="text-xs text-gray-400">
                Calculated: {calculatedFontSize.toFixed(2)}rem
              </div>
            )}
          </div>

          {/* Manual Font Size Controls - Only show when manual mode is enabled */}
          {bibleDisplaySettings.isManualFontSize && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-white text-xs mb-1">Verse Font Size</label>
                <input
                  type="number"
                  min="0.5"
                  max="8"
                  step="0.1"
                  value={bibleDisplaySettings.verseFontSize}
                  onChange={(e) => handleSettingChange('verseFontSize', parseFloat(e.target.value))}
                  className="w-full px-2 py-1 bg-neutral-700 text-white rounded text-sm"
                />
              </div>
              
              <div>
                <label className="block text-white text-xs mb-1">Header Font Size</label>
                <input
                  type="number"
                  min="0.5"
                  max="4"
                  step="0.1"
                  value={bibleDisplaySettings.headerFontSize}
                  onChange={(e) => handleSettingChange('headerFontSize', parseFloat(e.target.value))}
                  className="w-full px-2 py-1 bg-neutral-700 text-white rounded text-sm"
                />
              </div>
            </div>
          )}

          {/* Header Font Size - Always show since it's not auto-calculated */}
          {!bibleDisplaySettings.isManualFontSize && (
            <div>
              <label className="block text-white text-xs mb-1">Header Font Size</label>
              <input
                type="number"
                min="0.5"
                max="4"
                step="0.1"
                value={bibleDisplaySettings.headerFontSize}
                onChange={(e) => handleSettingChange('headerFontSize', parseFloat(e.target.value))}
                className="w-full px-2 py-1 bg-neutral-700 text-white rounded text-sm"
              />
            </div>
          )}

          {/* Font Weight Controls */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-white text-xs mb-1">Verse Font Weight</label>
              <input
                type="number"
                min="100"
                max="900"
                step="100"
                value={bibleDisplaySettings.verseFontWeight}
                onChange={(e) => handleSettingChange('verseFontWeight', parseInt(e.target.value))}
                className="w-full px-2 py-1 bg-neutral-700 text-white rounded text-sm"
              />
            </div>
            
            <div>
              <label className="block text-white text-xs mb-1">Header Font Weight</label>
              <input
                type="number"
                min="100"
                max="900"
                step="100"
                value={bibleDisplaySettings.headerFontWeight}
                onChange={(e) => handleSettingChange('headerFontWeight', parseInt(e.target.value))}
                className="w-full px-2 py-1 bg-neutral-700 text-white rounded text-sm"
              />
            </div>
          </div>

          {/* Color Controls */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-white text-xs mb-1">Header Color</label>
              <input
                type="color"
                value={bibleDisplaySettings.headerColor}
                onChange={(e) => handleSettingChange('headerColor', e.target.value)}
                className="w-full h-8 bg-neutral-700 rounded cursor-pointer"
              />
            </div>
            
            <div>
              <label className="block text-white text-xs mb-1">Verse Color</label>
              <input
                type="color"
                value={bibleDisplaySettings.verseColor}
                onChange={(e) => handleSettingChange('verseColor', e.target.value)}
                className="w-full h-8 bg-neutral-700 rounded cursor-pointer"
              />
            </div>
          </div>

          {/* Width and Height Sliders */}
          <div className="space-y-3">
            <div>
              <label className="block text-white text-xs mb-1">
                Viewport Width: {bibleDisplaySettings.verseWidth}%
              </label>
              <input
                type="range"
                min="20"
                max="100"
                value={bibleDisplaySettings.verseWidth}
                onChange={(e) => handleSettingChange('verseWidth', parseInt(e.target.value))}
                className="w-full"
              />
            </div>
            
            <div>
              <label className="block text-white text-xs mb-1">
                Viewport Height: {bibleDisplaySettings.verseHeight}%
              </label>
              <input
                type="range"
                min="20"
                max="100"
                value={bibleDisplaySettings.verseHeight}
                onChange={(e) => handleSettingChange('verseHeight', parseInt(e.target.value))}
                className="w-full"
              />
            </div>
          </div>

          {/* Position Controls */}
          <div className="space-y-3">
            <div className="text-white text-sm font-medium">Content Position</div>
            <div>
              <label className="block text-white text-xs mb-1">
                X Position: {bibleDisplaySettings.versePositionX}%
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={bibleDisplaySettings.versePositionX}
                onChange={(e) => handleSettingChange('versePositionX', parseInt(e.target.value))}
                className="w-full"
              />
            </div>
            
            <div>
              <label className="block text-white text-xs mb-1">
                Y Position: {bibleDisplaySettings.versePositionY}%
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={bibleDisplaySettings.versePositionY}
                onChange={(e) => handleSettingChange('versePositionY', parseInt(e.target.value))}
                className="w-full"
              />
            </div>
          </div>

          {/* Header Position Controls */}
          <div className="space-y-3">
            <div className="text-white text-sm font-medium">Header Position</div>
            <div>
              <label className="block text-white text-xs mb-1">
                Header X Position: {bibleDisplaySettings.headerPositionX}%
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={bibleDisplaySettings.headerPositionX}
                onChange={(e) => handleSettingChange('headerPositionX', parseInt(e.target.value))}
                className="w-full"
              />
            </div>
            
            <div>
              <label className="block text-white text-xs mb-1">
                Header Y Position: {bibleDisplaySettings.headerPositionY}%
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={bibleDisplaySettings.headerPositionY}
                onChange={(e) => handleSettingChange('headerPositionY', parseInt(e.target.value))}
                className="w-full"
              />
            </div>
          </div>

          {/* Text Alignment Controls */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-white text-xs mb-1">Verse Text Align</label>
              <select
                value={bibleDisplaySettings.verseTextAlign}
                onChange={(e) => handleSettingChange('verseTextAlign', e.target.value)}
                className="w-full px-2 py-1 bg-neutral-700 text-white rounded text-sm"
              >
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
                <option value="justify">Justify</option>
              </select>
            </div>
            
            <div>
              <label className="block text-white text-xs mb-1">Header Text Align</label>
              <select
                value={bibleDisplaySettings.headerTextAlign}
                onChange={(e) => handleSettingChange('headerTextAlign', e.target.value)}
                className="w-full px-2 py-1 bg-neutral-700 text-white rounded text-sm"
              >
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
                <option value="justify">Justify</option>
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
