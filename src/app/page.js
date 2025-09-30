'use client';

import { useState, useMemo, useEffect, useRef, use } from 'react';
import useSermonStore from '@/stores/sermonStore';

import ListTitle from '@/components/sermon/ListTitle';
import SermonView from '@/components/sermons/full/SermonView';
import SearchResultItem from '@/components/search/SearchResultItem';
import BibleSearchResultItem from '@/components/bible/list/BibleSearchResultItem';
import BibleView from '@/components/bible/full/BibleView';
import StatusBar from '@/components/ui/StatusBar';
import DisplaySettings from '@/components/ui/DisplaySettings';

import { sermonSearch } from '@/lib/sermonSearch';
import { bibleSearch } from '@/lib/bibleSearch';

import { FiSearch, FiBook, FiFileText, FiType } from 'react-icons/fi';
import { TbBlockquote, TbBible } from "react-icons/tb";

export default function Home() {
  const { activeSermon, setActiveSermon, clearSelectedParagraph } = useSermonStore();

  // Main view mode - either 'sermons' or 'bible'
  const [viewMode, setViewMode] = useState('sermons');

  // Sermon-related states
  const [allSermons, setAllSermons] = useState([]);
  const [sermonSearchTerm, setSermonSearchTerm] = useState('');
  const [selectedSermonData, setSelectedSermonData] = useState(null);
  const [sermonTextSearchMode, setSermonTextSearchMode] = useState(false);
  const [sermonTextSearchTerm, setSermonTextSearchTerm] = useState('');
  const [sermonSearchType, setSermonSearchType] = useState('general'); // 'general' or 'phrase'
  const [sermonSearchResults, setSermonSearchResults] = useState([]);
  const [isSermonSearching, setIsSermonSearching] = useState(false);

  // Bible-related states
  const [bibleBooks, setBibleBooks] = useState([]);
  const [selectedBook, setSelectedBook] = useState('');
  const [bibleSearchTerm, setBibleSearchTerm] = useState('');
  const [bibleResults, setBibleResults] = useState([]);
  const [selectedChapterData, setSelectedChapterData] = useState(null);
  const [isBibleSearching, setIsBibleSearching] = useState(false);

  const sermonViewRef = useRef(null);
  const bibleViewRef = useRef(null);

  useEffect(() => {
    const fetchData = async () => {
      console.log('Fetching sermons and Bible books...');
      try {
        const sermons = await sermonSearch.getSermons();
        setAllSermons(sermons);
        
        const books = await bibleSearch.getAllBooks();
        setBibleBooks(books);
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    };
    fetchData();
  }, []);

  // Watch changes in sermon search type to re-search results
  useEffect(() => {
    if (sermonTextSearchMode && sermonTextSearchTerm.trim()) {
      handleSermonTextSearch();
    }
  }, [sermonSearchType]);

  // SERMON FUNCTIONS
  const filteredSermons = useMemo(() => {
    if (!allSermons) return [];
    if (!sermonSearchTerm) return allSermons;
    return allSermons.filter(sermon =>
      sermon.title.toLowerCase().includes(sermonSearchTerm.toLowerCase()) ||
      sermon.date.toLowerCase().includes(sermonSearchTerm.toLowerCase())
    );
  }, [allSermons, sermonSearchTerm]);

  const handleSermonPress = async (sermon) => {
    console.log('Sermon pressed:', sermon);
    const sermonData = await sermonSearch.loadSermon(sermon.uid);
    console.log('Selected Sermon:', sermonData);
    setSelectedSermonData(sermonData);
  };

  const toggleSermonTextSearch = () => {
    setSermonTextSearchMode(!sermonTextSearchMode);
    setSermonTextSearchTerm('');
    setSermonSearchResults([]);
  };

  const handleSermonTextSearch = async () => {
    if (!sermonTextSearchTerm.trim()) return;
    
    setIsSermonSearching(true);
    try {
      let results = [];
      if (sermonSearchType === 'phrase') {
        results = await sermonSearch.searchText(`"${sermonTextSearchTerm}"`);
      } else {
        results = await sermonSearch.searchText(sermonTextSearchTerm);
      }
      
      // Get paragraph context for each result
      const enrichedResults = await Promise.all(
        results.map(async (result, index) => {
          try {
            const context = await sermonSearch.getBlockContext(result.sermon_uid, result.uid);
            return {
              ...result,
              paragraphBlocks: context.paragraphBlocks || [],
              targetBlockIndex: context.targetBlockIndex || 0
            };
          } catch (error) {
            console.error('Error getting context for block:', result.uid, error);
            return {
              ...result,
              paragraphBlocks: [{ uid: result.uid, text: result.text, type: result.type }],
              targetBlockIndex: 0
            };
          }
        })
      );
      
      setSermonSearchResults(enrichedResults);
    } catch (error) {
      console.error('Error searching sermons:', error);
    } finally {
      setIsSermonSearching(false);
    }
  };

  const handleSermonSearchResultClick = async (result) => {
    console.log('Sermon search result clicked:', result);
    
    // Load the sermon if not already loaded or if it's different
    if (!selectedSermonData || selectedSermonData.uid !== result.sermon_uid) {
      const sermonData = await sermonSearch.loadSermon(result.sermon_uid);
      setSelectedSermonData(sermonData);
    }
    
    // Scroll to and highlight the paragraph after a brief delay
    setTimeout(() => {
      if (sermonViewRef.current) {
        sermonViewRef.current.scrollToAndHighlight(result.paragraph_uid, sermonTextSearchTerm);
      }
    }, 100);
  };

  // BIBLE FUNCTIONS
  const handleBibleSearch = async () => {
    if (!bibleSearchTerm.trim()) return;
    
    setIsBibleSearching(true);
    try {
      let results = [];
      if (selectedBook) {
        results = await bibleSearch.searchByBook(bibleSearchTerm, selectedBook, 100);
      } else {
        results = await bibleSearch.searchVerses(bibleSearchTerm, 100);
      }
      
      setBibleResults(results);
    } catch (error) {
      console.error('Error searching Bible:', error);
    } finally {
      setIsBibleSearching(false);
    }
  };

  const handleBibleResultClick = async (result) => {
    console.log('Bible result clicked:', result);
    
    // Load the full chapter for context
    const chapterData = await bibleSearch.getChapter(result.book, result.chapter);
    setSelectedChapterData(chapterData);
    
    // Scroll to the specific verse after a brief delay
    setTimeout(() => {
      if (bibleViewRef.current) {
        bibleViewRef.current.scrollToVerse(result.verse);
      }
    }, 100);
  };

  // Listen for paragraph clear events from main process
  useEffect(() => {
    if (typeof window !== 'undefined' && window.electronAPI) {
      const handleParagraphClear = () => {
        clearSelectedParagraph();
      };

      window.electronAPI.on('paragraph:cleared', handleParagraphClear);

      return () => {
        window.electronAPI.off('paragraph:cleared', handleParagraphClear);
      };
    }
  }, [clearSelectedParagraph]);

  return (
    <div className="bg-black text-white flex flex-col" style={{ height: '100vh' }}>
      <div className="flex flex-1" style={{ height: 'calc(100vh - 80px)' }}>
        <div className='w-[40vw] flex flex-col max-h-screen'>
          {/* Main View Toggle */}
          <div className="flex gap-2 p-3 bg-neutral-800 border-b border-neutral-700">
            <button
              onClick={() => setViewMode('sermons')}
              className={`px-6 py-2 rounded font-medium transition-colors flex items-center space-x-2 ${
                viewMode === 'sermons' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-600 text-gray-200 hover:bg-gray-500'
              }`}
            >
              <FiBook className="w-4 h-4" />
              <span>Sermons</span>
            </button>
            
            <button
              onClick={() => setViewMode('bible')}
              className={`px-6 py-2 rounded font-medium transition-colors flex items-center space-x-2 ${
                viewMode === 'bible' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-600 text-gray-200 hover:bg-gray-500'
              }`}
            >
              <TbBible className="w-4 h-4" />
              <span>Bible</span>
            </button>
          </div>

          {/* SERMON VIEW */}
          {viewMode === 'sermons' && (
            <>
              {/* Sermon Search Controls */}
              <div className="flex gap-2 p-2 bg-neutral-800">
                <button
                  onClick={toggleSermonTextSearch}
                  className={`px-4 py-2 rounded font-medium transition-colors flex items-center space-x-2 ${
                    sermonTextSearchMode 
                      ? 'bg-green-600 text-white' 
                      : 'bg-gray-600 text-gray-200 hover:bg-gray-500'
                  }`}
                >
                  <FiSearch className="w-4 h-4" />
                  <span>{sermonTextSearchMode ? 'Text Search' : 'Search Text'}</span>
                </button>
                
                {sermonTextSearchMode && (
                  <>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setSermonSearchType('general')}
                        className={`px-3 py-2 rounded border transition-colors flex items-center space-x-1 ${
                          sermonSearchType === 'general'
                            ? 'bg-blue-600 text-white border-blue-500'
                            : 'bg-neutral-700 text-gray-300 border-gray-600 hover:bg-neutral-600'
                        }`}
                        title="Search for words (general)"
                      >
                        <FiType className="w-4 h-4" />
                        <span className="text-sm">Words</span>
                      </button>
                      <button
                        onClick={() => setSermonSearchType('phrase')}
                        className={`px-3 py-2 rounded border transition-colors flex items-center space-x-1 ${
                          sermonSearchType === 'phrase'
                            ? 'bg-blue-600 text-white border-blue-500'
                            : 'bg-neutral-700 text-gray-300 border-gray-600 hover:bg-neutral-600'
                        }`}
                        title="Search for exact phrase"
                      >
                        <TbBlockquote className="w-4 h-4" />
                        <span className="text-sm">Phrase</span>
                      </button>
                    </div>
                    
                    <button
                      onClick={handleSermonTextSearch}
                      disabled={!sermonTextSearchTerm.trim() || isSermonSearching}
                      className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center space-x-2"
                    >
                      <FiSearch className="w-4 h-4" />
                      <span>{isSermonSearching ? 'Searching...' : 'Search'}</span>
                    </button>
                  </>
                )}
              </div>

              {/* Sermon Search Input */}
              {sermonTextSearchMode ? (
                <div className="relative">
                  <FiFileText className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="text"
                    placeholder={`Search ${sermonSearchType === 'phrase' ? 'exact phrase' : 'words'} in sermons...`}
                    value={sermonTextSearchTerm}
                    onChange={(e) => setSermonTextSearchTerm(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSermonTextSearch()}
                    className="w-full p-3 pl-10 border border-gray-700 rounded-none bg-neutral-900 text-white"
                  />
                </div>
              ) : (
                <div className="relative">
                  <FiBook className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="text"
                    placeholder="Search sermon titles and dates..."
                    value={sermonSearchTerm}
                    onChange={(e) => setSermonSearchTerm(e.target.value)}
                    className="w-full p-3 pl-10 border border-gray-700 rounded-none bg-neutral-900 text-white"
                  />
                </div>
              )}

              {/* Sermon Results */}
              <div className="flex flex-col overflow-y-auto grow">
                {sermonTextSearchMode ? (
                  // Text Search Results
                  <>
                    {sermonSearchResults.length > 0 && (
                      <div className="p-2 bg-neutral-800 text-sm text-gray-300">
                        {sermonSearchResults.length} result{sermonSearchResults.length !== 1 ? 's' : ''} found
                        {sermonSearchType === 'phrase' && (
                          <span className="ml-2 text-yellow-400">(exact phrase)</span>
                        )}
                      </div>
                    )}
                    {sermonSearchResults.map((result, index) => (
                      <SearchResultItem
                        key={`${result.sermon_uid}-${result.paragraph_uid}-${index}`}
                        result={result}
                        searchTerm={sermonTextSearchTerm}
                        searchType={sermonSearchType}
                        onClick={() => handleSermonSearchResultClick(result)}
                      />
                    ))}
                    {sermonSearchResults.length === 0 && sermonTextSearchTerm && !isSermonSearching && (
                      <div className="p-4 text-gray-400 text-center">
                        No results found for "{sermonTextSearchTerm}"
                      </div>
                    )}
                  </>
                ) : (
                  // Sermon List
                  filteredSermons.map((sermon, index) => (
                    <ListTitle key={index} data={sermon} onPress={handleSermonPress} />
                  ))
                )}
              </div>
            </>
          )}

          {/* BIBLE VIEW */}
          {viewMode === 'bible' && (
            <>
              {/* Bible Search Controls */}
              <div className="flex gap-2 p-2 bg-neutral-800">
                <select
                  value={selectedBook}
                  onChange={(e) => setSelectedBook(e.target.value)}
                  className="px-3 py-2 bg-neutral-700 text-white rounded border border-gray-600"
                >
                  <option value="">All Books</option>
                  {bibleBooks.map((book) => (
                    <option key={book.id} value={book.id}>
                      {book.name}
                    </option>
                  ))}
                </select>

                <button
                  onClick={handleBibleSearch}
                  disabled={!bibleSearchTerm.trim() || isBibleSearching}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center space-x-2"
                >
                  <TbBible className="w-4 h-4" />
                  <span>{isBibleSearching ? 'Searching...' : 'Search'}</span>
                </button>
              </div>

              {/* Bible Search Input */}
              <div className="relative">
                <TbBible className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  placeholder="Search Bible verses..."
                  value={bibleSearchTerm}
                  onChange={(e) => setBibleSearchTerm(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleBibleSearch()}
                  className="w-full p-3 pl-10 border border-gray-700 rounded-none bg-neutral-900 text-white"
                />
              </div>

              {/* Bible Results */}
              <div className="flex flex-col overflow-y-auto grow">
                {bibleResults.length > 0 && (
                  <div className="p-2 bg-neutral-800 text-sm text-gray-300">
                    {bibleResults.length} verse{bibleResults.length !== 1 ? 's' : ''} found
                    {selectedBook && (
                      <span className="ml-2 text-blue-400">
                        in {bibleBooks.find(b => b.id == selectedBook)?.name}
                      </span>
                    )}
                  </div>
                )}
                {bibleResults.map((result, index) => (
                  <BibleSearchResultItem
                    key={`${result.book}-${result.chapter}-${result.verse}-${index}`}
                    result={result}
                    searchTerm={bibleSearchTerm}
                    onClick={() => handleBibleResultClick(result)}
                  />
                ))}
                {bibleResults.length === 0 && bibleSearchTerm && !isBibleSearching && (
                  <div className="p-4 text-gray-400 text-center">
                    No verses found for "{bibleSearchTerm}"
                  </div>
                )}
              </div>
            </>
          )}

          {/* Display Settings */}
          <DisplaySettings />
        </div>
        
        {/* Content View */}
        {viewMode === 'bible' ? (
          <BibleView 
            ref={bibleViewRef}
            chapterData={selectedChapterData} 
          />
        ) : (
          <SermonView 
            ref={sermonViewRef}
            sermonData={selectedSermonData} 
          />
        )}
      </div>
      
      <StatusBar />
    </div>
  );
}