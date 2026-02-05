import { create } from 'zustand';

const useSermonStore = create((set, get) => ({
  // Sermon state
  activeSermon: null,
  selectedParagraph: null,
  
  // Bible state
  activeBook: null,
  activeBookData: null,
  currentChapter: 1,
  selectedVerses: [],
  verseSelectionMode: 'single', // 'single' or 'multiple'
  targetVerse: null,
  highlightedVerse: null, // For temporary highlighting

  // Display settings
  displaySettings: {
    enabled: true,
    showTitle: true,
    showDate: true,
    showContent: true
  },

  // Bible display settings
  bibleDisplaySettings: {
    showDisplay: true,
    showHeader: true,
    verseFontSize: 3,
    headerFontSize: 2,
    verseFontWeight: 400,
    headerFontWeight: 700,
    headerColor: '#ffffff',
    verseColor: '#ffffff',
    verseWidth: 100,
    verseHeight: 100,
    versePositionX: 50,
    versePositionY: 50,
    headerPositionX: 50,
    headerPositionY: 15,
    verseTextAlign: 'center',
    headerTextAlign: 'center',
    isManualFontSize: false
  },

  // Sermon actions
  setActiveSermon: (sermon) => {
    set({ 
      activeSermon: sermon,
      selectedParagraph: null,
      selectedVerses: []
    });
  },

  setSelectedParagraph: (paragraph) => {
    set({ selectedParagraph: paragraph, selectedVerses: [] }); // Clear verses when selecting paragraph
  },

  clearSelectedParagraph: () => {
    set({ selectedParagraph: null });
  },

  // Bible actions
  setActiveBook: (book, bookData) => {
    set({ 
      activeBook: book, 
      activeBookData: bookData,
      currentChapter: 1,
      selectedVerses: [],
      selectedParagraph: null // Clear paragraph when selecting book
    });
  },

  setActiveBookWithChapter: (book, bookData, chapter = 1) => {
    set({ 
      activeBook: book, 
      activeBookData: bookData,
      currentChapter: chapter,
      selectedVerses: [],
      selectedParagraph: null // Clear paragraph when selecting book
    });
  },

  setActiveBookWithVerse: (book, bookData, chapter = 1, targetVerse = null) => {
    set({ 
      activeBook: book, 
      activeBookData: bookData,
      currentChapter: chapter,
      selectedVerses: [],
      selectedParagraph: null,
      targetVerse: targetVerse // Add target verse for scrolling
    });
  },

  clearTargetVerse: () => {
    set({ targetVerse: null });
  },

  setHighlightedVerse: (verse) => {
    set({ highlightedVerse: verse });
  },

  clearHighlightedVerse: () => {
    set({ highlightedVerse: null });
  },

  setCurrentChapter: (chapter) => {
    set({ currentChapter: chapter, selectedVerses: [] }); // Clear verses when changing chapter
  },

  setSelectedVerse: (verse, ctrlKey = false, shiftKey = false) => {
    const { selectedVerses } = get();
    
    if (shiftKey && selectedVerses.length > 0) {
      // Shift selection - extend range from last selected to current
      const lastSelected = selectedVerses[selectedVerses.length - 1];
      if (lastSelected.chapter === verse.chapter) {
        const startVerse = Math.min(lastSelected.verse, verse.verse);
        const endVerse = Math.max(lastSelected.verse, verse.verse);
        const { activeBookData, currentChapter } = get();
        const chapterData = activeBookData[currentChapter];
        
        const rangeVerses = [];
        for (let v = startVerse; v <= endVerse; v++) {
          if (chapterData[v]) {
            rangeVerses.push(chapterData[v]);
          }
        }
        
        // Merge with existing selections, avoiding duplicates and sort them
        const existingVerses = selectedVerses.filter(v => v.verse < startVerse || v.verse > endVerse || v.chapter !== verse.chapter);
        const combinedVerses = [...existingVerses, ...rangeVerses];
        
        combinedVerses.sort((a, b) => {
          if (a.chapter !== b.chapter) return a.chapter - b.chapter;
          return a.verse - b.verse;
        });
        
        set({ selectedVerses: combinedVerses, selectedParagraph: null });
      } else {
        // Different chapter, just add this verse
        set({ selectedVerses: [...selectedVerses, verse], selectedParagraph: null });
      }
    } else if (ctrlKey) {
      // Control selection - toggle verse in multi-selection
      const existingIndex = selectedVerses.findIndex(v => 
        v.chapter === verse.chapter && v.verse === verse.verse
      );
      
      if (existingIndex >= 0) {
        // Remove verse and sort if more than one remains
        let newVerses = selectedVerses.filter((_, index) => index !== existingIndex);
        if (newVerses.length > 1) {
          newVerses.sort((a, b) => a.chapter !== b.chapter ? a.chapter - b.chapter : a.verse - b.verse);
        }
        set({ selectedVerses: newVerses, selectedParagraph: null });
      } else {
        // Add verse and sort if more than one exists
        let newVerses = [...selectedVerses, verse];
        if (newVerses.length > 1) {
          newVerses.sort((a, b) => a.chapter !== b.chapter ? a.chapter - b.chapter : a.verse - b.verse);
        }
        set({ selectedVerses: newVerses, selectedParagraph: null });
      }
    } else {
      // Regular click - deselect all and select this one, or toggle if it's the only one selected
      const isOnlySelected = selectedVerses.length === 1 && 
        selectedVerses[0].chapter === verse.chapter && 
        selectedVerses[0].verse === verse.verse;
      
      if (isOnlySelected) {
        // Deselect if it's the only one selected
        set({ selectedVerses: [], selectedParagraph: null });
      } else {
        // Select only this verse
        set({ selectedVerses: [verse], selectedParagraph: null });
      }
    }
  },

  setVerseSelectionMode: (mode) => {
    set({ verseSelectionMode: mode, selectedVerses: [] }); // Clear selection when changing mode
  },

  clearSelectedVerses: () => {
    set({ selectedVerses: [] });
  },

  clearAllSelections: () => {
    set({ selectedParagraph: null, selectedVerses: [] });
  },

  // Display settings
  setDisplaySettings: (settings) => {
    set({ displaySettings: settings });
  },

  // Bible display actions
  setBibleDisplaySettings: (settings) => {
    set({ bibleDisplaySettings: settings });
  },

  resetBibleDisplaySettings: () => {
    const defaultSettings = {
      showDisplay: true,
      showHeader: true,
      verseFontSize: 3,
      headerFontSize: 2,
      verseFontWeight: 400,
      headerFontWeight: 700,
      headerColor: '#ffffff',
      verseColor: '#ffffff',
      verseWidth: 100,
      verseHeight: 100,
      versePositionX: 50,
      versePositionY: 50,
      headerPositionX: 50,
      headerPositionY: 15,
      verseTextAlign: 'center',
      headerTextAlign: 'center',
      isManualFontSize: false
    };
    set({ bibleDisplaySettings: defaultSettings });
    return defaultSettings;
  }
}));

export default useSermonStore;