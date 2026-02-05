import React, { memo, useMemo } from 'react';

const SearchResultItem = memo(({ result, searchTerm, searchType, onClick }) => {
  // Memoize the highlighted text calculation
  const highlightedText = useMemo(() => {
    const highlightText = (text, searchTerm, searchType) => {
      if (!searchTerm || !text) return text || '';
      
      let highlightedText = text;
      
      if (searchType === 'phrase') {
        let phraseToHighlight = searchTerm;
        
        if (searchTerm.startsWith('"') && searchTerm.endsWith('"')) {
          phraseToHighlight = searchTerm.slice(1, -1);
        }
        
        if (phraseToHighlight.trim().length > 0) {
          const escapedPhrase = phraseToHighlight.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`(${escapedPhrase})`, 'gi');
          highlightedText = highlightedText.replace(regex, (match) => 
            `<mark class="bg-blue-400/10 text-blue-500 px-1 rounded font-semibold">${match}</mark>`
          );
        }
      } else {
        const searchTerms = searchTerm.split(/\s+/).filter(term => term.length > 0);
        
        searchTerms.forEach(term => {
          if (term.length > 0) {
            const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`(${escapedTerm})`, 'gi');
            highlightedText = highlightedText.replace(regex, (match) => 
              `<mark class="bg-blue-400/10 text-blue-500 px-1 rounded font-semibold">${match}</mark>`
            );
          }
        });
      }
      
      return highlightedText;
    };

    // Use only the block text, not the full paragraph
    const blockText = result.text || '';
    return highlightText(blockText, searchTerm, searchType);
  }, [result.text, searchTerm, searchType]);

  return (
    <div 
      className="p-3 border-b border-gray-700 cursor-pointer hover:bg-gray-800 transition-colors"
      onClick={onClick}
    >
      <div className="text-sm text-gray-400 mb-2">
        <span className="font-medium">
          {result.title || 'Unknown Title'}
        </span>
        <span className="mx-2">•</span>
        <span>
          {result.date || 'Unknown Date'}
        </span>
        {result.type && (
          <>
            <span className="mx-2">•</span>
            <span className="text-blue-400">{result.type}</span>
          </>
        )}
      </div>
      <div className="text-white text-sm leading-relaxed">
        <span dangerouslySetInnerHTML={{ __html: highlightedText }} />
      </div>
    </div>
  );
});

SearchResultItem.displayName = 'SearchResultItem';

export default SearchResultItem;