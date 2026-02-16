import { create } from 'zustand';

const useSermonStore = create((set, get) => ({

  activeView: 'BIBLE',

  books: [],
  activeBook: null,
  activeBookData: null,
  activeChapter: 1,
  activeChapterData: null,
  activeVerse: null,
  activeVerseData: null,
  selectedVerses: [],
  highlightedVerses: [],

  // Sermon selection state
  selectedParagraph: null,

  // Display settings (used when broadcasting to presenter window)
  displaySettings: {
    enabled: true,
    showTitle: true,
    showDate: true,
    showContent: true,
  },

  sermons: [],
  activeSermon: null,
  activeSermonData: null,

  setActiveView: (view) => set({ activeView: view }),

  setBooks: (books) => set({ books: books }),
  setActiveBook: (book) => set({ activeBook: book }),
  setActiveBookData: (data) => set({ activeBookData: data }),
  setActiveChapter: (chapter) => set({ activeChapter: chapter }),
  setActiveChapterData: (data) => set({ activeChapterData: data }),
  setActiveVerse: (verse) => set({ activeVerse: verse }),
  setActiveVerseData: (data) => set({ activeVerseData: data }),
  setSelectedVerses: (verses) => set({ selectedVerses: verses }),
  clearSelectedVerses: () => set({ selectedVerses: [] }),
  setHighlightedVerses: (verses) => set({ highlightedVerses: verses }),

  setSelectedParagraph: (paragraph) => set({ selectedParagraph: paragraph, selectedVerses: [] }),
  clearSelectedParagraph: () => set({ selectedParagraph: null }),
  setDisplaySettings: (settings) => set({ displaySettings: settings }),

  setSermons: (sermons) => set({ sermons: sermons }),
  setActiveSermon: (sermon, data = null) => set({ activeSermon: sermon, activeSermonData: data, selectedParagraph: null, selectedVerses: [] }),
  setActiveSermonData: (data) => set({ activeSermonData: data }),

}));

export default useSermonStore;