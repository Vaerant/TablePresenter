import React, { forwardRef, useEffect } from 'react';
import useSermonStore from '@/stores/sermonStore';

const BlockView = ({ block, blockId }) => {
  return (
    <span
      key={blockId}
      className={block.type === 'ed' ? 'italic text-gray-500' : ''}
    >
      {block.text}{' '}
    </span>
  );
};

const ParagraphView = forwardRef(({ paragraph, paragraphId, sermonData }, ref) => {
  const { selectedParagraph, setSelectedParagraph, clearSelectedParagraph, displaySettings } = useSermonStore();
  const isSelected = selectedParagraph?.paragraphId === paragraphId;

  // Listen for clear events from main process
  useEffect(() => {
    if (typeof window !== 'undefined' && window.electronAPI) {
      const handleParagraphClear = () => {
        clearSelectedParagraph();
      };

      window.electronAPI.on('paragraph:cleared', handleParagraphClear);

      return () => {
        window.electronAPI.off('paragraph:cleared', handleParagraphClear);
      };
    }
  }, [clearSelectedParagraph]);

  const handleParagraphClick = () => {
    // If already selected, deselect it
    if (isSelected) {
      clearSelectedParagraph();
      // Send clear signal to display
      if (typeof window !== 'undefined' && window.electronAPI) {
        window.electronAPI.send('paragraph:cleared');
      }
      return;
    }

    // Otherwise, select the paragraph
    const paragraphData = {
      paragraphId,
      paragraph,
      sermonTitle: sermonData?.title,
      sermonDate: sermonData?.date,
      sermonUid: sermonData?.uid
    };
    setSelectedParagraph(paragraphData);
    
    // Send selection to display with current display settings
    if (typeof window !== 'undefined' && window.electronAPI) {
      window.electronAPI.send('paragraph:selected', {
        paragraphData,
        displaySettings: displaySettings || {
          enabled: true,
          showTitle: true,
          showDate: true,
          showContent: true
        }
      });
    }
  };

  return (
    <div 
      ref={ref}
      key={paragraphId} 
      className={`mb-2 p-2 rounded cursor-pointer transition-colors ${
        isSelected 
          ? 'bg-blue-600 bg-opacity-30 border border-blue-500' 
          : 'hover:bg-gray-800 hover:bg-opacity-50'
      }`}
      onClick={handleParagraphClick}
    >
      <style jsx>{`
        .highlight-search-result {
          background-color: rgba(156, 163, 175, 0.2) !important;
          border-left: 4px solid rgb(156, 163, 175) !important;
        }
      `}</style>
      
      {paragraph.orderedBlockIds.map((blockId) => {
        const block = paragraph.blocks[blockId];
        return (
          <BlockView 
            key={blockId}
            block={block}
            blockId={blockId}
          />
        );
      })}
    </div>
  );
});

ParagraphView.displayName = 'ParagraphView';

export default ParagraphView;
