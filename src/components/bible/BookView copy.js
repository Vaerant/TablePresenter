import React, { useState, useRef, useEffect } from 'react';
import useSermonStore from '@/stores/sermonStore';
import VerseView from './VerseView';
import { FiChevronLeft, FiChevronRight, FiChevronDown } from 'react-icons/fi';

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
  const buttonRef = useRef(null);

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target) &&
          buttonRef.current && !buttonRef.current.contains(event.target)) {
        setShowChapterPopover(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
    setShowChapterPopover(false);
  };

  const handleVerseClick = (verse, ctrlKey, shiftKey) => {
    setSelectedVerse(verse);
    
    // Send selection to display
    if (typeof window !== 'undefined' && window.electronAPI) {
      const verseData = {
        type: 'verse',
        bookName: activeBook.name,
        chapter: currentChapter,
        verses: verseSelectionMode === 'single' ? [verse] : 
          selectedVerses.some(v => v.chapter === verse.chapter && v.verse === verse.verse) 
            ? selectedVerses.filter(v => !(v.chapter === verse.chapter && v.verse === verse.verse))
            : [...selectedVerses, verse]
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

  return (
    <div className="flex-1 bg-neutral-900 text-white flex flex-col overflow-y-auto h-full">
      {/* Header with navigation */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <div className="flex items-center space-x-4">
          <h1 className="text-2xl font-bold">{activeBook.name}</h1>
          <div className="flex items-center space-x-2">
            <button
              onClick={handlePreviousChapter}
              disabled={chapters.indexOf(currentChapter) === 0}
              className="p-2 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FiChevronLeft />
            </button>
            <span className="text-lg font-semibold px-3">
              Chapter {currentChapter}
            </span>
            <button
              onClick={handleNextChapter}
              disabled={chapters.indexOf(currentChapter) === chapters.length - 1}
              className="p-2 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FiChevronRight />
            </button>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          {/* Selection mode toggle */}
          <select
            value={verseSelectionMode}
            onChange={(e) => setVerseSelectionMode(e.target.value)}
            className="bg-gray-700 text-white px-3 py-1 rounded"
          >
            <option value="single">Single</option>
            <option value="multiple">Multiple</option>
          </select>

          {/* Chapter selector */}
          <div className="relative">
            <button
              ref={buttonRef}
              onClick={() => setShowChapterPopover(!showChapterPopover)}
              className="p-2 rounded bg-gray-700 hover:bg-gray-600"
            >
              <FiChevronDown />
            </button>
            
            {showChapterPopover && (
              <div
                ref={popoverRef}
                className="absolute right-0 top-full mt-2 bg-gray-800 border border-gray-600 rounded shadow-lg z-10 max-h-60 overflow-y-auto"
                style={{ minWidth: '200px' }}
              >
                <div className="grid grid-cols-5 gap-1 p-2">
                  {chapters.map((chapter) => (
                    <button
                      key={chapter}
                      onClick={() => handleChapterSelect(chapter)}
                      className={`p-2 text-center rounded hover:bg-gray-700 ${
                        chapter === currentChapter ? 'bg-blue-600' : 'bg-gray-700'
                      }`}
                    >
                      {chapter}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Chapter content */}
      <div className="flex-1 p-4 overflow-y-auto">
        {currentChapterData ? (
          <div className="space-y-2">
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
      </div>
    </div>
  );
};

export default BookView;
