'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import useSermonStore from '@/stores/sermonStore';
import { sermonSearch } from '@/lib/sermonSearch';
import SermonView from '@/components/sermons/SermonView';
import ListSermon from './ListSermon';
import SearchModal from './SearchModal'; // UPDATED: Import sermon SearchModal instead of Bible one
import ResizablePanels from '@/components/ui/ResizablePanels';
import BibleControlPanel from './BibleControlPanel';

import { IoSearchOutline } from "react-icons/io5";

// -----------

export default function BiblePage() {
  const [books, setBooks] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [autoExpandMode, setAutoExpandMode] = useState(false);
  const [lastExpandedIndex, setLastExpandedIndex] = useState(-1);
  const [selectedBookIndex, setSelectedBookIndex] = useState(0); // Add separate index for smart search
  const searchInputRef = useRef(null);
  const selectedSermonRef = useRef(null);

  const { activeSermon, setActiveSermon, setActiveBookWithChapter, setActiveBookWithVerse } = useSermonStore();

  // ----------------------------

  const [sermons, setSermons] = useState([]);
  const [selectedSermonIndex, setSelectedSermonIndex] = useState(0);

  // ----------------------------

  useEffect(() => {
    const fetchSermons = async () => {
      try {
        const sermonsData = await sermonSearch.getSermons();
        console.log('Fetched sermons:', sermonsData);
        setSermons(sermonsData);
      } catch (error) {
        console.error("Error fetching sermons:", error);
      }
    };
    
    fetchSermons();
  }, []);

  // Helper to normalize a date-style query (e.g. 470412 -> 47-0412)
  const normalizeDateQuery = (q) => {
    const raw = q.replace(/[^0-9A-Za-z]/g, '');
    if (raw.length < 3) return null;
    // Insert hyphen after first 2 digits (year prefix)
    const normalized = raw.slice(0, 2) + '-' + raw.slice(2);
    return normalized;
  };

  // Helper to sync smart index with current UI selection
  const syncSmartIndex = (sermon) => {
    if (!sermon) return;
    const idx = smartSermonSearch.sermons.findIndex(s => s.id === sermon.id);
    if (idx >= 0) setSelectedSermonIndex(idx);
  };

  // Smart book/sermon search logic (updated for date search)
  const smartSermonSearch = useMemo(() => {
    if (!searchTerm.trim()) return { sermons: [], suggestion: '', paragraph: null, destinationPreview: '' };

    const input = searchTerm.trim();
    const dateQuery = normalizeDateQuery(input);
    const isDateSearch = !!dateQuery && /^\d{2}-[0-9A-Za-z]{3,8}$/.test(dateQuery); // Accept patterns like 47-0412 / 47-1100X

    // --- Paragraph / numeric suffix parsing (retain existing behavior) ---
    const patterns = [
      /^(\d*\s*\w+)\s+(\d+)$/, // "Title 10"
      /^(\d*\s*\w+)$/          // "Title"
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
    }

    let matchingSermons = [];

    if (isDateSearch) {
      // Date-based matching
      matchingSermons = sermons.filter(s =>
        (s.date || '').toLowerCase().startsWith(dateQuery.toLowerCase())
      ).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    } else {
      // Title-based matching (existing logic)
      matchingSermons = sermons
        .filter(sermon => {
          const sermonLower = sermonPart.toLowerCase();
          const sermonTitleLower = (sermon.title || '').toLowerCase();
          return sermonTitleLower.startsWith(sermonLower);
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
      const firstSermon = matchingSermons[selectedSermonIndex] || matchingSermons[0];

      if (isDateSearch) {
        // Suggest full date if partial / normalized
        if (dateQuery !== firstSermon.date) {
          suggestion = firstSermon.date;
          if (paragraph) suggestion += ` ${paragraph}`;
        }
        // Destination preview shows date + title + paragraph/chapter
        destinationPreview = `${firstSermon.date} ${firstSermon.title}` + (paragraph ? ` ${paragraph}` : ' #1');
      } else {
        // Existing title suggestion
        if (sermonPart.toLowerCase() !== (firstSermon.title || '').toLowerCase()) {
          suggestion = firstSermon.title;
          if (paragraph) suggestion += ` ${paragraph}`;
        }
        // Include date in destination preview even for title searches
        destinationPreview =
          `${firstSermon.date ? firstSermon.date + ' ' : ''}${firstSermon.title}` +
          (paragraph ? ` ${paragraph}` : ' #1');
      }
    }

    return { sermons: matchingSermons, suggestion, paragraph, destinationPreview };
  }, [searchTerm, sermons, selectedSermonIndex]);

  const filteredSermons = useMemo(() => {
    if (!sermons || sermons.length === 0) return [];
    if (!searchTerm) return sermons;
    const termRaw = searchTerm.toLowerCase();
    const termDateNorm = normalizeDateQuery(searchTerm)?.toLowerCase();
    return sermons.filter(s => {
      const titleMatch = (s.title || '').toLowerCase().includes(termRaw);
      const dateMatch = termDateNorm
        ? (s.date || '').toLowerCase().startsWith(termDateNorm)
        : (s.date || '').toLowerCase().includes(termRaw);
      return titleMatch || dateMatch;
    });
  }, [searchTerm, sermons]);

  const handleSmartNavigation = async () => {
    const { sermons: matchingSermons, paragraph } = smartSermonSearch;

    if (matchingSermons.length === 0) return;

    setLoading(true);

    try {
      let targetSermon = matchingSermons[selectedSermonIndex] || matchingSermons[0];
      let targetParagraph = paragraph || 1;

      // If paragraph is specified, find a sermon that has that paragraph
      if (paragraph) {
        let foundValidSermon = false;

        for (const sermon of matchingSermons) {
          const sermonData = await sermonSearch.loadSermon(sermon.uid);
          const paragraphs = Object.keys(sermonData).map(Number);

          if (paragraphs.includes(targetParagraph)) {
            targetSermon = sermon;
            foundValidSermon = true;
            break;
          }
        }

        // If no sermon has the specified paragraph, use first sermon and its last paragraph
        if (!foundValidSermon) {
          const sermonData = await sermonSearch.loadSermon(targetSermon.uid);
          const paragraphs = Object.keys(sermonData).map(Number).sort((a, b) => a - b);
          targetParagraph = paragraphs[paragraphs.length - 1];
        }
      }

      const sermonData = await sermonSearch.getBook(targetSermon.id);
      // setActiveBookWithVerse(targetSermon, sermonData, targetParagraph);

      // Clear search
      setSearchTerm('');
      setSelectedIndex(-1);
    } catch (error) {
      console.error('Error navigating to sermon:', error);
    } finally {
      setLoading(false);
    }
  };

  const scrollToSelectedSermon = () => {
    if (selectedSermonRef.current) {
      selectedSermonRef.current.scrollIntoView({
        // behavior: 'smooth',
        block: 'center',
        inline: 'nearest'
      });
    }
  };

  const handleKeyDown = (e) => {
    if (filteredSermons.length === 0) return;

    const isSmartMode = smartSermonSearch.sermons.length > 0;

    // Arrow navigation always uses visual order (filteredSermons)
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex = selectedIndex < filteredSermons.length - 1 ? selectedIndex + 1 : 0;
      setSelectedIndex(nextIndex);
      syncSmartIndex(filteredSermons[nextIndex]);
      setTimeout(scrollToSelectedSermon, 0);
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIndex = selectedIndex > 0 ? selectedIndex - 1 : filteredSermons.length - 1;
      setSelectedIndex(prevIndex);
      syncSmartIndex(filteredSermons[prevIndex]);
      setTimeout(scrollToSelectedSermon, 0);
      return;
    }

    if (isSmartMode) {
      if (e.key === 'Tab') {
        e.preventDefault();
        if (smartSermonSearch.suggestion && smartSermonSearch.sermons.length > 0) {
          setSearchTerm(smartSermonSearch.suggestion);
        }
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSmartNavigation();
        return;
      }
    }

    // Regular navigation (Enter/Escape) when not smart mode
    switch (e.key) {
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < filteredSermons.length) {
          handleSermonPress(filteredSermons[selectedIndex]);
        }
        break;
      case 'Escape':
        setSelectedIndex(-1);
        setAutoExpandMode(false);
        setLastExpandedIndex(-1);
        setSearchTerm('');
        searchInputRef.current?.blur();
        break;
    }
  };

  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchTerm(value);
    // Reset indices
    setSelectedIndex(0);
    setSelectedSermonIndex(0);
  };

  const handleSermonPress = async (sermon) => {
    // Prevent multiple clicks
    if (loading) return;
    
    console.log('Sermon pressed:', sermon);
    
    try {
      // Set loading state immediately but don't block UI
      setLoading(true);
      
      // Set basic sermon info immediately for instant feedback
      setActiveSermon({
        id: sermon.id,
        uid: sermon.uid,
        title: sermon.title,
        date: sermon.date
      });
      
      // Load full data in parallel (non-blocking)
      const sermonDataPromise = sermonSearch.loadSermon(sermon.uid);
      
      // Give immediate UI feedback, then load data
      await new Promise(resolve => setTimeout(resolve, 0)); // Yield to UI
      
      const sermonData = await sermonDataPromise;
      console.log('Sermon data loaded:', sermonData);
      
      // Update with full data
      if (sermonData) {
        setActiveSermon({ ...sermon, ...sermonData });
      }
    } catch (error) {
      console.error('Error loading sermon data:', error);
      // Keep basic sermon info on error rather than clearing
      setActiveSermon(sermon);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        setIsSearchModalOpen(true);
      }
      // watch for alt + s to focus search input
      if (e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <div className="text-white h-full">
      <ResizablePanels
        initialLeftWidth={40}
        orientation="vertical"
        leftPanel={
          <div className='flex flex-col bg-neutral-900 border-r border-neutral-800 h-full'>
            <div className="flex flex-col overflow-y-scroll flex-1 dark-scroll pb-8">
              <div className="p-2 py-4 sticky top-0 z-10 bg-neutral-900">
                <div className="relative">
                  <input
                    ref={searchInputRef}
                    type="text"
                    placeholder="Go to sermon title or date (e.g. 47-0412, Faith Is...)"
                    value={searchTerm}
                    onChange={handleSearchChange}
                    onKeyDown={handleKeyDown}
                    className="w-full rounded focus:outline-none p-4 hover:bg-neutral-800/60 bg-neutral-800 focus:bg-neutral-800 text-sm !text-neutral-500 focus:!text-white hover:!text-white transition-colors"
                  />
                  <IoSearchOutline className="text-white/80 absolute right-6 top-4" size={20} />

                  {/* Autocomplete suggestion */}
                  {smartSermonSearch.suggestion && searchTerm.length > 0 && (
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none text-sm">
                      <span className="text-transparent">{searchTerm}</span>
                      <span className="text-neutral-500">{smartSermonSearch.suggestion.slice(searchTerm.length)}</span>
                    </div>
                  )}

                  {/* Destination preview */}
                  {smartSermonSearch.destinationPreview && searchTerm.length > 0 && (
                    <div className="absolute right-12 top-1/2 -translate-y-1/2 pointer-events-none">
                      <span className="text-neutral-400 text-xs">→ {smartSermonSearch.destinationPreview}</span>
                    </div>
                  )}
                </div>

                {/* Smart search instructions */}
                <div className="mt-2 text-xs text-neutral-400">
                  Use ↑↓ to select, Tab to complete, Enter to navigate (titles or dates)
                </div>
              </div>

              {filteredSermons.map((sermon, index) => {
                const isSmartSelected = smartSermonSearch.sermons.length > 0 && index === selectedIndex;

                return (
                  <ListSermon
                    key={sermon.id ?? index}
                    ref={(selectedIndex === index) ? selectedSermonRef : null}
                    data={sermon}
                    onPress={smartSermonSearch.sermons.length > 0 ? () => {
                      setSelectedIndex(index);
                      syncSmartIndex(sermon);
                      handleSmartNavigation();
                    } : handleSermonPress}
                    isActive={activeSermon?.id === sermon.id}
                    isSelected={selectedIndex === index}
                    isSmartSelected={isSmartSelected}
                    selectedIndex={selectedIndex}
                    setSelectedIndex={setSelectedIndex}
                    bookIndex={index}
                    forceExpanded={autoExpandMode && selectedIndex === index}
                    forceCollapsed={autoExpandMode && lastExpandedIndex !== index}
                  />
                );
              })}
            </div>
          </div>
        }
        rightPanel={
          <div className="flex flex-col h-full">
            {loading ? (
              <div className="flex-1 flex items-center justify-center bg-neutral-900">
                <div className="text-gray-400">Loading sermon...</div>
              </div>
            ) : (
              <SermonView />
            )}
          </div>
        }
      />

      <SearchModal isOpen={isSearchModalOpen} onClose={() => setIsSearchModalOpen(false)} />

      <BibleControlPanel />
    </div>
  );
}