'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import useSermonStore from '@/stores/sermonStore';
import { bibleSearch } from '@/lib/bibleSearch';
import BookView from '@/components/bible/BookView';
import ListBook from './ListBook';
import BibleControlPanel from './BibleControlPanel';
import SearchModal from './SearchModal';

import { IoSearchOutline } from "react-icons/io5";

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

  // Smart book search logic (always active now)
  const smartBookSearch = useMemo(() => {
    console.log('Smart search triggered:', { searchTerm });
    if (!searchTerm.trim()) return { books: [], suggestion: '', chapter: null, verse: null };
    console.log('Performing smart search for:', searchTerm);

    const input = searchTerm.trim();
    
    // Parse different patterns: "Rev 10:7", "R 10:7", "Reve 10 7", "Rev 7", etc.
    const patterns = [
      /^(\w+)\s+(\d+):(\d+)$/,  // "Rev 10:7"
      /^(\w+)\s+(\d+)\s+(\d+)$/, // "Reve 10 7"
      /^(\w+)\s+(\d+)$/,        // "Rev 10"
      /^(\w+)$/                 // "Rev"
    ];

    let bookPart = input;
    let chapter = null;
    let verse = null;

    for (const pattern of patterns) {
      const match = input.match(pattern);
      if (match) {
        bookPart = match[1];
        chapter = match[2] ? parseInt(match[2]) : null;
        verse = match[3] ? parseInt(match[3]) : null;
        break;
      }
    }

    // Find matching books
    const matchingBooks = books.filter(book => 
      book.name.toLowerCase().startsWith(bookPart.toLowerCase()) ||
      book.short_name.toLowerCase().startsWith(bookPart.toLowerCase())
    ).sort((a, b) => {
      // Prioritize exact matches and shorter names
      const aExact = a.name.toLowerCase().startsWith(bookPart.toLowerCase()) ? 0 : 1;
      const bExact = b.name.toLowerCase().startsWith(bookPart.toLowerCase()) ? 0 : 1;
      if (aExact !== bExact) return aExact - bExact;
      return a.name.length - b.name.length;
    });

    // Generate suggestion
    let suggestion = '';
    if (matchingBooks.length > 0) {
      const firstBook = matchingBooks[selectedBookIndex] || matchingBooks[0];
      suggestion = firstBook.name;
      if (chapter) {
        suggestion += ` ${chapter}`;
        if (verse) {
          suggestion += `:${verse}`;
        }
      }
    }

    console.log('Smart search:', { input, bookPart, chapter, verse, matchingBooks, suggestion });

    return { books: matchingBooks, suggestion, chapter, verse };
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
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <div className="text-white flex h-full">
      {/* Books sidebar */}
      <div className='w-[40vw] flex flex-col bg-neutral-900 border-r border-neutral-800'>
        <div className="flex flex-col overflow-y-scroll flex-1 dark-scroll pb-8">
          <div className="p-2 py-4 sticky top-0 z-10 bg-neutral-900">
            <div className="relative">
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
              <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none text-sm">
                <span className="text-transparent">{searchTerm}</span>
                <span className="text-neutral-500">{smartBookSearch.suggestion.slice(searchTerm.length)}</span>
              </div>
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
          
          {/* Smart search chapter/verse info */}
          {smartBookSearch.books.length > 0 && smartBookSearch.chapter && (
            <div className="px-4 pb-2">
              <div className="text-xs text-neutral-400">
                → Chapter {smartBookSearch.chapter}{smartBookSearch.verse ? `:${smartBookSearch.verse}` : ''}
              </div>
            </div>
          )}
        </div>
        
        {/* Bible Control Panel */}
        <BibleControlPanel />
      </div>

      {/* Book content */}
      <div className="flex-1 flex flex-col">
        {loading ? (
          <div className="flex-1 flex items-center justify-center bg-neutral-900">
            <div className="text-gray-400">Loading book...</div>
          </div>
        ) : (
          <BookView />
        )}
      </div>

      <SearchModal isOpen={isSearchModalOpen} onClose={() => setIsSearchModalOpen(false)} />
    </div>
  );
}