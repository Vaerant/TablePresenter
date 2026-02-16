'use client';

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';

import useSermonStore from '@/stores/sermonStore';
import { sermonSearch } from '@/lib/sermonSearch';

import { IoSearchOutline } from "react-icons/io5";

import ListTitle from './ListTitle';
import SearchModal from './SearchModal';

export default function SermonList() {

  const ROW_HEIGHT = 86;
  const OVERSCAN = 10;

  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [selectedMatchIndex, setSelectedMatchIndex] = useState(0);
  const searchInputRef = useRef(null);
  const listViewportRef = useRef(null);
  const [listViewportSize, setListViewportSize] = useState({ width: 0, height: 0 });
  const [scrollTop, setScrollTop] = useState(0);

  const { sermons, activeSermon, setSermons, setActiveSermon } = useSermonStore();

  // fetch sermons on mount
  useEffect(() => {
    if (sermons.length > 0) return; // already have sermons
    const fetchSermons = async () => {
      const results = await sermonSearch.getSermons();
      console.log('Fetched sermons:', results);
      setSermons(results);
    };
    fetchSermons();
  }, [sermons.length, setSermons]);

  const handleSermonPress = async (sermon) => {
    const sermonData = await sermonSearch.loadSermon(sermon.uid);
    console.log('Selected Sermon:', sermonData);
    setActiveSermon(sermon, sermonData);
  };

  const smartSermonSearch = useMemo(() => {
    if (!searchTerm.trim()) {
      return { sermons: [], suggestion: '', destinationPreview: '', mode: 'none' };
    }

    const input = searchTerm.trim();
    const inputLower = input.toLowerCase();

    const isLikelyDate = /^\d{1,2}-[0-9x]{0,5}$/i.test(input) || /^\d{2}-?$/.test(input);

    let mode = 'title';
    if (isLikelyDate) mode = 'date';

    const normalize = (value) => (value ?? '').toString().trim().toLowerCase();

    const matching = sermons
      .filter((sermon) => {
        if (!sermon) return false;
        const title = normalize(sermon.title);
        const date = normalize(sermon.date);

        if (mode === 'date') return date.startsWith(inputLower) || date.includes(inputLower);
        return title.startsWith(inputLower) || title.includes(inputLower);
      })
      .sort((a, b) => {
        const aTitle = normalize(a.title);
        const bTitle = normalize(b.title);
        const aDate = normalize(a.date);
        const bDate = normalize(b.date);

        const starts = (value) => (value.startsWith(inputLower) ? 0 : 1);

        if (mode === 'date') {
          const dateCmp = starts(aDate) - starts(bDate) || aDate.localeCompare(bDate);
          if (dateCmp !== 0) return dateCmp;
          return aTitle.localeCompare(bTitle);
        }

        const titleCmp = starts(aTitle) - starts(bTitle) || aTitle.length - bTitle.length;
        if (titleCmp !== 0) return titleCmp;
        return aDate.localeCompare(bDate);
      });

    let suggestion = '';
    let destinationPreview = '';

    if (matching.length > 0) {
      const selected = matching[selectedMatchIndex] || matching[0];
      const selectedTitle = (selected.title ?? '').toString();
      const selectedDate = (selected.date ?? '').toString();
      const selectedUid = (selected.uid ?? '').toString();

      const targetText = mode === 'date' ? selectedDate : selectedTitle;

      if (targetText && targetText.toLowerCase() !== inputLower) {
        suggestion = targetText;
      }

      destinationPreview = `${selectedDate} · ${selectedTitle}`;
    }

    return { sermons: matching, suggestion, destinationPreview, mode };
  }, [searchTerm, sermons, selectedMatchIndex]);

  const hasSmartMatches = smartSermonSearch.sermons.length > 0;

  const inlineSuggestion = useMemo(() => {
    if (!searchTerm) return '';
    const suggestion = (smartSermonSearch.suggestion ?? '').toString();
    if (!suggestion) return '';

    const termLower = searchTerm.toLowerCase();
    const suggestionLower = suggestion.toLowerCase();
    if (!suggestionLower.startsWith(termLower)) return '';
    if (suggestion.length <= searchTerm.length) return '';
    return suggestion;
  }, [searchTerm, smartSermonSearch.suggestion]);

  const filteredSermons = useMemo(() => {
    if (!sermons || sermons.length === 0) return [];
    if (!searchTerm.trim()) return sermons;
    if (smartSermonSearch.sermons.length > 0) return smartSermonSearch.sermons;

    const term = searchTerm.trim().toLowerCase();
    return sermons.filter((s) => (s?.title ?? '').toString().toLowerCase().includes(term));
  }, [sermons, searchTerm, smartSermonSearch.sermons]);

  const scrollToIndex = useCallback((index) => {
    if (index < 0) return;
    const container = listViewportRef.current;
    if (!container) return;

    const itemTop = index * ROW_HEIGHT;
    const itemBottom = itemTop + ROW_HEIGHT;
    const viewTop = container.scrollTop;
    const viewBottom = viewTop + container.clientHeight;

    if (itemTop < viewTop) {
      container.scrollTop = itemTop;
      setScrollTop(container.scrollTop);
      return;
    }

    if (itemBottom > viewBottom) {
      container.scrollTop = Math.max(0, itemBottom - container.clientHeight);
      setScrollTop(container.scrollTop);
    }
  }, [setScrollTop]);

  useEffect(() => {
    const el = listViewportRef.current;
    if (!el) return;

    const update = () => {
      const rect = el.getBoundingClientRect();
      const next = {
        width: Math.max(0, Math.floor(rect.width)),
        height: Math.max(0, Math.floor(rect.height)),
      };
      setListViewportSize((prev) =>
        prev.width === next.width && prev.height === next.height ? prev : next
      );
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const selectedListIndex = hasSmartMatches ? selectedMatchIndex : selectedIndex;

  const virtualization = useMemo(() => {
    const count = filteredSermons.length;
    const viewportHeight = listViewportRef.current?.clientHeight ?? listViewportSize.height;
    const totalHeight = count * ROW_HEIGHT;

    if (count === 0 || viewportHeight <= 0) {
      return {
        totalHeight,
        startIndex: 0,
        endIndex: -1,
        offsetTop: 0,
        items: [],
      };
    }

    const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
    const endIndex = Math.min(
      count - 1,
      Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN
    );

    const items = filteredSermons.slice(startIndex, endIndex + 1);
    return {
      totalHeight,
      startIndex,
      endIndex,
      offsetTop: startIndex * ROW_HEIGHT,
      items,
    };
  }, [filteredSermons, listViewportSize.height, scrollTop]);

  const handleSmartNavigation = async () => {
    const matches = smartSermonSearch.sermons;
    if (!matches || matches.length === 0) return;

    const target = matches[selectedMatchIndex] || matches[0];
    setLoading(true);
    try {
      await handleSermonPress(target);
      setSearchTerm('');
      setSelectedIndex(-1);
      setSelectedMatchIndex(0);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {

    if (filteredSermons.length === 0) return;

    if (hasSmartMatches) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = selectedMatchIndex < filteredSermons.length - 1 ? selectedMatchIndex + 1 : 0;
        setSelectedMatchIndex(next);
        scrollToIndex(next);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const next = selectedMatchIndex > 0 ? selectedMatchIndex - 1 : filteredSermons.length - 1;
        setSelectedMatchIndex(next);
        scrollToIndex(next);
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        if (smartSermonSearch.suggestion) {
          setSearchTerm(smartSermonSearch.suggestion);
        }
        return;
      }
      if (e.key === 'ArrowRight') {
        const inputEl = searchInputRef.current;
        const selectionStart = inputEl?.selectionStart ?? searchTerm.length;
        const selectionEnd = inputEl?.selectionEnd ?? searchTerm.length;
        const caretAtEnd = selectionStart === searchTerm.length && selectionEnd === searchTerm.length;

        if (caretAtEnd && inlineSuggestion) {
          e.preventDefault();
          const nextValue = inlineSuggestion.slice(0, searchTerm.length + 1);
          setSearchTerm(nextValue);
          setTimeout(() => {
            inputEl?.setSelectionRange?.(nextValue.length, nextValue.length);
          }, 0);
          return;
        }
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSmartNavigation();
        return;
      }
    }

    const nextIndex = selectedIndex < filteredSermons.length - 1 ? selectedIndex + 1 : 0;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(nextIndex);
        scrollToIndex(nextIndex);
        break;
      case 'ArrowUp': {
        e.preventDefault();
        const prevIndex = selectedIndex > 0 ? selectedIndex - 1 : filteredSermons.length - 1;
        setSelectedIndex(prevIndex);
        scrollToIndex(prevIndex);
        break;
      }
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < filteredSermons.length) {
          handleSermonPress(filteredSermons[selectedIndex]);
        }
        break;
      case 'Escape':
        setSelectedIndex(-1);
        setSelectedMatchIndex(0);
        setSearchTerm('');
        searchInputRef.current?.blur();
        break;
    }
  };

  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchTerm(value);
    setSelectedIndex(-1);
    setSelectedMatchIndex(0);
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        setIsSearchModalOpen(true);
        return;
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

  const handleListScroll = useCallback((e) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  return (
    <React.Fragment>
      <div className="flex flex-col flex-1 min-h-0">
        <div className="p-2 py-4 bg-neutral-900">
          <div className='flex gap-2'>
            <div className="relative w-full">
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search sermons (title, date like 47-0412)"
                value={searchTerm}
                onChange={handleSearchChange}
                onKeyDown={handleKeyDown}
                className="w-full rounded focus:outline-none p-4 hover:bg-neutral-800/60 bg-neutral-800 focus:bg-neutral-800 text-sm !text-neutral-500 focus:!text-white hover:!text-white transition-colors"
              />
              <IoSearchOutline className="text-white/80 absolute right-6 top-4" size={20} />

              {/* Autocomplete suggestion */}
              {inlineSuggestion && searchTerm.length > 0 && (
                <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none text-sm">
                  <span className="text-transparent">{searchTerm}</span>
                  <span className="text-neutral-500">{inlineSuggestion.slice(searchTerm.length)}</span>
                </div>
              )}

              {/* Destination preview */}
              {/* {smartSermonSearch.destinationPreview && searchTerm.length > 0 && (
                <div className="absolute right-12 top-1/2 -translate-y-1/2 pointer-events-none">
                  <span className="text-neutral-400 text-xs">→ {smartSermonSearch.destinationPreview}</span>
                </div>
              )} */}
            </div>
          </div>

          <div className="mt-2 text-xs text-neutral-400">
            Use ↑↓ to select, Tab to complete, Enter to load • Ctrl+F for full search
          </div>
        </div>

        <div
          ref={listViewportRef}
          onScroll={handleListScroll}
          className="flex-1 min-h-0 overflow-y-auto dark-scroll px-2 pt-3 -mt-3"
        >
          <div style={{ height: virtualization.totalHeight, position: 'relative' }}>
            <div
              style={{
                position: 'absolute',
                top: virtualization.offsetTop,
                left: 0,
                right: 0,
              }}
            >
              {virtualization.items.map((sermon, i) => {
                const index = virtualization.startIndex + i;
                const isSelected = index === selectedListIndex;

                return (
                  <div key={sermon?.uid ?? index} style={{ height: ROW_HEIGHT }}>
                    <ListTitle
                      data={sermon}
                      onPress={handleSermonPress}
                      isActive={activeSermon?.uid === sermon?.uid}
                      isSelected={isSelected}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <SearchModal isOpen={isSearchModalOpen} onClose={() => setIsSearchModalOpen(false)} />
    </React.Fragment>
  );
}