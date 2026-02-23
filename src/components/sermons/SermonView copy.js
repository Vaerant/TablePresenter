import React, { useEffect, useMemo, useRef, useState } from 'react';
import useSermonStore from '@/stores/sermonStore';
import { sermonSearch } from '@/lib/sermonSearch';
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import { FaCaretUp, FaCaretDown } from 'react-icons/fa';
import { ParagraphView, BlockView } from './ParagraphViews'; // NEW

const SermonView = () => {
  const {
    activeSermon,
    activeSermonData,
    selectedParagraph,
    selectedParagraphs,
    displaySettings,
    setSelectedParagraph,
    setSelectedParagraphs,
    clearSelectedParagraph,
    clearSelectedVerses,
    setActiveSermonData
  } = useSermonStore();
  // console.log('Active sermon data in SermonView:', activeSermonData);

  const [sermonData, setSermonData] = useState(null);
  const [showSectionPopover, setShowSectionPopover] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [highlightedParagraphId, setHighlightedParagraphId] = useState(null);
  const [blockSelectionMode, setBlockSelectionMode] = useState(false);
  const [selectedBlockId, setSelectedBlockId] = useState(null);
  const [selectedParagraphIds, setSelectedParagraphIds] = useState([]);
  const [lastParagraphIndex, setLastParagraphIndex] = useState(null);
  const [selectedBlockIds, setSelectedBlockIds] = useState([]);
  const [lastBlockGlobalIndex, setLastBlockGlobalIndex] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const popoverRef = useRef(null);
  const searchPopoverRef = useRef(null);
  const searchInputRef = useRef(null);
  const buttonRef = useRef(null);
  const sermonViewRef = useRef(null);
  const highlightTimeoutRef = useRef(null);

  // Load sermon structure if needed
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!activeSermon) {
        setSermonData(null);
        return;
      }
      
      // If activeSermonData is already in the store (set by SermonList/SearchModal), use it
      if (activeSermonData && activeSermonData.sections && activeSermonData.orderedSectionIds) {
        if (mounted) setSermonData(activeSermonData);
        return;
      }

      // If activeSermon already has sections, use it immediately
      if (activeSermon.sections && activeSermon.orderedSectionIds) {
        if (mounted) setSermonData(activeSermon);
        return;
      }
      
      // Show minimal loading state
      setIsLoading(true);
      
      try {
        // Use requestIdleCallback for better performance
        const loadData = async () => {
          const loaded = await sermonSearch.loadSermon(activeSermon.uid);
          if (mounted && loaded) {
            setSermonData(loaded);
            setActiveSermonData(loaded);
          }
        };
        
        if (window.requestIdleCallback) {
          window.requestIdleCallback(loadData, { timeout: 100 });
        } else {
          await loadData();
        }
      } catch (error) {
        console.error('Failed to load sermon structure:', error);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };
    
    load();
    return () => {
      mounted = false;
    };
  }, [activeSermon, activeSermonData]);

  // Build ordered sections and a flat list of all paragraphs for navigation
  const orderedSections = useMemo(() => {
    if (!sermonData?.sections || !sermonData?.orderedSectionIds) return [];
    return sermonData.orderedSectionIds.map(sectionId => {
      const section = sermonData.sections[sectionId];
      return { id: sectionId, number: section.number, order: section.order, paragraphs: section.paragraphs, orderedParagraphIds: section.orderedParagraphIds };
    });
  }, [sermonData]);

  const navigableSectionEntries = useMemo(() => {
    const entries = [];
    orderedSections.forEach(sec => {
      const match = String(sec.number).match(/^(\d+)(?:-(\d+))?$/);
      if (!match) return;
      const start = parseInt(match[1], 10);
      const end = match[2] ? parseInt(match[2], 10) : start;
      if (!Number.isInteger(start) || !Number.isInteger(end) || end < start) return;
      for (let n = start; n <= end; n += 1) {
        entries.push({ label: n, sectionId: sec.id });
      }
    });
    return entries;
  }, [orderedSections]);

  const flatParagraphs = useMemo(() => {
    // modified: add globalIndex
    const list = [];
    let idx = 0;
    orderedSections.forEach(sec => {
      (sec.orderedParagraphIds || []).forEach(parId => {
        const p = sec.paragraphs[parId];
        list.push({
          sectionId: sec.id,
          sectionNumber: sec.number,
            paragraphId: parId,
            paragraphOrder: p.order,
            globalIndex: ++idx
        });
      });
    });
    return list;
  }, [orderedSections]);

  // NEW: global flatBlocks list for cross-paragraph block range selection
  const flatBlocks = useMemo(() => {
    const list = [];
    let idx = 0;
    orderedSections.forEach(sec => {
      (sec.orderedParagraphIds || []).forEach(parId => {
        const paragraph = sec.paragraphs[parId];
        (paragraph.orderedBlockIds || []).forEach(bid => {
          list.push({
            sectionId: sec.id,
            paragraphId: parId,
            blockId: bid,
            globalIndex: idx++
          });
        });
      });
    });
    return list;
  }, [orderedSections]);

  const findSelectedIndex = () => {
    if (!selectedParagraph) return -1;
    return flatParagraphs.findIndex(p => p.sectionId === selectedParagraph.sectionId && p.paragraphId === selectedParagraph.paragraphId);
  };

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        popoverRef.current && !popoverRef.current.contains(event.target) &&
        searchPopoverRef.current && !searchPopoverRef.current.contains(event.target) &&
        buttonRef.current && !buttonRef.current.contains(event.target)
      ) {
        setShowSectionPopover(false);
      }
    };
    if (showSectionPopover) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showSectionPopover]);

  // Close popover on escape and open with Ctrl+G
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setShowSectionPopover(false);
        setSearchInput('');
      } else if (event.ctrlKey && event.key === 'g') {
        event.preventDefault();
        setShowSectionPopover(true);
      } 
      // else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      //   event.preventDefault();
      //   handlePreviousParagraph();
      // } else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      //   event.preventDefault();
      //   handleNextParagraph();
      // }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  });

  // Focus search input when popover shows
  useEffect(() => {
    if (showSectionPopover && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [showSectionPopover]);

  const scrollToParagraph = (paragraphId, retries = 6) => {
    const container = sermonViewRef.current;
    if (!container) return;

    const el = container.querySelector(`[data-paragraph="${paragraphId}"]`);
    if (!el) {
      if (retries > 0) {
        requestAnimationFrame(() => scrollToParagraph(paragraphId, retries - 1));
      }
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const paragraphRect = el.getBoundingClientRect();
    const elementOffset = paragraphRect.top - containerRect.top;
    const centerOffset = (containerRect.height - paragraphRect.height) / 2;
    const targetTop = container.scrollTop + elementOffset - centerOffset;

    container.scrollTo({ top: targetTop, behavior: 'smooth' });
  };

  // Scroll to selected paragraph
  useEffect(() => {
    if (!selectedParagraph) return;
    
    // Clear any pending highlight timeout
    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
    }
    
    setTimeout(() => {
      scrollToParagraph(selectedParagraph.paragraphId);
      setHighlightedParagraphId(selectedParagraph.paragraphId);
      
      // Store the timeout ID so we can clear it if needed
      highlightTimeoutRef.current = setTimeout(() => {
        setHighlightedParagraphId(null);
        highlightTimeoutRef.current = null;
      }, 2000);
    }, 100);
    
    return () => {
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, [selectedParagraph]);

  // FIX keep hook order stable
  useEffect(() => {
    if (!blockSelectionMode) {
      setSelectedBlockId(null);
      setSelectedBlockIds([]); // NEW clear multi block selection
    }
  }, [blockSelectionMode]);

  if (!activeSermon) {
    return (
      <div className="flex-1 p-4 bg-neutral-900 flex items-center justify-center">
        <p className="text-neutral-500">Select a sermon to view.</p>
      </div>
    );
  }

  if (isLoading) {
  // if (true) {
    return (
      <div className="flex-1 bg-neutral-900 text-white flex flex-col h-full overflow-y-scroll dark-scroll">
        {/* Show sermon header immediately while loading */}
        <h1 className="text-4xl font-bold my-14 ml-6 text-center">
          {sermonData?.title} <span className="text-neutral-400 text-xl font-normal ml-2">{sermonData?.date}</span>
        </h1>
        
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-neutral-400 mb-2">Loading content...</div>
            <div className="animate-pulse">
              <div className="h-4 bg-neutral-700 rounded w-48 mx-auto mb-2"></div>
              <div className="h-4 bg-neutral-700 rounded w-32 mx-auto"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const handlePreviousParagraph = () => {
    const idx = findSelectedIndex();
    const prevIdx = idx > 0 ? idx - 1 : -1;
    scrollToParagraph(prevIdx >= 0 ? flatParagraphs[prevIdx].paragraphId : null);
    if (prevIdx >= 0) {
      const p = flatParagraphs[prevIdx];
      setSelectedParagraph({ sectionId: p.sectionId, paragraphId: p.paragraphId });
    }
  };

  const handleNextParagraph = () => {
    const idx = findSelectedIndex();
    const nextIdx = idx >= 0 && idx < flatParagraphs.length - 1 ? idx + 1 : (idx === -1 && flatParagraphs.length > 0 ? 0 : -1);
    scrollToParagraph(nextIdx >= 0 ? flatParagraphs[nextIdx].paragraphId : null);
    if (nextIdx >= 0) {
      const p = flatParagraphs[nextIdx];
      setSelectedParagraph({ sectionId: p.sectionId, paragraphId: p.paragraphId });
    }
  };

  const navigateToSection = (sectionId, targetNumber) => {
    const section = sermonData?.sections?.[sectionId];
    if (!section?.orderedParagraphIds?.length) return;
    let targetParagraphId = section.orderedParagraphIds[0];
    if (Number.isInteger(targetNumber)) {
      const targetText = String(targetNumber);
      const match = section.orderedParagraphIds.find(parId => {
        const paragraph = section.paragraphs?.[parId];
        const firstBlockId = paragraph?.orderedBlockIds?.[0];
        const firstBlock = firstBlockId ? paragraph.blocks?.[firstBlockId] : null;
        return String(firstBlock?.text) === targetText;
      });
      if (match) targetParagraphId = match;
    }
    // handleParagraphClick(sectionId, firstParagraphId);
    setSelectedParagraph({ sectionId, paragraphId: targetParagraphId });
    setShowSectionPopover(false);
    setSearchInput('');
    setTimeout(() => {
      scrollToParagraph(targetParagraphId);
      setHighlightedParagraphId(targetParagraphId);
      setTimeout(() => setHighlightedParagraphId(null), 3000);
    }, 100);
  };

  const handleSearchNavigation = () => {
    const trimmed = searchInput.trim();
    if (!trimmed) return;
    const num = parseInt(trimmed, 10);
    if (Number.isNaN(num) || num < 1) return;
    const byNumber = navigableSectionEntries.find(entry => entry.label === num);
    const target = byNumber || navigableSectionEntries[num - 1];
    if (!target) return;
    navigateToSection(target.sectionId, num);
  };

  const handleSearchInputChange = (e) => {
    const value = e.target.value;
    if (/^\d*$/.test(value)) setSearchInput(value);
  };

  const isSearchInputValid = () => {
    const trimmed = searchInput.trim();
    if (!trimmed) return false;
    const num = parseInt(trimmed, 10);
    if (!Number.isInteger(num) || num < 1) return false;
    return navigableSectionEntries.some(entry => entry.label === num) || num <= navigableSectionEntries.length;
  };

  const renderWithItalics = (text, segments = []) => {
    if (!segments || segments.length === 0) return text;
    const sorted = [...segments].sort((a, b) => a.index - b.index);
    const nodes = [];
    let cursor = 0;
    sorted.forEach((seg, i) => {
      const start = seg.index;
      const itText = seg.text || '';
      if (start > cursor) {
        nodes.push(<span key={`t-${i}`}>{text.slice(cursor, start)}</span>);
      }
      nodes.push(<em key={`i-${i}`} className="italic">{itText}</em>);
      cursor = start + itText.length;
    });
    if (cursor < text.length) nodes.push(<span key="t-end">{text.slice(cursor)}</span>);
    return nodes;
  };

  return (
    <div
      className="flex-1 bg-neutral-900 text-white flex flex-col overflow-y-scroll h-full dark-scroll relative"
      ref={sermonViewRef}
    >
      {/* <h1 className="text-3xl font-bold my-6 ml-6 text-center">
        {sermonData.title} <span className="text-neutral-400 text-xl font-normal ml-2">{sermonData.date}</span>
      </h1> */}

      <h1 className="text-4xl font-bold my-14 ml-6 text-center">
        {sermonData?.title} <span className="text-neutral-400 text-xl font-normal ml-2">{sermonData?.date}</span>
      </h1>

      {/* Replaced sectioned display with flat paragraphs */}
      <div className="flex flex-col px-4">
        {flatParagraphs.map(item => {
          // ...existing paragraph resolution...
          const sec = sermonData.sections[item.sectionId];
          const paragraph = sec?.paragraphs?.[item.paragraphId];
          if (!paragraph) return null;
          const isSelected = false;
          const isHighlighted = highlightedParagraphId === item.paragraphId;

            return (
              <ParagraphView
                key={item.paragraphId}
                paragraph={paragraph}
                paragraphId={item.paragraphId}
                paragraphNumber={item.globalIndex}
                isSelected={isSelected}
                isHighlighted={isHighlighted}
                onClick={(e) => setSelectedParagraph({ sectionId: item.sectionId, paragraphId: item.paragraphId })}
                renderWithItalics={renderWithItalics}
                blockSelectionMode={blockSelectionMode}
                selectedBlockIds={selectedBlockIds}                 // UPDATED multi blocks
                onBlockClick={(blockId, ctrl, shift) => handleBlockClick(item, blockId, ctrl, shift)}
              />
            );
        })}
      </div>

      <div className="h-full"></div>

      {/* Controls */}
      <div className="flex-grow flex items-center justify-center gap-3 sticky bottom-8 z-10 mt-12 w-full">
        <div className="relative w-fit flex items-center justify-center gap-3 p-2 bg-neutral-900 rounded-md border border-neutral-800 shadow-lg">
          <button
            onClick={handlePreviousParagraph}
            disabled={flatParagraphs.length === 0 || findSelectedIndex() <= 0}
            className="p-3 px-5 rounded bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-700 disabled:opacity-50"
          >
            <FiChevronLeft size={20} />
          </button>

          <button
            ref={buttonRef}
            onClick={() => setShowSectionPopover(!showSectionPopover)}
            className="px-4 rounded bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-700 flex items-center gap-2 transition-colors"
          >
            <p className="text-sm font-semibold my-2">
              {sermonData?.title}
            </p>
            {showSectionPopover ? <FaCaretDown /> : <FaCaretUp />}
          </button>

            <button
              onClick={handleNextParagraph}
              disabled={flatParagraphs.length === 0 || findSelectedIndex() === flatParagraphs.length - 1}
              className="p-3 px-5 rounded bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FiChevronRight size={20} />
            </button>
        </div>

        {/* Paragraph number popover */}
        <div
          ref={popoverRef}
          className={`absolute bottom-38 z-20 bg-neutral-900 border border-neutral-800 shadow-lg rounded-md p-2 h-fit max-h-64 w-[60%] overflow-y-auto flex flex-wrap gap-2 transition-all duration-150
            ${showSectionPopover ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0 pointer-events-none'}
          `}
        >
          {navigableSectionEntries.map(entry => {
            const section = sermonData.sections[entry.sectionId];
            const firstParagraphId = section?.orderedParagraphIds?.[0];
            const selected = selectedParagraph && selectedParagraph.sectionId === entry.sectionId;
            return (
              <button
                key={`${entry.sectionId}-${entry.label}`}
                onClick={() => {
                  navigateToSection(entry.sectionId, entry.label);
                }}
                className={`flex-1 min-w-[4rem] min-h-10 text-sm text-center rounded hover:bg-neutral-700/60 ${
                  selected ? 'bg-white text-black font-bold hover:bg-white' : 'bg-neutral-800/40'
                }`}
                disabled={!firstParagraphId}
              >
                {entry.label}
              </button>
            );
          })}
        </div>

        {/* Search Popover (Go to paragraph) */}
        <div
          ref={searchPopoverRef}
          className={`absolute bottom-18 z-20 bg-neutral-900 border border-neutral-800 shadow-lg rounded-md p-4 w-fit transition-all duration-150
            ${showSectionPopover ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0 pointer-events-none'}
          `}
        >
          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              <input
                ref={searchInputRef}
                type="text"
                value={searchInput}
                onChange={handleSearchInputChange}
                onKeyPress={(e)=> e.key==='Enter' && handleSearchNavigation()}
                placeholder="Go to section"
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

export default SermonView;