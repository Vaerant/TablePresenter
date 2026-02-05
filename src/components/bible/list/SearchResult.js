import React from 'react';

const SearchResult = ({ 
  verse, 
  onClick, 
  variant = 'verse', // 'verse', 'book', 'chapter'
  className = ''
}) => {
  const getVariantStyles = () => {
    switch (variant) {
      case 'book':
        return 'bg-neutral-800 hover:bg-neutral-700/30';
      case 'chapter':
        return 'bg-neutral-800 hover:bg-neutral-700/30';
      case 'verse':
      default:
        return 'bg-neutral-800 hover:bg-neutral-700/30';
    }
  };

  return (
    <div 
      className={`p-3 rounded-lg cursor-pointer ${getVariantStyles()} ${className}`}
      onClick={() => onClick(verse)}
    >
      <div className="flex justify-between items-start mb-2">
        <span className="font-semibold text-sm">
          {verse.book_name} {verse.chapter}:{verse.verse}
        </span>
        {variant === 'book' && (
          <span className="text-xs text-neutral-500">Chapter Content</span>
        )}
      </div>
      <p className="text-white text-sm leading-relaxed">
        {verse.text}
      </p>
    </div>
  );
};

export default SearchResult;
