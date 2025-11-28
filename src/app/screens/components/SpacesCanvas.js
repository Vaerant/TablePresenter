'use client';

import { useRef, useState, useEffect } from 'react';
import { IoAdd } from 'react-icons/io5';
import DraggableSpace from './DraggableSpace';

export default function SpacesCanvas({ 
  selectedScreen, 
  screenSpaces, 
  onAddSpace, 
  onEditSpace, 
  onDeleteSpace, 
  onEditSettings,
  onMoveSpace,
  onResizeSpace,
  onUpdateZIndex,
  selectedSpace,
  onSelectSpace
}) {
  const canvasRef = useRef(null);
  const [dragging, setDragging] = useState(null);
  const [resizing, setResizing] = useState(null);
  const [guides, setGuides] = useState({ vertical: [], horizontal: [] });

  const SNAP_THRESHOLD = 5; // pixels

  const getScaleFactor = () => {
    if (!selectedScreen) return 1;
    const [width, height] = selectedScreen.resolution.split('x').map(Number);
    const canvasWidth = 800;
    const canvasHeight = 600;
    return Math.min(canvasWidth / width, canvasHeight / height);
  };

  const getScaledDimensions = () => {
    if (!selectedScreen) return { width: 800, height: 600 };
    const [width, height] = selectedScreen.resolution.split('x').map(Number);
    const scale = getScaleFactor();
    return { width: width * scale, height: height * scale };
  };

  const getScreenDimensions = () => {
    if (!selectedScreen) return { width: 800, height: 600 };
    const [width, height] = selectedScreen.resolution.split('x').map(Number);
    return { width, height };
  };

  const generateGuides = (activeSpaceId = null) => {
    const vertical = new Set();
    const horizontal = new Set();
    
    // Add screen edges
    vertical.add(0);
    horizontal.add(0);
    if (selectedScreen) {
      const [screenWidth, screenHeight] = selectedScreen.resolution.split('x').map(Number);
      vertical.add(screenWidth);
      horizontal.add(screenHeight);
    }

    // Add space edges and centers
    screenSpaces.forEach(space => {
      if (space.id === activeSpaceId) return; // Skip the space being dragged
      
      // Vertical guides (left, center, right)
      vertical.add(space.x_position);
      vertical.add(space.x_position + space.width / 2);
      vertical.add(space.x_position + space.width);
      
      // Horizontal guides (top, center, bottom)
      horizontal.add(space.y_position);
      horizontal.add(space.y_position + space.height / 2);
      horizontal.add(space.y_position + space.height);
    });

    return {
      vertical: Array.from(vertical).sort((a, b) => a - b),
      horizontal: Array.from(horizontal).sort((a, b) => a - b)
    };
  };

  const findSnapPosition = (position, guides, spaceSize) => {
    const snapGuides = [];
    
    // Check snap points for left/top edge
    for (const guide of guides) {
      if (Math.abs(position - guide) <= SNAP_THRESHOLD) {
        snapGuides.push({ position: guide, type: 'edge' });
      }
    }
    
    // Check snap points for center
    const center = position + spaceSize / 2;
    for (const guide of guides) {
      if (Math.abs(center - guide) <= SNAP_THRESHOLD) {
        snapGuides.push({ position: guide - spaceSize / 2, type: 'center' });
      }
    }
    
    // Check snap points for right/bottom edge
    const edge = position + spaceSize;
    for (const guide of guides) {
      if (Math.abs(edge - guide) <= SNAP_THRESHOLD) {
        snapGuides.push({ position: guide - spaceSize, type: 'edge' });
      }
    }
    
    if (snapGuides.length > 0) {
      return snapGuides[0].position;
    }
    
    return position;
  };

  const updateGuides = (spaceId, x, y, width, height) => {
    const allGuides = generateGuides(spaceId);
    const activeGuides = { vertical: [], horizontal: [] };
    
    // Find which guides are being snapped to
    const snappedX = findSnapPosition(x, allGuides.vertical, width);
    const snappedY = findSnapPosition(y, allGuides.horizontal, height);
    
    // Show guides that are being snapped to
    if (snappedX !== x) {
      // Find the guide being snapped to
      const centerX = snappedX + width / 2;
      const rightX = snappedX + width;
      
      allGuides.vertical.forEach(guide => {
        if (Math.abs(snappedX - guide) <= SNAP_THRESHOLD || 
            Math.abs(centerX - guide) <= SNAP_THRESHOLD || 
            Math.abs(rightX - guide) <= SNAP_THRESHOLD) {
          activeGuides.vertical.push(guide);
        }
      });
    }
    
    if (snappedY !== y) {
      const centerY = snappedY + height / 2;
      const bottomY = snappedY + height;
      
      allGuides.horizontal.forEach(guide => {
        if (Math.abs(snappedY - guide) <= SNAP_THRESHOLD || 
            Math.abs(centerY - guide) <= SNAP_THRESHOLD || 
            Math.abs(bottomY - guide) <= SNAP_THRESHOLD) {
          activeGuides.horizontal.push(guide);
        }
      });
    }
    
    setGuides(activeGuides);
    return { x: snappedX, y: snappedY };
  };

  const handleMouseDown = (e, space) => {
    e.preventDefault();
    if (e.button !== 0) return; // Only handle left mouse button

    const rect = canvasRef.current.getBoundingClientRect();
    const scale = getScaleFactor();
    
    setDragging({
      spaceId: space.id,
      startX: e.clientX,
      startY: e.clientY,
      initialX: space.x_position * scale,
      initialY: space.y_position * scale,
      canvasRect: rect,
      scale: scale,
      altKey: e.altKey, // Track Alt key state
      constraintAxis: null // Will be determined on first movement
    });
  };

  const handleResizeStart = (e, space, direction) => {
    e.preventDefault();
    if (e.button !== 0) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const scale = getScaleFactor();
    
    setResizing({
      spaceId: space.id,
      direction,
      startX: e.clientX,
      startY: e.clientY,
      initialX: space.x_position,
      initialY: space.y_position,
      initialWidth: space.width,
      initialHeight: space.height,
      scale: scale,
      shiftKey: e.shiftKey // For aspect ratio lock
    });
  };

  const handleMouseMove = (e) => {
    if (dragging) {
      const deltaX = e.clientX - dragging.startX;
      const deltaY = e.clientY - dragging.startY;
      
      let newX = (dragging.initialX + deltaX) / dragging.scale;
      let newY = (dragging.initialY + deltaY) / dragging.scale;

      const space = screenSpaces.find(s => s.id === dragging.spaceId);
      if (!space) return;

      // Handle Alt key constraint for precise alignment
      if (e.altKey || dragging.altKey) {
        // Determine constraint axis on first significant movement
        if (!dragging.constraintAxis && (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10)) {
          if (Math.abs(deltaX) > Math.abs(deltaY)) {
            dragging.constraintAxis = 'horizontal';
          } else {
            dragging.constraintAxis = 'vertical';
          }
        }

        // Apply constraint based on determined axis
        if (dragging.constraintAxis === 'horizontal') {
          // Lock to horizontal movement only
          newY = space.y_position;
        } else if (dragging.constraintAxis === 'vertical') {
          // Lock to vertical movement only
          newX = space.x_position;
        }
      } else {
        // Reset constraint if Alt key is released
        dragging.constraintAxis = null;
      }

      // Apply snapping
      let snapped = { x: newX, y: newY };
      if (!e.altKey && !dragging.altKey) {
        // Normal snapping when Alt is not held
        snapped = updateGuides(dragging.spaceId, newX, newY, space.width, space.height);
      } else if (dragging.constraintAxis) {
        // Constrained snapping - only snap along the movement axis
        const allGuides = generateGuides(dragging.spaceId);
        
        if (dragging.constraintAxis === 'horizontal') {
          const snappedX = findSnapPosition(newX, allGuides.vertical, space.width);
          snapped = { x: snappedX, y: newY };
          
          // Show only vertical guides for horizontal movement
          if (snappedX !== newX) {
            const centerX = snappedX + space.width / 2;
            const rightX = snappedX + space.width;
            const activeGuides = { vertical: [], horizontal: [] };
            
            allGuides.vertical.forEach(guide => {
              if (Math.abs(snappedX - guide) <= SNAP_THRESHOLD || 
                  Math.abs(centerX - guide) <= SNAP_THRESHOLD || 
                  Math.abs(rightX - guide) <= SNAP_THRESHOLD) {
                activeGuides.vertical.push(guide);
              }
            });
            
            setGuides(activeGuides);
          } else {
            setGuides({ vertical: [], horizontal: [] });
          }
        } else if (dragging.constraintAxis === 'vertical') {
          const snappedY = findSnapPosition(newY, allGuides.horizontal, space.height);
          snapped = { x: newX, y: snappedY };
          
          // Show only horizontal guides for vertical movement
          if (snappedY !== newY) {
            const centerY = snappedY + space.height / 2;
            const bottomY = snappedY + space.height;
            const activeGuides = { vertical: [], horizontal: [] };
            
            allGuides.horizontal.forEach(guide => {
              if (Math.abs(snappedY - guide) <= SNAP_THRESHOLD || 
                  Math.abs(centerY - guide) <= SNAP_THRESHOLD || 
                  Math.abs(bottomY - guide) <= SNAP_THRESHOLD) {
                activeGuides.horizontal.push(guide);
              }
            });
            
            setGuides(activeGuides);
          } else {
            setGuides({ vertical: [], horizontal: [] });
          }
        }
      }
      
      newX = snapped.x;
      newY = snapped.y;

      const screenDims = getScreenDimensions();
      const boundedX = Math.max(0, Math.min(newX, screenDims.width - space.width));
      const boundedY = Math.max(0, Math.min(newY, screenDims.height - space.height));

      onMoveSpace(dragging.spaceId, Math.round(boundedX), Math.round(boundedY));
    }

    if (resizing) {
      const deltaX = (e.clientX - resizing.startX) / resizing.scale;
      const deltaY = (e.clientY - resizing.startY) / resizing.scale;
      
      let newX = resizing.initialX;
      let newY = resizing.initialY;
      let newWidth = resizing.initialWidth;
      let newHeight = resizing.initialHeight;

      const minSize = 50;
      const screenDims = getScreenDimensions();

      // Calculate new dimensions based on resize direction
      switch (resizing.direction) {
        case 'se': // Bottom-right
          newWidth = Math.max(minSize, resizing.initialWidth + deltaX);
          newHeight = Math.max(minSize, resizing.initialHeight + deltaY);
          break;
        case 'sw': // Bottom-left
          newWidth = Math.max(minSize, resizing.initialWidth - deltaX);
          newHeight = Math.max(minSize, resizing.initialHeight + deltaY);
          newX = Math.min(resizing.initialX + deltaX, resizing.initialX + resizing.initialWidth - minSize);
          break;
        case 'ne': // Top-right
          newWidth = Math.max(minSize, resizing.initialWidth + deltaX);
          newHeight = Math.max(minSize, resizing.initialHeight - deltaY);
          newY = Math.min(resizing.initialY + deltaY, resizing.initialY + resizing.initialHeight - minSize);
          break;
        case 'nw': // Top-left
          newWidth = Math.max(minSize, resizing.initialWidth - deltaX);
          newHeight = Math.max(minSize, resizing.initialHeight - deltaY);
          newX = Math.min(resizing.initialX + deltaX, resizing.initialX + resizing.initialWidth - minSize);
          newY = Math.min(resizing.initialY + deltaY, resizing.initialY + resizing.initialHeight - minSize);
          break;
        case 'e': // Right
          newWidth = Math.max(minSize, resizing.initialWidth + deltaX);
          break;
        case 'w': // Left
          newWidth = Math.max(minSize, resizing.initialWidth - deltaX);
          newX = Math.min(resizing.initialX + deltaX, resizing.initialX + resizing.initialWidth - minSize);
          break;
        case 's': // Bottom
          newHeight = Math.max(minSize, resizing.initialHeight + deltaY);
          break;
        case 'n': // Top
          newHeight = Math.max(minSize, resizing.initialHeight - deltaY);
          newY = Math.min(resizing.initialY + deltaY, resizing.initialY + resizing.initialHeight - minSize);
          break;
      }

      // Maintain aspect ratio if Shift is held
      if (e.shiftKey) {
        const aspectRatio = resizing.initialWidth / resizing.initialHeight;
        if (resizing.direction.includes('e') || resizing.direction.includes('w')) {
          newHeight = newWidth / aspectRatio;
        } else if (resizing.direction.includes('n') || resizing.direction.includes('s')) {
          newWidth = newHeight * aspectRatio;
        } else {
          // Corner resize - maintain aspect ratio
          const widthRatio = newWidth / resizing.initialWidth;
          const heightRatio = newHeight / resizing.initialHeight;
          const ratio = Math.min(widthRatio, heightRatio);
          
          newWidth = resizing.initialWidth * ratio;
          newHeight = resizing.initialHeight * ratio;
          
          // Adjust position for top/left resizing
          if (resizing.direction.includes('w')) {
            newX = resizing.initialX + (resizing.initialWidth - newWidth);
          }
          if (resizing.direction.includes('n')) {
            newY = resizing.initialY + (resizing.initialHeight - newHeight);
          }
        }
      }

      // Ensure the space stays within screen bounds
      newX = Math.max(0, Math.min(newX, screenDims.width - newWidth));
      newY = Math.max(0, Math.min(newY, screenDims.height - newHeight));
      newWidth = Math.min(newWidth, screenDims.width - newX);
      newHeight = Math.min(newHeight, screenDims.height - newY);

      // Apply snapping for resize
      const space = screenSpaces.find(s => s.id === resizing.spaceId);
      if (space) {
        const snapped = updateGuides(resizing.spaceId, newX, newY, newWidth, newHeight);
        newX = snapped.x;
        newY = snapped.y;
      }

      onResizeSpace(resizing.spaceId, {
        x_position: Math.round(newX),
        y_position: Math.round(newY),
        width: Math.round(newWidth),
        height: Math.round(newHeight)
      });
    }
  };

  const handleMouseUp = () => {
    setDragging(null);
    setResizing(null);
    setGuides({ vertical: [], horizontal: [] }); // Clear guides
  };

  const handleDeleteSpace = async (spaceId) => {
    if (confirm('Are you sure you want to delete this space?')) {
      await onDeleteSpace(spaceId);
    }
  };

  // Keyboard shortcuts for z-index
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (selectedSpace && e.altKey) {
        if (e.key === '[') {
          e.preventDefault();
          moveZIndex(selectedSpace.id, -1);
        } else if (e.key === ']') {
          e.preventDefault();
          moveZIndex(selectedSpace.id, 1);
        }
      }
      
      // Escape to deselect
      if (e.key === 'Escape') {
        onSelectSpace(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedSpace, onSelectSpace, onUpdateZIndex]);

  const moveZIndex = async (spaceId, direction) => {
    const space = screenSpaces.find(s => s.id === spaceId);
    if (!space) return;
    
    // Calculate min and max z-index based on number of spaces
    const minZIndex = 0;
    const maxZIndex = screenSpaces.length - 1;
    
    const newZIndex = Math.max(minZIndex, Math.min(maxZIndex, space.z_index + direction));
    
    // Only update if there's actually a change
    if (newZIndex !== space.z_index) {
      await onUpdateZIndex(spaceId, newZIndex);
    }
  };

  const handleCanvasClick = (e) => {
    // Deselect if clicking on empty canvas
    if (e.target === canvasRef.current || e.target.closest('.canvas-background')) {
      onSelectSpace(null);
    }
  };

  if (!selectedScreen) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-neutral-400">
          <p className="text-lg mb-2">No screen selected</p>
          <p>Create or select a screen to get started</p>
        </div>
      </div>
    );
  }

  console.log('Rendering spaces:', screenSpaces);

  return (
    <div 
      className="flex-1 flex flex-col"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div className="p-4 border-b border-neutral-700 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{selectedScreen.screen_name}</h1>
          <p className="text-neutral-400">{selectedScreen.resolution} • {selectedScreen.aspect_ratio}</p>
          <p className="text-xs text-neutral-500">
            Spaces: {screenSpaces.length}
            {selectedSpace && (
              <span className="ml-2 text-green-400">
                • Selected: {selectedSpace.space_name} (z:{selectedSpace.z_index})
              </span>
            )}
            {dragging?.constraintAxis && (
              <span className="ml-2 text-yellow-400">
                • Alt+Drag: {dragging.constraintAxis} constraint
              </span>
            )}
          </p>
        </div>
        <button
          onClick={onAddSpace}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded flex items-center space-x-2"
        >
          <IoAdd size={16} />
          <span>Add Space</span>
        </button>
      </div>

      <div className="flex-1 p-4 overflow-auto">
        <div className="flex justify-center">
          <div 
            ref={canvasRef}
            className="relative bg-black border border-neutral-600 rounded overflow-hidden canvas-background"
            style={{
              width: `${getScaledDimensions().width}px`,
              height: `${getScaledDimensions().height}px`
            }}
            onClick={handleCanvasClick}
          >
            {/* Dot grid for better alignment */}
            <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ zIndex: 1 }}>
              {Array.from({ length: Math.floor(getScaledDimensions().height / 20) + 1 }).map((_, row) =>
                Array.from({ length: Math.floor(getScaledDimensions().width / 20) + 1 }).map((_, col) => (
                  <div
                    key={`dot-${row}-${col}`}
                    className="absolute w-[2px] h-[2px] bg-neutral-500 rounded-full"
                    style={{
                      left: `${col * 20 - 2}px`,
                      top: `${row * 20 - 2}px`
                    }}
                  />
                ))
              )}
            </div>

            {/* Spaces - render in z_index order */}
            {screenSpaces
              .sort((a, b) => (a.z_index || 1) - (b.z_index || 1))
              .map((space) => (
                <DraggableSpace
                  key={space.id}
                  space={space}
                  scale={getScaleFactor()}
                  isDragging={dragging?.spaceId === space.id}
                  isResizing={resizing?.spaceId === space.id}
                  isSelected={selectedSpace?.id === space.id}
                  constraintAxis={dragging?.spaceId === space.id ? dragging.constraintAxis : null}
                  onMouseDown={(e) => handleMouseDown(e, space)}
                  onResizeStart={handleResizeStart}
                  onSelect={onSelectSpace}
                  onEdit={() => onEditSpace(space)}
                  onDelete={() => handleDeleteSpace(space.id)}
                  onSettings={() => onEditSettings(space)}
                />
              ))}

            {/* Alignment guides - render on top */}
            {guides.vertical.map((x, index) => (
              <div
                key={`v-${index}`}
                className="absolute bg-pink-500 pointer-events-none"
                style={{
                  left: `${x * getScaleFactor()}px`,
                  top: '0',
                  width: '1px',
                  height: '100%',
                  opacity: 0.8,
                  zIndex: 500
                }}
              />
            ))}
            {guides.horizontal.map((y, index) => (
              <div
                key={`h-${index}`}
                className="absolute bg-pink-500 pointer-events-none"
                style={{
                  left: '0',
                  top: `${y * getScaleFactor()}px`,
                  width: '100%',
                  height: '1px',
                  opacity: 0.8,
                  zIndex: 500
                }}
              />
            ))}
          </div>
        </div>

        {/* Help text */}
        <div className="mt-4 text-xs text-neutral-500 text-center">
          <p>Click to select • Drag to move • Alt+Drag for constraints • Alt+[ / Alt+] for z-index • Shift+Resize for aspect ratio</p>
        </div>
      </div>
    </div>
  );
}
