import React, { useState, useRef, useEffect } from 'react';
import useSermonStore from '@/stores/sermonStore';
import VerseView from './VerseView';
import { FiChevronLeft, FiChevronRight, FiChevronDown, FiChevronUp } from 'react-icons/fi';
import { FaCaretUp } from "react-icons/fa";


const BookView = () => {
  const {
    activeBook,
    activeBookData,
    currentChapter,
    selectedVerses,
    verseSelectionMode,
    displaySettings,
    setCurrentChapter,
    setSelectedVerse,
    setVerseSelectionMode,
    clearSelectedVerses
  } = useSermonStore();

  const [showChapterPopover, setShowChapterPopover] = useState(false);
  const popoverRef = useRef(null);
  const [minHeight, setMinHeight] = useState('0px');
  const [isTransitioning, setIsTransitioning] = useState(false); // New state for transition tracking
  const [needsScroll, setNeedsScroll] = useState(false); // New state to track if scrolling is needed

  // Listen for clear events from main process
  useEffect(() => {
    if (typeof window !== 'undefined' && window.electronAPI) {
      const handleParagraphClear = () => {
        clearSelectedVerses();
      };

      window.electronAPI.on('paragraph:cleared', handleParagraphClear);

      return () => {
        window.electronAPI.off('paragraph:cleared', handleParagraphClear);
      };
    }
  }, [clearSelectedVerses]);

  if (!activeBook || !activeBookData) {
    return (
      <div className="flex-1 p-4 bg-neutral-900 flex items-center justify-center">
        <p className='text-neutral-500'>Select a book to view.</p>
      </div>
    );
  }

  const chapters = Object.keys(activeBookData).map(Number).sort((a, b) => a - b);
  const currentChapterData = activeBookData[currentChapter];
  const verses = currentChapterData ? Object.keys(currentChapterData).map(Number).sort((a, b) => a - b) : [];

  const handlePreviousChapter = () => {
    const currentIndex = chapters.indexOf(currentChapter);
    if (currentIndex > 0) {
      setCurrentChapter(chapters[currentIndex - 1]);
    }
  };

  const handleNextChapter = () => {
    const currentIndex = chapters.indexOf(currentChapter);
    if (currentIndex < chapters.length - 1) {
      setCurrentChapter(chapters[currentIndex + 1]);
    }
  };

  const handleChapterSelect = (chapter) => {
    setCurrentChapter(chapter);
  };

  const handleVerseClick = (verse, ctrlKey, shiftKey) => {
    setSelectedVerse(verse, ctrlKey, shiftKey);

    // Send selection to display
    if (typeof window !== 'undefined' && window.electronAPI) {
      const { selectedVerses } = useSermonStore.getState();
      const verseData = {
        type: 'verse',
        bookName: activeBook.name,
        chapter: currentChapter,
        verses: selectedVerses
      };

      window.electronAPI.send('paragraph:selected', {
        paragraphData: verseData,
        displaySettings: displaySettings || {
          enabled: true,
          showTitle: true,
          showDate: false,
          showContent: true
        }
      });
    }
  };

  const isVerseSelected = (verse) => {
    return selectedVerses.some(v => v.chapter === verse.chapter && v.verse === verse.verse);
  };

  // Calculate minHeight based on rows when popover is shown
  useEffect(() => {
    if (showChapterPopover && popoverRef.current) {
      const rect = popoverRef.current.getBoundingClientRect();
      const containerWidth = rect.width;
      const buttonWidth = 56 + 8; // min-w-14 (56px) + gap-2 (8px)
      const columns = Math.max(1, Math.floor(containerWidth / buttonWidth)); // Ensure at least 1 column
      const rows = Math.ceil(chapters.length / columns);
      const rowHeight = 40 + 12; // min-h-10 (40px) + gap-2 (8px)
      const calculatedHeight = rows * rowHeight;
      setMinHeight(Math.min(calculatedHeight, 256) + 'px'); // Max height of 64 (16*4) to allow scrolling
      setNeedsScroll(calculatedHeight > 256); // Set if scrolling is needed
    } else {
      setMinHeight('0px');
      setNeedsScroll(false);
    }
  }, [showChapterPopover, chapters]);

  const toggleChapterPopover = () => {
    setShowChapterPopover(!showChapterPopover);
    setIsTransitioning(true);
    setTimeout(() => setIsTransitioning(false), 200); // Match transition duration
  };

  return (
    <div className="flex-1 bg-neutral-900 text-white flex flex-col overflow-y-scroll h-full dark-scroll relative">
      <h1 className="text-4xl font-bold my-14 ml-6 text-center">{activeBook.name} {currentChapter}</h1>

      {currentChapterData ? (
        <div className="flex flex-col px-4">
          {verses.map((verseNumber) => {
            const verse = currentChapterData[verseNumber];
            return (
              <VerseView
                key={`${currentChapter}-${verseNumber}`}
                verse={verse}
                isSelected={isVerseSelected(verse)}
                onVerseClick={handleVerseClick}
              />
            );
          })}
        </div>
      ) : (
        <p className="text-gray-400">No verses found for this chapter.</p>
      )}

      <div className="h-full"></div>

      <div 
        ref={popoverRef}
        className={`grid gap-2 w-full max-w-[60%] mx-auto justify-center items-center z-20 border border-neutral-800 shadow-lg p-2 ${showChapterPopover ? `h-fit max-h-64 ${(!isTransitioning || needsScroll) ? 'overflow-y-auto' : 'overflow-hidden'}` : 'h-0 overflow-hidden py-0 border-none'} transition-all duration-200 -mb-4 mt-4 rounded-lg sticky bottom-26 bg-neutral-900`} 
        style={{ 
          gridTemplateColumns: 'repeat(auto-fit, minmax(56px, 1fr))',
          minHeight: minHeight
        }}
      >
        {chapters.map((chapter) => (
          <button
            key={chapter}
            onClick={() => handleChapterSelect(chapter)}
            className={`min-w-14 min-h-10 text-center rounded hover:bg-neutral-700/60 ${chapter === currentChapter ? 'bg-white text-black font-bold hover:bg-white' : 'bg-neutral-800/40'}`}
          >
            {chapter}
          </button>
        ))}
      </div>

      <div className='flex-grow flex items-center justify-center gap-3 sticky bottom-8 z-10 mt-12'>
        <div className="w-fit flex items-center justify-center gap-3 p-2 bg-neutral-900 rounded-md border border-neutral-800 shadow-lg">
          <button
            onClick={handlePreviousChapter}
            className="p-3 px-5 rounded bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-700"
          >
            <FiChevronLeft size={20} />
          </button>
          <button
            onClick={toggleChapterPopover} // Use the new function
            className="px-4 rounded bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-700 flex items-center gap-2"
          >
            <p className="text-sm font-semibold my-2">{activeBook.name} {currentChapter}</p>
            <FaCaretUp />
          </button>
          <button
            onClick={handleNextChapter}
            className="p-3 px-5 rounded bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-700"
          >
            <FiChevronRight size={20} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default BookView;
