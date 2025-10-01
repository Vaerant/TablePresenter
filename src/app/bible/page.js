'use client';

import { useState, useMemo, useEffect, useRef, use } from 'react';
import useSermonStore from '@/stores/sermonStore';

import { sermonSearch } from '@/lib/sermonSearch';
import { bibleSearch } from '@/lib/bibleSearch';

import { FiSearch, FiBook, FiFileText, FiType } from 'react-icons/fi';
import { TbBlockquote, TbBible } from "react-icons/tb";

export default function Home() {
 
  useEffect(() => {
    const fetchBooks = async () => {
      try {
        const books = await bibleSearch.getAllBooks();
        console.log(books);
      } catch (error) {
        console.error("Error fetching books:", error);
      }
    };

    fetchBooks();
  }, []);

  return (
    <div className="bg-black text-white flex flex-col" style={{ height: '100vh' }}>
      
    </div>
  );
}