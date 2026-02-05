import React, { forwardRef } from 'react';
import useSermonStore from '@/stores/sermonStore';

const BlockView = forwardRef(({ block, blockId, paragraphId, sermonData, isTargetBlock }, ref) => {
  const { selectedBlocks, selectionMode, handleBlockClick } = useSermonStore();
  
  const isSelected = selectedBlocks.some(b => 
    b.blockId === blockId && b.paragraphId === paragraphId
  );

  const handleClick = (e) => {
    if (selectionMode !== 'block') return;
    
    e.stopPropagation(); // Prevent paragraph selection
    
    const blockData = {
      blockId,
      paragraphId,
      block,
      sermonTitle: sermonData?.title,
      sermonDate: sermonData?.date,
      sermonUid: sermonData?.uid
    };
    
    handleBlockClick(blockData, e.ctrlKey || e.metaKey, e.shiftKey);
  };

  const baseClasses = block.type === 'ed' ? 'italic text-gray-500' : '';
  const selectionClasses = selectionMode === 'block' 
    ? `cursor-pointer transition-colors select-none ${
        isSelected 
          ? '!bg-blue-600/30 bg-opacity-40 rounded' 
          : 'hover:bg-blue-600/40 rounded'
      }`
    : '';

  // Add special highlighting only for the target block from search results
  const targetBlockClasses = isTargetBlock 
    ? 'rounded shadow-lg text-blue-500' 
    : '';

  return (
    <span
      ref={ref}
      key={blockId}
      // className={`${baseClasses} ${selectionClasses} ${targetBlockClasses} transition-all duration-300`}
      className={`${baseClasses} ${selectionClasses} ${targetBlockClasses} transition-all duration-300`}
      onClick={handleClick}
    >
      {block.text}{' '}
    </span>
  );
});

BlockView.displayName = 'BlockView';

export default BlockView;