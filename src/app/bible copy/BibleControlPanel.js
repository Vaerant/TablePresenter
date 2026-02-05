'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import useSermonStore from '@/stores/sermonStore';
import { 
  IoSettingsOutline, 
  IoEyeOutline, 
  IoEyeOffOutline,
  IoRefreshOutline,
  IoTrashOutline,
  IoTextOutline,
  IoColorPaletteOutline,
  IoResizeOutline,
  IoMoveOutline,
  IoChevronDownOutline
} from 'react-icons/io5';
import { 
  FaCaretUp, 
  FaCaretDown,
  FaAlignLeft,
  FaAlignCenter,
  FaAlignRight,
  FaAlignJustify
} from "react-icons/fa";
import styles from './BibleControlPanel.module.css';

export default function BibleControlPanel() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState('display'); // 'display', 'style', 'position'
  const [calculatedFontSize, setCalculatedFontSize] = useState(null);
  const [isManualFontSize, setIsManualFontSize] = useState(false);
  const [tooltipContent, setTooltipContent] = useState('');
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const [showTooltip, setShowTooltip] = useState(false);
  const [localHeaderColor, setLocalHeaderColor] = useState('');
  const [localVerseColor, setLocalVerseColor] = useState('');
  
  // Debounce refs
  const debounceTimeoutRef = useRef(null);
  const lastSentSettingsRef = useRef(null);
  const panelRef = useRef(null);
  const colorDebounceRef = useRef(null);
  
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

  // Close panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (panelRef.current && !panelRef.current.contains(event.target)) {
        setIsExpanded(false);
      }
    };

    if (isExpanded) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isExpanded]);

  // Debounced setting change function
  const debouncedSettingChange = useCallback((settings) => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    
    debounceTimeoutRef.current = setTimeout(() => {
      const settingsString = JSON.stringify(settings);
      if (lastSentSettingsRef.current !== settingsString) {
        lastSentSettingsRef.current = settingsString;
        
        if (typeof window !== 'undefined' && window.electronAPI) {
          window.electronAPI.send('bible:displaySettingsUpdated', settings);
        }
      }
    }, 50);
  }, []);

  const handleSettingChange = (key, value) => {
    const newSettings = { ...bibleDisplaySettings, [key]: value };
    setBibleDisplaySettings(newSettings);
    debouncedSettingChange(newSettings);
  };

  const handleClearSelection = () => {
    clearSelectedVerses();
    if (typeof window !== 'undefined' && window.electronAPI) {
      window.electronAPI.send('verse:cleared');
    }
  };

  const handleResetSettings = () => {
    const defaultSettings = resetBibleDisplaySettings();
    if (typeof window !== 'undefined' && window.electronAPI) {
      window.electronAPI.send('bible:displaySettingsUpdated', defaultSettings);
    }
  };

  const handleRecalcFontSize = () => {
    if (typeof window !== 'undefined' && window.electronAPI) {
      window.electronAPI.send('bible:recalcFontSize');
    }
  };

  const handleMouseEnter = (content, event) => {
    const rect = event.target.getBoundingClientRect();
    setTooltipContent(content);
    setTooltipPosition({
      x: rect.left + rect.width / 2,
      y: rect.top - 8
    });
    setShowTooltip(true);
  };

  const handleMouseLeave = () => {
    setShowTooltip(false);
  };

  // Initialize local colors when settings change
  useEffect(() => {
    setLocalHeaderColor(bibleDisplaySettings.headerColor);
    setLocalVerseColor(bibleDisplaySettings.verseColor);
  }, [bibleDisplaySettings.headerColor, bibleDisplaySettings.verseColor]);

  // Debounced color change function
  const debouncedColorChange = useCallback((key, value) => {
    if (colorDebounceRef.current) {
      clearTimeout(colorDebounceRef.current);
    }
    
    colorDebounceRef.current = setTimeout(() => {
      handleSettingChange(key, value);
    }, 150); // Longer debounce for colors
  }, []);

  const handleColorChange = (key, value, setLocalValue) => {
    // Update local state immediately for visual feedback
    setLocalValue(value);
    // Debounce the actual setting change
    debouncedColorChange(key, value);
  };

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
      if (colorDebounceRef.current) {
        clearTimeout(colorDebounceRef.current);
      }
    };
  }, []);

  return (
    <>
      {/* Modern Tooltip */}
      {showTooltip && (
        <div 
          className="fixed z-[100] pointer-events-none transition-all duration-200"
          style={{
            left: tooltipPosition.x,
            top: tooltipPosition.y,
            transform: 'translateX(-50%) translateY(-100%)'
          }}
        >
          <div className="bg-neutral-900 backdrop-blur-sm text-white text-xs px-2 py-1 rounded-md shadow-lg border border-neutral-800">
            {tooltipContent}
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-neutral-900"></div>
          </div>
        </div>
      )}

      <div 
        ref={panelRef}
        className="fixed bottom-16 left-4 z-50"
      >
        {/* Main Control Button */}
        <div className="relative">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            onMouseEnter={(e) => handleMouseEnter('Bible Display Controls', e)}
            onMouseLeave={handleMouseLeave}
            className={`p-3 bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 text-white rounded-lg shadow-lg transition-all duration-200 flex items-center gap-2 ${
              selectedVerses.length > 0 ? 'border-blue-500/50 bg-blue-900/20' : ''
            }`}
          >
            <IoSettingsOutline size={20} />
            {selectedVerses.length > 0 && (
              <span className="bg-blue-600 text-white text-xs px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                {selectedVerses.length}
              </span>
            )}
            {isExpanded ? <FaCaretDown size={12} /> : <FaCaretUp size={12} />}
          </button>

          {/* Expanded Panel */}
          {isExpanded && (
            <div className={`absolute bottom-full mb-2 left-0 bg-neutral-900 border border-neutral-800 rounded-lg shadow-lg w-80 overflow-hidden ${styles.panelAnimated}`}>
              {/* Quick Actions Row */}
              <div className="flex p-2 bg-neutral-800 border-b border-neutral-700">
                <button
                  onClick={handleClearSelection}
                  disabled={selectedVerses.length === 0}
                  onMouseEnter={(e) => handleMouseEnter('Clear Selected Verses', e)}
                  onMouseLeave={handleMouseLeave}
                  className="p-2 text-red-400 hover:bg-red-900/20 disabled:text-neutral-600 disabled:hover:bg-transparent rounded transition-colors flex-1 flex items-center justify-center gap-1"
                >
                  <IoTrashOutline size={16} />
                  <span className="text-xs">Clear ({selectedVerses.length})</span>
                </button>
                
                <button
                  onClick={() => handleSettingChange('showDisplay', !bibleDisplaySettings.showDisplay)}
                  onMouseEnter={(e) => handleMouseEnter(bibleDisplaySettings.showDisplay ? 'Hide Bible Display' : 'Show Bible Display', e)}
                  onMouseLeave={handleMouseLeave}
                  className={`p-2 rounded transition-colors flex-1 flex items-center justify-center gap-1 ${
                    bibleDisplaySettings.showDisplay 
                      ? 'text-green-400 hover:bg-green-900/20' 
                      : 'text-neutral-400 hover:bg-neutral-700'
                  }`}
                >
                  {bibleDisplaySettings.showDisplay ? <IoEyeOutline size={16} /> : <IoEyeOffOutline size={16} />}
                  <span className="text-xs">{bibleDisplaySettings.showDisplay ? 'Hide' : 'Show'}</span>
                </button>
                
                <button
                  onClick={handleRecalcFontSize}
                  onMouseEnter={(e) => handleMouseEnter('Recalculate Font Size', e)}
                  onMouseLeave={handleMouseLeave}
                  className="p-2 text-purple-400 hover:bg-purple-900/20 rounded transition-colors flex-1 flex items-center justify-center gap-1"
                >
                  <IoRefreshOutline size={16} />
                  <span className="text-xs">Recalc</span>
                </button>
              </div>

              {/* Tab Navigation */}
              <div className="flex bg-neutral-800 border-b border-neutral-700">
                <button
                  onClick={() => setActiveTab('display')}
                  className={`flex-1 p-2 text-xs flex items-center justify-center gap-1 transition-colors ${
                    activeTab === 'display' ? 'bg-neutral-700 text-white' : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  <IoEyeOutline size={14} />
                  Display
                </button>
                <button
                  onClick={() => setActiveTab('style')}
                  className={`flex-1 p-2 text-xs flex items-center justify-center gap-1 transition-colors ${
                    activeTab === 'style' ? 'bg-neutral-700 text-white' : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  <IoTextOutline size={14} />
                  Style
                </button>
                <button
                  onClick={() => setActiveTab('position')}
                  className={`flex-1 p-2 text-xs flex items-center justify-center gap-1 transition-colors ${
                    activeTab === 'position' ? 'bg-neutral-700 text-white' : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  <IoMoveOutline size={14} />
                  Position
                </button>
              </div>

              {/* Tab Content */}
              <div className="p-3 max-h-96 overflow-y-auto">
                {activeTab === 'display' && (
                  <div className="space-y-3">
                    {/* Header Toggle */}
                    <div className="flex items-center justify-between">
                      <span className="text-white text-sm">Header</span>
                      <div className="relative">
                        <input
                          type="checkbox"
                          id="showHeaderToggle"
                          checked={bibleDisplaySettings.showHeader}
                          onChange={() => handleSettingChange('showHeader', !bibleDisplaySettings.showHeader)}
                          className={`sr-only ${styles.toggleCheckbox}`}
                        />
                        <label 
                          htmlFor="showHeaderToggle"
                          className={styles.toggleSwitch}
                        >
                          <span className={styles.toggleSlider}></span>
                        </label>
                      </div>
                    </div>

                    {/* Size Controls */}
                    <div className="space-y-3">
                      <div>
                        <label className="block text-white text-xs mb-2">Width: {bibleDisplaySettings.verseWidth}%</label>
                        <div className="relative">
                          <input
                            type="range"
                            min="20"
                            max="100"
                            value={bibleDisplaySettings.verseWidth}
                            onChange={(e) => handleSettingChange('verseWidth', parseInt(e.target.value))}
                            className={`w-full h-2 bg-neutral-700 rounded-lg cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/50 ${styles.sliderModern}`}
                            style={{
                              background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${bibleDisplaySettings.verseWidth}%, #404040 ${bibleDisplaySettings.verseWidth}%, #404040 100%)`
                            }}
                          />
                        </div>
                      </div>
                      
                      <div>
                        <label className="block text-white text-xs mb-2">Height: {bibleDisplaySettings.verseHeight}%</label>
                        <div className="relative">
                          <input
                            type="range"
                            min="20"
                            max="100"
                            value={bibleDisplaySettings.verseHeight}
                            onChange={(e) => handleSettingChange('verseHeight', parseInt(e.target.value))}
                            className={`w-full h-2 bg-neutral-700 rounded-lg cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/50 ${styles.sliderModern}`}
                            style={{
                              background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${bibleDisplaySettings.verseHeight}%, #404040 ${bibleDisplaySettings.verseHeight}%, #404040 100%)`
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Reset Button */}
                    <button
                      onClick={handleResetSettings}
                      className="w-full px-3 py-2 bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-700 hover:to-orange-600 text-white rounded-lg text-xs transition-all duration-200 shadow-lg hover:shadow-orange-600/25 focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                    >
                      Reset All Settings
                    </button>
                  </div>
                )}

                {activeTab === 'style' && (
                  <div className="space-y-3">
                    {/* Font Size Mode Toggle */}
                    <div className="flex items-center justify-between">
                      <span className="text-white text-sm">Manual Font</span>
                      <div className="relative">
                        <input
                          type="checkbox"
                          id="manualFontToggle"
                          checked={bibleDisplaySettings.isManualFontSize}
                          onChange={() => handleSettingChange('isManualFontSize', !bibleDisplaySettings.isManualFontSize)}
                          className={`sr-only ${styles.toggleCheckbox}`}
                        />
                        <label 
                          htmlFor="manualFontToggle"
                          className={styles.toggleSwitch}
                        >
                          <span className={styles.toggleSlider}></span>
                        </label>
                      </div>
                    </div>

                    {calculatedFontSize !== null && (
                      <div className="text-xs text-gray-400 bg-neutral-800/50 px-2 py-1 rounded-md">
                        Auto: {calculatedFontSize.toFixed(2)}rem
                      </div>
                    )}

                    {/* Font Size Controls */}
                    {bibleDisplaySettings.isManualFontSize && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-white text-xs mb-2">Verse Size</label>
                          <input
                            type="number"
                            min="0.5"
                            max="8"
                            step="0.1"
                            value={bibleDisplaySettings.verseFontSize}
                            onChange={(e) => handleSettingChange('verseFontSize', parseFloat(e.target.value))}
                            className={styles.numberInput}
                          />
                        </div>
                        <div>
                          <label className="block text-white text-xs mb-2">Header Size</label>
                          <input
                            type="number"
                            min="0.5"
                            max="4"
                            step="0.1"
                            value={bibleDisplaySettings.headerFontSize}
                            onChange={(e) => handleSettingChange('headerFontSize', parseFloat(e.target.value))}
                            className={styles.numberInput}
                          />
                        </div>
                      </div>
                    )}

                    {!bibleDisplaySettings.isManualFontSize && (
                      <div>
                        <label className="block text-white text-xs mb-2">Header Size</label>
                        <input
                          type="number"
                          min="0.5"
                          max="4"
                          step="0.1"
                          value={bibleDisplaySettings.headerFontSize}
                          onChange={(e) => handleSettingChange('headerFontSize', parseFloat(e.target.value))}
                          className={styles.numberInput}
                        />
                      </div>
                    )}

                    {/* Colors */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-white text-xs mb-2">Header Color</label>
                        <div className="relative">
                          <input
                            type="color"
                            value={localHeaderColor}
                            onChange={(e) => handleColorChange('headerColor', e.target.value, setLocalHeaderColor)}
                            className="sr-only"
                            id="headerColorPicker"
                          />
                          <label 
                            htmlFor="headerColorPicker"
                            className={styles.colorPickerContainer}
                          >
                            <div 
                              className={styles.colorSwatch}
                              style={{ backgroundColor: localHeaderColor }}
                            />
                          </label>
                        </div>
                      </div>
                      <div>
                        <label className="block text-white text-xs mb-2">Verse Color</label>
                        <div className="relative">
                          <input
                            type="color"
                            value={localVerseColor}
                            onChange={(e) => handleColorChange('verseColor', e.target.value, setLocalVerseColor)}
                            className="sr-only"
                            id="verseColorPicker"
                          />
                          <label 
                            htmlFor="verseColorPicker"
                            className={styles.colorPickerContainer}
                          >
                            <div 
                              className={styles.colorSwatch}
                              style={{ backgroundColor: localVerseColor }}
                            />
                          </label>
                        </div>
                      </div>
                    </div>

                    {/* Text Alignment */}
                    <div className="space-y-3">
                      <div>
                        <label className="block text-white text-xs mb-2">Verse Align</label>
                        <div className="flex rounded-lg overflow-hidden border border-neutral-700 bg-neutral-800">
                          <button
                            onClick={() => handleSettingChange('verseTextAlign', 'left')}
                            className={`flex-1 p-2 flex items-center justify-center transition-colors ${
                              bibleDisplaySettings.verseTextAlign === 'left'
                                ? 'bg-blue-600 text-white'
                                : 'text-neutral-400 hover:text-white hover:bg-neutral-700'
                            }`}
                            onMouseEnter={(e) => handleMouseEnter('Align Left', e)}
                            onMouseLeave={handleMouseLeave}
                          >
                            <FaAlignLeft size={14} />
                          </button>
                          <button
                            onClick={() => handleSettingChange('verseTextAlign', 'center')}
                            className={`flex-1 p-2 flex items-center justify-center transition-colors border-x border-neutral-700 ${
                              bibleDisplaySettings.verseTextAlign === 'center'
                                ? 'bg-blue-600 text-white'
                                : 'text-neutral-400 hover:text-white hover:bg-neutral-700'
                            }`}
                            onMouseEnter={(e) => handleMouseEnter('Align Center', e)}
                            onMouseLeave={handleMouseLeave}
                          >
                            <FaAlignCenter size={14} />
                          </button>
                          <button
                            onClick={() => handleSettingChange('verseTextAlign', 'right')}
                            className={`flex-1 p-2 flex items-center justify-center transition-colors border-r border-neutral-700 ${
                              bibleDisplaySettings.verseTextAlign === 'right'
                                ? 'bg-blue-600 text-white'
                                : 'text-neutral-400 hover:text-white hover:bg-neutral-700'
                            }`}
                            onMouseEnter={(e) => handleMouseEnter('Align Right', e)}
                            onMouseLeave={handleMouseLeave}
                          >
                            <FaAlignRight size={14} />
                          </button>
                          <button
                            onClick={() => handleSettingChange('verseTextAlign', 'justify')}
                            className={`flex-1 p-2 flex items-center justify-center transition-colors ${
                              bibleDisplaySettings.verseTextAlign === 'justify'
                                ? 'bg-blue-600 text-white'
                                : 'text-neutral-400 hover:text-white hover:bg-neutral-700'
                            }`}
                            onMouseEnter={(e) => handleMouseEnter('Justify', e)}
                            onMouseLeave={handleMouseLeave}
                          >
                            <FaAlignJustify size={14} />
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-white text-xs mb-2">Header Align</label>
                        <div className="flex rounded-lg overflow-hidden border border-neutral-700 bg-neutral-800">
                          <button
                            onClick={() => handleSettingChange('headerTextAlign', 'left')}
                            className={`flex-1 p-2 flex items-center justify-center transition-colors ${
                              bibleDisplaySettings.headerTextAlign === 'left'
                                ? 'bg-blue-600 text-white'
                                : 'text-neutral-400 hover:text-white hover:bg-neutral-700'
                            }`}
                            onMouseEnter={(e) => handleMouseEnter('Align Left', e)}
                            onMouseLeave={handleMouseLeave}
                          >
                            <FaAlignLeft size={14} />
                          </button>
                          <button
                            onClick={() => handleSettingChange('headerTextAlign', 'center')}
                            className={`flex-1 p-2 flex items-center justify-center transition-colors border-x border-neutral-700 ${
                              bibleDisplaySettings.headerTextAlign === 'center'
                                ? 'bg-blue-600 text-white'
                                : 'text-neutral-400 hover:text-white hover:bg-neutral-700'
                            }`}
                            onMouseEnter={(e) => handleMouseEnter('Align Center', e)}
                            onMouseLeave={handleMouseLeave}
                          >
                            <FaAlignCenter size={14} />
                          </button>
                          <button
                            onClick={() => handleSettingChange('headerTextAlign', 'right')}
                            className={`flex-1 p-2 flex items-center justify-center transition-colors border-r border-neutral-700 ${
                              bibleDisplaySettings.headerTextAlign === 'right'
                                ? 'bg-blue-600 text-white'
                                : 'text-neutral-400 hover:text-white hover:bg-neutral-700'
                            }`}
                            onMouseEnter={(e) => handleMouseEnter('Align Right', e)}
                            onMouseLeave={handleMouseLeave}
                          >
                            <FaAlignRight size={14} />
                          </button>
                          <button
                            onClick={() => handleSettingChange('headerTextAlign', 'justify')}
                            className={`flex-1 p-2 flex items-center justify-center transition-colors ${
                              bibleDisplaySettings.headerTextAlign === 'justify'
                                ? 'bg-blue-600 text-white'
                                : 'text-neutral-400 hover:text-white hover:bg-neutral-700'
                            }`}
                            onMouseEnter={(e) => handleMouseEnter('Justify', e)}
                            onMouseLeave={handleMouseLeave}
                          >
                            <FaAlignJustify size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'position' && (
                  <div className="space-y-4">
                    {/* Content Position */}
                    <div className="space-y-3">
                      <div className="text-white text-sm font-medium border-b border-neutral-700 pb-1">Content</div>
                      <div>
                        <label className="block text-white text-xs mb-2">X: {bibleDisplaySettings.versePositionX}%</label>
                        <div className="relative">
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={bibleDisplaySettings.versePositionX}
                            onChange={(e) => handleSettingChange('versePositionX', parseInt(e.target.value))}
                            className={`w-full h-2 bg-neutral-700 rounded-lg cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/50 ${styles.sliderModern}`}
                            style={{
                              background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${bibleDisplaySettings.versePositionX}%, #404040 ${bibleDisplaySettings.versePositionX}%, #404040 100%)`
                            }}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-white text-xs mb-2">Y: {bibleDisplaySettings.versePositionY}%</label>
                        <div className="relative">
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={bibleDisplaySettings.versePositionY}
                            onChange={(e) => handleSettingChange('versePositionY', parseInt(e.target.value))}
                            className={`w-full h-2 bg-neutral-700 rounded-lg cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/50 ${styles.sliderModern}`}
                            style={{
                              background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${bibleDisplaySettings.versePositionY}%, #404040 ${bibleDisplaySettings.versePositionY}%, #404040 100%)`
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Header Position */}
                    <div className="space-y-3">
                      <div className="text-white text-sm font-medium border-b border-neutral-700 pb-1">Header</div>
                      <div>
                        <label className="block text-white text-xs mb-2">X: {bibleDisplaySettings.headerPositionX}%</label>
                        <div className="relative">
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={bibleDisplaySettings.headerPositionX}
                            onChange={(e) => handleSettingChange('headerPositionX', parseInt(e.target.value))}
                            className={`w-full h-2 bg-neutral-700 rounded-lg cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/50 ${styles.sliderModern}`}
                            style={{
                              background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${bibleDisplaySettings.headerPositionX}%, #404040 ${bibleDisplaySettings.headerPositionX}%, #404040 100%)`
                            }}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-white text-xs mb-2">Y: {bibleDisplaySettings.headerPositionY}%</label>
                        <div className="relative">
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={bibleDisplaySettings.headerPositionY}
                            onChange={(e) => handleSettingChange('headerPositionY', parseInt(e.target.value))}
                            className={`w-full h-2 bg-neutral-700 rounded-lg cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/50 ${styles.sliderModern}`}
                            style={{
                              background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${bibleDisplaySettings.headerPositionY}%, #404040 ${bibleDisplaySettings.headerPositionY}%, #404040 100%)`
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
