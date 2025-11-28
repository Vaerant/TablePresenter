import React from 'react';

// UPDATED: selectedBlockIds (array) and onBlockClick with modifiers
const buildMergedBlocks = ({ paragraph, renderWithItalics, blockSelectionMode, selectedBlockIds = [], onBlockClick }) => {
  const blocks = paragraph.orderedBlockIds || [];
  return blocks.map((bid) => {
    const b = paragraph.blocks[bid];
    if (!b) return null;
    const content = renderWithItalics(b.text || '', b.italicSegments || []);
    const clickable = blockSelectionMode;
    const selected = selectedBlockIds.includes(bid);
    return (
      <span
        key={bid}
        data-block={bid}
        className={`mr-1 ${clickable ? 'px-1 rounded cursor-pointer' : ''} ${
          clickable && selected ? 'bg-blue-600 text-white' : clickable ? 'hover:bg-neutral-700/70' : ''
        }`}
        onClick={(e) => {
          if (!clickable) return;
          e.stopPropagation();
          onBlockClick && onBlockClick(bid, e.ctrlKey || e.metaKey, e.shiftKey); // UPDATED pass modifiers
        }}
      >
        {content}
      </span>
    );
  }).filter(Boolean);
};

export const ParagraphView = ({
  paragraph,
  paragraphId,
  paragraphNumber,
  isSelected,
  isHighlighted,
  onClick,
  renderWithItalics,
  blockSelectionMode,
  selectedBlockIds,
  onBlockClick
}) => {
  const merged = buildMergedBlocks({ paragraph, renderWithItalics, blockSelectionMode, selectedBlockIds, onBlockClick });
  return (
    <div
      data-paragraph={paragraphId}
      data-paragraph-number={paragraphNumber}
      className={`rounded-md cursor-pointer ${
        isSelected ? 'bg-white text-black' : 'hover:bg-neutral-800/60'
      } ${isHighlighted && !isSelected ? 'ring-2 ring-neutral-400' : ''} p-2`}
      onClick={onClick}
    >
      <div className="text-base leading-7">{merged}</div>
    </div>
  );
};
