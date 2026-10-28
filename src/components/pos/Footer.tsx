import React from 'react';
import {
  Wifi,
  Barcode,
  User,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { StoreInfo } from '../../types/pos';

interface FooterProps {
  storeInfo: StoreInfo;
}

export const Footer: React.FC<FooterProps> = ({ storeInfo }) => {
  return (
    <footer className="bg-white border-t border-[#e6dfd5] shrink-0 safe-area-bottom text-stone-600 text-xs py-2 px-4 shadow-xs">
      <div className="max-w-[1920px] mx-auto flex flex-wrap items-center justify-between gap-2">
        {/* Left: Online + Hardware Scanner Ready status (Icon + Text) */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-emerald-800 font-bold bg-emerald-50 border border-emerald-300 px-2.5 py-1 rounded-lg">
            <Wifi className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
            <span>Ready • Standalone / Offline First</span>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 text-stone-700 bg-stone-100 border border-stone-200 px-2.5 py-1 rounded-lg">
            <Barcode className="w-3.5 h-3.5 text-stone-600" aria-hidden="true" />
            <span>USB/BT Scanner: Active (Enter Trigger)</span>
          </div>
        </div>

        {/* Center: Desktop Shortcuts Legend */}
        <div className="hidden lg:flex items-center gap-3 text-stone-500 font-mono text-[11px]">
          <span><strong className="text-stone-700">F2</strong> Search</span>
          <span>•</span>
          <span><strong className="text-stone-700">F3</strong> Camera</span>
          <span>•</span>
          <span><strong className="text-stone-700">F4</strong> Hold</span>
          <span>•</span>
          <span><strong className="text-stone-700">F8</strong> Charge</span>
        </div>

        {/* Right: Active Cashier & Security */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-stone-800 font-medium">
            <User className="w-3.5 h-3.5 text-stone-500" aria-hidden="true" />
            <span>{storeInfo.cashierName}</span>
          </div>
          <div className="hidden md:flex items-center gap-1 text-emerald-700 font-semibold">
            <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Tax Compliant (15%)</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
