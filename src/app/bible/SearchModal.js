import React, { useState, useEffect, useRef, useMemo } from 'react';
import useSermonStore from '@/stores/sermonStore';

import { IoClose } from "react-icons/io5";
import { IoSearchOutline } from "react-icons/io5";
import { bibleSearch } from '../../lib/bibleSearch';

const SearchModal = ({ isOpen, onClose }) => {
  const { setActiveBookWithVerse } = useSermonStore();

  const [searchType, setSearchType] = useState('verses'); // 'verses' or 'bible'
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [books, setBooks] = useState([]);
  const [selectedBookIndex, setSelectedBookIndex] = useState(0);
  const LIMIT = 50;

  const modalRef = useRef(null);
  const searchInputRef = useRef(null);
  const resultsRef = useRef(null);
  const searchTimeoutRef = useRef(null);

  // Load books when modal opens
  useEffect(() => {
    if (isOpen && books.length === 0) {
      const fetchBooks = async () => {
        try {
          const booksData = await bibleSearch.getAllBooks();
          setBooks(booksData);
        } catch (error) {
          console.error('Error fetching books:', error);
        }
      };
      fetchBooks();
    }
  }, [isOpen, books.length]);

  // Smart book search logic
  const smartBookSearch = useMemo(() => {
    if (searchType !== 'bible' || !searchTerm.trim()) return { books: [], suggestion: '', chapter: null, verse: null, destinationPreview: '' };

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
  }, [searchTerm, searchType, books, selectedBookIndex]);

  // Debounced search effect for verses
  useEffect(() => {
    if (searchType === 'verses') {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }

      if (searchTerm.trim()) {
        searchTimeoutRef.current = setTimeout(() => {
          performSearch(searchTerm, 0, true);
        }, 300);
      } else {
        setSearchResults([]);
        setHasMore(false);
        setOffset(0);
      }

      return () => {
        if (searchTimeoutRef.current) {
          clearTimeout(searchTimeoutRef.current);
        }
      };
    }
  }, [searchTerm, searchType]);

  // Reset selected book index when search changes
  useEffect(() => {
    setSelectedBookIndex(0);
  }, [searchTerm]);

  const performSearch = async (query, currentOffset = 0, isNewSearch = false) => {
    if (!query.trim()) return;

    setIsLoading(true);
    try {
      const results = await bibleSearch.searchVerses(query, LIMIT, currentOffset);
      console.log('Search results:', results);
      
      if (isNewSearch) {
        setSearchResults(results);
        setOffset(LIMIT);
      } else {
        setSearchResults(prev => [...prev, ...results]);
        setOffset(prev => prev + LIMIT);
      }
      
      setHasMore(results.length === LIMIT);
    } catch (error) {
      console.error('Search error:', error);
      if (isNewSearch) {
        setSearchResults([]);
      }
      setHasMore(false);
    } finally {
      setIsLoading(false);
    }
  };

  const loadMore = () => {
    if (!isLoading && hasMore && searchTerm.trim()) {
      performSearch(searchTerm, offset, false);
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
      const book = {
        id: result.book,
        name: result.book_name,
        short_name: result.short_name
      };

      const bookData = await bibleSearch.getBook(result.book);
      setActiveBookWithVerse(book, bookData, result.chapter, result.verse);
      onClose();
    } catch (error) {
      console.error('Error navigating to verse:', error);
    }
  };

  const handleBibleNavigation = async () => {
    const { books: matchingBooks, chapter, verse } = smartBookSearch;
    
    if (matchingBooks.length === 0) return;

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
      onClose();
    } catch (error) {
      console.error('Error navigating to book:', error);
    }
  };

  const handleKeyDown = (e) => {
    if (searchType === 'bible' && smartBookSearch.books.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedBookIndex(prev => 
          prev < smartBookSearch.books.length - 1 ? prev + 1 : 0
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedBookIndex(prev => 
          prev > 0 ? prev - 1 : smartBookSearch.books.length - 1
        );
      } else if (e.key === 'Tab') {
        e.preventDefault();
        if (smartBookSearch.suggestion && smartBookSearch.books.length > 0) {
          setSearchTerm(smartBookSearch.suggestion);
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleBibleNavigation();
      }
    } else if (searchType === 'verses' && e.key === 'Enter' && searchResults.length > 0) {
      e.preventDefault();
      handleResultClick(searchResults[0]);
    }
  };

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen, searchType]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    const handleClickOutside = (e) => {
      if (modalRef.current && !modalRef.current.contains(e.target)) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousedown', handleClickOutside);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  return (
    <div className={`fixed inset-0 bg-black/50 flex items-center justify-center z-50 transition-all duration-200 ${isOpen ? 'opacity-100 pointer-events-auto backdrop-blur-xs' : 'opacity-0 pointer-events-none backdrop-blur-0'}`}>
      <div 
        ref={modalRef}
        className="w-[60%] max-w-4xl relative max-h-[80vh] flex flex-col">
        
        {/* Mode Toggle */}
        <div className="flex mb-4 bg-neutral-800 rounded-lg p-1">
          <button
            onClick={() => {setSearchType('verses'); setSearchTerm(''); setSearchResults([]);}}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              searchType === 'verses' 
                ? 'bg-neutral-700 text-white' 
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            Search Verses
          </button>
          <button
            onClick={() => {setSearchType('bible'); setSearchTerm(''); setSearchResults([]);}}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              searchType === 'bible' 
                ? 'bg-neutral-700 text-white' 
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            Go to Bible
          </button>
        </div>

        <div className="flex items-center relative mb-4">
          <input 
            type="text" 
            placeholder={searchType === 'verses' ? "Search verses..." : "Go to book, chapter, verse (e.g. Rev 10:7)"}
            className="w-full rounded-lg focus:outline-none p-4 bg-neutral-800 text-sm !text-neutral-500 focus:!text-white hover:!text-white transition-colors" 
            ref={searchInputRef} 
            value={searchTerm}
            onChange={handleSearchChange}
            onKeyDown={handleKeyDown}
            style={{ boxShadow: '0 0 15px rgba(0, 0, 0, 0.3)' }} 
          />
          <IoSearchOutline className="text-white/80 absolute right-6 top-1/2 -translate-y-1/2" size={20} />
          
          {/* Autocomplete suggestion */}
          {searchType === 'bible' && smartBookSearch.suggestion && searchTerm.length > 0 && (
            <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
              <span className="text-transparent">{searchTerm}</span>
              <span className="text-neutral-500">{smartBookSearch.suggestion.slice(searchTerm.length)}</span>
            </div>
          )}
          
          {/* Destination preview */}
          {searchType === 'bible' && smartBookSearch.destinationPreview && searchTerm.length > 0 && (
            <div className="absolute right-12 top-1/2 -translate-y-1/2 pointer-events-none">
              <span className="text-neutral-400 text-sm">→ {smartBookSearch.destinationPreview}</span>
            </div>
          )}
        </div>
        
        {/* Bible mode book suggestions */}
        {searchType === 'bible' && searchTerm.trim() && smartBookSearch.books.length > 0 && (
          <div 
            className="bg-neutral-800 rounded-lg flex-1 overflow-y-auto p-4 space-y-2"
            style={{ boxShadow: '0 0 15px rgba(0, 0, 0, 0.3)' }}
          >
            {smartBookSearch.books.slice(0, 10).map((book, index) => (
              <div 
                key={book.id}
                className={`p-3 rounded-lg cursor-pointer transition-colors ${
                  index === selectedBookIndex 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-neutral-700 hover:bg-neutral-600'
                }`}
                onClick={() => {
                  setSelectedBookIndex(index);
                  handleBibleNavigation();
                }}
              >
                <div className="flex justify-between items-center">
                  <span className="font-medium">{book.name}</span>
                  <span className="text-sm text-neutral-400">{book.short_name}</span>
                </div>
                {smartBookSearch.chapter && (
                  <div className="text-sm text-neutral-300 mt-1">
                    Chapter {smartBookSearch.chapter}{smartBookSearch.verse ? `:${smartBookSearch.verse}` : ''}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Verse search results */}
        {searchType === 'verses' && searchTerm.trim() && (
          <div 
            ref={resultsRef}
            className="bg-neutral-800 rounded-lg flex-1 overflow-y-auto p-4 space-y-3"
            style={{ boxShadow: '0 0 15px rgba(0, 0, 0, 0.3)' }}
            onScroll={handleScroll}
          >
            {searchResults.length > 0 ? (
              <>
                {searchResults.map((verse) => (
                  <div 
                    key={`${verse.book}-${verse.chapter}-${verse.verse}`}
                    className="p-3 bg-neutral-700 rounded-lg hover:bg-neutral-600 cursor-pointer transition-colors"
                    onClick={() => handleResultClick(verse)}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-blue-400 font-medium text-sm">
                        {verse.book_name} {verse.chapter}:{verse.verse}
                      </span>
                    </div>
                    <p className="text-white text-sm leading-relaxed">
                      {verse.text}
                    </p>
                  </div>
                ))}
                
                {isLoading && (
                  <div className="flex justify-center py-4">
                    <div className="text-white/60">Loading more results...</div>
                  </div>
                )}
                
                {!hasMore && searchResults.length > 0 && (
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
        {searchType === 'bible' && !searchTerm.trim() && (
          <div className="bg-neutral-800 rounded-lg p-6 text-center" style={{ boxShadow: '0 0 15px rgba(0, 0, 0, 0.3)' }}>
            <h3 className="text-white font-medium mb-3">Bible Navigation</h3>
            <div className="text-neutral-400 text-sm space-y-2">
              <p>Examples: "Rev 10:7", "Revelations 10", "R 1:1", "J 38 7"</p>
              <p>Use ↑↓ arrows to select books, Tab to autocomplete, Enter to navigate</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default SearchModal;