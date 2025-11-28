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
    <div className="bg-transparent text-white flex" style={{ height: '100vh' }}>
      <div className="relative w-1/2 h-full overflow-hidden group flex items-center justify-center flex-col gap-24">
        <Image
          src={MessagePresenterLogo}
          alt="Message Presenter Logo"
          className="max-w-[50%] h-auto object-contain"
          // objectPosition="top"
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
      <div className="flex flex-col h-full w-1/2">
        <div className="flex w-full grow">
          <div className="relative grow overflow-hidden group cursor-pointer" onClick={() => router.push('/bible')}>
            <Image
              src={BibleImg}
              alt="Bible"
              fill
              priority
              className="object-cover hover:scale-105 transition-transform duration-300"
            />
            <div className="absolute inset-0 bg-black/50 group-hover:bg-black/30 flex items-end justify-center z-10 pointer-events-none transition-all duration-300">
              <h3 className="relative nav-title--top text-white text-2xl font-[100] tracking-[15px] uppercase mb-18 transition-all">Bible</h3>
            </div>
          </div>

          <div className="relative grow overflow-hidden group cursor-pointer" onClick={() => router.push('/table')}>
            <Image
              src={PillarImg}
              alt="Pillar of Fire"
              fill
              className="object-cover hover:scale-105 transition-transform duration-300"
              objectPosition="top"
            />
            <div className="absolute inset-0 bg-black/50 group-hover:bg-black/30 flex items-end justify-center z-10 pointer-events-none transition-all duration-300">
              <h3 className="relative nav-title--top text-white text-2xl font-[100] tracking-[15px] uppercase mb-18 transition-all">Sermons</h3>
            </div>
          </div>
        </div>

        <div className="relative grow overflow-hidden group cursor-pointer" onClick={() => router.push('/screens')}>
          <Image
            src={StreamingImg}
            alt="Streaming"
            fill
            priority
            className="object-cover hover:scale-105 transition-transform duration-300"
          />
          <div className="absolute inset-0 bg-black/50 group-hover:bg-black/30 flex items-center justify-start z-10 pointer-events-none transition-all duration-300">
            <h3 className="nav-title text-white text-2xl font-[100] tracking-[15px] uppercase ml-18 group-hover:ml-26 transition-all duration-300">Streaming</h3>
          </div>
        </div>
      </div>
    </div>
  );
}