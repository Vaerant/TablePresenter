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
    <div className="bg-neutral-900/50 text-white flex flex-col overflow-hidden" style={{ height: '100vh' }}>

      <div className='flex lg:flex-row flex-col items-center h-full'>
        <div className="w-fit hidden sm:flex items-center justify-center flex-col gap-8 mt-6 lg:mt-0">
          <Image
            src={MessagePresenterLogo}
            alt="Message Presenter Logo"
            className="max-w-[40%] h-auto object-contain"
          />
          <div className='flex flex-col gap-2 max-w-lg items-center text-neutral-400'>
            <p className="text-center italic">
              "And whatsoever ye do in word or deed, do all in the name of the Lord Jesus, giving thanks to God and the Father by him."
            </p>
            <p className="text-sm font-bold text-center">
              Colossians 3:17 KJV
            </p>
          </div>
        </div>

        <div className="w-full md:w-fit h-full p-4 py-8 pb-16 flex flex-col items-center justify-center gap-3 lg:mr-12">
          <div className={`grow w-[400px] max-w-[90%] max-h-[175px] overflow-hidden text-base text-center rounded-lg hover:bg-neutral-700/60 active:bg-neutral-700/50 flex items-center justify-center gap-2.5 select-none relative transition-all duration-100
              ${activeView == 'BIBLE' ? 'bg-neutral-700/40 hover:bg-neutral-700/40' : 'bg-neutral-800/40'}
              `}
            onClick={() => { setActiveView('BIBLE'); router.push('/bible'); }}
          >
            <RiCrossFill className="sm:-ml-3.5" size={18} />
            <p className='hidden sm:block'>Bible</p>
          </div>
          <div className={`grow w-[400px] max-w-[90%] max-h-[175px] overflow-hidden text-base text-center rounded-lg hover:bg-neutral-700/60 active:bg-neutral-700/50 flex items-center justify-center gap-2.5 select-none relative transition-all duration-100
              ${activeView == 'SERMONS' ? 'bg-neutral-700/40 hover:bg-neutral-700/40' : 'bg-neutral-800/40'}
              `}
            onClick={() => { setActiveView('SERMONS'); router.push('/bible'); }}
          >
            <LuWheat className="sm:-ml-3.5" size={18} />
            <p className='hidden sm:block'>Tapes</p>
          </div>
          <div className={`grow w-[400px] max-w-[90%] max-h-[175px] overflow-hidden text-base text-center rounded-lg hover:bg-neutral-700/60 active:bg-neutral-700/50 flex items-center justify-center gap-2.5 select-none relative transition-all duration-100
              ${activeView == 'STREAMING' ? 'bg-neutral-700/40 hover:bg-neutral-700/40' : 'bg-neutral-800/40'}
              `}
            onClick={() => { setActiveView('STREAMING'); router.push('/bible'); }}
          >
            <FaChromecast className="sm:-ml-3.5" size={18} />
            <p className='hidden sm:block'>Streaming</p>
          </div>
        </div>
      </div>


    </div>
  );
}