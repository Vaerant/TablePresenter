import React, { useEffect, forwardRef, useImperativeHandle, useRef } from 'react';
import ParagraphView from './ParagraphView';

const SermonView = forwardRef(({ sermonData }, ref) => {
  const containerRef = useRef(null);
  const paragraphRefs = useRef({});

  useImperativeHandle(ref, () => ({
    scrollToAndHighlight: (paragraphUid, searchTerm) => {
      const paragraphElement = paragraphRefs.current[paragraphUid];
      if (paragraphElement && containerRef.current) {
        // Remove highlight from any previously highlighted paragraph
        Object.values(paragraphRefs.current).forEach(el => {
          if (el) {
            el.classList.remove('highlight-search-result');
          }
        });

        // Scroll to the paragraph
        const containerRect = containerRef.current.getBoundingClientRect();
        const paragraphRect = paragraphElement.getBoundingClientRect();
        const scrollTop = containerRef.current.scrollTop + paragraphRect.top - containerRect.top - 100;
        
        containerRef.current.scrollTo({
          top: scrollTop,
          behavior: 'smooth'
        });
        
        // Highlight the paragraph with lighter background - keep until sermon changes
        paragraphElement.classList.add('highlight-search-result');
      }
    }
  }));

  // Clear all highlights when sermon changes
  useEffect(() => {
    if (paragraphRefs.current) {
      Object.values(paragraphRefs.current).forEach(el => {
        if (el) {
          el.classList.remove('highlight-search-result');
        }
      });
    }
  }, [sermonData?.uid]);

  if (!sermonData) {
    return (
      <div className="flex-1 p-4 bg-neutral-900 text-white">
        <p>Select a sermon to view.</p>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className="flex-1 p-4 bg-neutral-900 text-white overflow-y-auto max-h-screen"
    >
      <style jsx>{`
        .highlight-search-result {
          background-color: rgba(156, 163, 175, 0.2) !important;
          border-left: 4px solid rgb(156, 163, 175) !important;
          transition: all 0.3s ease;
        }
      `}</style>
      
      <h1 className="text-2xl font-bold mb-2">{sermonData.title}</h1>
      <p className="text-gray-400 mb-4">{sermonData.date}</p>
      {Object.entries(sermonData.sections).map(([sectionId, section]) => {
        return (
          <div key={sectionId} className="mb-4">
            {Object.entries(section.paragraphs).map(([paragraphId, paragraph]) => {
              return (
                <ParagraphView 
                  key={paragraphId}
                  ref={(el) => {
                    if (el) {
                      paragraphRefs.current[paragraphId] = el;
                    }
                  }}
                  paragraph={paragraph}
                  paragraphId={paragraphId}
                  sermonData={sermonData}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
});

SermonView.displayName = 'SermonView';

export default SermonView;