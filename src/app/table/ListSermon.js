import React, { useState, useEffect, forwardRef } from 'react';
import { FiChevronRight } from 'react-icons/fi';
import { MdKeyboardArrowRight } from "react-icons/md";
import { MdChevronRight } from "react-icons/md";

import useSermonStore from '@/stores/sermonStore';

const ListSermon = forwardRef(({ data, onPress, isActive = false, isSelected = false, isSmartSelected = false }, ref) => {
  const handleSermonClick = () => {
    if (isActive) return; // Do nothing if already active
    onPress(data);
  };

  return (
    <div ref={(isSelected || isSmartSelected) ? ref : null} className={`flex flex-col px-2`}>
      <div 
        className={`flex items-center cursor-pointer`}
        onClick={handleSermonClick}
      >
        <div className={`flex-1 p-2 px-3 rounded flex items-center justify-between bg-neutral-900 border border-neutral-900
            ${
            isActive ? '!bg-neutral-700/60' : ''
            }
            ${
            (isSelected || isSmartSelected)
              ? '!border-neutral-500/50'
              : 'hover:bg-neutral-800'
            }
          `}>
          <div className="flex flex-col">
            <h3 className={`font-medium text-white`}>
              {data.title}
            </h3>
            <p className="text-sm text-neutral-400">
              {data.date}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
});

ListSermon.displayName = 'ListSermon';

export default ListSermon;
