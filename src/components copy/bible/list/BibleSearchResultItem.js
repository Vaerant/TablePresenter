import React from 'react';

const BibleSearchResultItem = ({ result, searchTerm, onClick }) => {
  const highlightText = (text, searchTerm) => {
    if (!searchTerm || !text) return text || '';
    
    const searchTerms = searchTerm.split(/\s+/).filter(term => term.length > 0);
    let highlightedText = text;
    
    searchTerms.forEach(term => {
      if (term.length > 0) {
        const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${escapedTerm})`, 'gi');
        highlightedText = highlightedText.replace(regex, (match) => 
          `<mark class="bg-yellow-400 text-black px-1 rounded font-semibold">${match}</mark>`
        );
      }
    });
    
    return <span dangerouslySetInnerHTML={{ __html: highlightedText }} />;
  };

  const formatReference = (result) => {
    return `${result.book_name} ${result.chapter}:${result.verse}`;
  };

  return (
    <div 
      className="p-3 border-b border-gray-700 cursor-pointer hover:bg-gray-800 transition-colors"
      onClick={onClick}
    >
      <div className="text-sm text-blue-400 mb-2 font-medium">
        {formatReference(result)}
      </div>
      <div className="text-white text-sm leading-relaxed">
        {highlightText(result.text, searchTerm)}
      </div>
    </div>
  );
};

export default BibleSearchResultItem;
