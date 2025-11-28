"use client";
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

import BibleImg from '../../public/img/Bible.jpg';
import PillarImg from '../../public/img/PillarOfFire.jpg';
import StreamingImg from '../../public/img/Streaming2.jpg';
import MessagePresenterLogo from '../../public/img/MessagePresenter_logo.svg';

import Switch from '../components/ui/Switch';
import { Tooltip } from '../components/ui/Tooltip'; // added

import { HiMenuAlt3 } from "react-icons/hi";
import { TbBook } from "react-icons/tb";
import { TbBrandGooglePodcasts } from "react-icons/tb";
import { FaChromecast } from "react-icons/fa";
import { FiSettings } from "react-icons/fi";

import './navHover.css';

const BottomNav = () => {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('BIBLE');
  const [navExpanded, setNavExpanded] = useState(false);
  const [streamingEnabled, setStreamingEnabled] = useState(false);

  return (
    <div className="relative w-full h-[40px] bg-neutral-900 flex items-center justify-between z-50 border-t border-neutral-800 pr-1">
      {/* <div className="text-white font-medium">Table Quote Presenter</div> */}
      <Image
        src={MessagePresenterLogo}
        alt="Message Presenter Logo"
        className="w-auto h-[20px] object-contain ml-6 cursor-pointer"
        // objectPosition="top"
        onClick={() => router.push('/')}
      />
      <div className="w-full flex items-center justify-end gap-2 border-b border-neutral-800">
        <div className={`px-4 min-h-7 text-xs text-center rounded hover:bg-neutral-700/60 flex items-center justify-center select-none
            ${activeTab == 'BIBLE' ? 'bg-neutral-800/90 hover:bg-neutral-800/90' : ''}
            `}
          onClick={() => setActiveTab('BIBLE')}
        >
          Bible
        </div>
        <div className={`px-4 min-h-7 text-xs text-center rounded hover:bg-neutral-700/60 flex items-center justify-center select-none
            ${activeTab == 'SERMONS' ? 'bg-neutral-800/90 hover:bg-neutral-800/90' : ''}
            `}
          onClick={() => setActiveTab('SERMONS')}
        >
          Tapes
        </div>
        <div className='w-[1px] h-4 bg-white/10'></div>
        <div className={`px-4 min-h-7 text-xs text-center rounded hover:bg-neutral-700/60 flex items-center justify-center select-none gap-2
            ${streamingEnabled ? 'bg-blue-900/20 hover:bg-blue-900/70' : ''}
            `}
        >
          <p className={`${streamingEnabled ? 'text-blue-500' : 'text-white/90'}`}>Streaming Mode</p>
          <Tooltip
            content={streamingEnabled ? "Disable streaming" : "Enable streaming"}
            placement="top"
          >
            <Switch
              checked={streamingEnabled}
              onChange={(checked, e) => {
                setStreamingEnabled(checked);
                e.stopPropagation();
              }}
              size="sm"
            />
          </Tooltip>
        </div>
        <div className={`px-4 min-h-7 text-xs text-center rounded hover:bg-neutral-700/60 flex items-center justify-center select-none
            ${activeTab == 'STREAMING' ? 'bg-neutral-800/90 hover:bg-neutral-800/90' : ''}
            `}
          onClick={() => setActiveTab('STREAMING')}
        >
          Stream Settings
        </div>
        <Tooltip
          content="Expand Stream Screens"
          placement="top-end"
        >
          <button className="p-2 hover:bg-neutral-800/90 rounded transition-colors" onClick={() => setNavExpanded(!navExpanded)}>
            <FaChromecast
              className="text-white/70 hover:text-white transition-colors"
            />
          </button>
        </Tooltip>
        <Tooltip
          content="Settings"
          placement="top-end"
        >
          <button className="p-2 hover:bg-neutral-800/90 rounded transition-colors">
            <FiSettings
              className="text-white/70 hover:text-white transition-colors"
            />
          </button>
        </Tooltip>
      </div>

      <div className={`absolute bottom-full w-full bg-neutral-900/40 backdrop-blur-md border-t border-neutral-800 transition-all duration-300 overflow-hidden flex items-center justify-center gap-4
        ${navExpanded ? 'min-h-40 max-h-40' : 'min-h-0 max-h-0'}
      `}>
      </div>
    </div>
  );
};

const Structure = ({ children, hideNav = false }) => {
  return (
    <div className="h-screen flex flex-col antialiased max-h-screen overflow-hidden">
      {/* <div className="flex-grow overflow-hidden" style={{ height: 'calc(100vh - 50px)' }}> */}
      <div className="flex-grow overflow-hidden max-h-screen">
        {children}
      </div>
      {!hideNav && <BottomNav />}
    </div>
  );
};

export default Structure;
