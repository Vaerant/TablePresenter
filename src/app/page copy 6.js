'use client';

import Image from 'next/image';

// Use static imports so paths work in dev and packaged Electron
import BibleImg from '../../public/img/Bible.jpg';
import PillarImg from '../../public/img/PillarOfFire.jpg';
import StreamingImg from '../../public/img/Streaming2.jpg';
import MessagePresenterLogo from '../../public/img/MessagePresenter_logo.svg';

import { useRouter } from 'next/navigation';
import './navHover.css';

export default function Home() {
  const router = useRouter();
  return (
    <div className="bg-transparent text-white flex flex-col items-center" style={{ height: '100vh' }}>
      <div className="relative overflow-hidden group flex items-center justify-center flex-col gap-8 p-12">
        <Image
          src={MessagePresenterLogo}
          alt="Message Presenter Logo"
          className="max-w-[30%] min-w-[150px] h-auto object-contain"
        />
        <div className='flex flex-col gap-2 max-w-lg items-center text-neutral-400'>
          <p className="text-center italic">
            "And whatsoever ye do in word or deed, do all in the name of the Lord Jesus, giving thanks to God and the Father by him."
          </p>
          <p className="text-sm font-bold">
            Colossians 3:17 KJV
          </p>
        </div>
      </div>
      <div className="flex flex-col lg:flex-row gap-4 w-full grow p-4 px-8 md:px-24 pb-12">
        <div className="relative grow overflow-hidden group cursor-pointer mr-2 rounded-md" onClick={() => router.push('/bible')}>
          <Image
            src={BibleImg}
            alt="Bible"
            fill
            priority
            className="object-cover hover:scale-105 transition-transform duration-300"
          />
          <div className="absolute inset-0 bg-black/50 group-hover:bg-black/30 flex items-end justify-center z-10 pointer-events-none transition-all duration-300">
            <h3 className="relative nav-title--top text-white text-xl font-[100] tracking-[15px] uppercase mb-18 transition-all">Bible</h3>
          </div>
        </div>

        <div className="relative grow overflow-hidden group cursor-pointer rounded-md" onClick={() => router.push('/table')}>
          <Image
            src={PillarImg}
            alt="Pillar of Fire"
            fill
            className="object-cover hover:scale-105 transition-transform duration-300"
            objectPosition="top"
          />
          <div className="absolute inset-0 bg-black/50 group-hover:bg-black/30 flex items-end justify-center z-10 pointer-events-none transition-all duration-300">
            <h3 className="relative nav-title--top text-white text-xl font-[100] tracking-[15px] uppercase mb-18 transition-all">Sermons</h3>
          </div>
        </div>

        <div className='flex flex-col mx-16'>
          <div className='border-l-2 border-white h-[30%] opacity-10'></div>
          <div className='border-l-2 border-dashed border-white h-[20%] opacity-10'></div>
        </div>

        <div className='flex flex-col items-center p-4'>
          <div className='flex flex-col gap-2'>
            <h2 className='font-light uppercase tracking-[10px] mb-4'>Technical</h2>
            <button
              className='hover:bg-neutral-900 text-white px-4 py-2 rounded transition'
              onClick={() => router.push('/settings')}
            >
              Settings
            </button>
          </div>
        </div>

        {/* <div className="relative grow overflow-hidden group cursor-pointer" onClick={() => router.push('/screens')}>
          <Image
            src={StreamingImg}
            alt="Streaming"
            fill
            className="object-cover hover:scale-105 transition-transform duration-300"
            objectPosition="top"
          />
          <div className="absolute inset-0 bg-black/50 group-hover:bg-black/30 flex items-end justify-center z-10 pointer-events-none transition-all duration-300">
            <h3 className="relative nav-title--top text-white text-xl font-[100] tracking-[15px] uppercase mb-18 transition-all">Streaming</h3>
          </div>
        </div> */}
      </div>
    </div>
  );
}