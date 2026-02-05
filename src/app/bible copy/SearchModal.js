import React, { useState, useEffect, useRef, useMemo } from 'react';
import useSermonStore from '@/stores/sermonStore';
import SearchResult from './SearchResult';

import { IoClose } from "react-icons/io5";
import { IoSearchOutline } from "react-icons/io5";
import { bibleSearch } from '../../lib/bibleSearch';

const SearchModal = ({ isOpen, onClose }) => {
  const { setActiveBookWithVerse } = useSermonStore();

  const [searchType, setSearchType] = useState('combined'); // 'verses', 'bible', or 'combined'
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [bookVerseResults, setBookVerseResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isBookLoading, setIsBookLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [books, setBooks] = useState([]);
  const [selectedBookIndex, setSelectedBookIndex] = useState(0);
  const [lastBookPart, setLastBookPart] = useState('');
  const LIMIT = 50;

  const modalRef = useRef(null);
  const searchInputRef = useRef(null);
  const resultsRef = useRef(null);
  const searchTimeoutRef = useRef(null);
  const combinedBookListRef = useRef(null);
  const bibleBookListRef = useRef(null);

  // focus input when modal opens and when searchType changes
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen, searchType]);

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
    if ((searchType !== 'bible' && searchType !== 'combined') || !searchTerm.trim()) return { books: [], suggestion: '', chapter: null, verse: null, destinationPreview: '' };

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

    // Find matching books - handle numbered books better and allow partial matches anywhere
    const matchingBooks = books.filter(book => {
      const bookLower = bookPart.toLowerCase();
      const bookNameLower = book.name.toLowerCase();
      const bookShortLower = book.short_name.toLowerCase();
      
      // Allow matches at start or anywhere in the name for better coverage
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
      // Use the selected book index but ensure it's within bounds of filtered results
      const boundedIndex = Math.min(selectedBookIndex, matchingBooks.length - 1);
      const selectedBook = matchingBooks[boundedIndex];
      
      // For suggestion, complete the book name if it's partial
      if (bookPart.toLowerCase() !== selectedBook.name.toLowerCase() && 
          bookPart.toLowerCase() !== selectedBook.short_name.toLowerCase()) {
        suggestion = selectedBook.name;
        if (chapter) {
          suggestion += ` ${chapter}`;
          if (verse) {
            suggestion += `:${verse}`;
          }
        }
      }
      
      // Always show destination preview using selected book
      destinationPreview = selectedBook.name;
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

  // Debounced search effect for verses and combined mode
  useEffect(() => {
    if (searchType === 'verses' || searchType === 'combined') {
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

  // New effect for book verse results in all modes that show book content
  useEffect(() => {
    if ((searchType === 'combined' || searchType === 'bible') && smartBookSearch.books.length > 0) {
      const fetchBookVerses = async () => {
        setIsBookLoading(true);
        try {
          // Use the selected book index but ensure it's within bounds of filtered results
          const boundedIndex = Math.min(selectedBookIndex, smartBookSearch.books.length - 1);
          const selectedBook = smartBookSearch.books[boundedIndex];
          const { chapter, verse } = smartBookSearch;
          
          if (verse) {
            // Get specific verse
            const verseResult = await bibleSearch.getVerse(selectedBook.id, chapter || 1, verse);
            if (verseResult) {
              setBookVerseResults([{
                book: selectedBook.id,
                book_name: selectedBook.name,
                short_name: selectedBook.short_name,
                chapter: chapter || 1,
                verse: verse,
                text: verseResult.text
              }]);
            } else {
              setBookVerseResults([]);
            }
          } else if (chapter) {
            // Get entire chapter
            const chapterData = await bibleSearch.getChapter(selectedBook.id, chapter);
            console.log('Fetched chapter data:', chapterData);
            if (chapterData && chapterData.verses) {
              const verses = Object.entries(chapterData.verses).map(([verseNum, verseText]) => ({
                book: selectedBook.id,
                book_name: selectedBook.name,
                short_name: selectedBook.short_name,
                chapter: chapter,
                verse: parseInt(verseNum),
                text: verseText
              }));
              setBookVerseResults(verses);
            } else {
              setBookVerseResults([]);
            }
          } else {
            // Get chapter 1 by default when just book name is typed
            const chapterData = await bibleSearch.getChapter(selectedBook.id, 1);
            console.log('Fetched default chapter 1 data:', chapterData);
            if (chapterData && chapterData.verses) {
              const verses = Object.entries(chapterData.verses).map(([verseNum, verseText]) => ({
                book: selectedBook.id,
                book_name: selectedBook.name,
                short_name: selectedBook.short_name,
                chapter: 1,
                verse: parseInt(verseNum),
                text: verseText
              }));
              setBookVerseResults(verses);
            } else {
              setBookVerseResults([]);
            }
          }
        } catch (error) {
          console.error('Error fetching book verses:', error);
          setBookVerseResults([]);
        } finally {
          setIsBookLoading(false);
        }
      };

      fetchBookVerses();
    } else {
      setBookVerseResults([]);
    }
  }, [searchType, smartBookSearch.books, smartBookSearch.chapter, smartBookSearch.verse, selectedBookIndex]);

  // Smart reset of selected book index - only when book part changes
  useEffect(() => {
    const input = searchTerm.trim();
    
    // Parse to get just the book part
    const patterns = [
      /^(\d*\s*\w+)\s+(\d+):(\d+)$/,  // "2 Samuel 10:7" or "Gen 10:7"
      /^(\d*\s*\w+)\s+(\d+)\s+(\d+)$/, // "2 Samuel 10 7" or "Gen 10 7"
      /^(\d*\s*\w+)\s+(\d+)$/,        // "2 Samuel 7" or "Gen 7"
      /^(\d*\s*\w+)$/                 // "2 Samuel" or "Gen"
    ];

    let currentBookPart = input;
    for (const pattern of patterns) {
      const match = input.match(pattern);
      if (match) {
        currentBookPart = match[1].trim();
        break;
      }
    }

    // Only reset selectedBookIndex if the book part actually changed
    if (currentBookPart !== lastBookPart) {
      setSelectedBookIndex(0);
      setLastBookPart(currentBookPart);
    }
  }, [searchTerm, lastBookPart]);

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
      // Always use the selected book index with proper bounds checking for filtered results
      const boundedIndex = Math.min(selectedBookIndex, matchingBooks.length - 1);
      let targetBook = matchingBooks[boundedIndex];
      let targetChapter = chapter || 1;

      // If chapter is specified, check if the selected book has that chapter
      if (chapter) {
        const bookData = await bibleSearch.getBook(targetBook.id);
        const chapters = Object.keys(bookData).map(Number);
        
        if (!chapters.includes(chapter)) {
          // If selected book doesn't have the chapter, use its last chapter
          const sortedChapters = chapters.sort((a, b) => a - b);
          targetChapter = sortedChapters[sortedChapters.length - 1];
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
    if ((searchType === 'bible' || searchType === 'combined') && smartBookSearch.books.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedBookIndex(prev => {
          // Only cycle through the filtered books
          const maxIndex = smartBookSearch.books.length - 1;
          return prev < maxIndex ? prev + 1 : 0;
        });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedBookIndex(prev => {
          // Only cycle through the filtered books
          const maxIndex = smartBookSearch.books.length - 1;
          return prev > 0 ? prev - 1 : maxIndex;
        });
      } else if (e.key === 'Tab') {
        e.preventDefault();
        if (smartBookSearch.suggestion && smartBookSearch.books.length > 0) {
          setSearchTerm(smartBookSearch.suggestion);
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleBibleNavigation();
      }
    } else if ((searchType === 'verses' || searchType === 'combined') && e.key === 'Enter' && searchResults.length > 0) {
      e.preventDefault();
      handleResultClick(searchResults[0]);
    }
  };

  // Add keyboard shortcuts for mode switching
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        setSearchType(prev => {
          const modes = ['combined', 'verses', 'bible'];
          const currentIndex = modes.indexOf(prev);
          const newIndex = currentIndex === 0 ? modes.length - 1 : currentIndex - 1;
          return modes[newIndex];
        });
        setSearchTerm('');
        setSearchResults([]);
      } else if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        setSearchType(prev => {
          const modes = ['combined', 'verses', 'bible'];
          const currentIndex = modes.indexOf(prev);
          const newIndex = (currentIndex + 1) % modes.length;
          return modes[newIndex];
        });
        setSearchTerm('');
        setSearchResults([]);
      } else if ((e.altKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        setSearchType(prev => {
          const modes = ['combined', 'verses', 'bible'];
          const currentIndex = modes.indexOf(prev);
          const newIndex = (currentIndex + 1) % modes.length;
          return modes[newIndex];
        });
        setSearchTerm('');
        setSearchResults([]);
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
  }, [onClose]);

  // Effect to scroll selected book into view when selectedBookIndex changes
  useEffect(() => {
    if (smartBookSearch.books.length > 0) {
      const scrollToSelectedBook = () => {
        const activeListRef = searchType === 'combined' ? combinedBookListRef : bibleBookListRef;
        if (activeListRef.current) {
          const bookElements = activeListRef.current.children;
          if (bookElements[selectedBookIndex]) {
            // bookElements[selectedBookIndex].scrollIntoView({
            //   behavior: 'smooth',
            //   block: 'center',
            //   inline: 'nearest'
            // });
          }
        }
      };

      // Small delay to ensure DOM is updated
      setTimeout(scrollToSelectedBook, 50);
    }
  }, [selectedBookIndex, searchType, smartBookSearch.books.length]);

  return (
    <div className={`fixed inset-0 bg-black/50 flex items-center justify-center z-50 transition-all duration-200 ${isOpen ? 'opacity-100 pointer-events-auto backdrop-blur-xs' : 'opacity-0 pointer-events-none backdrop-blur-0'}`}>
      <div 
        ref={modalRef}
        className="w-[60%] max-w-4xl relative max-h-[80vh] flex flex-col">
        
        {/* Mode Toggle - Updated for three modes */}
        <div className="flex mb-4 bg-neutral-800 rounded-lg p-1">
          <button
            onClick={() => {setSearchType('combined'); setSearchTerm(''); setSearchResults([]); setBookVerseResults([]);}}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              searchType === 'combined' 
                ? 'bg-neutral-700 text-white' 
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            Combined Search
          </button>
          <button
            onClick={() => {setSearchType('verses'); setSearchTerm(''); setSearchResults([]); setBookVerseResults([]);}}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              searchType === 'verses' 
                ? 'bg-neutral-700 text-white' 
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            Search Verses
          </button>
          <button
            onClick={() => {setSearchType('bible'); setSearchTerm(''); setSearchResults([]); setBookVerseResults([]);}}
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
            placeholder={
              searchType === 'verses' ? "Search verses..." : 
              searchType === 'bible' ? "Go to book, chapter, verse (e.g. Rev 10:7)" :
              "Search verses or go to book (e.g. 'love' or 'Rev 10:7')"
            }
            className="w-full rounded-lg focus:outline-none p-4 bg-neutral-800 text-sm !text-neutral-500 focus:!text-white hover:!text-white transition-colors" 
            ref={searchInputRef} 
            value={searchTerm}
            onChange={handleSearchChange}
            onKeyDown={handleKeyDown}
            style={{ boxShadow: '0 0 15px rgba(0, 0, 0, 0.3)' }} 
          />
          <IoSearchOutline className="text-white/80 absolute right-6 top-1/2 -translate-y-1/2" size={20} />
          
          {/* Autocomplete suggestion - show for bible and combined modes */}
          {(searchType === 'bible' || searchType === 'combined') && smartBookSearch.suggestion && searchTerm.length > 0 && (
            <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
              <span className="text-transparent text-sm">{searchTerm}</span>
              <span className="text-neutral-500 text-sm">{smartBookSearch.suggestion.slice(searchTerm.length)}</span>
            </div>
          )}
          
          {/* Destination preview - show for bible and combined modes */}
          {(searchType === 'bible' || searchType === 'combined') && smartBookSearch.destinationPreview && searchTerm.length > 0 && (
            <div className="absolute right-12 top-1/2 -translate-y-1/2 pointer-events-none">
              <span className="text-neutral-400 text-sm">→ {smartBookSearch.destinationPreview}</span>
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
            {/* Book suggestions section */}
            {smartBookSearch.books.length > 0 && (
              <div className="mb-6">
                <h3 className="text-white font-medium mb-3 text-sm">Book Navigation</h3>
                <div className="space-y-2 max-h-60 overflow-y-auto" ref={combinedBookListRef}>
                  {smartBookSearch.books.map((book, index) => (
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
              </div>
            )}

            {/* Results container - side by side layout */}
            <div className="flex gap-4">
              {/* Normal verse search results */}
              {(searchResults.length > 0 || bookVerseResults.length === 0) && (
                <div className={`${bookVerseResults.length > 0 ? 'flex-1' : 'w-full'}`}>
                  {searchResults.length > 0 && (
                    <>
                      <h3 className="text-white font-medium mb-3 text-sm">Verse Search Results</h3>
                      <div className="space-y-3">
                        {searchResults.map((verse) => (
                          <SearchResult
                            key={`${verse.book}-${verse.chapter}-${verse.verse}`}
                            verse={verse}
                            onClick={handleResultClick}
                            variant="verse"
                          />
                        ))}
                      </div>
                    </>
                  )}
                  
                  {searchResults.length === 0 && bookVerseResults.length > 0 && !isLoading && (
                    <div className="flex justify-center py-8">
                      <div className="text-white/60">No verse search results for "{searchTerm}"</div>
                    </div>
                  )}
                </div>
              )}

              {/* Book verse results section */}
              {bookVerseResults.length > 0 && (
                <div className={`${searchResults.length > 0 ? 'flex-1' : 'w-full'}`}>
                  <h3 className="text-white font-medium mb-3 text-sm">
                    {smartBookSearch.verse ? 'Verse' : smartBookSearch.chapter ? `Chapter ${smartBookSearch.chapter}` : 'Chapter 1'} Content
                  </h3>
                  {isBookLoading ? (
                    <div className="flex justify-center py-4">
                      <div className="text-white/60">Loading...</div>
                    </div>
                  ) : (
                    <div className="space-y-3 overflow-y-auto">
                      {bookVerseResults.map((verse) => (
                        <SearchResult
                          key={`book-${verse.book}-${verse.chapter}-${verse.verse}`}
                          verse={verse}
                          onClick={handleResultClick}
                          variant="book"
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            
            {(isLoading || isBookLoading) && (
              <div className="flex justify-center py-4">
                <div className="text-white/60">Loading more results...</div>
              </div>
            )}
            
            {!hasMore && searchResults.length > 0 && (
              <div className="flex justify-center py-4">
                <div className="text-white/60">No more results</div>
              </div>
            )}

            {!isLoading && !isBookLoading && searchResults.length === 0 && smartBookSearch.books.length === 0 && bookVerseResults.length === 0 && searchTerm.trim() && (
              <div className="flex justify-center py-8">
                <div className="text-white/60">No results found</div>
              </div>
            )}
          </div>
        )}

        {/* Bible mode book suggestions and chapter content */}
        {searchType === 'bible' && searchTerm.trim() && (
          <div 
            className="bg-neutral-800 rounded-lg flex-1 overflow-y-auto p-4"
            style={{ boxShadow: '0 0 15px rgba(0, 0, 0, 0.3)' }}
          >
            <div className="flex gap-4">
              {/* Book suggestions */}
              <div className="w-1/3 sticky top-0 self-start">
                <h3 className="text-white font-medium mb-3 text-sm">Book Selection</h3>
                <div className="space-y-2 max-h-96 overflow-y-auto" ref={bibleBookListRef}>
                  {smartBookSearch.books.map((book, index) => (
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
              </div>

              {/* Chapter content */}
              {bookVerseResults.length > 0 && (
                <div className="flex-1">
                  <h3 className="text-white font-medium mb-3 text-sm">
                    {smartBookSearch.verse ? 'Verse' : smartBookSearch.chapter ? `Chapter ${smartBookSearch.chapter}` : 'Chapter 1'} Content
                  </h3>
                  {isBookLoading ? (
                    <div className="flex justify-center py-4">
                      <div className="text-white/60">Loading...</div>
                    </div>
                  ) : (
                    <div className="space-y-3 grow overflow-y-auto">
                      {bookVerseResults.map((verse) => (
                        <SearchResult
                          key={`bible-${verse.book}-${verse.chapter}-${verse.verse}`}
                          verse={verse}
                          onClick={handleResultClick}
                          variant="book"
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
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
                  <SearchResult
                    key={`${verse.book}-${verse.chapter}-${verse.verse}`}
                    verse={verse}
                    onClick={handleResultClick}
                    variant="verse"
                  />
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

        {/* Instructions - Updated for all modes */}
        {((searchType === 'bible' || searchType === 'combined') && !searchTerm.trim()) && (
          <div className="bg-neutral-800 rounded-lg p-6 text-center" style={{ boxShadow: '0 0 15px rgba(0, 0, 0, 0.3)' }}>
            <h3 className="text-white font-medium mb-3">
              {searchType === 'combined' ? 'Combined Search' : 'Bible Navigation'}
            </h3>
            <div className="text-neutral-400 text-sm space-y-2">
              <p>Examples: "Rev 10:7", "Revelations 10", "R 1:1", "J 38 7"</p>
              {searchType === 'combined' && <p>Or search for verse content: "love", "salvation", etc.</p>}
              <p>Use ↑↓ arrows to select books, Tab to autocomplete, Enter to navigate</p>
              <p className="text-neutral-500 text-xs mt-3">
                Alt+←/→ to switch modes • Alt+F to toggle modes
              </p>
            </div>
          </div>
        )}

        {searchType === 'verses' && !searchTerm.trim() && (
          <div className="bg-neutral-800 rounded-lg p-6 text-center" style={{ boxShadow: '0 0 15px rgba(0, 0, 0, 0.3)' }}>
            <h3 className="text-white font-medium mb-3">Verse Search</h3>
            <div className="text-neutral-400 text-sm space-y-2">
              <p>Search for verses containing specific words or phrases</p>
              <p>Examples: "love", "salvation", "for God so loved"</p>
              <p className="text-neutral-500 text-xs mt-3">
                Alt+←/→ to switch modes • Alt+F to toggle modes
              </p>
            </div>
          </div>
        )}
      </div>
    </div>  )
}

export default SearchModal;