import { create } from 'zustand';

const useSermonStore = create((set, get) => ({

  activeView: 'HOME',

  books: [],
  activeBook: null,
  activeBookData: null,
  activeChapter: 1,
  activeChapterData: null,
  activeVerse: null,
  activeVerseData: null,
  selectedVerses: [],
  highlightedVerses: [],

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
  setHighlightedVerses: (verses) => set({ highlightedVerses: verses }),

  setSermons: (sermons) => set({ sermons: sermons }),
  setActiveSermon: (sermon) => set({ activeSermon: sermon }),
  setActiveSermonData: (data) => set({ activeSermonData: data }),

}));

export default useSermonStore;