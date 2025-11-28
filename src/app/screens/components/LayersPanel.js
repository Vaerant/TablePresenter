'use client';

import { useState } from 'react';
import { IoEye, IoEyeOff, IoTrash, IoCopy } from 'react-icons/io5';

export default function LayersPanel({ 
  screenSpaces, 
  selectedSpace, 
  onSelectSpace, 
  onUpdateZIndex,
  onToggleActive,
  onDeleteSpace,
  onDuplicateSpace
}) {
  const [draggedLayer, setDraggedLayer] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  // Sort spaces by z-index in descending order (highest z-index first = top of list)
  const sortedSpaces = [...screenSpaces].sort((a, b) => (b.z_index || 0) - (a.z_index || 0));

  const handleDragStart = (e, space) => {
    setDraggedLayer(space);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e, targetSpace) => {
    e.preventDefault();
    if (!draggedLayer || draggedLayer.id === targetSpace.id) {
      setDraggedLayer(null);
      setDragOverIndex(null);
      return;
    }

    // Swap z-indices when dropping
    const draggedZIndex = draggedLayer.z_index;
    const targetZIndex = targetSpace.z_index;
    
    onUpdateZIndex(draggedLayer.id, targetZIndex);
    onUpdateZIndex(targetSpace.id, draggedZIndex);
    
    setDraggedLayer(null);
    setDragOverIndex(null);
  };

  const handleMoveUp = (space) => {
    // Moving up in the list means increasing z-index (bringing to front)
    const maxZIndex = screenSpaces.length - 1;
    if (space.z_index < maxZIndex) {
      // Find the space with the next higher z-index
      const targetSpace = screenSpaces.find(s => s.z_index === space.z_index + 1);
      if (targetSpace) {
        onUpdateZIndex(space.id, space.z_index + 1);
        onUpdateZIndex(targetSpace.id, targetSpace.z_index - 1);
      }
    }
  };

  const handleMoveDown = (space) => {
    // Moving down in the list means decreasing z-index (sending to back)
    const minZIndex = 0;
    if (space.z_index > minZIndex) {
      // Find the space with the next lower z-index
      const targetSpace = screenSpaces.find(s => s.z_index === space.z_index - 1);
      if (targetSpace) {
        onUpdateZIndex(space.id, space.z_index - 1);
        onUpdateZIndex(targetSpace.id, targetSpace.z_index + 1);
      }
    }
  };

  return (
    <div className="w-64 bg-neutral-800 border-l border-neutral-700 flex flex-col">
      <div className="p-3 border-b border-neutral-700">
        <h3 className="text-sm font-semibold text-neutral-300">Layers</h3>
        <p className="text-xs text-neutral-500 mt-1">
          {sortedSpaces.length} spaces • Top to bottom (z: {Math.max(0, sortedSpaces.length - 1)} to 0)
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {sortedSpaces.length === 0 ? (
          <div className="p-4 text-center text-neutral-500 text-sm">
            No spaces created
          </div>
        ) : (
          sortedSpaces.map((space, index) => {
            const maxZIndex = screenSpaces.length - 1;
            const minZIndex = 0;
            const isTopLayer = space.z_index === maxZIndex;
            const isBottomLayer = space.z_index === minZIndex;
            
            return (
              <div
                key={space.id}
                className={`relative border-b border-neutral-700 cursor-pointer ${
                  selectedSpace?.id === space.id ? 'bg-blue-600/20 border-blue-500' : 'hover:bg-neutral-700'
                } ${dragOverIndex === index ? 'border-t-2 border-t-blue-400' : ''}`}
                draggable
                onDragStart={(e) => handleDragStart(e, space)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, space)}
                onClick={() => onSelectSpace(space)}
              >
                <div className="p-3 flex items-center space-x-2">
                  {/* Layer Type Icon with z-index indicator */}
                  <div className="flex flex-col items-center">
                    <div className="w-4 h-4 bg-blue-500 rounded-sm flex items-center justify-center text-xs text-white font-bold">
                      T
                    </div>
                    <div className="text-xs text-neutral-500 mt-1">
                      {space.z_index}
                    </div>
                  </div>

                  {/* Layer Name */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white truncate flex items-center space-x-2">
                      <span>{space.space_name}</span>
                      {isTopLayer && <span className="text-xs bg-green-600 px-1 rounded">TOP</span>}
                      {isBottomLayer && <span className="text-xs bg-red-600 px-1 rounded">BOTTOM</span>}
                    </div>
                    <div className="text-xs text-neutral-400">
                      {space.width}×{space.height} • Layer {space.z_index + 1} of {screenSpaces.length}
                    </div>
                  </div>

                  {/* Layer Controls */}
                  <div className="flex items-center space-x-1">
                    {/* Visibility Toggle */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleActive(space.id, !space.is_active);
                      }}
                      className="p-1 hover:bg-neutral-600 rounded text-neutral-400 hover:text-white"
                      title={space.is_active ? 'Hide' : 'Show'}
                    >
                      {space.is_active ? <IoEye size={12} /> : <IoEyeOff size={12} />}
                    </button>

                    {/* Move Up (Bring Forward) */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMoveUp(space);
                      }}
                      disabled={isTopLayer}
                      className="p-1 hover:bg-neutral-600 rounded text-neutral-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed text-xs"
                      title={isTopLayer ? 'Already at top' : 'Bring Forward'}
                    >
                      ↑
                    </button>

                    {/* Move Down (Send Backward) */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMoveDown(space);
                      }}
                      disabled={isBottomLayer}
                      className="p-1 hover:bg-neutral-600 rounded text-neutral-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed text-xs"
                      title={isBottomLayer ? 'Already at bottom' : 'Send Backward'}
                    >
                      ↓
                    </button>

                    {/* Duplicate */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDuplicateSpace(space);
                      }}
                      className="p-1 hover:bg-neutral-600 rounded text-neutral-400 hover:text-white"
                      title="Duplicate"
                    >
                      <IoCopy size={12} />
                    </button>

                    {/* Delete */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Delete "${space.space_name}"?`)) {
                          onDeleteSpace(space.id);
                        }
                      }}
                      className="p-1 hover:bg-red-600 rounded text-red-400 hover:text-white"
                      title="Delete"
                    >
                      <IoTrash size={12} />
                    </button>
                  </div>
                </div>

                {/* Selection indicator */}
                {selectedSpace?.id === space.id && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500" />
                )}

                {/* Layer position indicator */}
                <div className="absolute right-1 top-1 text-xs text-neutral-500 bg-neutral-700 px-1 rounded">
                  z:{space.z_index}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Layer Actions Help */}
      <div className="p-3 border-t border-neutral-700 space-y-2">
        <div className="text-xs text-neutral-500 space-y-1">
          <div>• Click to select layer</div>
          <div>• Drag to reorder layers</div>
          <div>• ↑↓ to bring forward/send backward</div>
          <div>• Alt+[/] for keyboard shortcuts</div>
          <div className="text-yellow-400">• Higher z-index = closer to viewer</div>
        </div>
      </div>
    </div>
  );
}
