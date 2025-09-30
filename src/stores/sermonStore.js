import { create } from 'zustand';

const useSermonStore = create((set, get) => ({
  activeSermon: null,
  selectedParagraph: null,
  displaySettings: {
    enabled: true,
    showTitle: true,
    showDate: true,
    showContent: true
  },

  setActiveSermon: (sermon) => set({ activeSermon: sermon }),

  setSelectedParagraph: (paragraph) => {
    set({ selectedParagraph: paragraph });
  },

  clearSelectedParagraph: () => {
    set({ selectedParagraph: null });
  },

  setDisplaySettings: (settings) => {
    set({ displaySettings: settings });
    // Don't clear or send paragraph data here - let the display page handle visibility
    // The paragraph remains selected in the store regardless of display settings
  }
}));

export default useSermonStore;