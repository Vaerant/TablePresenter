'use client';

import { useEffect, useState, useMemo } from 'react';
import { FiMinus, FiSquare, FiCopy, FiX } from 'react-icons/fi';

export default function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);

  // get current url path to determine if we're in the presenter window
  const path = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return window.location.pathname;
  }, []);

  const hasWindowControls =
    typeof window !== 'undefined' &&
    window.electronAPI &&
    window.electronAPI.windowControls;

  useEffect(() => {
    if (!hasWindowControls) return;

    let cleanup;

    (async () => {
      try {
        const value = await window.electronAPI.windowControls.isMaximized();
        setIsMaximized(Boolean(value));
      } catch {
        // ignore
      }

      cleanup = window.electronAPI.windowControls.onMaximizeChanged((value) => {
        setIsMaximized(Boolean(value));
      });
    })();

    return () => {
      if (typeof cleanup === 'function') cleanup();
    };
  }, [hasWindowControls]);

  const minimize = async (e) => {
    e?.stopPropagation?.();
    if (!hasWindowControls) return;
    await window.electronAPI.windowControls.minimize();
  };

  const toggleMaximize = async (e) => {
    e?.stopPropagation?.();
    if (!hasWindowControls) return;
    const value = await window.electronAPI.windowControls.toggleMaximize();
    setIsMaximized(Boolean(value));
  };

  const close = async (e) => {
    e?.stopPropagation?.();
    if (!hasWindowControls) return;
    await window.electronAPI.windowControls.close();
  };

  return (
    <div
      className={`header-drag h-[38px] w-full flex items-center justify-between text-white select-none !bg-neutral-900/60
        ${path === '/' ? 'bg-neutral-900/60' : 'bg-neutral-800'}
        `}
      onDoubleClick={toggleMaximize}
    >
      <div className="text-xs text-neutral-600 ml-3 hidden sm:block">Message Presenter</div>

      <div className="flex items-center justify-end grow gap-1 h-full">
        <button
          type="button"
          className="no-drag h-full w-14 hover:bg-neutral-700/60 flex items-center justify-center"
          aria-label="Minimize"
          onClick={minimize}
        >
          <FiMinus size={14} />
        </button>

        <button
          type="button"
          className="no-drag h-full w-14 hover:bg-neutral-700/60 flex items-center justify-center"
          aria-label={isMaximized ? 'Restore' : 'Maximize'}
          onClick={toggleMaximize}
        >
          {isMaximized ? <FiCopy size={14} /> : <FiSquare size={14} />}
        </button>

        <button
          type="button"
          className="no-drag h-full w-14 hover:bg-red-600 flex items-center justify-center"
          aria-label="Close"
          onClick={close}
        >
          <FiX size={18} />
        </button>
      </div>
    </div>
  );
}
