'use client';

import { IoAdd, IoSettings, IoTrash } from 'react-icons/io5';

export default function ScreensPanel({ 
  screens, 
  selectedScreen, 
  onScreenSelect, 
  onAddScreen, 
  onEditScreen, 
  onDeleteScreen 
}) {
  const handleDeleteScreen = async (screenId) => {
    if (confirm('Are you sure you want to delete this screen?')) {
      await onDeleteScreen(screenId);
    }
  };

  return (
    <div className="w-1/4 bg-neutral-800 border-r border-neutral-700 flex flex-col">
      <div className="p-4 border-b border-neutral-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Screens</h2>
          <button
            onClick={onAddScreen}
            className="p-2 bg-blue-600 hover:bg-blue-700 rounded"
          >
            <IoAdd size={16} />
          </button>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto">
        {screens.map(screen => (
          <div
            key={screen.id}
            className={`p-3 border-b border-neutral-700 cursor-pointer hover:bg-neutral-700 ${
              selectedScreen?.id === screen.id ? 'bg-neutral-700' : ''
            }`}
            onClick={() => onScreenSelect(screen)}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">{screen.screen_name}</div>
                <div className="text-sm text-neutral-400">{screen.resolution}</div>
              </div>
              <div className="flex space-x-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditScreen(screen);
                  }}
                  className="p-1 hover:bg-neutral-600 rounded"
                >
                  <IoSettings size={14} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteScreen(screen.id);
                  }}
                  className="p-1 hover:bg-red-600 rounded text-red-400"
                >
                  <IoTrash size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
