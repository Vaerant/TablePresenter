import React, { useState, useEffect, forwardRef } from 'react';
import { FiChevronRight } from 'react-icons/fi';
import { MdKeyboardArrowRight } from "react-icons/md";
import { MdChevronRight } from "react-icons/md";

import useSermonStore from '@/stores/sermonStore';

const ListTitle = forwardRef(({ data, onPress, isActive = false, isSelected = false }, ref) => {

  const handleSermonClick = () => {
    console.log('ListTitle clicked:', data);
    if (isActive) return; // Do nothing if already active
    onPress(data);
  };

  return (
    <div ref={isSelected ? ref : null} className={`flex flex-col h-full`}>
      <div 
        className={`flex items-stretch cursor-pointer h-full`}
        onClick={handleSermonClick}
      >
        <div className={`flex-1 flex flex-col justify-center min-w-0 h-full bg-neutral-900 border-b border-neutral-800 p-2 px-3 rounded
            ${
            isActive ? '!bg-neutral-700/60' : ''
            }
            ${
            isSelected
              ? 'ring-1 ring-neutral-500/60'
              : 'hover:bg-neutral-800'
            }
          `}>
          <h3 className={`font-medium text-white`} title={(data?.title ?? '').toString()}>
            {(data?.title ?? '').toString()}
          </h3>
          <p className="text-sm text-gray-400" title={(data?.date ?? '').toString()}>{(data?.date ?? '').toString()}</p>
        </div>
      </div>
    </div>
  );

  // return (
  //   <div className="flex flex-col w-full p-2 border-b border-neutral-700 hover:bg-neutral-900 cursor-pointer" onClick={() => onPress(data)}>
  //     <h2 className="text-base font-semibold">{data.title}</h2>
  //     <p className="text-sm text-gray-400">{data.date}</p>
  //   </div>
  // );
});

ListTitle.displayName = 'ListTitle';

export default ListTitle;
