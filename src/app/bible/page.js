'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

import useSermonStore from '@/stores/sermonStore';
import ResizablePanels from '@/components/ui/ResizablePanels';

import { IoSearchOutline } from "react-icons/io5";
import { FaLinesLeaning } from "react-icons/fa6";
import { LuLetterText } from "react-icons/lu";

import { CgCross } from "react-icons/cg";
import { RiCrossFill } from "react-icons/ri";
import { LuWheat } from "react-icons/lu";

import BibleList from '@/components/bible/list/BibleList';
import SermonList from '@/components/sermons/list/SermonList';

import BookView from '@/components/bible/BookView';
import SermonView from '@/components/sermons/SermonView';

export default function BiblePage() {

  const [activeTab, setActiveTab] = useState('BIBLE');

  const { activeView, setActiveView } = useSermonStore();

  return (
    <div className="text-white h-full">
      <ResizablePanels
        initialLeftWidth={40}
        orientation="vertical"
        leftPanel={
          <div className='flex flex-col bg-neutral-900 border-r border-neutral-800 h-full'>

            <div className="w-full p-4 flex items-center justify-evenly gap-3 border-b border-neutral-800">
              <div className={`flex-1 min-w-[4.5rem] min-h-10 text-sm text-center rounded hover:bg-neutral-700/60 flex items-center justify-center select-none relative transition-all duration-200
                  ${activeView == 'BIBLE' ? 'bg-neutral-700/40 hover:bg-neutral-700/40' : 'bg-neutral-800/40'}
                  `}
                onClick={() => setActiveView('BIBLE')}
              >
                <RiCrossFill className="absolute left-5 top-1/2 -translate-y-1/2" size={18} />
                <p>Bible</p>
              </div>
              <div className={`flex-1 min-w-[4.5rem] min-h-10 text-sm text-center rounded hover:bg-neutral-700/60 flex items-center justify-center select-none relative transition-all duration-200
                  ${activeView == 'SERMONS' ? 'bg-neutral-700/40 hover:bg-neutral-700/40' : 'bg-neutral-800/40'}
                  `}
                onClick={() => setActiveView('SERMONS')}
              >
                <LuWheat className="absolute left-5 top-1/2 -translate-y-1/2" size={18} />
                <p>Tapes</p>
              </div>
            </div>

            {activeView == 'BIBLE' && (
              <BibleList />
            )}

            {activeView == 'SERMONS' && (
              <SermonList />
            )}

          </div>
        }
        rightPanel={
          // <div className="flex flex-col h-full">
          //   {loading ? (
          //     <div className="flex-1 flex items-center justify-center bg-neutral-900">
          //       <div className="text-gray-400">Loading book...</div>
          //     </div>
          //   ) : (
          //     <BookView />
          //   )}
          // </div>
          <div className="flex flex-col h-full">
            {activeView == 'BIBLE' && (
              <BookView />
            )}
            {activeView == 'SERMONS' && (
              <SermonView />
            )}
          </div>
        }
      />

      {/* <SearchModal isOpen={isSearchModalOpen} onClose={() => setIsSearchModalOpen(false)} /> */}

      {/* <BibleControlPanel /> */}
    </div>
  );
}