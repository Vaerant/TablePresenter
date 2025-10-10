import React, { forwardRef, useState, useEffect } from 'react';
import useSermonStore from '@/stores/sermonStore';

import './VerseView.css';

const VerseView = forwardRef(({ verse, isSelected, onVerseClick }, ref) => {
  const { verseSelectionMode, highlightedVerse } = useSermonStore();
  const [fadeState, setFadeState] = useState('hidden'); // 'hidden', 'visible', 'fading'

  const isHighlighted = highlightedVerse === verse.verse;

  useEffect(() => {
    if (isHighlighted) {
      setFadeState('visible');
      const timeout = setTimeout(() => {
        setFadeState('fading');
      }, 2000); // Show for 2 seconds, then fade out

      return () => clearTimeout(timeout);
    } else {
      setFadeState('hidden');
    }
  }, [isHighlighted]);

  const parseVerseText = (text) => {
    const parts = [];
    let currentIndex = 0;
    let partKey = 0;

    const regex = /‹([^›]+)›/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      // Add text before the match
      if (match.index > currentIndex) {
        parts.push(
          <span key={partKey++}>
            {text.substring(currentIndex, match.index)}
          </span>
        );
      }

      // Add the bracketed text in red (without brackets)
      parts.push(
        <span key={partKey++} className="text-red-400">
          {match[1]}
        </span>
      );

      currentIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (currentIndex < text.length) {
      parts.push(
        <span key={partKey++}>
          {text.substring(currentIndex)}
        </span>
      );
    }

    return parts;
  };

  const handleClick = (e) => {
    e.stopPropagation();
    onVerseClick(verse, e.ctrlKey || e.metaKey, e.shiftKey);
  };

  const baseClasses = 'inline-block transition-all duration-500';
  const selectionClasses = `cursor-pointer select-none p-2 px-3 border-l-0 ${
    isHighlighted
      ? `rounded ${fadeState === 'visible' ? 'border-neutral-700 border-l-8 !rounded-l-none' : fadeState === 'fading' ? 'border-neutral-900' : 'border-transparent'}`
      : isSelected 
        ? 'bg-blue-600/10 bg-opacity-30 rounded hover:bg-blue-600/20 border-transparent'
        : 'hover:bg-neutral-800 rounded border-transparent'
  }`;

  return (
    <span
      ref={ref}
      data-verse={verse.verse}
      className={`${baseClasses} ${selectionClasses} mr-1 mb-1 verse-view`}
      onClick={handleClick}
    >
      <span className={`text-sm font-semibold mr-1 ${
        isSelected 
          ? 'text-white' 
          : 'text-blue-400'
      }`}>
        {verse.verse}
      </span>
      <span className={`${
        isSelected 
          ? 'text-blue-500' 
          : 'text-white/70'
      } verse-text`}>
        {parseVerseText(verse.text)}
      </span>
    </span>
  );
});

VerseView.displayName = 'VerseView';

export default VerseView;
