'use client';

import { IoClose, IoSave } from 'react-icons/io5';

export default function ScreenModal({ isOpen, editingScreen, onClose, onSubmit }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-neutral-800 rounded-lg p-6 w-96">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">
            {editingScreen ? 'Edit Screen' : 'Create Screen'}
          </h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-neutral-700 rounded"
          >
            <IoClose size={20} />
          </button>
        </div>
        
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Screen Name</label>
            <input
              name="screen_name"
              type="text"
              defaultValue={editingScreen?.screen_name || ''}
              required
              className="w-full p-2 bg-neutral-700 border border-neutral-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Resolution</label>
            <select
              name="resolution"
              defaultValue={editingScreen?.resolution || '1920x1080'}
              className="w-full p-2 bg-neutral-700 border border-neutral-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="1920x1080">1920x1080 (Full HD)</option>
              <option value="1280x720">1280x720 (HD)</option>
              <option value="1366x768">1366x768</option>
              <option value="1440x900">1440x900</option>
              <option value="1600x900">1600x900</option>
              <option value="2560x1440">2560x1440 (QHD)</option>
              <option value="3840x2160">3840x2160 (4K)</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Aspect Ratio</label>
            <select
              name="aspect_ratio"
              defaultValue={editingScreen?.aspect_ratio || '16:9'}
              className="w-full p-2 bg-neutral-700 border border-neutral-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="16:9">16:9</option>
              <option value="16:10">16:10</option>
              <option value="4:3">4:3</option>
              <option value="21:9">21:9</option>
            </select>
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
