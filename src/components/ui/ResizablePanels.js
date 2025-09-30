'use client';

import { useState, useRef, useEffect } from 'react';

export default function ResizablePanels({ leftPanel, rightPanel, initialLeftWidth = 40 }) {
  const [leftWidth, setLeftWidth] = useState(initialLeftWidth);
  const [isDragging, setIsDragging] = useState(false);
  const [previewPosition, setPreviewPosition] = useState(null);
  const containerRef = useRef(null);

  const handleMouseDown = (e) => {
    setIsDragging(true);
    e.preventDefault();
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging || !containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const newLeftWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100;
      
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
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, previewPosition]);

  const currentLeftWidth = previewPosition !== null ? previewPosition : leftWidth;

  return (
    <div ref={containerRef} className="flex max-h-screen w-full h-full grow relative">
      {/* Left Panel */}
      <div 
        className="overflow-y-scroll h-full"
        style={{ width: `${leftWidth}%` }}
      >
        {leftPanel}
      </div>
      
      {/* Resizable Divider */}
      <div
        className={`w-1 bg-neutral-900 hover:bg-neutral-800 cursor-col-resize flex-shrink-0 transition-colors ${
          isDragging ? 'bg-neutral-400' : ''
        }`}
        onMouseDown={handleMouseDown}
        style={{ left: `${leftWidth}%` }}
      >
        <div className="w-full h-full relative">
          <div className="absolute left-0 w-1 bg-current opacity-50" />
        </div>
      </div>
      
      {/* Preview Line - only visible during drag */}
      {isDragging && previewPosition !== null && (
        <div
          className="absolute top-0 bottom-0 w-1 bg-blue-400 opacity-75 z-50 pointer-events-none"
          style={{ left: `${previewPosition}%` }}
        />
      )}
      
      {/* Right Panel */}
      <div 
        className="overflow-hidden"
        style={{ width: `${100 - leftWidth}%` }}
      >
        {rightPanel}
      </div>
    </div>
  );
}
