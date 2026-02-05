'use client';

import { useState } from 'react';
import Image from 'next/image';

import useSermonStore from '@/stores/sermonStore';

// Use static imports so paths work in dev and packaged Electron
import BibleImg from '../../public/img/Bible.jpg';
import PillarImg from '../../public/img/PillarOfFire.jpg';
import StreamingImg from '../../public/img/Streaming2.jpg';
import MessagePresenterLogo from '../../public/img/MessagePresenter_logo.svg';
import Cloud from '../../public/img/Cloud.jpg';

import { RiCrossFill } from "react-icons/ri";
import { LuWheat } from "react-icons/lu";
import { FaChromecast } from "react-icons/fa";

import { useRouter } from 'next/navigation';
import './navHover.css';


export default function Home() {
  const router = useRouter();
  const [hoveredNav, setHoveredNav] = useState(null);

  const { activeView, setActiveView } = useSermonStore()

  return (
    <div className="bg-transparent text-white flex flex-col md:flex-row" style={{ height: '100vh' }}>

      <div className="w-full p-4 flex flex-col items-center justify-center gap-3 border-b border-neutral-800">
        <div className={`h-12 w-[350px] text-sm text-center rounded hover:bg-neutral-700/60 flex items-center justify-center select-none relative transition-all duration-200
            ${activeView == 'BIBLE' ? 'bg-neutral-700/40 hover:bg-neutral-700/40' : 'bg-neutral-800/40'}
            `}
          onClick={() => setActiveView('BIBLE')}
        >
          <RiCrossFill className="absolute left-5 top-1/2 -translate-y-1/2" size={18} />
          <p>Bible</p>
        </div>
        <div className={`h-12 w-[350px] text-sm text-center rounded hover:bg-neutral-700/60 flex items-center justify-center select-none relative transition-all duration-200
            ${activeView == 'SERMONS' ? 'bg-neutral-700/40 hover:bg-neutral-700/40' : 'bg-neutral-800/40'}
            `}
          onClick={() => setActiveView('SERMONS')}
        >
          <LuWheat className="absolute left-5 top-1/2 -translate-y-1/2" size={18} />
          <p>Tapes</p>
        </div>
        <div className={`h-12 w-[350px] text-sm text-center rounded hover:bg-neutral-700/60 flex items-center justify-center select-none relative transition-all duration-200
            ${activeView == 'STREAMING' ? 'bg-neutral-700/40 hover:bg-neutral-700/40' : 'bg-neutral-800/40'}
            `}
          onClick={() => setActiveView('STREAMING')}
        >
          <FaChromecast className="absolute left-5 top-1/2 -translate-y-1/2" size={18} />
          <p>Streaming</p>
        </div>
      </div>

    </div>
  );
}