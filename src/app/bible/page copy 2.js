'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

import useSermonStore from '@/stores/sermonStore';
import { bibleSearch } from '@/lib/bibleSearch';
import BookView from '@/components/bible/BookView';
import ListBook from './ListBook';
import SearchModal from './SearchModal';
import ResizablePanels from '@/components/ui/ResizablePanels';
import BibleControlPanel from './BibleControlPanel';

import { IoSearchOutline } from "react-icons/io5";
import { FaLinesLeaning } from "react-icons/fa6";
import { LuLetterText } from "react-icons/lu";

export default function BiblePage() {

  const [activeTab, setActiveTab] = useState('BIBLE');
  const [searchMode, setSearchMode] = useState('BOOK'); // 'BOOK' or 'VERSE'

  const router = useRouter();
  const [books, setBooks] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [autoExpandMode, setAutoExpandMode] = useState(false);
  const [lastExpandedIndex, setLastExpandedIndex] = useState(-1);
  const [selectedBookIndex, setSelectedBookIndex] = useState(0); // Add separate index for smart search
  const searchInputRef = useRef(null);
  const selectedBookRef = useRef(null);

  const { activeBook, setActiveBook, setActiveBookWithChapter, setActiveBookWithVerse } = useSermonStore();

  useEffect(() => {
    const fetchBooks = async () => {
      try {
        const booksData = await bibleSearch.getAllBooks();
        console.log('Fetched books:', booksData);
        setBooks(booksData);
      } catch (error) {
        console.error("Error fetching books:", error);
      }
    };

    fetchBooks();
  }, []);

  // Smart book search logic (updated to match SearchModal)
  const smartBookSearch = useMemo(() => {
    if (!searchTerm.trim()) return { books: [], suggestion: '', chapter: null, verse: null, destinationPreview: '' };

    const input = searchTerm.trim();

    // Parse different patterns: "2 Samuel 10:7", "2 Sam 10:7", "Gen 10:7", "R 10:7", "Reve 10 7", "Rev 7", etc.
    const patterns = [
      /^(\d*\s*\w+)\s+(\d+):(\d+)$/,  // "2 Samuel 10:7" or "Gen 10:7"
      /^(\d*\s*\w+)\s+(\d+)\s+(\d+)$/, // "2 Samuel 10 7" or "Gen 10 7"
      /^(\d*\s*\w+)\s+(\d+)$/,        // "2 Samuel 7" or "Gen 7"
      /^(\d*\s*\w+)$/                 // "2 Samuel" or "Gen"
    ];

    let bookPart = input;
    let chapter = null;
    let verse = null;

    for (const pattern of patterns) {
      const match = input.match(pattern);
      if (match) {
        bookPart = match[1].trim();
        chapter = match[2] ? parseInt(match[2]) : null;
        verse = match[3] ? parseInt(match[3]) : null;
        break;
      }
    }

    // Find matching books - handle numbered books better
    const matchingBooks = books.filter(book => {
      const bookLower = bookPart.toLowerCase();
      const bookNameLower = book.name.toLowerCase();
      const bookShortLower = book.short_name.toLowerCase();

      return bookNameLower.startsWith(bookLower) ||
        bookShortLower.startsWith(bookLower) ||
        bookNameLower.includes(bookLower) ||
        bookShortLower.includes(bookLower);
    }).sort((a, b) => {
      const bookLower = bookPart.toLowerCase();

      // Prioritize exact starts, then partial matches
      const aStartsName = a.name.toLowerCase().startsWith(bookLower) ? 0 : 1;
      const bStartsName = b.name.toLowerCase().startsWith(bookLower) ? 0 : 1;
      const aStartsShort = a.short_name.toLowerCase().startsWith(bookLower) ? 0 : 1;
      const bStartsShort = b.short_name.toLowerCase().startsWith(bookLower) ? 0 : 1;

      const aScore = Math.min(aStartsName, aStartsShort);
      const bScore = Math.min(bStartsName, bStartsShort);

      if (aScore !== bScore) return aScore - bScore;
      return a.name.length - b.name.length;
    });

    // Generate suggestion and destination preview
    let suggestion = '';
    let destinationPreview = '';

    if (matchingBooks.length > 0) {
      const firstBook = matchingBooks[selectedBookIndex] || matchingBooks[0];

      // For suggestion, complete the book name if it's partial
      if (bookPart.toLowerCase() !== firstBook.name.toLowerCase() &&
        bookPart.toLowerCase() !== firstBook.short_name.toLowerCase()) {
        suggestion = firstBook.name;
        if (chapter) {
          suggestion += ` ${chapter}`;
          if (verse) {
            suggestion += `:${verse}`;
          }
        }
      }

      // Always show destination preview
      destinationPreview = firstBook.name;
      if (chapter) {
        destinationPreview += ` ${chapter}`;
        if (verse) {
          destinationPreview += `:${verse}`;
        }
      } else {
        destinationPreview += ' 1'; // Default to chapter 1
      }
    }

    return { books: matchingBooks, suggestion, chapter, verse, destinationPreview };
  }, [searchTerm, books, selectedBookIndex]);

  const filteredBooks = useMemo(() => {
    if (!books || books.length === 0) return [];
    if (!searchTerm) return books;

    // Use smart search results if available
    if (smartBookSearch.books.length > 0) {
      return smartBookSearch.books;
    }

    // Regular filtering as fallback
    return books.filter(book => book.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [searchTerm, books, smartBookSearch.books]);

  const handleSmartNavigation = async () => {
    const { books: matchingBooks, chapter, verse } = smartBookSearch;

    if (matchingBooks.length === 0) return;

    setLoading(true);

    try {
      let targetBook = matchingBooks[selectedBookIndex] || matchingBooks[0];
      let targetChapter = chapter || 1;

      // If chapter is specified, find a book that has that chapter
      if (chapter) {
        let foundValidBook = false;

        for (const book of matchingBooks) {
          const bookData = await bibleSearch.getBook(book.id);
          const chapters = Object.keys(bookData).map(Number);

          if (chapters.includes(chapter)) {
            targetBook = book;
            foundValidBook = true;
            break;
          }
        }

        // If no book has the specified chapter, use first book and its last chapter
        if (!foundValidBook) {
          const bookData = await bibleSearch.getBook(targetBook.id);
          const chapters = Object.keys(bookData).map(Number).sort((a, b) => a - b);
          targetChapter = chapters[chapters.length - 1];
        }
      }

      const bookData = await bibleSearch.getBook(targetBook.id);
      setActiveBookWithVerse(targetBook, bookData, targetChapter, verse);

      // Clear search
      setSearchTerm('');
      setSelectedIndex(-1);
    } catch (error) {
      console.error('Error navigating to book:', error);
    } finally {
      setLoading(false);
    }
  };

  const scrollToSelectedBook = () => {
    if (selectedBookRef.current) {
      selectedBookRef.current.scrollIntoView({
        // behavior: 'smooth',
        block: 'center',
        inline: 'nearest'
      });
    }
  };

  const handleKeyDown = (e) => {

    if (filteredBooks.length === 0) return;

    if (smartBookSearch.books.length > 0) {
      // Smart search mode keyboard handling
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedBookIndex(prev =>
          prev < smartBookSearch.books.length - 1 ? prev + 1 : 0
        );
        return;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedBookIndex(prev =>
          prev > 0 ? prev - 1 : smartBookSearch.books.length - 1
        );
        return;
      } else if (e.key === 'Tab') {
        e.preventDefault();
        if (smartBookSearch.suggestion && smartBookSearch.books.length > 0) {
          setSearchTerm(smartBookSearch.suggestion);
        }
        return;
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleSmartNavigation();
        return;
      }
    }

    // Regular navigation mode
    const nextIndex = selectedIndex < filteredBooks.length - 1 ? selectedIndex + 1 : 0;

    switch (e.key) {
      case 'Tab':
        e.preventDefault();
        setSelectedIndex(nextIndex);

        // Handle auto-expand/collapse
        if (autoExpandMode) {
          if (lastExpandedIndex >= 0 && lastExpandedIndex < filteredBooks.length) {
            // Collapse previous book
            const prevBook = filteredBooks[lastExpandedIndex];
            // This will be handled by passing expanded state to ListBook
          }
          setLastExpandedIndex(nextIndex);
        }
        // Scroll after state update
        setTimeout(scrollToSelectedBook, 0);
        break;
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(nextIndex);

        // Handle auto-expand/collapse
        if (autoExpandMode) {
          if (lastExpandedIndex >= 0 && lastExpandedIndex < filteredBooks.length) {
            // Collapse previous book
            const prevBook = filteredBooks[lastExpandedIndex];
            // This will be handled by passing expanded state to ListBook
          }
          setLastExpandedIndex(nextIndex);
        }
        // Scroll after state update
        setTimeout(scrollToSelectedBook, 0);
        break;
      case 'ArrowUp':
        e.preventDefault();
        const prevIndex = selectedIndex > 0 ? selectedIndex - 1 : filteredBooks.length - 1;
        setSelectedIndex(prevIndex);

        // Handle auto-expand/collapse
        if (autoExpandMode) {
          if (lastExpandedIndex >= 0 && lastExpandedIndex < filteredBooks.length) {
            // Collapse previous book
            const prevBook = filteredBooks[lastExpandedIndex];
            // This will be handled by passing expanded state to ListBook
          }
          setLastExpandedIndex(prevIndex);
        }
        // Scroll after state update
        setTimeout(scrollToSelectedBook, 0);
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < filteredBooks.length) {
          handleBookPress(filteredBooks[selectedIndex]);
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
    setSelectedIndex(-1);
    setSelectedBookIndex(0); // Reset smart search selection

    if (!value.trim()) {
      setAutoExpandMode(false);
      setLastExpandedIndex(-1);
    }
  };

  const handleBookPress = async (book) => {
    console.log('Book pressed:', book);
    setLoading(true);

    try {
      const bookData = await bibleSearch.getBook(book.id);
      console.log('Book data loaded:', bookData);
      setActiveBook(book, bookData);
    } catch (error) {
      console.error('Error loading book data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleChapterPress = async (book, chapterNumber) => {
    console.log('Chapter pressed:', book, chapterNumber);
    setLoading(true);

    try {
      const bookData = await bibleSearch.getBook(book.id);
      console.log('Book data loaded:', bookData);
      setActiveBookWithChapter(book, bookData, chapterNumber);
    } catch (error) {
      console.error('Error loading book data:', error);
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

            <div className="w-full p-4 flex items-center justify-evenly gap-3 border-b border-neutral-800">
              <div className={`flex-1 min-w-[4.5rem] min-h-10 text-sm text-center rounded hover:bg-neutral-700/60 flex items-center justify-center select-none
                  ${activeTab == 'BIBLE' ? 'bg-white text-black font-bold hover:bg-white' : 'bg-neutral-800/40'}
                  `}
                onClick={() => setActiveTab('BIBLE')}
              >
                Bible
              </div>
              <div className={`flex-1 min-w-[4.5rem] min-h-10 text-sm text-center rounded hover:bg-neutral-700/60 flex items-center justify-center select-none
                  ${activeTab == 'SERMONS' ? 'bg-white text-black font-bold hover:bg-white' : 'bg-neutral-800/40'}
                  `}
                onClick={() => setActiveTab('SERMONS')}
              >
                Tapes
              </div>
            </div>

            <div className="flex flex-col overflow-y-scroll flex-1 dark-scroll pb-8">
              <div className="p-2 py-4 sticky top-0 z-10 bg-neutral-900">
                <div className='flex gap-2'>
                  <div className="relative w-full">
                    <input
                      ref={searchInputRef}
                      type="text"
                      placeholder="Go to book, chapter, verse (e.g. Rev 10:7)"
                      value={searchTerm}
                      onChange={handleSearchChange}
                      onKeyDown={handleKeyDown}
                      className="w-full rounded focus:outline-none p-4 hover:bg-neutral-800/60 bg-neutral-800 focus:bg-neutral-800 text-sm !text-neutral-500 focus:!text-white hover:!text-white transition-colors"
                    />
                    <IoSearchOutline className="text-white/80 absolute right-6 top-4" size={20} />

                    {/* Autocomplete suggestion */}
                    {smartBookSearch.suggestion && searchTerm.length > 0 && (
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
                        <span className="text-transparent">{searchTerm}</span>
                        <span className="text-neutral-500">{smartBookSearch.suggestion.slice(searchTerm.length)}</span>
                      </div>
                    )}

                    {/* Destination preview */}
                    {smartBookSearch.destinationPreview && searchTerm.length > 0 && (
                      <div className="absolute right-12 top-1/2 -translate-y-1/2 pointer-events-none">
                        <span className="text-neutral-400 text-xs">→ {smartBookSearch.destinationPreview}</span>
                      </div>
                    )}
                  </div>

                  <button
                    className={`p-3 rounded hover:bg-neutral-800/60 transition-colors
                      ${searchMode === 'BOOK' ? 'bg-neutral-700/30' : ''}
                    `}
                    onClick={() => setSearchMode('BOOK')}
                  >
                    <FaLinesLeaning className="text-white/80" size={20} />
                  </button>
                  <button
                    className={`p-3 rounded hover:bg-neutral-800/60 transition-colors
                      ${searchMode === 'VERSE' ? 'bg-neutral-700/30' : ''}
                    `}
                    onClick={() => setSearchMode('VERSE')}
                  >
                    <LuLetterText className="text-white/80" size={20} />
                  </button>

                </div>

                {/* Smart search instructions */}
                <div className="mt-2 text-xs text-neutral-400">
                  Use ↑↓ to select, Tab to complete, Enter to navigate
                </div>
              </div>

              {filteredBooks.map((book, index) => (
                <ListBook
                  key={index}
                  ref={selectedIndex === index ? selectedBookRef : null}
                  data={book}
                  onPress={smartBookSearch.books.length > 0 ? () => {
                    setSelectedIndex(index);
                    handleSmartNavigation();
                  } : handleBookPress}
                  onChapterPress={handleChapterPress}
                  isActive={activeBook?.id === book.id}
                  isSelected={selectedIndex === index}
                  isSmartSelected={smartBookSearch.books.length > 0 && index === selectedBookIndex}
                  selectedIndex={selectedIndex}
                  setSelectedIndex={setSelectedIndex}
                  bookIndex={index}
                  forceExpanded={autoExpandMode && selectedIndex === index}
                  forceCollapsed={autoExpandMode && lastExpandedIndex !== index}
                />
              ))}
            </div>
          </div>
        }
        rightPanel={
          <div className="flex flex-col h-full">
            {loading ? (
              <div className="flex-1 flex items-center justify-center bg-neutral-900">
                <div className="text-gray-400">Loading book...</div>
              </div>
            ) : (
              <BookView />
            )}
          </div>
        }
      />

      {/* <SearchModal isOpen={isSearchModalOpen} onClose={() => setIsSearchModalOpen(false)} /> */}

      {/* <BibleControlPanel /> */}
    </div>
  );
}