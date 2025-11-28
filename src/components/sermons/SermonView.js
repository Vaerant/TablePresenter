import React, { useEffect, useMemo, useRef, useState } from 'react';
import useSermonStore from '@/stores/sermonStore';
import { sermonSearch } from '@/lib/sermonSearch';
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import { FaCaretUp, FaCaretDown } from 'react-icons/fa';
import { ParagraphView, BlockView } from './ParagraphViews'; // NEW

const SermonView = () => {
  const {
    activeSermon,
    selectedParagraph,
    displaySettings,
    setSelectedParagraph,
    clearSelectedParagraph,
    clearSelectedVerses
  } = useSermonStore();

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

  // Load sermon structure if needed
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!activeSermon) {
        setSermonData(null);
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
  }, [activeSermon]);

  // Build ordered sections and a flat list of all paragraphs for navigation
  const orderedSections = useMemo(() => {
    if (!sermonData?.sections || !sermonData?.orderedSectionIds) return [];
    return sermonData.orderedSectionIds.map(sectionId => {
      const section = sermonData.sections[sectionId];
      return { id: sectionId, number: section.number, order: section.order, paragraphs: section.paragraphs, orderedParagraphIds: section.orderedParagraphIds };
    });
  }, [sermonData]);

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

  // Listen for clear events from main process
  useEffect(() => {
    if (typeof window !== 'undefined' && window.electronAPI) {
      const handleParagraphClear = () => {
        clearSelectedParagraph();
        clearSelectedVerses();
      };
      window.electronAPI.on('paragraph:cleared', handleParagraphClear);
      return () => window.electronAPI.off('paragraph:cleared', handleParagraphClear);
    }
  }, [clearSelectedParagraph, clearSelectedVerses]);

  // Scroll to selected paragraph
  useEffect(() => {
    if (!selectedParagraph) return;
    setTimeout(() => {
      const el = document.querySelector(`[data-paragraph="${selectedParagraph.paragraphId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setHighlightedParagraphId(selectedParagraph.paragraphId);
        setTimeout(() => setHighlightedParagraphId(null), 3000);
      }
    }, 100);
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

  if (isLoading || !sermonData) {
    return (
      <div className="flex-1 bg-neutral-900 text-white flex flex-col h-full">
        {/* Show sermon header immediately while loading */}
        <h1 className="text-3xl font-bold my-6 ml-6 text-center">
          {activeSermon.title} <span className="text-neutral-400 text-xl font-normal ml-2">{activeSermon.date}</span>
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

  const handleSendSelection = (sectionId, paragraphId, specificBlockId = null) => {
    if (!sermonData?.sections?.[sectionId]?.paragraphs?.[paragraphId]) return;
    const section = sermonData.sections[sectionId];
    const paragraph = section.paragraphs[paragraphId];

    const blocks = (paragraph.orderedBlockIds || [])
      .filter(bid => !specificBlockId || bid === specificBlockId) // NEW: allow single block
      .map(bid => {
        const b = paragraph.blocks[bid];
        return {
          uid: bid,
          text: b.text,
          type: b.type,
          indented: !!b.indented,
          italicSegments: b.italicSegments || []
        };
      });

    if (typeof window !== 'undefined' && window.electronAPI) {
      window.electronAPI.send('paragraph:selected', {
        paragraphData: {
          type: 'paragraph',
          sermonUid: sermonData.uid,
          title: sermonData.title,
          date: sermonData.date,
          sectionUid: sectionId,
          sectionNumber: section.number,
          paragraphUid: paragraphId,
          paragraphOrder: paragraph.order,
          blocks
        },
        displaySettings: displaySettings || {
          enabled: true,
          showTitle: true,
          showDate: true,
          showContent: true
        }
      });
    }
  };

  const handleSendMultiParagraphSelection = (paragraphMetaList) => { // NEW
    if (typeof window === 'undefined' || !window.electronAPI) return;
    const paragraphsData = paragraphMetaList.map(meta => {
      const section = sermonData.sections[meta.sectionId];
      const paragraph = section.paragraphs[meta.paragraphId];
      const blocks = (paragraph.orderedBlockIds || []).map(bid => {
        const b = paragraph.blocks[bid];
        return {
          uid: bid,
          text: b.text,
          type: b.type,
          indented: !!b.indented,
          italicSegments: b.italicSegments || []
        };
      });
      return {
        sectionUid: meta.sectionId,
        sectionNumber: section.number,
        paragraphUid: meta.paragraphId,
        paragraphOrder: paragraph.order,
        blocks
      };
    });
    window.electronAPI.send('paragraph:selected', {
      paragraphData: {
        type: 'paragraph-multi',
        sermonUid: sermonData.uid,
        title: sermonData.title,
        date: sermonData.date,
        paragraphs: paragraphsData
      },
      displaySettings: displaySettings || {
        enabled: true,
        showTitle: true,
        showDate: true,
        showContent: true
      }
    });
  };

  // REPLACE handleSendBlocksSelection to support multi-paragraph blocks
  const handleSendBlocksSelection = (blockIds) => {
    if (typeof window === 'undefined' || !window.electronAPI || blockIds.length === 0) return;

    // Group selected blocks by paragraph
    const selectedBlockMeta = flatBlocks.filter(b => blockIds.includes(b.blockId));
    const grouped = {};
    selectedBlockMeta.forEach(b => {
      const key = `${b.sectionId}::${b.paragraphId}`;
      if (!grouped[key]) grouped[key] = { sectionId: b.sectionId, paragraphId: b.paragraphId, blockIds: [] };
      grouped[key].blockIds.push(b.blockId);
    });

    const paragraphsData = Object.values(grouped).map(meta => {
      const section = sermonData.sections[meta.sectionId];
      const paragraph = section.paragraphs[meta.paragraphId];
      const blocks = meta.blockIds.map(bid => {
        const b = paragraph.blocks[bid];
        return {
          uid: bid,
          text: b.text,
          type: b.type,
          indented: !!b.indented,
          italicSegments: b.italicSegments || []
        };
      });
      return {
        sectionUid: meta.sectionId,
        sectionNumber: section.number,
        paragraphUid: meta.paragraphId,
        paragraphOrder: paragraph.order,
        blocks
      };
    });

    window.electronAPI.send('paragraph:selected', {
      paragraphData: {
        type: blockIds.length === 1 ? 'paragraph-block-single' : 'block-multi',
        sermonUid: sermonData.uid,
        title: sermonData.title,
        date: sermonData.date,
        paragraphs: paragraphsData
      },
      displaySettings: displaySettings || {
        enabled: true,
        showTitle: true,
        showDate: true,
        showContent: true
      }
    });
  };

  const handleParagraphClick = (sectionId, paragraphId) => {
    // Clear selected block when changing paragraph
    setSelectedBlockId(null);
    setSelectedBlockIds([]); // NEW clear blocks when focusing single paragraph
    setSelectedParagraph({ sermonUid: sermonData.uid, sectionId, paragraphId });
    handleSendSelection(sectionId, paragraphId);
  };

  const handleParagraphInteraction = (item, event) => { // NEW ctrl/shift logic
    const pid = item.paragraphId;
    const idx = flatParagraphs.findIndex(p => p.paragraphId === pid && p.sectionId === item.sectionId);
    const { ctrlKey, metaKey, shiftKey } = event;
    const ctrl = ctrlKey || metaKey;

    if (shiftKey && selectedParagraphIds.length > 0) {
      const anchor = lastParagraphIndex != null ? lastParagraphIndex : idx;
      const start = Math.min(anchor, idx);
      const end = Math.max(anchor, idx);
      const range = flatParagraphs.slice(start, end + 1).map(p => p.paragraphId);
      const merged = Array.from(new Set([...selectedParagraphIds, ...range]));
      setSelectedParagraphIds(merged);
      setSelectedParagraph({ sermonUid: sermonData.uid, sectionId: item.sectionId, paragraphId: pid });
      handleSendMultiParagraphSelection(
        flatParagraphs
          .filter(p => merged.includes(p.paragraphId))
          .map(p => ({ sectionId: p.sectionId, paragraphId: p.paragraphId }))
      );
    } else if (ctrl) {
      let updated;
      if (selectedParagraphIds.includes(pid)) {
        updated = selectedParagraphIds.filter(id => id !== pid);
      } else {
        updated = [...selectedParagraphIds, pid];
      }
      setSelectedParagraphIds(updated);
      setLastParagraphIndex(idx);
      if (updated.length === 0) {
        clearSelectedParagraph();
      } else {
        setSelectedParagraph({ sermonUid: sermonData.uid, sectionId: item.sectionId, paragraphId: pid });
        if (updated.length === 1) {
          handleSendSelection(item.sectionId, pid);
        } else {
          handleSendMultiParagraphSelection(
            flatParagraphs
              .filter(p => updated.includes(p.paragraphId))
              .map(p => ({ sectionId: p.sectionId, paragraphId: p.paragraphId }))
          );
        }
      }
    } else {
      // plain click
      if (selectedParagraphIds.length === 1 && selectedParagraphIds[0] === pid) {
        // deselect
        setSelectedParagraphIds([]);
        clearSelectedParagraph();
        setSelectedBlockIds([]);
        setSelectedBlockId(null);
      } else {
        setSelectedParagraphIds([pid]);
        setLastParagraphIndex(idx);
        handleParagraphClick(item.sectionId, pid);
      }
    }
  };

  // REPLACE handleBlockClick to allow shift across paragraphs
  const handleBlockClick = (paragraphMeta, blockId, ctrlKey, shiftKey) => {
    if (!blockSelectionMode) return;

    const currentGlobalIndex = flatBlocks.findIndex(b => b.blockId === blockId);
    if (currentGlobalIndex === -1) return;

    if (shiftKey) {
      // Determine anchor: lastBlockGlobalIndex or last selected block in global order
      let anchor = lastBlockGlobalIndex;
      if (anchor == null) {
        // fallback: last selected block's global index
        for (let i = selectedBlockIds.length - 1; i >= 0; i--) {
          const candidateIdx = flatBlocks.findIndex(b => b.blockId === selectedBlockIds[i]);
          if (candidateIdx !== -1) {
            anchor = candidateIdx;
            break;
          }
        }
        if (anchor == null) anchor = currentGlobalIndex;
      }
      const start = Math.min(anchor, currentGlobalIndex);
      const end = Math.max(anchor, currentGlobalIndex);
      const rangeIds = flatBlocks.slice(start, end + 1).map(b => b.blockId);
      const merged = Array.from(new Set([...selectedBlockIds, ...rangeIds]));
      setSelectedBlockIds(merged);
      setLastBlockGlobalIndex(currentGlobalIndex);
      handleSendBlocksSelection(merged);
      return;
    }

    if (ctrlKey) {
      let updated;
      if (selectedBlockIds.includes(blockId)) {
        updated = selectedBlockIds.filter(id => id !== blockId);
      } else {
        updated = [...selectedBlockIds, blockId];
      }
      setSelectedBlockIds(updated);
      setLastBlockGlobalIndex(currentGlobalIndex);
      if (updated.length === 0) return;
      if (updated.length === 1) {
        // single
        handleSendSelection(paragraphMeta.sectionId, paragraphMeta.paragraphId, updated[0]);
      } else {
        handleSendBlocksSelection(updated);
      }
      return;
    }

    // Plain click
    if (selectedBlockIds.length === 1 && selectedBlockIds[0] === blockId) {
      setSelectedBlockIds([]);
      setSelectedBlockId(null);
      return;
    }
    setSelectedBlockIds([blockId]);
    setSelectedBlockId(blockId);
    setLastBlockGlobalIndex(currentGlobalIndex);
    handleSendSelection(paragraphMeta.sectionId, paragraphMeta.paragraphId, blockId);
  };

  const isParagraphSelected = (sectionId, paragraphId) => {
    return selectedParagraphIds.includes(paragraphId); // UPDATED
  };

  const handlePreviousParagraph = () => {
    const idx = findSelectedIndex();
    const prevIdx = idx > 0 ? idx - 1 : -1;
    if (prevIdx >= 0) {
      const p = flatParagraphs[prevIdx];
      handleParagraphClick(p.sectionId, p.paragraphId);
    }
  };

  const handleNextParagraph = () => {
    const idx = findSelectedIndex();
    const nextIdx = idx >= 0 && idx < flatParagraphs.length - 1 ? idx + 1 : (idx === -1 && flatParagraphs.length > 0 ? 0 : -1);
    if (nextIdx >= 0) {
      const p = flatParagraphs[nextIdx];
      handleParagraphClick(p.sectionId, p.paragraphId);
    }
  };

  const handleSearchNavigation = () => {
    const trimmed = searchInput.trim();
    if (!trimmed) return;
    const num = parseInt(trimmed, 10);
    if (Number.isNaN(num) || num < 1 || num > flatParagraphs.length) return;
    const p = flatParagraphs[num - 1];
    handleParagraphClick(p.sectionId, p.paragraphId);
    setShowSectionPopover(false);
    setSearchInput('');
    setTimeout(() => {
      const el = document.querySelector(`[data-paragraph="${p.paragraphId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setHighlightedParagraphId(p.paragraphId);
        setTimeout(() => setHighlightedParagraphId(null), 3000);
      }
    }, 100);
  };

  const handleSearchInputChange = (e) => {
    const value = e.target.value;
    if (/^\d*$/.test(value)) setSearchInput(value);
  };

  const isSearchInputValid = () => {
    const trimmed = searchInput.trim();
    if (!trimmed) return false;
    const num = parseInt(trimmed, 10);
    return Number.isInteger(num) && num >= 1 && num <= flatParagraphs.length;
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
    <div className="flex-1 bg-neutral-900 text-white flex flex-col overflow-y-scroll h-full dark-scroll relative">
      <h1 className="text-3xl font-bold my-6 ml-6 text-center">
        {sermonData.title} <span className="text-neutral-400 text-xl font-normal ml-2">{sermonData.date}</span>
      </h1>

      {/* Replaced sectioned display with flat paragraphs */}
      <div className="flex flex-col px-4">
        {flatParagraphs.map(item => {
          // ...existing paragraph resolution...
          const sec = sermonData.sections[item.sectionId];
          const paragraph = sec?.paragraphs?.[item.paragraphId];
          if (!paragraph) return null;
          const isSelected = isParagraphSelected(item.sectionId, item.paragraphId);
          const isHighlighted = highlightedParagraphId === item.paragraphId;

            return (
              <ParagraphView
                key={item.paragraphId}
                paragraph={paragraph}
                paragraphId={item.paragraphId}
                paragraphNumber={item.globalIndex}
                isSelected={isSelected}
                isHighlighted={isHighlighted}
                onClick={(e) => handleParagraphInteraction(item, e)} // UPDATED pass event
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
              {sermonData.title}
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

            {/* View toggle */}
            <div className="ml-2 flex items-center gap-2">
              <button
                onClick={() => setBlockSelectionMode(m => !m)}
                className={`px-3 py-2 rounded text-sm ${blockSelectionMode ? 'bg-blue-500 text-white' : 'bg-neutral-800 hover:bg-neutral-700'}`}
              >
                {blockSelectionMode ? 'Block Select On' : 'Block Select'}
              </button>
            </div>
        </div>

        {/* Paragraph number popover */}
        <div
          ref={popoverRef}
          className={`absolute bottom-38 z-20 bg-neutral-900 border border-neutral-800 shadow-lg rounded-md p-2 h-fit max-h-64 w-[60%] overflow-y-auto flex flex-wrap gap-2 transition-all duration-150
            ${showSectionPopover ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0 pointer-events-none'}
          `}
        >
          {flatParagraphs.map(p => {
            const selected = selectedParagraph && selectedParagraph.sectionId === p.sectionId && selectedParagraph.paragraphId === p.paragraphId;
            return (
              <button
                key={p.paragraphId}
                onClick={() => {
                  handleParagraphClick(p.sectionId, p.paragraphId);
                  setShowSectionPopover(false);
                  setSearchInput('');
                }}
                className={`flex-1 min-w-[4rem] min-h-10 text-sm text-center rounded hover:bg-neutral-700/60 ${
                  selected ? 'bg-white text-black font-bold hover:bg-white' : 'bg-neutral-800/40'
                }`}
              >
                {p.globalIndex}
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
                placeholder="Go to paragraph"
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
