'use client';

import { IoClose, IoSave } from 'react-icons/io5';

export default function SpaceModal({ isOpen, editingSpace, onClose, onSubmit }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-neutral-800 rounded-lg p-6 w-96">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">
            {editingSpace ? 'Edit Space' : 'Create Space'}
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
            <label className="block text-sm font-medium mb-1">Space Name</label>
            <input
              name="space_name"
              type="text"
              defaultValue={editingSpace?.space_name || ''}
              required
              className="w-full p-2 bg-neutral-700 border border-neutral-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Width (px)</label>
              <input
                name="width"
                type="number"
                defaultValue={editingSpace?.width || 400}
                min="50"
                required
                className="w-full p-2 bg-neutral-700 border border-neutral-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Height (px)</label>
              <input
                name="height"
                type="number"
                defaultValue={editingSpace?.height || 300}
                min="50"
                required
                className="w-full p-2 bg-neutral-700 border border-neutral-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">X Position (px)</label>
              <input
                name="x_position"
                type="number"
                defaultValue={editingSpace?.x_position || 100}
                min="0"
                required
                className="w-full p-2 bg-neutral-700 border border-neutral-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Y Position (px)</label>
              <input
                name="y_position"
                type="number"
                defaultValue={editingSpace?.y_position || 100}
                min="0"
                required
                className="w-full p-2 bg-neutral-700 border border-neutral-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          
          <div>
            <label className="flex items-center space-x-2">
              <input
                name="is_active"
                type="checkbox"
                defaultChecked={editingSpace?.is_active}
                className="rounded"
              />
              <span className="text-sm">Active</span>
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
