'use client';

import { useState } from 'react';

export default function Home() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError('');
    
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      const data = await response.json();
      console.log(data);
      if (!response.ok) {
        throw new Error(data.error || 'Search failed');
      }
      
      setResults(data.results || []);
    } catch (err) {
      setError(err.message);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const highlightText = (text, searchQuery) => {
    if (!searchQuery || searchQuery.length === 0) return text;
    
    const terms = searchQuery.split(/\s+/).filter(term => term.length > 0);
    let highlightedText = text;
    
    terms.forEach(term => {
      const regex = new RegExp(`(${term})`, 'gi');
      highlightedText = highlightedText.replace(regex, '<mark>$1</mark>');
    });
    
    return <span dangerouslySetInnerHTML={{ __html: highlightedText }} />;
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-8 text-center text-white">Sermon Search</h1>
        
        <form onSubmit={handleSearch} className="mb-8">
          <div className="flex gap-4">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search sermons..."
              className="flex-1 px-4 py-2 border border-gray-600 rounded-lg bg-gray-900 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>
        </form>

        {error && (
          <div className="bg-red-900 border border-red-600 text-red-300 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {results.length > 0 && (
          <div className="mb-4 text-sm text-gray-400">
            Found {results.reduce((total, result) => total + result.totalMatches, 0)} match{results.reduce((total, result) => total + result.totalMatches, 0) !== 1 ? 'es' : ''} in {results.length} sermon{results.length !== 1 ? 's' : ''}
          </div>
        )}

        <div className="space-y-6">
          {results.map((result, index) => (
            <div key={result.sermon.id} className="bg-gray-900 border border-gray-700 rounded-lg p-6 shadow-lg">
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-blue-400 mb-1">
                  {result.sermon.title}
                </h3>
                <p className="text-sm text-gray-400 mb-2">
                  Date: {result.sermon.date} | {result.totalMatches} match{result.totalMatches !== 1 ? 'es' : ''}
                </p>
              </div>
              
              <div className="space-y-4">
                {result.matches.map((match, matchIndex) => (
                  <div key={match.blockId} className="border-l-4 border-blue-500 pl-4">
                    <div className="prose max-w-none">
                      <div className="paragraph text-gray-200">
                        {match.context.paragraphBlocks.map((block, blockIndex) => (
                          <span key={block.id} className="block">
                            {block.id === match.blockId 
                              ? highlightText(block.text, query)
                              : block.text
                            }
                            {blockIndex < match.context.paragraphBlocks.length - 1 ? ' ' : ''}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {query && !loading && results.length === 0 && !error && (
          <div className="text-center text-gray-400 mt-8">
            No results found for "{query}"
          </div>
        )}
      </div>
    </div>
  );
}