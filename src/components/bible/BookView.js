import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import useSermonStore from '@/stores/sermonStore';
import VerseView from './VerseView';
import { FiChevronLeft, FiChevronRight, FiChevronsLeft, FiChevronsRight, FiCopy, FiCheck } from 'react-icons/fi';
import { FaCaretUp, FaCaretDown } from "react-icons/fa";

const BookView = () => {
  const {
    activeBook,
    activeBookData,
    activeChapter,
    selectedVerses,
    setActiveChapter,
    setSelectedVerses,
    clearSelectedVerses,
  } = useSermonStore();

  const [showChapterPopover, setShowChapterPopover] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [highlightedVerse, setHighlightedVerse] = useState(null);
  const [lastSelectedIndex, setLastSelectedIndex] = useState(null);
  const [copied, setCopied] = useState(false);
  const [isModifierActive, setIsModifierActive] = useState(false);
  const popoverRef = useRef(null);
  const searchPopoverRef = useRef(null);
  const searchInputRef = useRef(null);
  const bookViewRef = useRef(null);
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
      } else if (event.ctrlKey && event.key === 'c') {
        if (selectedVerses.length > 0) {
          event.preventDefault();
          handleCopySelectedVerses();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  });

  // Focus search input whenever popover shows
  useEffect(() => {
    if (showChapterPopover && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current.focus();
      }, 50);
    }
  }, [showChapterPopover]);

  // Scroll and highlight when explicitly set
  useEffect(() => {
    if (!highlightedVerse) return;
    
    setTimeout(() => {
      scrollToVerse(highlightedVerse);
    }, 50);
  }, [highlightedVerse]);

  // Track modifier keys for user-select styling
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey || e.metaKey || e.shiftKey) {
        setIsModifierActive(true);
      }
    };
    const handleKeyUp = () => {
      setIsModifierActive(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Build flat list of verses for navigation (must be before early return)
  const flatVerses = useMemo(() => {
    if (!activeBookData) return [];
    const list = [];
    let idx = 0;
    const chapters = Object.keys(activeBookData).map(Number).sort((a, b) => a - b);
    chapters.forEach(chapterNum => {
      const chapterData = activeBookData[chapterNum];
      if (!chapterData) return;
      const verseNumbers = Object.keys(chapterData).map(Number).sort((a, b) => a - b);
      verseNumbers.forEach(verseNum => {
        list.push({
          chapter: chapterNum,
          verse: verseNum,
          globalIndex: idx++,
          text: chapterData[verseNum].text
        });
      });
    });
    return list;
  }, [activeBookData]);

  const findSelectedIndex = useCallback(() => {
    if (!selectedVerses || selectedVerses.length === 0) return -1;
    const lastSelected = selectedVerses[selectedVerses.length - 1];
    return flatVerses.findIndex(v => v.chapter === lastSelected.chapter && v.verse === lastSelected.verse);
  }, [selectedVerses, flatVerses]);

  const scrollToVerse = useCallback((verseNumber, retries = 4) => {
    const container = bookViewRef.current;
    if (!container) return;

    const el = container.querySelector(`[data-verse="${verseNumber}"]`);
    if (!el) {
      if (retries > 0) {
        requestAnimationFrame(() => scrollToVerse(verseNumber, retries - 1));
      }
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const paragraphRect = el.getBoundingClientRect();
    const elementOffset = paragraphRect.top - containerRect.top;
    const centerOffset = (containerRect.height - paragraphRect.height) / 2;
    const targetTop = container.scrollTop + elementOffset - centerOffset;

    container.scrollTo({ top: targetTop, behavior: 'smooth' });
  }, []);

  // Handle verse click with ctrl/shift modifier support
  const handleVerseClick = useCallback((verse, isCtrl, isShift) => {
    const currentIndex = flatVerses.findIndex(v => v.chapter === verse.chapter && v.verse === verse.verse);
    
    // Check if clicked verse is already the only selected verse (no modifiers)
    const isSingleSelected = selectedVerses.length === 1 &&
      selectedVerses[0].chapter === verse.chapter &&
      selectedVerses[0].verse === verse.verse;
    
    if (isSingleSelected && !isCtrl && !isShift) {
      // Deselect
      clearSelectedVerses();
      setLastSelectedIndex(null);
      return;
    }
    
    if (isShift && lastSelectedIndex !== null) {
      // Range selection
      const start = Math.min(lastSelectedIndex, currentIndex);
      const end = Math.max(lastSelectedIndex, currentIndex);
      const range = flatVerses.slice(start, end + 1);
      setSelectedVerses(range);
    } else if (isCtrl) {
      // Toggle selection
      const isAlreadySelected = selectedVerses.some(v => v.chapter === verse.chapter && v.verse === verse.verse);
      if (isAlreadySelected) {
        setSelectedVerses(selectedVerses.filter(v => !(v.chapter === verse.chapter && v.verse === verse.verse)));
        setLastSelectedIndex(currentIndex);
      } else {
        setSelectedVerses([...selectedVerses, verse]);
        setLastSelectedIndex(currentIndex);
      }
    } else {
      // Single selection
      setSelectedVerses([verse]);
      setLastSelectedIndex(currentIndex);
    }
  }, [selectedVerses, lastSelectedIndex, flatVerses, setSelectedVerses, clearSelectedVerses]);

  const handlePreviousVerse = useCallback(() => {
    const currentIdx = findSelectedIndex();
    if (currentIdx > 0) {
      const prevVerse = flatVerses[currentIdx - 1];
      setSelectedVerses([prevVerse]);
      setLastSelectedIndex(currentIdx - 1);
      
      // Change chapter if needed
      if (prevVerse.chapter !== activeChapter) {
        setActiveChapter(prevVerse.chapter);
      }
      
      // Scroll and highlight
      setTimeout(() => {
        setHighlightedVerse(prevVerse.verse);
        scrollToVerse(prevVerse.verse);
        setTimeout(() => setHighlightedVerse(null), 2000);
      }, prevVerse.chapter !== activeChapter ? 300 : 50);
    }
  }, [findSelectedIndex, flatVerses, setSelectedVerses, activeChapter, setActiveChapter]);

  const handleNextVerse = useCallback(() => {
    const currentIdx = findSelectedIndex();
    if (currentIdx >= 0 && currentIdx < flatVerses.length - 1) {
      const nextVerse = flatVerses[currentIdx + 1];
      setSelectedVerses([nextVerse]);
      setLastSelectedIndex(currentIdx + 1);
      
      // Change chapter if needed
      if (nextVerse.chapter !== activeChapter) {
        setActiveChapter(nextVerse.chapter);
      }
      
      // Scroll and highlight
      setTimeout(() => {
        setHighlightedVerse(nextVerse.verse);
        scrollToVerse(nextVerse.verse);
        setTimeout(() => setHighlightedVerse(null), 2000);
      }, nextVerse.chapter !== activeChapter ? 300 : 50);
    }
  }, [findSelectedIndex, flatVerses, setSelectedVerses, activeChapter, setActiveChapter]);

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
        // Find the verse in flatVerses and select it
        const targetVerse = flatVerses.find(v => v.chapter === chapterNum && v.verse === verseNum);
        if (targetVerse) {
          setSelectedVerses([targetVerse]);
          setLastSelectedIndex(targetVerse.globalIndex);
        }
        
        setActiveChapter(chapterNum);
        setShowChapterPopover(false);
        setSearchInput('');
        
        // Scroll and highlight after chapter change (if needed)
        setTimeout(() => {
          scrollToVerse(verseNum);
          setHighlightedVerse(verseNum);
          setTimeout(() => setHighlightedVerse(null), 2000);
        }, chapterNum !== activeChapter ? 300 : 100);
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

  const handleCopySelectedVerses = async () => {
    if (selectedVerses.length === 0) return;

    // Sort verses by chapter and verse number
    const sortedVerses = [...selectedVerses].sort((a, b) => {
      if (a.chapter !== b.chapter) return a.chapter - b.chapter;
      return a.verse - b.verse;
    });

    // Build verse text line: [verse no.] text [verse no.] text
    const verseTextLine = sortedVerses.map(v => {
      const verseData = activeBookData[v.chapter]?.[v.verse];
      const verseText = verseData?.text || '';
      return `[${v.verse}] ${verseText}`;
    }).join(' ');

    // Build reference line with ranges
    const referenceGroups = [];
    let currentGroup = { chapter: sortedVerses[0].chapter, verses: [sortedVerses[0].verse] };

    for (let i = 1; i < sortedVerses.length; i++) {
      const v = sortedVerses[i];
      if (v.chapter === currentGroup.chapter && v.verse === currentGroup.verses[currentGroup.verses.length - 1] + 1) {
        // Consecutive verse in same chapter
        currentGroup.verses.push(v.verse);
      } else {
        // New group
        referenceGroups.push(currentGroup);
        currentGroup = { chapter: v.chapter, verses: [v.verse] };
      }
    }
    referenceGroups.push(currentGroup);

    // Format reference groups
    const references = referenceGroups.map((group, index) => {
      const isNewChapter = index === 0 || group.chapter !== referenceGroups[index - 1].chapter;
      const verseRange = group.verses.length === 1 
        ? `${group.verses[0]}` 
        : `${group.verses[0]}-${group.verses[group.verses.length - 1]}`;
      
      if (isNewChapter) {
        return `${activeBook.name} ${group.chapter}:${verseRange}`;
      } else {
        return verseRange;
      }
    }).join(', ');

    const text = `${verseTextLine}\n\n${references} KJV`;

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="flex-1 bg-neutral-900 text-white flex flex-col overflow-y-scroll h-full dark-scroll relative" ref={bookViewRef}>
      <h1 className="text-4xl font-bold my-14 ml-6 text-center">{activeBook.name} {activeChapter}</h1>

      {currentChapterData ? (
        <div className="flex flex-col px-4" style={{ userSelect: isModifierActive ? 'none' : 'auto' }}>
          {verses.map((verseNumber) => {
            const verse = currentChapterData[verseNumber];
            return (
              <VerseView
                key={`${activeChapter}-${verseNumber}`}
                verse={verse}
                isSelected={isVerseSelected(verse)}
                isHighlighted={highlightedVerse === verse.verse}
                onVerseClick={handleVerseClick}
              />
            );
          })}
        </div>
      ) : (
        <p className="text-gray-400">No verses found for this chapter.</p>
      )}

      <div className="h-full"></div>

      {/* Copy button */}
      {selectedVerses.length > 0 && (
        <div className="fixed bottom-18 right-8 z-20 bg-neutral-900 rounded-md border border-neutral-800 shadow-lg p-2 flex items-center gap-2 transition-all duration-200 hover:bg-neutral-750">
          <button
            onClick={handleCopySelectedVerses}
            className="p-4 rounded bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-700 flex items-center gap-2 transition-colors"
            title="Copy selected verses"
          >
            {copied ? (
              <>
                <FiCheck size={16} className="text-white" />
              </>
            ) : (
              <>
                <FiCopy size={16} />
              </>
            )}
          </button>
        </div>
      )}

      <div className='flex-grow flex items-center justify-center gap-3 sticky bottom-8 z-10 mt-12 w-full'>
        <div className="relative w-fit flex items-center justify-center gap-0 p-2 bg-neutral-900 rounded-md border border-neutral-800 shadow-lg">
          <button
            onClick={handlePreviousChapter}
            disabled={chapters.indexOf(activeChapter) === 0}
            className="p-3 px-5 rounded bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-700 disabled:opacity-50"
          >
            <FiChevronsLeft size={16} />
          </button>
          <button
            onClick={handlePreviousVerse}
            disabled={flatVerses.length === 0 || findSelectedIndex() <= 0}
            className="p-3 px-5 rounded bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-700 disabled:opacity-50"
          >
            <FiChevronLeft size={20} />
          </button>
          
          <button
            ref={buttonRef}
            onClick={() => setShowChapterPopover(!showChapterPopover)}
            className="px-4 mx-3 rounded bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-700 flex items-center gap-2 transition-colors"
          >
            <p className="text-sm font-semibold my-2">{activeBook.name} {activeChapter}</p>
            {showChapterPopover ? <FaCaretDown /> : <FaCaretUp />}
          </button>
          
          <button
            onClick={handleNextVerse}
            disabled={flatVerses.length === 0 || findSelectedIndex() < 0 || findSelectedIndex() >= flatVerses.length - 1}
            className="p-3 px-5 rounded bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-700 disabled:opacity-50"
          >
            <FiChevronRight size={20} />
          </button>
          <button
            onClick={handleNextChapter}
            disabled={chapters.indexOf(activeChapter) === chapters.length - 1}
            className="p-3 px-5 rounded bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-700 disabled:opacity-50"
          >
            <FiChevronsRight size={16} />
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