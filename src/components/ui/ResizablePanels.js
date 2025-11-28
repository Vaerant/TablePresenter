'use client';

import { useState, useRef, useEffect } from 'react';

export default function ResizablePanels({ 
  leftPanel, 
  rightPanel, 
  initialLeftWidth = 40, 
  orientation = 'horizontal' // 'vertical' or 'horizontal'
}) {
  const [leftWidth, setLeftWidth] = useState(initialLeftWidth);
  const [isDragging, setIsDragging] = useState(false);
  const [previewPosition, setPreviewPosition] = useState(null);
  const containerRef = useRef(null);

  const isVertical = orientation === 'vertical';

  const handleMouseDown = (e) => {
    setIsDragging(true);
    e.preventDefault();
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging || !containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const newLeftWidth = isVertical 
        ? ((e.clientX - containerRect.left) / containerRect.width) * 100
        : ((e.clientY - containerRect.top) / containerRect.height) * 100;
      
      // Constrain between 20% and 80%
      const constrainedWidth = Math.min(Math.max(newLeftWidth, 20), 80);
      
      // Only update preview position during drag, not actual width
      setPreviewPosition(constrainedWidth);
    };

    const handleMouseUp = () => {
      if (isDragging && previewPosition !== null) {
        // Apply the resize only on mouse release
        setLeftWidth(previewPosition);
      }
      setIsDragging(false);
      setPreviewPosition(null);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = isVertical ? 'col-resize' : 'row-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, previewPosition, isVertical]);

  const currentLeftWidth = previewPosition !== null ? previewPosition : leftWidth;

  return (
    <div 
      ref={containerRef} 
      className={`${isVertical ? 'flex' : 'flex flex-col'} max-h-screen w-full h-full grow relative`}
    >
      {/* Left/Top Panel */}
      <div 
        className={isVertical ? "h-full" : "overflow-x-scroll w-full"}
        style={isVertical ? { width: `${leftWidth}%` } : { height: `${leftWidth}%` }}
      >
        {leftPanel}
      </div>
      
      {/* Resizable Divider */}
      <div
        className={`${isVertical ? 'w-1 h-full' : 'h-1 w-full'} bg-neutral-900 hover:bg-neutral-800 ${
          isVertical ? 'cursor-col-resize' : 'cursor-row-resize'
        } flex-shrink-0 transition-colors ${
          isDragging ? 'bg-neutral-400' : ''
        }`}
        onMouseDown={handleMouseDown}
      >
        <div className="w-full h-full relative">
          <div className={`absolute ${isVertical ? 'left-0 w-1' : 'top-0 h-1'} bg-current opacity-50`} />
        </div>
      </div>
      
      {/* Preview Line - only visible during drag */}
      {isDragging && previewPosition !== null && (
        <div
          className={`absolute ${isVertical ? 'top-0 bottom-0 w-1' : 'left-0 right-0 h-1'} bg-blue-400 opacity-75 z-50 pointer-events-none`}
          style={isVertical ? { left: `${previewPosition}%` } : { top: `${previewPosition}%` }}
        />
      )}
      
      {/* Right/Bottom Panel */}
      <div 
        className={isVertical ? "overflow-hidden" : "overflow-hidden"}
        style={isVertical ? { width: `${100 - leftWidth}%` } : { height: `${100 - leftWidth}%` }}
      >
        {rightPanel}
      </div>
    </div>
  );
}
