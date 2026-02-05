import React, { useState, useRef, useEffect } from 'react';
import useSermonStore from '@/stores/sermonStore';
import VerseView from './VerseView';
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import { FaCaretUp, FaCaretDown } from "react-icons/fa";

const BookView = () => {
  const {
    activeBook,
    activeBookData,
    activeChapter,
    selectedVerses,
    setActiveChapter,
  } = useSermonStore();

  const [showChapterPopover, setShowChapterPopover] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const popoverRef = useRef(null);
  const searchPopoverRef = useRef(null);
  const searchInputRef = useRef(null);
  const locationNumberSearchRef = useRef(null);
  const buttonRef = useRef(null);

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target) &&
          searchPopoverRef.current && !searchPopoverRef.current.contains(event.target) &&
          buttonRef.current && !buttonRef.current.contains(event.target)) {
        setShowChapterPopover(false);
      }
    };

    if (showChapterPopover) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showChapterPopover]);

  // Close popover on escape key and handle Ctrl+G
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setShowChapterPopover(false);
        setSearchInput('');
      } else if (event.ctrlKey && event.key === 'g') {
        event.preventDefault();
        setShowChapterPopover(true);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Focus search input whenever popover shows
  useEffect(() => {
    if (showChapterPopover && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current.focus();
      }, 50);
    }
  }, [showChapterPopover]);


  if (!activeBook || !activeBookData) {
    return (
      <div className="flex-1 p-4 bg-neutral-900 flex items-center justify-center">
        <p className='text-neutral-500'>Select a book to view.</p>
      </div>
    );
  }

  const chapters = Object.keys(activeBookData).map(Number).sort((a, b) => a - b);
  const currentChapterData = activeBookData[activeChapter];
  const verses = currentChapterData ? Object.keys(currentChapterData).map(Number).sort((a, b) => a - b) : [];

  const handlePreviousChapter = () => {
    const currentIndex = chapters.indexOf(activeChapter);
    if (currentIndex > 0) {
      setActiveChapter(chapters[currentIndex - 1]);
    }
  };

  const handleNextChapter = () => {
    const currentIndex = chapters.indexOf(activeChapter);
    if (currentIndex < chapters.length - 1) {
      setActiveChapter(chapters[currentIndex + 1]);
    }
  };

  const handleChapterSelect = (chapter) => {
    setActiveChapter(chapter);
    setShowChapterPopover(false);
    setSearchInput('');
  };

  const handleVerseClick = (verse, ctrlKey, shiftKey) => {
    setSelectedVerse(verse, ctrlKey, shiftKey);

    // Send selection to display
    if (typeof window !== 'undefined' && window.electronAPI) {
      const { selectedVerses } = useSermonStore.getState();
      const verseData = {
        type: 'verse',
        bookName: activeBook.name,
        chapter: activeChapter,
        verses: selectedVerses
      };
    }
  };

  const isVerseSelected = (verse) => {
    return selectedVerses.some(v => v.chapter === verse.chapter && v.verse === verse.verse);
  };

  const isValidChapter = (chapter) => {
    return chapters.includes(parseInt(chapter));
  };

  const isValidVerse = (chapter, verse) => {
    const chapterData = activeBookData[parseInt(chapter)];
    if (!chapterData) return false;
    const verseNumbers = Object.keys(chapterData).map(Number);
    return verseNumbers.includes(parseInt(verse));
  };

  const handleSearchNavigation = () => {
    const trimmedInput = searchInput.trim();
    if (!trimmedInput) return;

    // Split by colon, space, or comma
    const parts = trimmedInput.split(/[:\s,]+/).filter(part => part.length > 0);
    const chapterNum = parseInt(parts[0]);
    
    if (!isValidChapter(chapterNum)) return;

    if (parts.length === 1) {
      // Just chapter number
      setActiveChapter(chapterNum);
      setShowChapterPopover(false);
      setSearchInput('');
    } else if (parts.length >= 2) {
      const verseNum = parseInt(parts[1]);
      if (isValidVerse(chapterNum, verseNum)) {
        setActiveChapter(chapterNum);
        setShowChapterPopover(false);
        setSearchInput('');
        
        // Scroll to verse after a short delay to ensure chapter is loaded
        setTimeout(() => {
          const verseElement = document.querySelector(`[data-verse="${verseNum}"]`);
          if (verseElement) {
            verseElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            // Highlight the verse after scrolling
            setHighlightedVerse(verseNum);
            
            // Clear highlight after 3 seconds
            setTimeout(() => {
              clearHighlightedVerse();
            }, 3000);
          }
        }, 100);
      }
    }
  };

  const handleSearchInputChange = (e) => {
    const value = e.target.value;
    // Allow numbers, colons, spaces, and commas
    if (/^[\d:\s,]*$/.test(value)) {
      setSearchInput(value);
    }
  };

  const handleSearchKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSearchNavigation();
    }
  };

  const isSearchInputValid = () => {
    const trimmedInput = searchInput.trim();
    if (!trimmedInput) return false;

    // Split by colon, space, or comma
    const parts = trimmedInput.split(/[:\s,]+/).filter(part => part.length > 0);
    const chapterNum = parseInt(parts[0]);
    
    if (!isValidChapter(chapterNum)) return false;

    if (parts.length >= 2) {
      const verseNum = parseInt(parts[1]);
      return isValidVerse(chapterNum, verseNum);
    }

    return parts.length === 1;
  };

  return (
    <div className="flex-1 bg-neutral-900 text-white flex flex-col overflow-y-scroll h-full dark-scroll relative">
      <h1 className="text-4xl font-bold my-14 ml-6 text-center">{activeBook.name} {activeChapter}</h1>

      {currentChapterData ? (
        <div className="flex flex-col px-4">
          {verses.map((verseNumber) => {
            const verse = currentChapterData[verseNumber];
            return (
              <VerseView
                key={`${activeChapter}-${verseNumber}`}
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

      <div className='flex-grow flex items-center justify-center gap-3 sticky bottom-8 z-10 mt-12 w-full'>
        <div className="relative w-fit flex items-center justify-center gap-3 p-2 bg-neutral-900 rounded-md border border-neutral-800 shadow-lg">
          <button
            onClick={handlePreviousChapter}
            disabled={chapters.indexOf(activeChapter) === 0}
            className="p-3 px-5 rounded bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-700 disabled:opacity-50"
          >
            <FiChevronLeft size={20} />
          </button>
          
          <button
            ref={buttonRef}
            onClick={() => setShowChapterPopover(!showChapterPopover)}
            className="px-4 rounded bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-700 flex items-center gap-2 transition-colors"
          >
            <p className="text-sm font-semibold my-2">{activeBook.name} {activeChapter}</p>
            {showChapterPopover ? <FaCaretDown /> : <FaCaretUp />}
          </button>
          
          <button
            onClick={handleNextChapter}
            disabled={chapters.indexOf(activeChapter) === chapters.length - 1}
            className="p-3 px-5 rounded bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FiChevronRight size={20} />
          </button>

        </div>

        {/* Chapter Popover */}
        <div 
          ref={popoverRef}
          className={`absolute bottom-38 z-20 bg-neutral-900 border border-neutral-800 shadow-lg rounded-md p-2 h-fit max-h-64 w-[50%] overflow-y-auto flex flex-wrap gap-2 transition-all duration-150
              ${showChapterPopover ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0 pointer-events-none'}
            `}
        >
          {chapters.map((chapter) => (
            <button
              key={chapter}
              onClick={() => handleChapterSelect(chapter)}
              className={`flex-1 min-w-[4.5rem] min-h-10 text-sm text-center rounded hover:bg-neutral-700/60 ${
                chapter === activeChapter 
                  ? 'bg-white text-black font-bold hover:bg-white' 
                  : 'bg-neutral-800/40'
              }`}
            >
              {chapter}
            </button>
          ))}
        </div>

        {/* Search Popover - positioned below chapter popover */}
        <div 
          ref={searchPopoverRef}
          className={`absolute bottom-18 z-20 bg-neutral-900 border border-neutral-800 shadow-lg rounded-md p-4 w-fit transition-all duration-150
              ${showChapterPopover ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0 pointer-events-none'}
            `}
        >
          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              <input
                ref={searchInputRef}
                type="text"
                value={searchInput}
                onChange={handleSearchInputChange}
                onKeyPress={handleSearchKeyPress}
                placeholder="Go to chapter:verse"
                className="w-full rounded focus:outline-none p-2 hover:bg-neutral-800/60 bg-neutral-800 focus:bg-neutral-800 text-sm !text-neutral-500 focus:!text-white hover:!text-neutral-300 transition-colors"
              />
              <button
                onClick={handleSearchNavigation}
                disabled={!isSearchInputValid()}
                className="px-3 py-2 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 rounded text-sm"
              >
                Go
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BookView;