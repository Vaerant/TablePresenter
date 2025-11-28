'use client';

import { IoSettings, IoTrash, IoMove, IoPencil } from 'react-icons/io5';

export default function DraggableSpace({ 
  space, 
  scale, 
  isDragging,
  isResizing,
  isSelected,
  constraintAxis,
  onMouseDown,
  onResizeStart,
  onSelect,
  onEdit, 
  onDelete, 
  onSettings 
}) {
  const scaledX = space.x_position * scale;
  const scaledY = space.y_position * scale;
  const scaledWidth = space.width * scale;
  const scaledHeight = space.height * scale;

  const handleResizeMouseDown = (e, direction) => {
    e.stopPropagation();
    e.preventDefault();
    onResizeStart(e, space, direction);
  };

  const handleClick = (e) => {
    e.stopPropagation();
    // Don't select if clicking on resize handles or buttons
    if (e.target.closest('.resize-handle') || e.target.closest('button')) {
      return;
    }
    onSelect(space);
  };

  const handleMouseDown = (e) => {
    // Don't start dragging if clicking on resize handles or buttons
    if (e.target.closest('.resize-handle') || e.target.closest('button')) {
      return;
    }
    onMouseDown(e);
  };

  // Calculate z-index using database z_index value
  const zIndex = isDragging || isResizing ? 1000 : (space.z_index || 1) * 10 + 10;

  return (
    <div
      className={`absolute border-2 rounded bg-blue-600/20 select-none group ${
        isDragging && constraintAxis ? 'border-yellow-400' : 
        isSelected ? 'border-green-500' : 'border-blue-500'
      } ${space.is_active ? 'opacity-100' : 'opacity-50'}`}
      style={{
        left: `${scaledX}px`,
        top: `${scaledY}px`,
        width: `${scaledWidth}px`,
        height: `${scaledHeight}px`,
        zIndex: zIndex,
        cursor: isDragging ? (constraintAxis ? (constraintAxis === 'horizontal' ? 'ew-resize' : 'ns-resize') : 'grabbing') : 'grab',
        minWidth: '50px',
        minHeight: '50px'
      }}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
    >
      {/* Constraint indicator */}
      {isDragging && constraintAxis && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className={`bg-yellow-400 ${constraintAxis === 'horizontal' ? 'w-8 h-1' : 'w-1 h-8'}`} />
        </div>
      )}

      {/* Drag handle - hide when constrained */}
      {!isDragging || !constraintAxis ? (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <IoMove 
            size={Math.min(scaledWidth / 8, scaledHeight / 8, 24)} 
            className="text-blue-400 opacity-70 group-hover:opacity-100"
          />
        </div>
      ) : null}

      {/* Space label with z-index */}
      <div 
        className="absolute top-0 left-0 right-0 bg-blue-600 text-white text-xs px-2 py-1 rounded-t truncate pointer-events-none flex justify-between"
        style={{ fontSize: `${Math.max(10, Math.min(12, scaledWidth / 20))}px` }}
      >
        <span>{space.space_name}</span>
        <span className="bg-blue-800 px-1 rounded text-xs">z:{space.z_index}</span>
      </div>

      {/* Coordinate display without units */}
      <div className="absolute -top-6 left-0 text-xs text-blue-300 bg-neutral-900/80 px-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
        x: {space.x_position}, y: {space.y_position}
      </div>

      {/* Control buttons */}
      <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex space-x-1 z-10">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className="p-1 bg-neutral-800 hover:bg-neutral-700 rounded text-white"
          title="Edit"
        >
          <IoPencil size={12} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-1 bg-red-600 hover:bg-red-700 rounded text-white"
          title="Delete"
        >
          <IoTrash size={12} />
        </button>
      </div>

      {/* Size indicator without units */}
      <div className="absolute bottom-1 left-1 text-xs text-blue-300 opacity-70 pointer-events-none">
        {space.width}×{space.height}
      </div>

      {/* Show coordinates while dragging without units */}
      {(isDragging || isResizing) && (
        <div 
          className="absolute -top-8 left-1/2 transform -translate-x-1/2 text-xs text-white bg-blue-600 px-2 py-1 rounded whitespace-nowrap pointer-events-none"
          style={{ zIndex: 1001 }}
        >
          {space.x_position}, {space.y_position} | {space.width}×{space.height}
          {constraintAxis && (
            <span className="ml-2 text-yellow-300">
              ({constraintAxis === 'horizontal' ? '↔' : '↕'} {constraintAxis})
            </span>
          )}
        </div>
      )}

      {/* Resize handles - only show on hover and not while dragging others */}
      {!isDragging && !isResizing && (
        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
          {/* Corner handles */}
          <div
            className="resize-handle absolute w-3 h-3 bg-blue-500 border border-blue-400 rounded-sm cursor-nw-resize"
            style={{ top: '-6px', left: '-6px', zIndex: 10 }}
            onMouseDown={(e) => handleResizeMouseDown(e, 'nw')}
          />
          <div
            className="resize-handle absolute w-3 h-3 bg-blue-500 border border-blue-400 rounded-sm cursor-ne-resize"
            style={{ top: '-6px', right: '-6px', zIndex: 10 }}
            onMouseDown={(e) => handleResizeMouseDown(e, 'ne')}
          />
          <div
            className="resize-handle absolute w-3 h-3 bg-blue-500 border border-blue-400 rounded-sm cursor-sw-resize"
            style={{ bottom: '-6px', left: '-6px', zIndex: 10 }}
            onMouseDown={(e) => handleResizeMouseDown(e, 'sw')}
          />
          <div
            className="resize-handle absolute w-3 h-3 bg-blue-500 border border-blue-400 rounded-sm cursor-se-resize"
            style={{ bottom: '-6px', right: '-6px', zIndex: 10 }}
            onMouseDown={(e) => handleResizeMouseDown(e, 'se')}
          />

          {/* Edge handles */}
          <div
            className="resize-handle absolute w-3 h-3 bg-blue-500 border border-blue-400 rounded-sm cursor-n-resize"
            style={{ top: '-6px', left: '50%', transform: 'translateX(-50%)', zIndex: 10 }}
            onMouseDown={(e) => handleResizeMouseDown(e, 'n')}
          />
          <div
            className="resize-handle absolute w-3 h-3 bg-blue-500 border border-blue-400 rounded-sm cursor-s-resize"
            style={{ bottom: '-6px', left: '50%', transform: 'translateX(-50%)', zIndex: 10 }}
            onMouseDown={(e) => handleResizeMouseDown(e, 's')}
          />
          <div
            className="resize-handle absolute w-3 h-3 bg-blue-500 border border-blue-400 rounded-sm cursor-w-resize"
            style={{ left: '-6px', top: '50%', transform: 'translateY(-50%)', zIndex: 10 }}
            onMouseDown={(e) => handleResizeMouseDown(e, 'w')}
          />
          <div
            className="resize-handle absolute w-3 h-3 bg-blue-500 border border-blue-400 rounded-sm cursor-e-resize"
            style={{ right: '-6px', top: '50%', transform: 'translateY(-50%)', zIndex: 10 }}
            onMouseDown={(e) => handleResizeMouseDown(e, 'e')}
          />
        </div>
      )}
    </div>
  );
}
