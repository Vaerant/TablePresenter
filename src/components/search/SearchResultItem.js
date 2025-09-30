import React from 'react';

const SearchResultItem = ({ result, searchTerm, searchType, onClick }) => {
  const highlightText = (text, searchTerm, searchType) => {
    if (!searchTerm || !text) return text || '';
    
    let highlightedText = text;
    
    if (searchType === 'phrase') {
      // For exact phrase mode, highlight ONLY the complete phrase
      let phraseToHighlight = searchTerm;
      
      // Remove quotes if present (they're added by the search logic)
      if (searchTerm.startsWith('"') && searchTerm.endsWith('"')) {
        phraseToHighlight = searchTerm.slice(1, -1);
      }
      
      if (phraseToHighlight.trim().length > 0) {
        // Escape the phrase for regex and match it as a complete phrase
        const escapedPhrase = phraseToHighlight.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${escapedPhrase})`, 'gi');
        highlightedText = highlightedText.replace(regex, (match) => 
          `<mark class="bg-yellow-400 text-black px-1 rounded font-semibold">${match}</mark>`
        );
      }
    } else {
      // For general search, highlight individual words
      const searchTerms = searchTerm.split(/\s+/).filter(term => term.length > 0);
      
      searchTerms.forEach(term => {
        if (term.length > 0) {
          const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`(${escapedTerm})`, 'gi');
          highlightedText = highlightedText.replace(regex, (match) => 
            `<mark class="bg-yellow-400 text-black px-1 rounded font-semibold">${match}</mark>`
          );
        }
      });
    }
    
    return <span dangerouslySetInnerHTML={{ __html: highlightedText }} />;
  };

  const getFullParagraphText = () => {
    if (!result.paragraphBlocks || result.paragraphBlocks.length === 0) {
      return result.text || '';
    }
    
    // Combine all blocks in the paragraph to show full context
    const fullText = result.paragraphBlocks
      .filter(block => block && block.text) // Filter out blocks without text
      .map(block => block.text)
      .join(' ');
    
    return fullText || result.text || '';
  };

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
        {highlightText(getFullParagraphText(), searchTerm, searchType)}
      </div>
    </div>
  );
};

export default SearchResultItem;
