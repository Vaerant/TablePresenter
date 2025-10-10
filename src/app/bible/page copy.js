'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import useSermonStore from '@/stores/sermonStore';
import { bibleSearch } from '@/lib/bibleSearch';
import BookView from '@/components/bible/BookView';
import ListBook from './ListBook';
import BibleControlPanel from './BibleControlPanel';

import { IoSearchOutline } from "react-icons/io5";

export default function BiblePage() {
  const [books, setBooks] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [autocompleteIndex, setAutocompleteIndex] = useState(-1);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const searchInputRef = useRef(null);

  const { activeBook, setActiveBook, setActiveBookWithChapter } = useSermonStore();

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

  const { suggestions, isChapterMode } = useMemo(() => {
    if (!books || books.length === 0 || !searchTerm) return { suggestions: [], isChapterMode: false };
    
    const searchParts = searchTerm.trim().split(' ');
    
    if (searchParts.length === 1) {
      // Book mode
      const bookSuggestions = books
        .filter(book => book.name.toLowerCase().includes(searchParts[0].toLowerCase()))
        .slice(0, 5)
        .map(book => ({
          type: 'book',
          text: book.name,
          book: book
        }));
      return { suggestions: bookSuggestions, isChapterMode: false };
    } else if (searchParts.length === 2) {
      // Chapter mode
      const bookName = searchParts[0];
      const chapterInput = searchParts[1];
      
      const matchedBook = books.find(book => 
        book.name.toLowerCase().includes(bookName.toLowerCase())
      );
      
      if (matchedBook && matchedBook.chapters) {
        const chapters = Object.keys(matchedBook.chapters).map(Number).sort((a, b) => a - b);
        const chapterSuggestions = chapters
          .filter(chapter => chapter.toString().startsWith(chapterInput))
          .slice(0, 10)
          .map(chapter => ({
            type: 'chapter',
            text: `${matchedBook.name} ${chapter}`,
            book: matchedBook,
            chapter: chapter
          }));
        return { suggestions: chapterSuggestions, isChapterMode: true };
      }
    }
    
    return { suggestions: [], isChapterMode: false };
  }, [searchTerm, books]);

  const filteredBooks = useMemo(() => {
    if (!books || books.length === 0) return [];
    if (!searchTerm) return books;
    const searchParts = searchTerm.trim().split(' ');
    return books.filter(book => book.name.toLowerCase().includes(searchParts[0].toLowerCase()));
  }, [searchTerm, books]);

  const handleKeyDown = (e) => {
    if (!showAutocomplete || suggestions.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setAutocompleteIndex(prev => 
          prev < suggestions.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setAutocompleteIndex(prev => 
          prev > 0 ? prev - 1 : suggestions.length - 1
        );
        break;
      case 'Tab':
        e.preventDefault();
        if (autocompleteIndex >= 0) {
          const suggestion = suggestions[autocompleteIndex];
          if (suggestion.type === 'book') {
            setSearchTerm(suggestion.text + ' ');
          } else {
            setSearchTerm(suggestion.text);
          }
          setShowAutocomplete(false);
          setAutocompleteIndex(-1);
        }
        break;
      case 'Enter':
        e.preventDefault();
        if (autocompleteIndex >= 0) {
          const suggestion = suggestions[autocompleteIndex];
          if (suggestion.type === 'book') {
            handleBookPress(suggestion.book);
          } else if (suggestion.type === 'chapter') {
            handleChapterPress(suggestion.book, suggestion.chapter);
          }
          setSearchTerm('');
          setShowAutocomplete(false);
          setAutocompleteIndex(-1);
        }
        break;
      case 'Escape':
        setShowAutocomplete(false);
        setAutocompleteIndex(-1);
        break;
    }
  };

  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchTerm(value);
    setShowAutocomplete(value.length > 0);
    setAutocompleteIndex(-1);
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
                placeholder="Search Bible Books..."
                value={searchTerm}
                onChange={handleSearchChange}
                onKeyDown={handleKeyDown}
                onFocus={() => setShowAutocomplete(searchTerm.length > 0)}
                onBlur={() => setTimeout(() => setShowAutocomplete(false), 200)}
                className="w-full rounded text-white focus:outline-none p-4 hover:bg-neutral-800/60 bg-neutral-800 focus:bg-neutral-800"
              />
              <IoSearchOutline className="text-white/80 absolute right-6 top-4" size={20} />
              
              {/* Autocomplete dropdown */}
              {showAutocomplete && suggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 bg-neutral-800 border border-neutral-700 rounded-b mt-1 max-h-60 overflow-y-auto z-20">
                  {suggestions.map((suggestion, index) => (
                    <div
                      key={index}
                      className={`p-3 cursor-pointer transition-colors ${
                        index === autocompleteIndex 
                          ? 'bg-neutral-600' 
                          : 'hover:bg-neutral-700'
                      }`}
                      onClick={() => {
                        if (suggestion.type === 'book') {
                          handleBookPress(suggestion.book);
                        } else if (suggestion.type === 'chapter') {
                          handleChapterPress(suggestion.book, suggestion.chapter);
                        }
                        setSearchTerm('');
                        setShowAutocomplete(false);
                      }}
                    >
                      <span className="text-white">{suggestion.text}</span>
                      {suggestion.type === 'chapter' && (
                        <span className="text-blue-400 ml-2 text-sm">
                          ({Object.keys(suggestion.book.chapters)[suggestion.chapter - 1] ? 
                            `${suggestion.book.chapters[suggestion.chapter]} verses` : 
                            'Chapter'})
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          
          {filteredBooks.map((book, index) => (
            <ListBook
              key={index}
              data={book}
              onPress={handleBookPress}
              onChapterPress={handleChapterPress}
              isActive={activeBook?.id === book.id}
            />
          ))}
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
    </div>
  );
}