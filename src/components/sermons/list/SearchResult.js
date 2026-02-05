import React from 'react';

const SearchResult = ({ 
  result, 
  onClick, 
  variant = 'block',
  className = ''
}) => {
  const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const getHighlightTerms = () => {
    const query = (result.searchQuery || '').trim();
    if (!query) return [];

    const mode = result.searchMode || 'phrase';
    if (mode === 'phrase') return [query];

    // general + similar: highlight each word
    return query
      .split(/\s+/)
      .map(t => t.trim())
      .filter(Boolean);
  };

  const highlightText = (text) => {
    const raw = String(text || '');
    const terms = getHighlightTerms();
    if (!raw || terms.length === 0) return raw;

    const uniqueTerms = Array.from(new Set(terms))
      .sort((a, b) => b.length - a.length)
      .slice(0, 25);

    const pattern = uniqueTerms.map(escapeRegex).join('|');
    if (!pattern) return raw;

    const regex = new RegExp(`(${pattern})`, 'gi');
    const parts = raw.split(regex);

    return parts.map((part, i) => {
      if (part && regex.test(part)) {
        // Reset lastIndex because regex is global-ish via split usage.
        regex.lastIndex = 0;
        return (
          <span key={i} className="bg-yellow-500/25 text-yellow-100 rounded px-0.5">
            {part}
          </span>
        );
      }
      return <React.Fragment key={i}>{part}</React.Fragment>;
    });
  };

  const getVariantStyles = () => {
    switch (variant) {
      case 'sermon':
        return 'bg-neutral-800 hover:bg-neutral-700/30';
      case 'paragraph':
        return 'bg-neutral-800 hover:bg-neutral-700/30';
      case 'block':
      default:
        return 'bg-neutral-800 hover:bg-neutral-700/30';
    }
  };

  const renderHeader = () => {
    switch (variant) {
      case 'sermon':
        return (
          <div className="flex justify-between items-start mb-2">
            <span className="font-semibold text-sm">
              {result.date} {result.title}
            </span>
            {result.paragraphNumber && (
              <span className="text-xs text-neutral-500">Paragraph {result.paragraphNumber}</span>
            )}
          </div>
        );
      case 'block':
        return (
          <div className="flex justify-between items-start mb-2">
            <span className="font-semibold text-sm">
              {result.date} {result.title}
            </span>
            <div className="flex gap-2 items-center">
              {result.searchMode && (
                <span className="text-xs text-blue-400">
                  {result.searchMode === 'phrase' ? 'Phrase' : result.searchMode === 'general' ? 'General' : 'Similar'}
                </span>
              )}
              <span className="text-xs text-neutral-500">Block</span>
            </div>
          </div>
        );
      case 'paragraph':
        return (
          <div className="flex justify-between items-start mb-2">
            <span className="font-semibold text-sm">
              {result.date} {result.title}
            </span>
            <span className="text-xs text-neutral-500">Paragraph {result.paragraphNumber || 'N/A'}</span>
          </div>
        );
      default:
        return (
          <div className="flex justify-between items-start mb-2">
            <span className="font-semibold text-sm">
              {result.title || 'Unknown Sermon'}
            </span>
            <span className="text-xs text-neutral-500">{variant}</span>
          </div>
        );
    }
  };

  const renderContent = () => {
    // Handle different text sources
    const text = result.text || result.content || result.description || '';
    
    // Truncate long text for display
    const truncatedText = text.length > 300 ? text.substring(0, 300) + '...' : text;
    
    return (
      <p className="text-white text-sm leading-relaxed">
        {highlightText(truncatedText)}
      </p>
    );
  };

  return (
    <div 
      className={`p-3 rounded-lg cursor-pointer ${getVariantStyles()} ${className}`}
      onClick={() => onClick(result)}
    >
      {renderHeader()}
      {renderContent()}
      
      {/* Additional context for blocks */}
      {variant === 'block' && result.type && (
        <div className="mt-2 flex gap-2">
          <span className="text-xs bg-neutral-700 px-2 py-1 rounded">
            {result.type}
          </span>
          {result.paragraphNumber && (
            <span className="text-xs bg-neutral-700 px-2 py-1 rounded">
              ¶{result.paragraphNumber}
            </span>
          )}
          {result.searchMode && (
            <span className="text-xs bg-blue-600 px-2 py-1 rounded">
              {result.searchMode === 'phrase' ? 'Phrase Match' : result.searchMode === 'general' ? 'Word Match' : 'Similar'}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default SearchResult;
