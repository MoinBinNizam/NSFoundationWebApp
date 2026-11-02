import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, ArrowLeftRight } from 'lucide-react';
import { usePreferences } from '../context/PreferencesContext';

interface TableScrollControlsProps {
  containerRef: React.RefObject<HTMLElement | null>;
  className?: string;
  label?: string;
}

export const TableScrollControls: React.FC<TableScrollControlsProps> = ({
  containerRef,
  className = '',
  label,
}) => {
  const { language } = usePreferences();
  const isBn = language === 'bn';
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const checkScroll = () => {
      const scrollable = el.scrollWidth > el.clientWidth + 5;
      setHasOverflow(scrollable);
      setCanScrollLeft(el.scrollLeft > 5);
      setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 5);
    };

    checkScroll();
    el.addEventListener('scroll', checkScroll, { passive: true });
    window.addEventListener('resize', checkScroll);

    const observer = new ResizeObserver(checkScroll);
    observer.observe(el);

    return () => {
      el.removeEventListener('scroll', checkScroll);
      window.removeEventListener('resize', checkScroll);
      observer.disconnect();
    };
  }, [containerRef]);

  const handleScroll = (direction: 'left' | 'right') => {
    const el = containerRef.current;
    if (!el) return;
    const distance = Math.max(300, Math.round(el.clientWidth * 0.65));
    el.scrollBy({
      left: direction === 'left' ? -distance : distance,
      behavior: 'smooth',
    });
  };

  // If table does not overflow, hide or keep subtle
  if (!hasOverflow) {
    return null;
  }

  return (
    <div
      className={`inline-flex items-center gap-1.5 bg-slate-900/90 border border-slate-700/80 rounded-xl p-1 shadow-md text-xs backdrop-blur-md ${className}`}
      title={isBn ? 'টেবিলের ডাটা ডানে-বামে স্ক্রল করুন' : 'Scroll table columns horizontally'}
    >
      <div className="flex items-center gap-1 px-2 text-slate-400 font-medium text-[11px] select-none">
        <ArrowLeftRight size={13} className="text-blue-400" />
        <span className="hidden sm:inline">
          {label || (isBn ? 'কলাম স্ক্রল:' : 'Table Scroll:')}
        </span>
      </div>

      <button
        type="button"
        disabled={!canScrollLeft}
        onClick={() => handleScroll('left')}
        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all disabled:opacity-30 disabled:pointer-events-none bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 border border-slate-700/60 shadow-sm"
        aria-label={isBn ? 'বামে স্ক্রল' : 'Scroll Left'}
        title={isBn ? 'বামে স্ক্রল করুন' : 'Scroll Left'}
      >
        <ChevronLeft size={14} className="text-blue-400" />
        <span>{isBn ? 'বামে' : 'Left'}</span>
      </button>

      <button
        type="button"
        disabled={!canScrollRight}
        onClick={() => handleScroll('right')}
        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all disabled:opacity-30 disabled:pointer-events-none bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 border border-slate-700/60 shadow-sm"
        aria-label={isBn ? 'ডানে স্ক্রল' : 'Scroll Right'}
        title={isBn ? 'ডানে স্ক্রল করুন' : 'Scroll Right'}
      >
        <span>{isBn ? 'ডানে' : 'Right'}</span>
        <ChevronRight size={14} className="text-blue-400" />
      </button>
    </div>
  );
};

export default TableScrollControls;
