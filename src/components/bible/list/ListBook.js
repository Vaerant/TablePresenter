import React, { useState, useEffect, forwardRef } from 'react';
import { FiChevronRight } from 'react-icons/fi';
import { MdKeyboardArrowRight } from "react-icons/md";
import { MdChevronRight } from "react-icons/md";

import useSermonStore from '@/stores/sermonStore';

const ListBook = forwardRef(({ data, onPress, onChapterPress, isActive = false, isSelected = false }, ref) => {
  const { activeChapter } = useSermonStore();
  const [isExpanded, setIsExpanded] = useState(false);

  const handleBookClick = () => {
    if (isActive) return; // Do nothing if already active
    onPress(data);
  };

  const handleExpandClick = (e) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  };

  const handleChapterClick = (chapterNumber, e) => {
    e.stopPropagation();
    onChapterPress(data, chapterNumber);
  };

  const chapters = data.chapters ? Object.keys(data.chapters).map(Number).sort((a, b) => a - b) : [];

  return (
    <div ref={isSelected ? ref : null} className={`flex flex-col px-2`}>
      <div 
        className={`flex items-center cursor-pointer`}
        onClick={handleBookClick}
      >
        <div className={`flex-1 p-2 px-3 rounded flex items-center justify-between bg-neutral-900 border border-neutral-900
            ${
            isActive ? '!bg-neutral-700/60' : ''
            }
            ${
            isSelected
              ? '!border-neutral-500/50'
              : 'hover:bg-neutral-800'
            }
          `}>
          <h3 className={`font-medium text-white`}>
            {data.name}
          </h3>
          {chapters.length > 0 && (
            <button
              onClick={handleExpandClick}
              className="p-1 hover:bg-neutral-600 rounded transition-colors px-4 expander group"
            >
              <MdChevronRight
                className={`text-white/30 group-hover:text-white transition-transform ${isExpanded ? 'rotate-90' : ''} expander:hover:text-white`}  
                size={20}
              />
            </button>
          )}
        </div>
      </div>
      
      {isExpanded && chapters.length > 0 && (
        <div className="mt-2 mb-2">
          <div className="flex flex-wrap gap-2">
            {chapters.map((chapterNum) => (
              <button
                key={chapterNum}
                onClick={(e) => handleChapterClick(chapterNum, e)}
                className={`flex-1 min-w-[4.5rem] min-h-10 text-sm text-center rounded hover:bg-neutral-700/60 ${
                chapterNum === activeChapter && isActive
                  ? 'bg-white text-black font-bold hover:bg-white' 
                  : 'bg-neutral-800/40'
              }`}
              >
                {chapterNum}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

ListBook.displayName = 'ListBook';

export default ListBook;
