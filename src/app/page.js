'use client';

import { useState } from 'react';
import Image from 'next/image';

// Use static imports so paths work in dev and packaged Electron
import BibleImg from '../../public/img/Bible.jpg';
import PillarImg from '../../public/img/PillarOfFire.jpg';
import StreamingImg from '../../public/img/Streaming2.jpg';
import MessagePresenterLogo from '../../public/img/MessagePresenter_logo.svg';
import Cloud from '../../public/img/Cloud.jpg';

import { useRouter } from 'next/navigation';
import './navHover.css';

export default function Home() {
  const router = useRouter();
  const [hoveredNav, setHoveredNav] = useState(null);

  return (
    <div className="bg-transparent text-white flex flex-col md:flex-row" style={{ height: '100vh' }}>

      <div className='flex md:flex-col md:min-w-[35%] md:max-w-[35%] lg:min-w-[45%] lg:max-w-[45%] border-r border-neutral-800 md:max-h-full max-h-[30vh]'>
        <Image
          src={Cloud}
          alt="Cloud"
          className="object-cover w-full h-full"
        />
      </div>

      <div className='flex flex-col items-center justify-between grow h-full min-h-[70vh] overflow-auto'>
        
        <div className='relative flex justify-evenly gap-2 h-full w-full'>
          {/* Background images with gradient overlay */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <Image
              src={BibleImg}
              alt="Bible background"
              fill
              className={`object-cover transition-opacity duration-500 ${hoveredNav === 'bible' ? 'opacity-100' : 'opacity-0'}`}
              objectPosition={'75px'}
            />
            <Image
              src={PillarImg}
              alt="Sermons background"
              fill
              className={`object-cover transition-opacity duration-500 ${hoveredNav === 'sermons' ? 'opacity-100' : 'opacity-0'}`}
              // style={{ transform: 'scale(1.05)', transformOrigin: 'top center' }}
              objectPosition={'50px top'}
            />
            <Image
              src={StreamingImg}
              alt="Streaming background"
              fill
              className={`object-cover transition-opacity duration-500 ${hoveredNav === 'streaming' ? 'opacity-100' : 'opacity-0'}`}
              objectPosition={'60px'}
            />
            {/* Gradient overlay */}
            <div
              className={`absolute inset-0 transition-opacity duration-500 gradient-overlay`}
            />
          </div>

          <div className='flex flex-col md:flex-row justify-evenly gap-2 lg:gap-16 pt-[155px]'>
            <div className='flex flex-col gap-2 h-full '>
              <h2 className='relative font-light uppercase tracking-[10px] mb-4 text-center'>Navigate</h2>
              <div className='relative flex flex-col gap-2 items-center'>
                <button
                  className='hover:bg-black/40 w-[200px] md:backdrop-blur-sm text-white px-4 py-2 rounded'
                  onClick={() => router.push('/bible')}
                  onMouseEnter={() => setHoveredNav('bible')}
                  onMouseLeave={() => setHoveredNav(null)}
                >
                  Bible
                </button>
                <button
                  className='hover:bg-black/40 w-[200px] md:backdrop-blur-sm text-white px-4 py-2 rounded'
                  onClick={() => router.push('/table')}
                  onMouseEnter={() => setHoveredNav('sermons')}
                  onMouseLeave={() => setHoveredNav(null)}
                >
                  Sermons
                </button>
                <button
                  className='hover:bg-black/40 w-[200px] md:backdrop-blur-sm text-white px-4 py-2 rounded'
                  onClick={() => router.push('/streaming')}
                  onMouseEnter={() => setHoveredNav('streaming')}
                  onMouseLeave={() => setHoveredNav(null)}
                >
                  Streaming
                </button>
              </div>
            </div>

            <div className={`lg:flex flex-col hidden 
              ${hoveredNav ? 'opacity-0 pointer-events-none' : 'opacity-100 pointer-events-auto'} transition-opacity duration-300
              `}>
              <div className='border-l-2 border-white h-[30%] opacity-10'></div>
              <div className='border-l-2 border-dashed border-white h-[20%] opacity-10'></div>
            </div>

            <div className={`flex flex-col gap-2 h-full md:border-none border-t border-neutral-700 pt-8 md:pt-0  pb-8
              ${hoveredNav ? 'opacity-0 pointer-events-none' : 'opacity-100 pointer-events-auto'} transition-opacity duration-300
            `}>
              <h2 className='relative font-light mb-4 text-center'>Recent</h2>
              <p className='hover:bg-black/40 w-[200px] backdrop-blur-md text-white px-4 py-2 rounded text-center cursor-default text-sm italic'>No recent items</p>
            </div>
          </div>
        </div>

        <div className="h-full overflow-hidden group flex items-center justify-center flex-col gap-8 p-12 border-t border-neutral-800 sticky bottom-0 bg-neutral-950 z-20 max-h-[15%] md:max-h-[50%]">
          <Image
            src={MessagePresenterLogo}
            alt="Message Presenter Logo"
            className="max-w-[40%] min-w-[200px] h-auto object-contain"
          />
          <div className='flex-col gap-2 max-w-lg items-center text-neutral-400 hidden md:flex'>
            <p className="text-center italic">
              "And whatsoever ye do in word or deed, do all in the name of the Lord Jesus, giving thanks to God and the Father by him."
            </p>
            <p className="text-sm font-bold">
              Colossians 3:17 KJV
            </p>
          </div>
        </div>


        {/* <div className='flex'>
          <Image
            src={BibleImg}
            alt="Bible"
            className="object-cover w-1/3"
          />
          <Image
            src={PillarImg}
            alt="Pillar of Fire"
            className="object-cover w-1/3"
          />
          <Image
            src={StreamingImg}
            alt="Streaming"
            className="object-cover w-1/3"
          />
        </div> */}

        {/* <div className='flex flex-col gap-6 grow h-full max-h-[70%] w-full'>
          <div className="relative w-full h-full grow overflow-hidden group cursor-pointer rounded-md" onClick={() => router.push('/bible')}>
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
          <div className="relative w-full h-full grow overflow-hidden group cursor-pointer rounded-md" onClick={() => router.push('/table')}>
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
        </div> */}

      </div>

    </div>
  );
}