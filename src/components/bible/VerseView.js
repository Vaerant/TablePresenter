import React, { forwardRef, memo } from 'react';

const VerseView = memo(forwardRef(({ verse, isSelected, isHighlighted, onVerseClick }, ref) => {

  const parseVerseText = (text) => {
    const parts = [];
    let currentIndex = 0;
    let partKey = 0;

    const regex = /‹([^›]+)›/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      // Add text before the match
      if (match.index > currentIndex) {
        parts.push(
          <span key={partKey++}>
            {text.substring(currentIndex, match.index)}
          </span>
        );
      }

      // Add the bracketed text in red (without brackets)
      parts.push(
        <span key={partKey++} className="text-red-400">
          {match[1]}
        </span>
      );

      currentIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (currentIndex < text.length) {
      parts.push(
        <span key={partKey++}>
          {text.substring(currentIndex)}
        </span>
      );
    }

    return parts;
  };

  const handleClick = (e) => {
    e.stopPropagation();
    onVerseClick(verse, e.ctrlKey || e.metaKey, e.shiftKey);
  };

  return (
    <div 
      className={`rounded-md cursor-pointer group transition-[margin] hover:!bg-neutral-800/60
        ${isHighlighted ? 'ml-2' : 'ml-0'} 
        ${isHighlighted && !isSelected ? 'bg-neutral-800/60' : ''}
        ${isSelected ? 'bg-blue-800/10' : isHighlighted ? '' : 'hover:bg-neutral-800/60'} 
        p-2`}
      onClick={handleClick}
    >
      <span
        ref={ref}
        data-verse={verse.verse}
        className={`py-1`}
      >
        <span 
          className={`text-sm font-semibold mr-2 ${
            isSelected 
              ? 'text-blue-400' 
              : 'text-blue-400'
          }`}
        >
          {verse.verse}
        </span>
        <span 
          className={`text-base text-white/70 group-hover:text-white leading-7
            ${isHighlighted && !isSelected ? '!text-blue-300' : ''}
            ${isSelected ? '!text-blue-500' : ''}
          `}
        >
          {parseVerseText(verse.text)}
        </span>
      </span>
    </div>
  );
}), (prevProps, nextProps) => {
  // Custom comparison function to prevent unnecessary re-renders
  return (
    prevProps.verse.verse === nextProps.verse.verse &&
    prevProps.verse.chapter === nextProps.verse.chapter &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.isHighlighted === nextProps.isHighlighted &&
    prevProps.verse.text === nextProps.verse.text &&
    prevProps.onVerseClick === nextProps.onVerseClick
  );
});

VerseView.displayName = 'VerseView';

export default VerseView;
