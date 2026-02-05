'use client';

import { FiSearch, FiFileText, FiType } from 'react-icons/fi';
import { TbBlockquote } from "react-icons/tb";
import SearchResultItem from '@/components/search/SearchResultItem';
import useSermonStore from '@/stores/sermonStore';

export default function SermonTextSearch({ onResultClick }) {
  const {
    sermonTextSearchMode,
    sermonTextSearchTerm,
    sermonSearchType,
    sermonSearchResults,
    isSermonSearching,
    setSermonTextSearchMode,
    setSermonTextSearchTerm,
    setSermonSearchType,
    searchSermonText
  } = useSermonStore();

  const toggleTextSearch = () => {
    setSermonTextSearchMode(!sermonTextSearchMode);
  };

  const handleSearch = () => {
    searchSermonText();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <>
      {/* Search Controls */}
      <div className="flex gap-2 p-2 bg-neutral-800">
        <button
          onClick={toggleTextSearch}
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
              onClick={handleSearch}
              disabled={!sermonTextSearchTerm.trim() || isSermonSearching}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              <FiSearch className="w-4 h-4" />
              <span>{isSermonSearching ? 'Searching...' : 'Search'}</span>
            </button>
          </>
        )}
      </div>

      {/* Search Input */}
      {sermonTextSearchMode && (
        <div className="relative">
          <FiFileText className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder={`Search ${sermonSearchType === 'phrase' ? 'exact phrase' : 'words'} in sermons...`}
            value={sermonTextSearchTerm}
            onChange={(e) => setSermonTextSearchTerm(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full p-3 pl-10 border border-gray-700 rounded-none bg-neutral-900 text-white"
          />
        </div>
      )}

      {/* Search Results */}
      {sermonTextSearchMode && (
        <div className="flex flex-col overflow-y-auto grow">
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
              onClick={() => onResultClick && onResultClick(result)}
            />
          ))}
          {sermonSearchResults.length === 0 && sermonTextSearchTerm && !isSermonSearching && (
            <div className="p-4 text-gray-400 text-center">
              No results found for "{sermonTextSearchTerm}"
            </div>
          )}
        </div>
      )}
    </>
  );
}
