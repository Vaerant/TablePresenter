'use client';

import { IoClose, IoSave } from 'react-icons/io5';

export default function SettingsModal({ isOpen, editingSettings, onClose, onSubmit }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-neutral-800 rounded-lg p-6 w-96 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Space Settings</h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-neutral-700 rounded"
          >
            <IoClose size={20} />
          </button>
        </div>
        
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Font Size</label>
              <input
                name="font_size"
                type="number"
                defaultValue={editingSettings?.font_size || 24}
                min="8"
                max="200"
                className="w-full p-2 bg-neutral-700 border border-neutral-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Font Weight</label>
              <select
                name="font_weight"
                defaultValue={editingSettings?.font_weight || 'normal'}
                className="w-full p-2 bg-neutral-700 border border-neutral-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="normal">Normal</option>
                <option value="bold">Bold</option>
                <option value="lighter">Lighter</option>
              </select>
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Font Color</label>
            <input
              name="font_color"
              type="color"
              defaultValue={editingSettings?.font_color || '#ffffff'}
              className="w-full h-10 bg-neutral-700 border border-neutral-600 rounded"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Font Family</label>
            <input
              name="font_family"
              type="text"
              defaultValue={editingSettings?.font_family || 'Arial, sans-serif'}
              className="w-full p-2 bg-neutral-700 border border-neutral-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Line Height</label>
              <input
                name="line_height"
                type="text"
                defaultValue={editingSettings?.line_height || '1.4'}
                className="w-full p-2 bg-neutral-700 border border-neutral-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Text Align</label>
              <select
                name="text_align"
                defaultValue={editingSettings?.text_align || 'center'}
                className="w-full p-2 bg-neutral-700 border border-neutral-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
                <option value="justify">Justify</option>
              </select>
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Text Shadow</label>
            <input
              name="text_shadow"
              type="text"
              defaultValue={editingSettings?.text_shadow || 'none'}
              placeholder="e.g., 2px 2px 4px rgba(0,0,0,0.5)"
              className="w-full p-2 bg-neutral-700 border border-neutral-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <div>
            <label className="flex items-center space-x-2">
              <input
                name="text_resizing"
                type="checkbox"
                defaultChecked={editingSettings?.text_resizing}
                className="rounded"
              />
              <span className="text-sm">Auto Text Resizing</span>
            </label>
          </div>
          
          <div className="flex space-x-3 pt-4">
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded flex items-center justify-center space-x-2"
            >
              <IoSave size={16} />
              <span>Save</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-neutral-600 hover:bg-neutral-700 rounded"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
