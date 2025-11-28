'use client';

import { useState, useEffect } from 'react';
import { IoSave, IoClose } from 'react-icons/io5';

export default function SettingsPanel({ selectedSpace, onUpdateSettings, screenSpaces = [] }) {
  const [settings, setSettings] = useState({});
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (selectedSpace) {
      setSettings({
        font_size: selectedSpace.font_size || 24,
        font_weight: selectedSpace.font_weight || 'normal',
        font_color: selectedSpace.font_color || '#ffffff',
        font_family: selectedSpace.font_family || 'Arial, sans-serif',
        font_style: selectedSpace.font_style || 'normal',
        line_height: selectedSpace.line_height || '1.4',
        text_align: selectedSpace.text_align || 'center',
        text_decoration: selectedSpace.text_decoration || 'none',
        text_shadow: selectedSpace.text_shadow || 'none',
        text_resizing: selectedSpace.text_resizing || 1
      });
      setHasChanges(false);
    }
  }, [selectedSpace]);

  const handleChange = (field, value) => {
    setSettings(prev => ({
      ...prev,
      [field]: value
    }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (selectedSpace && hasChanges) {
      await onUpdateSettings(selectedSpace.id, settings);
      setHasChanges(false);
    }
  };

  if (!selectedSpace) {
    return (
      <div className="bg-neutral-800 border-t border-neutral-700 p-4">
        <div className="text-center text-neutral-400">
          <p className="text-sm">No space selected</p>
          <p className="text-xs mt-1">Click on a space to edit its settings</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-neutral-800 border-t border-neutral-700">
      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold">Space Settings</h3>
            <p className="text-sm text-neutral-400">{selectedSpace.space_name}</p>
          </div>
          {hasChanges && (
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm flex items-center space-x-2"
            >
              <IoSave size={14} />
              <span>Save</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {/* Basic Properties */}
          <div>
            <h4 className="text-sm font-medium text-neutral-300 mb-3">Basic Properties</h4>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-neutral-400 mb-1">Position & Size</label>
                <div className="text-xs text-neutral-500 bg-neutral-700 p-2 rounded">
                  x: {selectedSpace.x_position}, y: {selectedSpace.y_position} | 
                  {selectedSpace.width}×{selectedSpace.height}
                </div>
              </div>
              <div>
                <label className="block text-xs text-neutral-400 mb-1">Layer Order</label>
                <div className="text-xs text-neutral-500 bg-neutral-700 p-2 rounded">
                  z-index: {selectedSpace.z_index} (range: 0-{Math.max(0, screenSpaces.length - 1)})
                </div>
              </div>
              <div>
                <label className="block text-xs text-neutral-400 mb-1">Status</label>
                <div className={`text-xs px-2 py-1 rounded ${selectedSpace.is_active ? 'text-green-400 bg-green-900/20' : 'text-red-400 bg-red-900/20'}`}>
                  {selectedSpace.is_active ? 'Active' : 'Inactive'}
                </div>
              </div>
            </div>
          </div>

          {/* Typography Settings */}
          <div>
            <h4 className="text-sm font-medium text-neutral-300 mb-3">Typography</h4>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-neutral-400 mb-1">Font Size</label>
                  <input
                    type="number"
                    value={settings.font_size || ''}
                    onChange={(e) => handleChange('font_size', parseInt(e.target.value))}
                    min="8"
                    max="200"
                    className="w-full p-2 text-sm bg-neutral-700 border border-neutral-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-neutral-400 mb-1">Font Weight</label>
                  <select
                    value={settings.font_weight || ''}
                    onChange={(e) => handleChange('font_weight', e.target.value)}
                    className="w-full p-2 text-sm bg-neutral-700 border border-neutral-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="normal">Normal</option>
                    <option value="bold">Bold</option>
                    <option value="lighter">Lighter</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs text-neutral-400 mb-1">Font Color</label>
                <input
                  type="color"
                  value={settings.font_color || ''}
                  onChange={(e) => handleChange('font_color', e.target.value)}
                  className="w-full h-8 bg-neutral-700 border border-neutral-600 rounded"
                />
              </div>

              <div>
                <label className="block text-xs text-neutral-400 mb-1">Font Family</label>
                <input
                  type="text"
                  value={settings.font_family || ''}
                  onChange={(e) => handleChange('font_family', e.target.value)}
                  placeholder="Arial, sans-serif"
                  className="w-full p-2 text-sm bg-neutral-700 border border-neutral-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Text Formatting */}
          <div>
            <h4 className="text-sm font-medium text-neutral-300 mb-3">Text Formatting</h4>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-neutral-400 mb-1">Line Height</label>
                  <input
                    type="text"
                    value={settings.line_height || ''}
                    onChange={(e) => handleChange('line_height', e.target.value)}
                    placeholder="1.4"
                    className="w-full p-2 text-sm bg-neutral-700 border border-neutral-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-neutral-400 mb-1">Text Align</label>
                  <select
                    value={settings.text_align || ''}
                    onChange={(e) => handleChange('text_align', e.target.value)}
                    className="w-full p-2 text-sm bg-neutral-700 border border-neutral-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                    <option value="justify">Justify</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs text-neutral-400 mb-1">Text Shadow</label>
                <input
                  type="text"
                  value={settings.text_shadow || ''}
                  onChange={(e) => handleChange('text_shadow', e.target.value)}
                  placeholder="2px 2px 4px rgba(0,0,0,0.5)"
                  className="w-full p-2 text-sm bg-neutral-700 border border-neutral-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={settings.text_resizing === 1}
                    onChange={(e) => handleChange('text_resizing', e.target.checked ? 1 : 0)}
                    className="rounded"
                  />
                  <span className="text-xs text-neutral-400">Auto Text Resizing</span>
                </label>
              </div>

              {/* Preview */}
              <div>
                <label className="block text-xs text-neutral-400 mb-1">Preview</label>
                <div 
                  className="p-3 bg-black border border-neutral-600 rounded text-center"
                  style={{
                    fontSize: `${Math.min(settings.font_size, 16)}px`,
                    fontWeight: settings.font_weight,
                    color: settings.font_color,
                    fontFamily: settings.font_family,
                    lineHeight: settings.line_height,
                    textAlign: settings.text_align,
                    textShadow: settings.text_shadow === 'none' ? 'none' : settings.text_shadow
                  }}
                >
                  Sample Text Preview
                </div>
              </div>
            </div>
          </div>
        </div>

        {hasChanges && (
          <div className="mt-6 pt-4 border-t border-neutral-700 flex justify-between items-center">
            <div className="text-sm text-yellow-400">You have unsaved changes</div>
            <div className="flex space-x-2">
              <button
                onClick={() => {
                  if (selectedSpace) {
                    setSettings({
                      font_size: selectedSpace.font_size || 24,
                      font_weight: selectedSpace.font_weight || 'normal',
                      font_color: selectedSpace.font_color || '#ffffff',
                      font_family: selectedSpace.font_family || 'Arial, sans-serif',
                      font_style: selectedSpace.font_style || 'normal',
                      line_height: selectedSpace.line_height || '1.4',
                      text_align: selectedSpace.text_align || 'center',
                      text_decoration: selectedSpace.text_decoration || 'none',
                      text_shadow: selectedSpace.text_shadow || 'none',
                      text_resizing: selectedSpace.text_resizing || 1
                    });
                    setHasChanges(false);
                  }
                }}
                className="px-4 py-2 bg-neutral-600 hover:bg-neutral-700 rounded text-sm"
              >
                Reset
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm flex items-center space-x-2"
              >
                <IoSave size={14} />
                <span>Save Changes</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
