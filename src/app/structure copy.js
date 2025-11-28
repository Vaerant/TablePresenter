"use client";

import { useRouter } from 'next/navigation';
import Image from 'next/image';

import BibleImg from '../../public/img/Bible.jpg';
import PillarImg from '../../public/img/PillarOfFire.jpg';
import StreamingImg from '../../public/img/Streaming2.jpg';
import MessagePresenterLogo from '../../public/img/MessagePresenter_logo.svg';

import { TbBook } from "react-icons/tb";
import { TbBrandGooglePodcasts } from "react-icons/tb";
import { FaChromecast } from "react-icons/fa";

import './navHover.css';

const TopBarNav = () => {
  const router = useRouter();
  return (
    <div className="w-full h-[70px] bg-neutral-900 flex items-center justify-between z-50 border-b border-neutral-800">
      {/* <div className="text-white font-medium">Table Quote Presenter</div> */}
      <Image
        src={MessagePresenterLogo}
        alt="Message Presenter Logo"
        className="w-auto h-[40px] object-contain ml-6"
        // objectPosition="top"
      />
      <div className="flex items-center">
        <div className="h-[70px] min-w-[250px] hover:min-w-[350px] transition-width duration-300 relative grow overflow-hidden group cursor-pointer" onClick={() => router.push('/bible')}>
          <Image
            src={BibleImg}
            alt="Bible"
            fill
            priority
            className="object-cover hover:scale-105 transition-transform duration-300"
          />
          <div className="absolute h-full w-full bg-black/70 group-hover:bg-black/30 flex items-center justify-center z-10 pointer-events-none transition-all duration-300 top-1/2 transform -translate-y-1/2">
            <h3 className="nav-title-mini relative text-white text-base font-[400] ml-0 group-hover:ml-6 tracking-[7px] uppercase transition-all">Bible</h3>
          </div>
        </div>
        <div className="h-[70px] min-w-[250px] hover:min-w-[350px] transition-width duration-300 relative grow overflow-hidden group cursor-pointer" onClick={() => router.push('/table')}>
          <Image
            src={PillarImg}
            alt="Sermons"
            fill
            priority
            // className="object-cover hover:scale-105 transition-transform duration-300"
            className="object-cover object-[0_-0px] hover:object-[0_-0px] hover:scale-105 transition-all duration-300"
            // objectPosition="0 -30px"
          />
          <div className="absolute h-full w-full bg-black/70 group-hover:bg-black/30 flex items-center justify-center z-10 pointer-events-none transition-all duration-300 top-1/2 transform -translate-y-1/2">
            <h3 className="nav-title-mini relative text-white text-base font-[400] ml-0 group-hover:ml-6 tracking-[7px] uppercase transition-all">Sermons</h3>
          </div>
        </div>
        <div className="h-[70px] min-w-[250px] hover:min-w-[350px] transition-width duration-300 relative grow overflow-hidden group cursor-pointer" onClick={() => router.push('/screens')}>
          <Image
            src={StreamingImg}
            alt="Streaming"
            fill
            priority
            className="object-cover hover:scale-105 transition-transform duration-300"
          />
          <div className="absolute h-full w-full bg-black/70 group-hover:bg-black/30 flex items-center justify-center z-10 pointer-events-none transition-all duration-300 top-1/2 transform -translate-y-1/2">
            <h3 className="nav-title-mini relative text-white text-base font-[400] ml-0 group-hover:ml-6 tracking-[7px] uppercase transition-all">Streaming</h3>
          </div>
        </div>
      </div>
    </div>
  );
};

const Structure = ({ children, hideNav = false }) => {
  return (
    <div className="h-screen flex flex-col antialiased">
      {!hideNav && <TopBarNav />}
      <div className="flex-grow overflow-hidden" style={{ height: 'calc(100vh - 50px)' }}>
        {children}
      </div>
    </div>
  );
};

export default Structure;
