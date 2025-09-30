import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import useSermonStore from '@/stores/sermonStore';

const VerseView = ({ verse, onVerseClick }) => {
  const { selectedParagraph } = useSermonStore();
  const isSelected = selectedParagraph?.verseId === verse.id;

  const handleClick = () => {
    onVerseClick(verse);
  };

  return (
    <div 
      className={`mb-1 p-2 rounded cursor-pointer transition-colors ${
        isSelected 
          ? 'bg-blue-600 bg-opacity-30 border border-blue-500' 
          : 'hover:bg-gray-800 hover:bg-opacity-50'
      }`}
      onClick={handleClick}
    >
      <span className="text-blue-400 font-medium mr-2">{verse.verse}</span>
      <span className="text-white">{verse.text}</span>
    </div>
  );
};

const BibleView = forwardRef(({ chapterData }, ref) => {
  const containerRef = useRef(null);
  const verseRefs = useRef({});
  const { setSelectedParagraph, clearSelectedParagraph } = useSermonStore();

  useImperativeHandle(ref, () => ({
    scrollToVerse: (verseNumber) => {
      const verseElement = verseRefs.current[verseNumber];
      if (verseElement && containerRef.current) {
        const containerRect = containerRef.current.getBoundingClientRect();
        const verseRect = verseElement.getBoundingClientRect();
        const scrollTop = containerRef.current.scrollTop + verseRect.top - containerRect.top - 100;
        
        containerRef.current.scrollTo({
          top: scrollTop,
          behavior: 'smooth'
        });
      }
    }
  }));

  const handleVerseClick = (verse) => {
    const verseData = {
      verseId: verse.id,
      verse: verse,
      reference: `${verse.book_name} ${verse.chapter}:${verse.verse}`,
      text: verse.text,
      type: 'bible'
    };

    setSelectedParagraph(verseData);

    // Send to display
    if (typeof window !== 'undefined' && window.electronAPI) {
      window.electronAPI.send('paragraph:selected', {
        paragraphData: verseData,
        displaySettings: {
          enabled: true,
          showTitle: true,
          showDate: false,
          showContent: true
        }
      });
    }
  };

  if (!chapterData || chapterData.length === 0) {
    return (
      <div className="flex-1 p-4 bg-neutral-900 text-white">
        <p>Select a search result to view the chapter.</p>
      </div>
    );
  }

  const firstVerse = chapterData[0];
  const chapterTitle = `${firstVerse.book_name} Chapter ${firstVerse.chapter}`;

  return (
    <div 
      ref={containerRef}
      className="flex-1 p-4 bg-neutral-900 text-white overflow-y-auto max-h-screen"
    >
      <h1 className="text-2xl font-bold mb-4">{chapterTitle}</h1>
      
      {chapterData.map((verse) => (
        <VerseView 
          key={verse.id}
          ref={(el) => {
            if (el) {
              verseRefs.current[verse.verse] = el;
            }
          }}
          verse={verse}
          onVerseClick={handleVerseClick}
        />
      ))}
    </div>
  );
});

BibleView.displayName = 'BibleView';

export default BibleView;
