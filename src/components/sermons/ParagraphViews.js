import React, { memo, useCallback } from 'react';

// UPDATED: selectedBlockIds (array) and onBlockClick with modifiers
const buildMergedBlocks = ({ paragraph, renderWithItalics, blockSelectionMode, selectedBlockIds = [], onInternalBlockClick, isSelected }) => {
  const blocks = paragraph.orderedBlockIds || [];
  return blocks.map((bid) => {
    const b = paragraph.blocks[bid];
    if (!b) return null;
    const content = renderWithItalics(b.text || '', b.italicSegments || []);
    const clickable = blockSelectionMode;
    const selected = selectedBlockIds.includes(bid);
    // const typeClasses = b.type === 'paragraphStart' ? 'text-blue-400' : '';
    // const typeClasses = b.type === 'paragraphStart' ? 'text-blue-400 mr-2'
    const typeClasses = b.type === 'paragraphStart' ? isSelected ? 'text-blue-400 mr-2 font-semibold text-sm' : 'text-blue-400 mr-2 font-semibold text-sm'
      : b.type === 'ed' ? 'text-neutral-400 italic'
      : '';
    const isIndented = b.indented;

    return (
      <span
        key={bid}
        data-block={bid}
        className={`mr-1 
          ${typeClasses} ${clickable ? 'px-1 rounded cursor-pointer' : ''} 
          ${clickable && selected ? 'bg-blue-600 text-white' : clickable ? 'hover:bg-neutral-700/70' : ''}
        ${isIndented ? 'ml-4' : ''}
        `}
        onClick={(e) => {
          if (!clickable) return;
          e.stopPropagation();
          onInternalBlockClick && onInternalBlockClick(bid, e.ctrlKey || e.metaKey, e.shiftKey); // UPDATED pass modifiers
        }}
      >
        {content}
      </span>
    );
  }).filter(Boolean);
};

export const ParagraphView = memo(({
  paragraph,
  paragraphId,
  paragraphNumber,
  sectionId,
  itemData,
  isSelected,
  isHighlighted,
  onParagraphClick,
  renderWithItalics,
  blockSelectionMode,
  selectedBlockIds,
  onBlockClick
}) => {
  // console.log('Rendering ParagraphView', { paragraphId, paragraphNumber, isSelected, isHighlighted });
  
  // Destructure itemData for stable references (these are passed as separate props already)
  // Using the already-provided separate props for dependencies
  
  // Create stable click handler for this paragraph
  const handleClick = useCallback((e) => {
    onParagraphClick(itemData, e);
  }, [onParagraphClick, sectionId, paragraphId, paragraphNumber]);
  
  // Create stable block click handler
  const handleInternalBlockClick = useCallback((blockId, ctrl, shift) => {
    onBlockClick(itemData, blockId, ctrl, shift);
  }, [onBlockClick, sectionId, paragraphId, paragraphNumber]);
  
  const merged = buildMergedBlocks({ 
    paragraph, 
    renderWithItalics, 
    blockSelectionMode, 
    selectedBlockIds, 
    onInternalBlockClick: handleInternalBlockClick, 
    isSelected 
  });
  
  return (
    <div
      data-paragraph={paragraphId}
      data-paragraph-number={paragraphNumber}
      // style={{ transition: 'margin 400ms ease-in-out, background-color 250ms ease-in-out' }}
      className={`rounded-md cursor-pointer group transition-[margin] hover:!bg-neutral-800/60
        ${isHighlighted ? 'ml-2' : 'ml-0'} 
        ${isHighlighted && !isSelected ? 'bg-neutral-800/60' : ''}
        ${isSelected ? 'bg-blue-800/10' : isHighlighted ? '' : 'hover:bg-neutral-800/60'} 
        p-2`}
      onClick={handleClick}
    >
      <div className={`text-base text-white/70 group-hover:text-white leading-7
        ${isHighlighted && !isSelected ? 'text-blue-300' : ''}
        ${isSelected ? '!text-blue-500' : ''}
        `}
        >
        {merged}
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function to prevent unnecessary re-renders
  // Only re-render if these specific props change
  
  // Check if selectedBlockIds array changed
  const blockIdsEqual = 
    prevProps.selectedBlockIds.length === nextProps.selectedBlockIds.length &&
    prevProps.selectedBlockIds.every((id, index) => id === nextProps.selectedBlockIds[index]);
  
  // Check if itemData changed (shallow comparison of relevant fields)
  const itemDataEqual = 
    prevProps.itemData.sectionId === nextProps.itemData.sectionId &&
    prevProps.itemData.paragraphId === nextProps.itemData.paragraphId &&
    prevProps.itemData.globalIndex === nextProps.itemData.globalIndex;
  
  return (
    prevProps.paragraphId === nextProps.paragraphId &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.isHighlighted === nextProps.isHighlighted &&
    prevProps.blockSelectionMode === nextProps.blockSelectionMode &&
    blockIdsEqual &&
    itemDataEqual &&
    prevProps.paragraph === nextProps.paragraph &&
    prevProps.renderWithItalics === nextProps.renderWithItalics &&
    prevProps.onParagraphClick === nextProps.onParagraphClick &&
    prevProps.onBlockClick === nextProps.onBlockClick
  );
});

// BlockView: renders blocks inline within a paragraph, each individually selectable
export const BlockView = memo(({
  paragraph,
  paragraphId,
  sectionId,
  renderWithItalics,
  selectedBlockIds,
  highlightedBlockId,
  onBlockClick,
}) => {
  const blocks = paragraph.orderedBlockIds || [];

  return (
    <div data-paragraph={paragraphId} className="p-2 rounded-md">
      <div className="text-base text-white/70 leading-7">
        {blocks.map((bid) => {
          const b = paragraph.blocks[bid];
          if (!b) return null;
          const content = renderWithItalics(b.text || '', b.italicSegments || []);
          const isSelected = selectedBlockIds.includes(bid);
          const isHighlighted = highlightedBlockId === bid;
          const typeClasses = b.type === 'paragraphStart'
            ? 'text-blue-400 mr-2 font-semibold text-sm'
            : b.type === 'ed' ? 'text-neutral-400 italic'
            : '';
          const isIndented = b.indented;

          return (
            <span
              key={bid}
              data-block={bid}
              className={`mr-1 px-1 rounded cursor-pointer transition-colors
                ${typeClasses}
                ${isSelected ? 'bg-blue-600 text-white' : 'hover:bg-neutral-700/70'}
                ${isHighlighted && !isSelected ? 'bg-neutral-800/60 text-blue-300' : ''}
                ${isIndented ? 'ml-4' : ''}
              `}
              onClick={(e) => {
                e.stopPropagation();
                onBlockClick(bid, e.ctrlKey || e.metaKey, e.shiftKey);
              }}
            >
              {content}
            </span>
          );
        })}
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // Only re-render if blocks in THIS paragraph changed selection or highlight
  const prevBlockIds = prevProps.paragraph.orderedBlockIds || [];
  const nextBlockIds = nextProps.paragraph.orderedBlockIds || [];

  const prevSelected = prevBlockIds.filter(bid => prevProps.selectedBlockIds.includes(bid));
  const nextSelected = nextBlockIds.filter(bid => nextProps.selectedBlockIds.includes(bid));
  const selectedEqual = prevSelected.length === nextSelected.length &&
    prevSelected.every((id, i) => id === nextSelected[i]);

  const prevHasHighlight = prevBlockIds.includes(prevProps.highlightedBlockId);
  const nextHasHighlight = nextBlockIds.includes(nextProps.highlightedBlockId);
  const highlightEqual = prevHasHighlight === nextHasHighlight &&
    (!prevHasHighlight || prevProps.highlightedBlockId === nextProps.highlightedBlockId);

  return (
    prevProps.paragraphId === nextProps.paragraphId &&
    selectedEqual &&
    highlightEqual &&
    prevProps.paragraph === nextProps.paragraph &&
    prevProps.renderWithItalics === nextProps.renderWithItalics &&
    prevProps.onBlockClick === nextProps.onBlockClick
  );
});