import React, { useState, useEffect, useRef, useMemo } from 'react';
import useSermonStore from '@/stores/sermonStore';
import { sermonSearch } from '@/lib/sermonSearch';
import SearchResult from './SearchResult';
import useDebounce from '@/lib/hooks/useDebounce';

import { IoClose } from "react-icons/io5";
import { IoSearchOutline } from "react-icons/io5";

const SearchModal = ({ isOpen, onClose }) => {
  const { setActiveSermon } = useSermonStore();

  const [searchType, setSearchType] = useState('combined'); // 'blocks', 'sermons', or 'combined'
  const [searchTerm, setSearchTerm] = useState('');
  const [blockSearchMode, setBlockSearchMode] = useState('phrase'); // 'phrase' or 'general'
  const [blockResults, setBlockResults] = useState([]);
  const [sermonBlockResults, setSermonBlockResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSermonLoading, setIsSermonLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [sermons, setSermons] = useState([]);
  const [selectedSermonIndex, setSelectedSermonIndex] = useState(0);
  const [lastSermonPart, setLastSermonPart] = useState('');
  const LIMIT = 50;

  const modalRef = useRef(null);
  const searchInputRef = useRef(null);
  const resultsRef = useRef(null);
  const combinedSermonListRef = useRef(null);
  const sermonListRef = useRef(null);
  const searchRequestIdRef = useRef(0); // track active block search
  const lastBlockSearchSigRef = useRef(null); // NEW: prevent duplicate searches

  const debouncedSearchTerm = useDebounce(searchTerm, 500);

  // Focus input when modal opens and when searchType changes
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen, searchType]);

  // Load sermons when modal opens
  useEffect(() => {
    if (isOpen && sermons.length === 0) {
      const fetchSermons = async () => {
        try {
          const sermonsData = await sermonSearch.getSermons();
          setSermons(sermonsData);
        } catch (error) {
          console.error('Error fetching sermons:', error);
        }
      };
      fetchSermons();
    }
  }, [isOpen, sermons.length]);

  // Helper to normalize a date-style query (e.g. 470412 -> 47-0412)
  const normalizeDateQuery = (q) => {
    const raw = q.replace(/[^0-9A-Za-z]/g, '');
    if (raw.length < 3) return null;
    const normalized = raw.slice(0, 2) + '-' + raw.slice(2);
    return normalized;
  };

  // Smart sermon search logic
  const smartSermonSearch = useMemo(() => {
    if ((searchType !== 'sermons' && searchType !== 'combined') || !debouncedSearchTerm.trim()) return { sermons: [], suggestion: '', paragraph: null, destinationPreview: '' };

    const input = debouncedSearchTerm.trim();
    const dateQuery = normalizeDateQuery(input);
    const isDateSearch = !!dateQuery && /^\d{2}-[0-9A-Za-z]{3,8}$/.test(dateQuery);

    // Parse different patterns: "Faith is 10", "Faith 10", "47-0412 5", etc.
    const patterns = [
      /^(\d*\s*\w+.*?)\s+(\d+)$/, // "Faith is the Substance 10" or "47-0412 5"
      /^(\d*\s*\w+.*?)$/          // "Faith is the Substance" or "47-0412"
    ];

    let sermonPart = input;
    let paragraph = null;

    if (!isDateSearch) {
      for (const pattern of patterns) {
        const match = input.match(pattern);
        if (match) {
          sermonPart = match[1].trim();
          paragraph = match[2] ? parseInt(match[2]) : null;
          break;
        }
      }
    } else {
      // For date searches, extract paragraph number after the date
      const dateMatch = input.match(/^(\d{2}-[0-9A-Za-z]{3,8})\s*(\d+)?$/);
      if (dateMatch) {
        sermonPart = dateMatch[1];
        paragraph = dateMatch[2] ? parseInt(dateMatch[2]) : null;
      }
    }

    let matchingSermons = [];

    if (isDateSearch) {
      // Date-based matching
      matchingSermons = sermons.filter(s =>
        (s.date || '').toLowerCase().startsWith(dateQuery.toLowerCase())
      ).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    } else {
      // Title-based matching
      matchingSermons = sermons
        .filter(sermon => {
          const sermonLower = sermonPart.toLowerCase();
          const sermonTitleLower = (sermon.title || '').toLowerCase();
          return sermonTitleLower.includes(sermonLower);
        })
        .sort((a, b) => {
          const q = sermonPart.toLowerCase();
          const aTitle = (a.title || '').toLowerCase();
          const bTitle = (b.title || '').toLowerCase();
          const aStarts = aTitle.startsWith(q) ? 0 : 1;
          const bStarts = bTitle.startsWith(q) ? 0 : 1;
          if (aStarts !== bStarts) return aStarts - bStarts;
          return aTitle.length - bTitle.length;
        });
    }

    let suggestion = '';
    let destinationPreview = '';

    if (matchingSermons.length > 0) {
      const boundedIndex = Math.min(selectedSermonIndex, matchingSermons.length - 1);
      const selectedSermon = matchingSermons[boundedIndex];

      if (isDateSearch) {
        if (dateQuery !== selectedSermon.date) {
          suggestion = selectedSermon.date;
          if (paragraph) suggestion += ` ${paragraph}`;
        }
        destinationPreview = `${selectedSermon.date} ${selectedSermon.title}` + (paragraph ? ` #${paragraph}` : ' #1');
      } else {
        if (sermonPart.toLowerCase() !== (selectedSermon.title || '').toLowerCase()) {
          suggestion = selectedSermon.title;
          if (paragraph) suggestion += ` ${paragraph}`;
        }
        destinationPreview = `${selectedSermon.date ? selectedSermon.date + ' ' : ''}${selectedSermon.title}` + (paragraph ? ` #${paragraph}` : ' #1');
      }
    }

    return { sermons: matchingSermons, suggestion, paragraph, destinationPreview };
  }, [debouncedSearchTerm, searchType, sermons, selectedSermonIndex]);

  const inlineSermonSuggestion = useMemo(() => {
    if (!(searchType === 'sermons' || searchType === 'combined')) return '';
    if (!debouncedSearchTerm) return '';
    const suggestion = (smartSermonSearch.suggestion ?? '').toString();
    if (!suggestion) return '';

    const termLower = debouncedSearchTerm.toLowerCase();
    const suggestionLower = suggestion.toLowerCase();
    if (!suggestionLower.startsWith(termLower)) return '';
    if (suggestion.length <= debouncedSearchTerm.length) return '';
    return suggestion;
  }, [searchType, debouncedSearchTerm, smartSermonSearch.suggestion]);

  // Debounced search effect for blocks and combined mode
  useEffect(() => {
    if (!(searchType === 'blocks' || searchType === 'combined')) return;

    if (!debouncedSearchTerm.trim()) {
      lastBlockSearchSigRef.current = null;
      setBlockResults([]);
      setHasMore(false);
      setOffset(0);
      return;
    }

    performBlockSearch(debouncedSearchTerm, 0, true, blockSearchMode);
  }, [debouncedSearchTerm, searchType, blockSearchMode]);

  // Effect for sermon block results in modes that show sermon content.
  // Debounced to avoid expensive `loadSermon` calls on every keystroke.
  useEffect(() => {
    if (!(searchType === 'combined' || searchType === 'sermons')) {
      setSermonBlockResults([]);
      return;
    }

    if (!debouncedSearchTerm.trim()) {
      setSermonBlockResults([]);
      return;
    }

    if (smartSermonSearch.sermons.length > 0) {
      const fetchSermonBlocks = async () => {
        setIsSermonLoading(true);
        try {
          const boundedIndex = Math.min(selectedSermonIndex, smartSermonSearch.sermons.length - 1);
          const selectedSermon = smartSermonSearch.sermons[boundedIndex];
          const { paragraph } = smartSermonSearch;
          
          // Load the full sermon data to get blocks
          const sermonData = await sermonSearch.loadSermon(selectedSermon.uid);
          
          if (paragraph) {
            // Get specific paragraph blocks
            const flatParagraphs = [];
            let idx = 0;
            
            if (sermonData.orderedSectionIds) {
              sermonData.orderedSectionIds.forEach(sectionId => {
                const section = sermonData.sections[sectionId];
                (section.orderedParagraphIds || []).forEach(parId => {
                  idx++;
                  if (idx === paragraph) {
                    const par = section.paragraphs[parId];
                    const blocks = (par.orderedBlockIds || []).map(bid => {
                      const block = par.blocks[bid];
                      return {
                        uid: bid,
                        text: block.text,
                        type: block.type,
                        section_uid: sectionId,
                        paragraph_uid: parId,
                        sermon_uid: selectedSermon.uid,
                        title: selectedSermon.title,
                        date: selectedSermon.date,
                        paragraphNumber: idx
                      };
                    });
                    setSermonBlockResults(blocks);
                    return;
                  }
                });
              });
            }
            
            // If specific paragraph not found, show first few blocks
            if (sermonBlockResults.length === 0) {
              const firstBlocks = [];
              let blockCount = 0;
              
              if (sermonData.orderedSectionIds) {
                for (const sectionId of sermonData.orderedSectionIds) {
                  const section = sermonData.sections[sectionId];
                  for (const parId of (section.orderedParagraphIds || [])) {
                    const par = section.paragraphs[parId];
                    for (const bid of (par.orderedBlockIds || [])) {
                      if (blockCount >= 10) break;
                      const block = par.blocks[bid];
                      firstBlocks.push({
                        uid: bid,
                        text: block.text,
                        type: block.type,
                        section_uid: sectionId,
                        paragraph_uid: parId,
                        sermon_uid: selectedSermon.uid,
                        title: selectedSermon.title,
                        date: selectedSermon.date,
                        paragraphNumber: Math.floor(blockCount / 3) + 1 // Approximate
                      });
                      blockCount++;
                    }
                    if (blockCount >= 10) break;
                  }
                  if (blockCount >= 10) break;
                }
              }
              setSermonBlockResults(firstBlocks);
            }
          } else {
            // Get first 10 blocks from the sermon
            const firstBlocks = [];
            let blockCount = 0;
            let paragraphIdx = 0;
            
            if (sermonData.orderedSectionIds) {
              for (const sectionId of sermonData.orderedSectionIds) {
                const section = sermonData.sections[sectionId];
                for (const parId of (section.orderedParagraphIds || [])) {
                  paragraphIdx++;
                  const par = section.paragraphs[parId];
                  for (const bid of (par.orderedBlockIds || [])) {
                    if (blockCount >= 10) break;
                    const block = par.blocks[bid];
                    firstBlocks.push({
                      uid: bid,
                      text: block.text,
                      type: block.type,
                      section_uid: sectionId,
                      paragraph_uid: parId,
                      sermon_uid: selectedSermon.uid,
                      title: selectedSermon.title,
                      date: selectedSermon.date,
                      paragraphNumber: paragraphIdx
                    });
                    blockCount++;
                  }
                  if (blockCount >= 10) break;
                }
                if (blockCount >= 10) break;
              }
            }
            setSermonBlockResults(firstBlocks);
          }
        } catch (error) {
          console.error('Error fetching sermon blocks:', error);
          setSermonBlockResults([]);
        } finally {
          setIsSermonLoading(false);
        }
      };

      fetchSermonBlocks();
    } else {
      setSermonBlockResults([]);
    }
  }, [debouncedSearchTerm, searchType, smartSermonSearch.sermons, smartSermonSearch.paragraph, selectedSermonIndex]);

  // Smart reset of selected sermon index when sermon part changes
  useEffect(() => {
    const input = searchTerm.trim();
    const patterns = [
      /^(\d*\s*\w+.*?)\s+(\d+)$/,
      /^(\d*\s*\w+.*?)$/
    ];

    let currentSermonPart = input;
    for (const pattern of patterns) {
      const match = input.match(pattern);
      if (match) {
        currentSermonPart = match[1].trim();
        break;
      }
    }

    if (currentSermonPart !== lastSermonPart) {
      setSelectedSermonIndex(0);
      setLastSermonPart(currentSermonPart);
    }
  }, [searchTerm, lastSermonPart]);

  const performBlockSearch = async (query, currentOffset = 0, isNewSearch = false, searchMode = 'phrase') => {
    const trimmed = (query || '').trim();
    if (!trimmed) return;

    const sig = `${trimmed}|${searchMode}|${currentOffset}|${isNewSearch ? 'new' : 'append'}`;
    if (sig === lastBlockSearchSigRef.current) {
      // Skip duplicate triggered by React strict/effect double-fire
      return;
    }
    lastBlockSearchSigRef.current = sig;

    const requestId = ++searchRequestIdRef.current;
    setIsLoading(true);
    try {
      const page = Math.floor((currentOffset || 0) / LIMIT) + 1;
      const resp = await sermonSearch.searchText(trimmed, LIMIT, searchMode, null, page);
      const results = resp?.data || [];
      const transformed = results.map(r => ({
        ...r,
        paragraphNumber: 1,
        searchMode
        ,searchQuery: trimmed
      }));
      if (requestId !== searchRequestIdRef.current) return;
      if (isNewSearch) {
        setBlockResults(transformed);
        setOffset(LIMIT);
      } else {
        setBlockResults(prev => [...prev, ...transformed]);
        setOffset(prev => prev + LIMIT);
      }
      const hasNext = resp?.pagination?.hasNext;
      setHasMore(typeof hasNext === 'boolean' ? hasNext : transformed.length === LIMIT);
    } catch (e) {
      if (isNewSearch) setBlockResults([]);
      setHasMore(false);
      console.error('Block search error:', e);
    } finally {
      if (requestId === searchRequestIdRef.current) {
        setIsLoading(false);
      }
    }
  };

  const loadMore = () => {
    if (!isLoading && hasMore && debouncedSearchTerm.trim()) {
      performBlockSearch(debouncedSearchTerm, offset, false, blockSearchMode);
    }
  };

  const handleScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    if (scrollTop + clientHeight >= scrollHeight - 5) {
      loadMore();
    }
  };

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
  };

  const handleResultClick = async (result) => {
    try {
      if (result.type === 'sermon') {
        // Navigate to sermon
        const sermonData = await sermonSearch.loadSermon(result.uid);
        setActiveSermon(result, sermonData);
        onClose();
      } else {
        // Navigate to specific block in sermon
        const sermon = {
          id: result.sermon_id || result.id,
          uid: result.sermon_uid,
          title: result.title,
          date: result.date
        };
        const sermonData = await sermonSearch.loadSermon(result.sermon_uid);
        setActiveSermon(sermon, sermonData);
        onClose();
        
        // TODO: Scroll to specific block after navigation
      }
    } catch (error) {
      console.error('Error navigating to result:', error);
    }
  };

  const handleSermonNavigation = async () => {
    const { sermons: matchingSermons, paragraph } = smartSermonSearch;
    
    if (matchingSermons.length === 0) return;

    try {
      const boundedIndex = Math.min(selectedSermonIndex, matchingSermons.length - 1);
      let targetSermon = matchingSermons[boundedIndex];
      let targetParagraph = paragraph || 1;

      // If paragraph is specified, validate it exists
      if (paragraph) {
        const sermonData = await sermonSearch.loadSermon(targetSermon.uid);
        let flatParagraphs = [];
        let idx = 0;
        
        if (sermonData.orderedSectionIds) {
          sermonData.orderedSectionIds.forEach(sectionId => {
            const section = sermonData.sections[sectionId];
            (section.orderedParagraphIds || []).forEach(parId => {
              idx++;
              flatParagraphs.push({ id: parId, number: idx });
            });
          });
        }

        if (paragraph > flatParagraphs.length) {
          targetParagraph = flatParagraphs.length; // Go to last paragraph
        }
      }

      const sermonData = await sermonSearch.loadSermon(targetSermon.uid);
      setActiveSermon(targetSermon, sermonData);
      onClose();
      
      // TODO: Navigate to specific paragraph after setting active sermon
    } catch (error) {
      console.error('Error navigating to sermon:', error);
    }
  };

  const handleKeyDown = (e) => {
    if ((searchType === 'sermons' || searchType === 'combined') && smartSermonSearch.sermons.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedSermonIndex(prev => {
          const maxIndex = smartSermonSearch.sermons.length - 1;
          return prev < maxIndex ? prev + 1 : 0;
        });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedSermonIndex(prev => {
          const maxIndex = smartSermonSearch.sermons.length - 1;
          return prev > 0 ? prev - 1 : maxIndex;
        });
      } else if (e.key === 'Tab') {
        e.preventDefault();
        if (smartSermonSearch.suggestion && smartSermonSearch.sermons.length > 0) {
          setSearchTerm(smartSermonSearch.suggestion);
        }
      } else if (e.key === 'ArrowRight') {
        const inputEl = searchInputRef.current;
        const selectionStart = inputEl?.selectionStart ?? searchTerm.length;
        const selectionEnd = inputEl?.selectionEnd ?? searchTerm.length;
        const caretAtEnd = selectionStart === searchTerm.length && selectionEnd === searchTerm.length;

        if (caretAtEnd && inlineSermonSuggestion) {
          e.preventDefault();
          const nextValue = inlineSermonSuggestion.slice(0, searchTerm.length + 1);
          setSearchTerm(nextValue);
          setTimeout(() => {
            inputEl?.setSelectionRange?.(nextValue.length, nextValue.length);
          }, 0);
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleSermonNavigation();
      }
    } else if ((searchType === 'blocks' || searchType === 'combined') && e.key === 'Enter' && blockResults.length > 0) {
      e.preventDefault();
      handleResultClick(blockResults[0]);
    }
  };

  const toggleBlockSearchMode = () => {
    const newMode = blockSearchMode === 'phrase'
      ? 'general'
      : blockSearchMode === 'general'
        ? 'similar'
        : 'phrase';
    setBlockSearchMode(newMode);
    // Invalidate prior searches
    searchRequestIdRef.current++; // invalidate any in‑flight result handlers
    setBlockResults([]);
    setOffset(0);
    if (searchTerm.trim() && (searchType === 'blocks' || searchType === 'combined')) {
      // Slight delay to allow state update
      setTimeout(() => {
        performBlockSearch(searchTerm, 0, true, newMode);
      }, 50);
    }
  };

  // Global keyboard shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        setSearchType(prev => {
          const modes = ['combined', 'blocks', 'sermons'];
          const currentIndex = modes.indexOf(prev);
          const newIndex = currentIndex === 0 ? modes.length - 1 : currentIndex - 1;
          return modes[newIndex];
        });
        setSearchTerm('');
        setBlockResults([]);
      } else if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        setSearchType(prev => {
          const modes = ['combined', 'blocks', 'sermons'];
          const currentIndex = modes.indexOf(prev);
          const newIndex = (currentIndex + 1) % modes.length;
          return modes[newIndex];
        });
        setSearchTerm('');
        setBlockResults([]);
      } else if (e.ctrlKey && e.key === 'm') {
        // Ctrl+M to toggle block search mode
        e.preventDefault();
        if (searchType === 'blocks' || searchType === 'combined') {
          toggleBlockSearchMode();
        }
      } else if (e.ctrlKey && e.key === 'f') {
        // Ctrl+F to focus search input
        if (isOpen) {
          e.preventDefault();
          setSearchType(prev => {
            const modes = ['combined', 'blocks', 'sermons'];
            const currentIndex = modes.indexOf(prev);
            const newIndex = (currentIndex + 1) % modes.length;
            return modes[newIndex];
          });
        }
      }
    };

    const handleClickOutside = (e) => {
      if (modalRef.current && !modalRef.current.contains(e.target)) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    window.addEventListener('mousedown', handleClickOutside);

    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
      window.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose, searchType, searchTerm, blockSearchMode]);

  // Scroll selected sermon into view
  useEffect(() => {
    if (smartSermonSearch.sermons.length > 0) {
      const scrollToSelectedSermon = () => {
        const activeListRef = searchType === 'combined' ? combinedSermonListRef : sermonListRef;
        if (activeListRef.current) {
          const sermonElements = activeListRef.current.children;
          if (sermonElements[selectedSermonIndex]) {
            // Uncomment if you want auto-scroll behavior
            // sermonElements[selectedSermonIndex].scrollIntoView({
            //   behavior: 'smooth',
            //   block: 'center',
            //   inline: 'nearest'
            // });
          }
        }
      };
      setTimeout(scrollToSelectedSermon, 50);
    }
  }, [selectedSermonIndex, searchType, smartSermonSearch.sermons.length]);

  return (
    <div className={`fixed inset-0 bg-black/50 flex items-center justify-center z-50 transition-all duration-200 ${isOpen ? 'opacity-100 pointer-events-auto backdrop-blur-xs' : 'opacity-0 pointer-events-none backdrop-blur-0'}`}>
      <div 
        ref={modalRef}
        className="w-[60%] max-w-4xl relative max-h-[80vh] flex flex-col">
        
        {/* Mode Toggle */}
        <div className="flex mb-4 bg-neutral-800 rounded-lg p-1">
          <button
            onClick={() => {setSearchType('combined'); setSearchTerm(''); setBlockResults([]); setSermonBlockResults([]);}}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              searchType === 'combined' 
                ? 'bg-neutral-700 text-white' 
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            Combined Search
          </button>
          <button
            onClick={() => {setSearchType('blocks'); setSearchTerm(''); setBlockResults([]); setSermonBlockResults([]);}}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              searchType === 'blocks' 
                ? 'bg-neutral-700 text-white' 
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            Search Blocks
          </button>
          <button
            onClick={() => {setSearchType('sermons'); setSearchTerm(''); setBlockResults([]); setSermonBlockResults([]);}}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              searchType === 'sermons' 
                ? 'bg-neutral-700 text-white' 
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            Go to Sermon
          </button>
        </div>

        {/* Block Search Mode Toggle - Show only for blocks and combined search */}
        {(searchType === 'blocks' || searchType === 'combined') && (
          <div className="flex mb-4 bg-neutral-700 rounded-lg p-1">
            <button
              onClick={() => {
                if (blockSearchMode === 'phrase') return;
                setBlockSearchMode('phrase');
                searchRequestIdRef.current++;
                setBlockResults([]);
                setOffset(0);
                if (searchTerm.trim()) setTimeout(() => performBlockSearch(searchTerm, 0, true, 'phrase'), 50);
              }}
              className={`flex-1 py-2 px-3 rounded-md text-xs font-medium transition-colors ${
                blockSearchMode === 'phrase' 
                  ? 'bg-neutral-600 text-white' 
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Phrase Search
            </button>
            <button
              onClick={() => {
                if (blockSearchMode === 'general') return;
                setBlockSearchMode('general');
                searchRequestIdRef.current++;
                setBlockResults([]);
                setOffset(0);
                if (searchTerm.trim()) setTimeout(() => performBlockSearch(searchTerm, 0, true, 'general'), 50);
              }}
              className={`flex-1 py-2 px-3 rounded-md text-xs font-medium transition-colors ${
                blockSearchMode === 'general' 
                  ? 'bg-neutral-600 text-white' 
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              General Search
            </button>
            <button
              onClick={() => {
                if (blockSearchMode === 'similar') return;
                setBlockSearchMode('similar');
                searchRequestIdRef.current++;
                setBlockResults([]);
                setOffset(0);
                if (searchTerm.trim()) setTimeout(() => performBlockSearch(searchTerm, 0, true, 'similar'), 50);
              }}
              className={`flex-1 py-2 px-3 rounded-md text-xs font-medium transition-colors ${
                blockSearchMode === 'similar'
                  ? 'bg-neutral-600 text-white'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Similar Search
            </button>
            <div className="flex items-center px-2">
              <span className="text-xs text-neutral-500">Ctrl+M</span>
            </div>
          </div>
        )}

        <div className="flex items-center relative mb-4">
          <input 
            type="text" 
            placeholder={
              searchType === 'blocks' ? 
                `Search sermon content (${blockSearchMode === 'phrase' ? 'consecutive words' : blockSearchMode === 'general' ? 'all words in paragraph' : 'semantic similarity'})...` : 
              searchType === 'sermons' ? "Go to sermon (e.g. 'Faith is 10', '47-0412 5')" :
              `Search blocks (${blockSearchMode === 'phrase' ? 'phrase' : blockSearchMode === 'general' ? 'general' : 'similar'}) or go to sermon (e.g. 'love' or 'Faith is 10')`
            }
            className="w-full rounded-lg focus:outline-none p-4 bg-neutral-800 text-sm !text-neutral-500 focus:!text-white hover:!text-white transition-colors" 
            ref={searchInputRef} 
            value={searchTerm}
            onChange={handleSearchChange}
            onKeyDown={handleKeyDown}
            style={{ boxShadow: '0 0 15px rgba(0, 0, 0, 0.3)' }} 
          />
          <IoSearchOutline className="text-white/80 absolute right-6 top-1/2 -translate-y-1/2" size={20} />
          
          {/* Autocomplete suggestion */}
          {(searchType === 'sermons' || searchType === 'combined') && inlineSermonSuggestion && searchTerm.length > 0 && (
            <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
              <span className="text-transparent text-sm">{searchTerm}</span>
              <span className="text-neutral-500 text-sm">{inlineSermonSuggestion.slice(searchTerm.length)}</span>
            </div>
          )}
          
          {/* Destination preview */}
          {(searchType === 'sermons' || searchType === 'combined') && smartSermonSearch.destinationPreview && searchTerm.length > 0 && (
            <div className="absolute right-12 top-1/2 -translate-y-1/2 pointer-events-none">
              <span className="text-neutral-400 text-sm">→ {smartSermonSearch.destinationPreview}</span>
            </div>
          )}
        </div>
        
        {/* Combined mode results */}
        {searchType === 'combined' && searchTerm.trim() && (
          <div 
            className="bg-neutral-800 rounded-lg flex-1 overflow-y-auto p-4 space-y-3"
            style={{ boxShadow: '0 0 15px rgba(0, 0, 0, 0.3)' }}
            onScroll={handleScroll}
          >
            {/* Sermon suggestions section */}
            {smartSermonSearch.sermons.length > 0 && (
              <div className="mb-6">
                <h3 className="text-white font-medium mb-3 text-sm">Sermon Navigation</h3>
                <div className="space-y-2 max-h-60 overflow-y-auto" ref={combinedSermonListRef}>
                  {smartSermonSearch.sermons.map((sermon, index) => (
                    <div 
                      key={sermon.id}
                      className={`p-3 rounded-lg cursor-pointer transition-colors ${
                        index === selectedSermonIndex 
                          ? 'bg-blue-600 text-white' 
                          : 'bg-neutral-700 hover:bg-neutral-600'
                      }`}
                      onClick={() => {
                        setSelectedSermonIndex(index);
                        handleSermonNavigation();
                      }}
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-medium">{sermon.title}</span>
                        <span className="text-sm text-neutral-400">{sermon.date}</span>
                      </div>
                      {smartSermonSearch.paragraph && (
                        <div className="text-sm text-neutral-300 mt-1">
                          Paragraph {smartSermonSearch.paragraph}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Results container */}
            <div className="flex gap-4">
              {/* Block search results */}
              {(blockResults.length > 0 || sermonBlockResults.length === 0) && (
                <div className={`${sermonBlockResults.length > 0 ? 'flex-1' : 'w-full'}`}>
                  {blockResults.length > 0 && (
                    <>
                      <h3 className="text-white font-medium mb-3 text-sm">
                        Block Search Results ({blockSearchMode === 'phrase' ? 'Phrase' : blockSearchMode === 'general' ? 'General' : 'Similar'})
                      </h3>
                      <div className="space-y-3">
                        {blockResults.map((block, index) => (
                          <SearchResult
                            key={`${block.sermon_uid}-${block.uid}-${index}`}
                            result={block}
                            onClick={handleResultClick}
                            variant="block"
                          />
                        ))}
                      </div>
                    </>
                  )}
                  
                  {blockResults.length === 0 && sermonBlockResults.length > 0 && !isLoading && (
                    <div className="flex justify-center py-8">
                      <div className="text-white/60">No {blockSearchMode} search results for "{searchTerm}"</div>
                    </div>
                  )}
                </div>
              )}

              {/* Sermon content results */}
              {sermonBlockResults.length > 0 && (
                <div className={`${blockResults.length > 0 ? 'flex-1' : 'w-full'}`}>
                  <h3 className="text-white font-medium mb-3 text-sm">
                    {smartSermonSearch.paragraph ? `Paragraph ${smartSermonSearch.paragraph}` : 'Sermon'} Content
                  </h3>
                  {isSermonLoading ? (
                    <div className="flex justify-center py-4">
                      <div className="text-white/60">Loading...</div>
                    </div>
                  ) : (
                    <div className="space-y-3 overflow-y-auto">
                      {sermonBlockResults.map((block, index) => (
                        <SearchResult
                          key={`sermon-${block.sermon_uid}-${block.uid}-${index}`}
                          result={block}
                          onClick={handleResultClick}
                          variant="sermon"
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            
            {/* Loading and status messages */}
            {(isLoading || isSermonLoading) && (
              <div className="flex justify-center py-4">
                <div className="text-white/60">Loading more results...</div>
              </div>
            )}
            
            {!hasMore && blockResults.length > 0 && (
              <div className="flex justify-center py-4">
                <div className="text-white/60">No more results</div>
              </div>
            )}

            {!isLoading && !isSermonLoading && blockResults.length === 0 && smartSermonSearch.sermons.length === 0 && sermonBlockResults.length === 0 && searchTerm.trim() && (
              <div className="flex justify-center py-8">
                <div className="text-white/60">No results found</div>
              </div>
            )}
          </div>
        )}

        {/* Sermons mode */}
        {searchType === 'sermons' && searchTerm.trim() && (
          <div 
            className="bg-neutral-800 rounded-lg flex-1 overflow-y-auto p-4"
            style={{ boxShadow: '0 0 15px rgba(0, 0, 0, 0.3)' }}
          >
            <div className="flex gap-4">
              {/* Sermon suggestions */}
              <div className="w-1/3 sticky top-0 self-start">
                <h3 className="text-white font-medium mb-3 text-sm">Sermon Selection</h3>
                <div className="space-y-2 max-h-96 overflow-y-auto" ref={sermonListRef}>
                  {smartSermonSearch.sermons.map((sermon, index) => (
                    <div 
                      key={sermon.id}
                      className={`p-3 rounded-lg cursor-pointer transition-colors ${
                        index === selectedSermonIndex 
                          ? 'bg-blue-600 text-white' 
                          : 'bg-neutral-700 hover:bg-neutral-600'
                      }`}
                      onClick={() => {
                        setSelectedSermonIndex(index);
                        handleSermonNavigation();
                      }}
                    >
                      <div className="flex flex-col">
                        <span className="font-medium">{sermon.title}</span>
                        <span className="text-sm text-neutral-400">{sermon.date}</span>
                      </div>
                      {smartSermonSearch.paragraph && (
                        <div className="text-sm text-neutral-300 mt-1">
                          Paragraph {smartSermonSearch.paragraph}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Sermon content */}
              {sermonBlockResults.length > 0 && (
                <div className="flex-1">
                  <h3 className="text-white font-medium mb-3 text-sm">
                    {smartSermonSearch.paragraph ? `Paragraph ${smartSermonSearch.paragraph}` : 'Sermon'} Content
                  </h3>
                  {isSermonLoading ? (
                    <div className="flex justify-center py-4">
                      <div className="text-white/60">Loading...</div>
                    </div>
                  ) : (
                    <div className="space-y-3 grow overflow-y-auto">
                      {sermonBlockResults.map((block, index) => (
                        <SearchResult
                          key={`sermon-content-${block.sermon_uid}-${block.uid}-${index}`}
                          result={block}
                          onClick={handleResultClick}
                          variant="sermon"
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Block search results */}
        {searchType === 'blocks' && searchTerm.trim() && (
          <div 
            ref={resultsRef}
            className="bg-neutral-800 rounded-lg flex-1 overflow-y-auto p-4 space-y-3"
            style={{ boxShadow: '0 0 15px rgba(0, 0, 0, 0.3)' }}
            onScroll={handleScroll}
          >
            {blockResults.length > 0 ? (
              <>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-white font-medium text-sm">
                    {blockSearchMode === 'phrase' ? 'Phrase' : 'General'} Search Results
                  </h3>
                  <span className="text-xs text-neutral-400">
                    {blockSearchMode === 'phrase' ? 'Consecutive words' : 'All words in paragraph'}
                  </span>
                </div>
                {blockResults.map((block, index) => (
                  <SearchResult
                    key={`${block.sermon_uid}-${block.uid}-${index}`}
                    result={block}
                    onClick={handleResultClick}
                    variant="block"
                  />
                ))}
                
                {isLoading && (
                  <div className="flex justify-center py-4">
                    <div className="text-white/60">Loading more results...</div>
                  </div>
                )}
                
                {!hasMore && blockResults.length > 0 && (
                  <div className="flex justify-center py-4">
                    <div className="text-white/60">No more results</div>
                  </div>
                )}
              </>
            ) : isLoading ? (
              <div className="flex justify-center py-8">
                <div className="text-white/60">Searching...</div>
              </div>
            ) : searchTerm.trim() ? (
              <div className="flex justify-center py-8">
                <div className="text-white/60">No results found</div>
              </div>
            ) : null}
          </div>
        )}

        {/* Instructions */}
        {((searchType === 'sermons' || searchType === 'combined') && !searchTerm.trim()) && (
          <div className="bg-neutral-800 rounded-lg p-6 text-center" style={{ boxShadow: '0 0 15px rgba(0, 0, 0, 0.3)' }}>
            <h3 className="text-white font-medium mb-3">
              {searchType === 'combined' ? 'Combined Search' : 'Sermon Navigation'}
            </h3>
            <div className="text-neutral-400 text-sm space-y-2">
              <p>Examples: "Faith is 10", "47-0412 5", "Divine Healing"</p>
              {searchType === 'combined' && <p>Or search for block content: "love", "salvation", etc.</p>}
              <p>Use ↑↓ arrows to select sermons, Tab to autocomplete, Enter to navigate</p>
              <p className="text-neutral-500 text-xs mt-3">
                Alt+←/→ to switch modes
              </p>
            </div>
          </div>
        )}

        {searchType === 'blocks' && !searchTerm.trim() && (
          <div className="bg-neutral-800 rounded-lg p-6 text-center" style={{ boxShadow: '0 0 15px rgba(0, 0, 0, 0.3)' }}>
            <h3 className="text-white font-medium mb-3">Block Search</h3>
            <div className="text-neutral-400 text-sm space-y-2">
              <p><strong>Phrase Search:</strong> Find exact phrases or consecutive words</p>
              <p><strong>General Search:</strong> Find paragraphs containing all words (any order)</p>
              <p>Examples: "love salvation", "for God so loved", "faith works together"</p>
              <p className="text-neutral-500 text-xs mt-3">
                Alt+←/→ to switch modes • Ctrl+M to toggle search mode
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchModal;
