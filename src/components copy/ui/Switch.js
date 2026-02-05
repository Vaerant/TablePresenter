"use client";
import React, { forwardRef } from 'react';

const Switch = forwardRef(({
  checked = false, 
  onChange, 
  disabled = false, 
  size = 'md', 
  className = '',
  label = '',
  id,
  // Color customization props
  trackColorChecked = 'bg-blue-600 hover:bg-blue-700',
  trackColorUnchecked = 'bg-neutral-700 hover:bg-neutral-600',
  thumbColor = 'bg-white',
  // Add mouse event props for tooltip compatibility
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur
}, ref) => {
  const sizeClasses = {
    sm: {
      track: 'w-8 h-4',
      thumb: 'w-3 h-3',
      translate: 'translate-x-4'
    },
    md: {
      track: 'w-11 h-6',
      thumb: 'w-5 h-5',
      translate: 'translate-x-5'
    },
    lg: {
      track: 'w-14 h-7',
      thumb: 'w-6 h-6',
      translate: 'translate-x-7'
    }
  };

  const currentSize = sizeClasses[size];

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {label && (
        <label 
          htmlFor={id} 
          className="text-sm text-white/90 cursor-pointer select-none"
        >
          {label}
        </label>
      )}
      <button
        ref={ref}
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={(e) => {
          if (!disabled && onChange) {
            onChange(!checked, e);
          }
        }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onFocus={onFocus}
        onBlur={onBlur}
        className={`
          relative inline-flex items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none
          ${currentSize.track}
          ${checked ? trackColorChecked : trackColorUnchecked}
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
      >
        <span
          className={`
            inline-block rounded-full shadow-lg transform transition-transform duration-200 ease-in-out
            ${currentSize.thumb}
            ${thumbColor}
            ${checked ? currentSize.translate : 'translate-x-0.5'}
          `}
        />
      </button>
    </div>
  );
});

export default Switch;
