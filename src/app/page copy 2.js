'use client';

import { useState, useMemo, useEffect, useRef, use } from 'react';
import useSermonStore from '@/stores/sermonStore';

import { useRouter } from 'next/navigation';

import { sermonSearch } from '@/lib/sermonSearch';
import { bibleSearch } from '@/lib/bibleSearch';

import { FiSearch, FiBook, FiFileText, FiType } from 'react-icons/fi';
import { TbBlockquote, TbBible } from "react-icons/tb";

export default function Home() {
  const router = useRouter();

  return (
    <div className="bg-black text-white flex flex-col" style={{ height: '100vh' }}>
      <div className="flex items-center justify-center gap-8 h-full w-full">

        <button
          onClick={() => router.push('/bible')}
          className="h-[500px] w-[300px] flex flex-col items-center justify-center bg-neutral-950 hover:bg-neutral-900 rounded-lg cursor-pointer"
        >
          <span className="text-2xl font-thin tracking-widest uppercase">Bible</span>
        </button>
        <button
          onClick={() => router.push('/table')}
          className="h-[500px] w-[300px] flex flex-col items-center justify-center bg-neutral-950 hover:bg-neutral-900 rounded-lg cursor-pointer"
        >
          <span className="text-2xl font-thin tracking-widest uppercase">Table</span>
        </button>
        <button
          onClick={() => router.push('/screens')}
          className="h-[500px] w-[300px] flex flex-col items-center justify-center bg-neutral-950 hover:bg-neutral-900 rounded-lg cursor-pointer"
        >
          <span className="text-2xl font-thin tracking-widest uppercase">Screens</span>
        </button>

      </div>
    </div>
  );
}