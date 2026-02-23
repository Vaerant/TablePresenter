import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import useSermonStore from '@/stores/sermonStore';
import { sermonSearch } from '@/lib/sermonSearch';
import { FiChevronLeft, FiChevronRight, FiCopy, FiCheck } from 'react-icons/fi';
import { FaCaretUp, FaCaretDown } from 'react-icons/fa';
import { ParagraphView, BlockView } from './ParagraphViews'; // NEW
import { LuTextSelect } from "react-icons/lu";
import { PiSelectionAll } from "react-icons/pi";

const SermonView = () => {
  const {
    activeSermon,
    activeSermonData,
    selectedParagraphs,
    selectedBlocks,
    displaySettings,
    setSelectedParagraphs,
    setSelectedBlocks,
    clearSelectedVerses,
    setActiveSermonData
  } = useSermonStore();
  console.log('Active sermon data in SermonView:', activeSermonData);

  const [sermonData, setSermonData] = useState(null);
  const [showSectionPopover, setShowSectionPopover] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [highlightedParagraphId, setHighlightedParagraphId] = useState(null);
  const [lastSelectedIndex, setLastSelectedIndex] = useState(null);
  const [lastSelectedBlockIndex, setLastSelectedBlockIndex] = useState(null);
  const [isModifierActive, setIsModifierActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [highlightedBlockId, setHighlightedBlockId] = useState(null);

  const [selectionMode, setSelectionMode] = useState('paragraph'); // 'paragraph' or 'block'

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
    orderedSections.forEach((sec) => {
      (sec.orderedParagraphIds || []).forEach(parId => {
        const paragraph = sec.paragraphs?.[parId];
        if (!paragraph) return;
        const firstBlockId = paragraph.orderedBlockIds?.[0];
        if (!firstBlockId) return;
        const firstBlock = paragraph.blocks?.[firstBlockId];
        if (firstBlock?.type === 'paragraphStart') {
          const num = parseInt(firstBlock.text, 10);
          if (Number.isInteger(num)) {
            entries.push({ label: num, sectionId: sec.id, paragraphId: parId });
          }
        }
      });
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
    if (!selectedParagraphs || selectedParagraphs.length === 0) return -1;
    const lastSelected = selectedParagraphs[selectedParagraphs.length - 1];
    return flatParagraphs.findIndex(p => p.sectionId === lastSelected.sectionId && p.paragraphId === lastSelected.paragraphId);
  };

  const findSelectedBlockIndex = () => {
    if (!selectedBlocks || selectedBlocks.length === 0) return -1;
    const lastBlock = selectedBlocks[selectedBlocks.length - 1];
    return flatBlocks.findIndex(b => b.blockId === lastBlock);
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
      else if (event.ctrlKey && event.key === 'c') {
        if (selectionMode === 'block' && selectedBlocks.length > 0) {
          event.preventDefault();
          handleCopySelectedBlocks();
        } else if (selectedParagraphs.length > 0) {
          event.preventDefault();
          handleCopySelectedParagraphs();
        }
      }
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

  const scrollToBlock = (blockId, retries = 6) => {
    const container = sermonViewRef.current;
    if (!container) return;
    const el = container.querySelector(`[data-block="${blockId}"]`);
    if (!el) {
      if (retries > 0) requestAnimationFrame(() => scrollToBlock(blockId, retries - 1));
      return;
    }
    const containerRect = container.getBoundingClientRect();
    const blockRect = el.getBoundingClientRect();
    const elementOffset = blockRect.top - containerRect.top;
    const centerOffset = (containerRect.height - blockRect.height) / 2;
    const targetTop = container.scrollTop + elementOffset - centerOffset;
    container.scrollTo({ top: targetTop, behavior: 'smooth' });
  };

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

  // Scroll and highlight when explicitly set (from "go to" or navigation buttons, not from manual clicks)
  useEffect(() => {
    if (!highlightedParagraphId) return;
    
    setTimeout(() => {
      scrollToParagraph(highlightedParagraphId);
    }, 50);
  }, [highlightedParagraphId]);

  // Scroll and highlight for block navigation
  useEffect(() => {
    if (!highlightedBlockId) return;
    setTimeout(() => scrollToBlock(highlightedBlockId), 50);
  }, [highlightedBlockId]);

  // Clear opposite selection type when switching modes
  useEffect(() => {
    if (selectionMode === 'paragraph') {
      setSelectedBlocks([]);
      setLastSelectedBlockIndex(null);
    } else {
      setSelectedParagraphs([]);
      setLastSelectedIndex(null);
    }
  }, [selectionMode]);

  // Memoize renderWithItalics to prevent recreation on every render
  const renderWithItalics = useCallback((text, segments = []) => {
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
  }, []);

  // Memoize handleParagraphClick to prevent recreation
  const handleParagraphClick = useCallback((item, e) => {
    const isCtrl = e.ctrlKey || e.metaKey;
    const isShift = e.shiftKey;
    const currentIndex = item.globalIndex;

    // check if clicked paragraph is already selected and selecting a single paragraph (no modifiers)
    const isSingleSelected = selectedParagraphs.length === 1 &&
      selectedParagraphs[0].sectionId === item.sectionId &&
      selectedParagraphs[0].paragraphId === item.paragraphId;
    
    if (isSingleSelected && !isCtrl && !isShift) {
      // Deselect if clicking the already selected paragraph without modifiers
      setSelectedParagraphs([]);
      setLastSelectedIndex(null);
      return;
    }
    
    if (isShift && lastSelectedIndex !== null) {
      // Range selection
      const start = Math.min(lastSelectedIndex, currentIndex);
      const end = Math.max(lastSelectedIndex, currentIndex);
      const range = flatParagraphs
        .filter(p => p.globalIndex >= start && p.globalIndex <= end)
        .map(p => ({ sectionId: p.sectionId, paragraphId: p.paragraphId }));
      setSelectedParagraphs(range);
    } else if (isCtrl) {
      // Toggle selection
      const isAlreadySelected = selectedParagraphs.some(
        p => p.sectionId === item.sectionId && p.paragraphId === item.paragraphId
      );
      if (isAlreadySelected) {
        setSelectedParagraphs(
          selectedParagraphs.filter(
            p => !(p.sectionId === item.sectionId && p.paragraphId === item.paragraphId)
          )
        );
      } else {
        setSelectedParagraphs([...selectedParagraphs, { sectionId: item.sectionId, paragraphId: item.paragraphId }]);
      }
      setLastSelectedIndex(currentIndex);
    } else {
      // Normal click - single selection
      setSelectedParagraphs([{ sectionId: item.sectionId, paragraphId: item.paragraphId }]);
      setLastSelectedIndex(currentIndex);
    }
  }, [selectedParagraphs, lastSelectedIndex, flatParagraphs, setSelectedParagraphs, setLastSelectedIndex]);

  // Block click handler for block selection mode
  const handleBlockClick = useCallback((blockId, ctrlKey, shiftKey) => {
    const currentGlobalIndex = flatBlocks.findIndex(b => b.blockId === blockId);
    if (currentGlobalIndex === -1) return;

    if (shiftKey && lastSelectedBlockIndex !== null) {
      const start = Math.min(lastSelectedBlockIndex, currentGlobalIndex);
      const end = Math.max(lastSelectedBlockIndex, currentGlobalIndex);
      const rangeIds = flatBlocks.slice(start, end + 1).map(b => b.blockId);
      const merged = Array.from(new Set([...selectedBlocks, ...rangeIds]));
      setSelectedBlocks(merged);
      setLastSelectedBlockIndex(currentGlobalIndex);
      return;
    }

    if (ctrlKey) {
      if (selectedBlocks.includes(blockId)) {
        setSelectedBlocks(selectedBlocks.filter(id => id !== blockId));
      } else {
        setSelectedBlocks([...selectedBlocks, blockId]);
      }
      setLastSelectedBlockIndex(currentGlobalIndex);
      return;
    }

    // Plain click - toggle if already the only selection
    if (selectedBlocks.length === 1 && selectedBlocks[0] === blockId) {
      setSelectedBlocks([]);
      setLastSelectedBlockIndex(null);
      return;
    }
    setSelectedBlocks([blockId]);
    setLastSelectedBlockIndex(currentGlobalIndex);
  }, [flatBlocks, lastSelectedBlockIndex, selectedBlocks, setSelectedBlocks]);

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

  const navigateToParagraph = (p) => {
    setSelectedParagraphs([{ sectionId: p.sectionId, paragraphId: p.paragraphId }]);
    setLastSelectedIndex(p.globalIndex);
    setShowSectionPopover(false);
    setSearchInput('');
    // Clear any pending highlight timeout before starting a new one
    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = null;
    }
    setHighlightedParagraphId(null);
    // Small delay lets React flush the null before setting the new id,
    // ensuring the transition triggers fresh each time
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollToParagraph(p.paragraphId);
        setHighlightedParagraphId(p.paragraphId);
        highlightTimeoutRef.current = setTimeout(() => {
          setHighlightedParagraphId(null);
          highlightTimeoutRef.current = null;
        }, 1500);
      });
    });
  };

  const handlePreviousParagraph = () => {
    const idx = findSelectedIndex();
    const prevIdx = idx > 0 ? idx - 1 : -1;
    if (prevIdx >= 0) {
      navigateToParagraph(flatParagraphs[prevIdx]);
    }
  };

  const handleNextParagraph = () => {
    const idx = findSelectedIndex();
    const nextIdx = idx >= 0 && idx < flatParagraphs.length - 1 ? idx + 1 : (idx === -1 && flatParagraphs.length > 0 ? 0 : -1);
    if (nextIdx >= 0) {
      navigateToParagraph(flatParagraphs[nextIdx]);
    }
  };

  // Block navigation functions
  const navigateToBlock = (block) => {
    setSelectedBlocks([block.blockId]);
    setLastSelectedBlockIndex(block.globalIndex);
    setShowSectionPopover(false);
    setSearchInput('');
    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = null;
    }
    setHighlightedBlockId(null);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollToBlock(block.blockId);
        setHighlightedBlockId(block.blockId);
        highlightTimeoutRef.current = setTimeout(() => {
          setHighlightedBlockId(null);
          highlightTimeoutRef.current = null;
        }, 1500);
      });
    });
  };

  const handlePreviousBlock = () => {
    const idx = findSelectedBlockIndex();
    const prevIdx = idx > 0 ? idx - 1 : -1;
    if (prevIdx >= 0) navigateToBlock(flatBlocks[prevIdx]);
  };

  const handleNextBlock = () => {
    const idx = findSelectedBlockIndex();
    const nextIdx = idx >= 0 && idx < flatBlocks.length - 1 ? idx + 1 : (idx === -1 && flatBlocks.length > 0 ? 0 : -1);
    if (nextIdx >= 0) navigateToBlock(flatBlocks[nextIdx]);
  };

  const navigateToSection = (sectionId, paragraphId) => {
    const section = sermonData?.sections?.[sectionId];
    if (!section?.orderedParagraphIds?.length) return;
    const targetParagraphId = paragraphId || section.orderedParagraphIds[0];
    if (selectionMode === 'block') {
      const paragraph = section.paragraphs[targetParagraphId];
      if (!paragraph?.orderedBlockIds?.length) return;
      const firstBlockId = paragraph.orderedBlockIds[0];
      const block = flatBlocks.find(b => b.blockId === firstBlockId);
      if (!block) return;
      navigateToBlock(block);
    } else {
      const p = flatParagraphs.find(fp => fp.sectionId === sectionId && fp.paragraphId === targetParagraphId);
      if (!p) return;
      navigateToParagraph(p);
    }
  };

  const handleSearchNavigation = () => {
    const trimmed = searchInput.trim();
    if (!trimmed) return;
    const num = parseInt(trimmed, 10);
    if (Number.isNaN(num) || num < 1) return;
    const entry = navigableSectionEntries.find(e => e.label === num);
    if (!entry) return;
    navigateToSection(entry.sectionId, entry.paragraphId);
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
    return navigableSectionEntries.some(entry => entry.label === num);
  };

  // Handlers moved above for proper hook ordering

  const extractTextFromParagraph = (sectionId, paragraphId) => {
    const section = sermonData?.sections?.[sectionId];
    const paragraph = section?.paragraphs?.[paragraphId];
    if (!paragraph) return '';
    
    const textParts = [];
    (paragraph.orderedBlockIds || []).forEach(bid => {
      const block = paragraph.blocks[bid];
      if (block?.text) {
        textParts.push(block.text);
      }
    });
    return textParts.join(' ');
  };

  const handleCopySelectedParagraphs = async () => {
    if (selectedParagraphs.length === 0) return;

    // sort selected paragraphs by their order in the sermon
    const sortedParagraphs = selectedParagraphs.slice().sort((a, b) => {
      const aIndex = flatParagraphs.findIndex(p => p.sectionId === a.sectionId && p.paragraphId === a.paragraphId);
      const bIndex = flatParagraphs.findIndex(p => p.sectionId === b.sectionId && p.paragraphId === b.paragraphId);
      return aIndex - bIndex;
    });
    
    const paragraphTexts = sortedParagraphs.map(sel => 
      extractTextFromParagraph(sel.sectionId, sel.paragraphId)
    ).filter(Boolean);
    
    const fullText = [
      ...paragraphTexts,
      '',
      sermonData?.title || '',
      'Sermon by William Marrion Branham'
    ].join('\n');
    
    try {
      await navigator.clipboard.writeText(fullText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleCopySelectedBlocks = async () => {
    if (selectedBlocks.length === 0) return;
    const sortedBlocks = selectedBlocks.slice().sort((a, b) => {
      const aIdx = flatBlocks.findIndex(fb => fb.blockId === a);
      const bIdx = flatBlocks.findIndex(fb => fb.blockId === b);
      return aIdx - bIdx;
    });
    // Group blocks by paragraph for natural reading
    const paragraphGroups = [];
    let currentGroup = { paragraphId: null, texts: [] };
    sortedBlocks.forEach(bid => {
      const blockInfo = flatBlocks.find(fb => fb.blockId === bid);
      if (!blockInfo) return;
      const section = sermonData?.sections?.[blockInfo.sectionId];
      const paragraph = section?.paragraphs?.[blockInfo.paragraphId];
      const block = paragraph?.blocks?.[bid];
      if (!block?.text) return;
      if (blockInfo.paragraphId !== currentGroup.paragraphId) {
        if (currentGroup.texts.length > 0) paragraphGroups.push(currentGroup.texts.join(' '));
        currentGroup = { paragraphId: blockInfo.paragraphId, texts: [block.text] };
      } else {
        currentGroup.texts.push(block.text);
      }
    });
    if (currentGroup.texts.length > 0) paragraphGroups.push(currentGroup.texts.join(' '));
    const fullText = [
      ...paragraphGroups,
      '',
      sermonData?.title || '',
      'Sermon by William Marrion Branham'
    ].join('\n');
    try {
      await navigator.clipboard.writeText(fullText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
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
      {/* <div className="flex flex-col px-4" style={isModifierActive ? { userSelect: 'none' } : {}}> */}
      <div className="flex flex-col px-4" style={{ userSelect: 'none' }}>
        {flatParagraphs.map(item => {
          const sec = sermonData.sections[item.sectionId];
          const paragraph = sec?.paragraphs?.[item.paragraphId];
          if (!paragraph) return null;

          if (selectionMode === 'block') {
            return (
              <BlockView
                key={item.paragraphId}
                paragraph={paragraph}
                paragraphId={item.paragraphId}
                sectionId={item.sectionId}
                renderWithItalics={renderWithItalics}
                selectedBlockIds={selectedBlocks}
                highlightedBlockId={highlightedBlockId}
                onBlockClick={handleBlockClick}
              />
            );
          }

          const isSelected = selectedParagraphs.some(
            p => p.sectionId === item.sectionId && p.paragraphId === item.paragraphId
          );
          const isHighlighted = highlightedParagraphId === item.paragraphId;

          return (
            <ParagraphView
              key={item.paragraphId}
              paragraph={paragraph}
              paragraphId={item.paragraphId}
              paragraphNumber={item.globalIndex}
              sectionId={item.sectionId}
              itemData={item}
              isSelected={isSelected}
              isHighlighted={isHighlighted}
              onParagraphClick={handleParagraphClick}
              renderWithItalics={renderWithItalics}
              blockSelectionMode={false}
              selectedBlockIds={[]}
              onBlockClick={handleBlockClick}
            />
          );
        })}
      </div>

      <div className="h-full"></div>

      {/* Floating toolbar for selected paragraphs */}
      <div className="fixed bottom-18 right-8 z-20 bg-neutral-900 rounded-md border border-neutral-800 shadow-lg p-2 flex items-center gap-2 transition-all duration-200 hover:bg-neutral-750">
        {/* <span className="text-xs text-neutral-400 px-2">
          {selectedParagraphs.length} paragraph{selectedParagraphs.length > 1 ? 's' : ''} selected
        </span> */}
        {(selectionMode === 'block' ? selectedBlocks.length > 0 : selectedParagraphs.length > 0) && (
          <button
            onClick={selectionMode === 'block' ? handleCopySelectedBlocks : handleCopySelectedParagraphs}
            className="p-4 rounded bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-700 flex items-center gap-2 transition-colors"
            title={selectionMode === 'block' ? 'Copy selected blocks' : 'Copy selected paragraphs'}
          >
            {copied ? (
              <>
                <FiCheck size={16} className="text-white" />
                {/* <span className="text-green-400">Copied!</span> */}
              </>
            ) : (
              <>
                <FiCopy size={16} />
                {/* <span>Copy</span> */}
              </>
            )}
            {/* <FiCopy size={16} /> */}
          </button>
        )}
        <button
          onClick={() => selectionMode === 'paragraph' ? setSelectionMode('block') : setSelectionMode('paragraph')}
          className="p-4 rounded bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-700 flex items-center gap-2 transition-colors"
          title={selectionMode === 'paragraph' ? 'Switch to block selection' : 'Switch to paragraph selection'}
        >
          {selectionMode === 'paragraph' ? <PiSelectionAll size={16} /> : <LuTextSelect size={16} />}
        </button>
      </div>

      {/* Controls */}
      <div className="flex-grow flex items-center justify-center gap-3 sticky bottom-8 z-10 mt-12 w-full">
        <div className="relative w-fit flex items-center justify-center gap-3 p-2 bg-neutral-900 rounded-md border border-neutral-800 shadow-lg">
          <button
            onClick={selectionMode === 'block' ? handlePreviousBlock : handlePreviousParagraph}
            disabled={selectionMode === 'block'
              ? flatBlocks.length === 0 || findSelectedBlockIndex() <= 0
              : flatParagraphs.length === 0 || findSelectedIndex() <= 0}
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
            onClick={selectionMode === 'block' ? handleNextBlock : handleNextParagraph}
            disabled={selectionMode === 'block'
              ? flatBlocks.length === 0 || findSelectedBlockIndex() === flatBlocks.length - 1
              : flatParagraphs.length === 0 || findSelectedIndex() === flatParagraphs.length - 1}
            className="p-3 px-5 rounded bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-700 disabled:opacity-50"
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
            const selected = selectedParagraphs.some(p => p.sectionId === entry.sectionId && p.paragraphId === entry.paragraphId);
            return (
              <button
                key={`${entry.sectionId}-${entry.paragraphId}`}
                onClick={() => navigateToSection(entry.sectionId, entry.paragraphId)}
                className={`flex-1 min-w-[4rem] min-h-10 text-sm text-center rounded hover:bg-neutral-700/60 ${
                  selected ? 'bg-white text-black font-bold hover:bg-white' : 'bg-neutral-800/40'
                }`}
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

      {/* <div className="flex-grow flex items-center justify-start gap-3 sticky bottom-8 z-10 mt-12 w-full">
        <div className="relative w-fit flex items-center justify-center gap-3 p-2 bg-neutral-900 rounded-md border border-neutral-800 shadow-lg">
          <button
            onClick={() => selectionMode === 'paragraph' ? setSelectionMode('block') : setSelectionMode('paragraph')}
            className="p-3 px-5 rounded bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-700 disabled:opacity-50"
          >
            {selectionMode === 'paragraph' ? 'Block Select' : 'Paragraph Select'}
          </button>
        </div>
      </div> */}
    </div>
  );
};

export default SermonView;