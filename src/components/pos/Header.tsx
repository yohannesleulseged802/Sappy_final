import React from 'react';
import {
  ShoppingBag,
  Camera,
  FolderArchive,
  Keyboard,
  ArrowLeft,
  Search,
  Sparkles,
  Barcode,
  RotateCcw,
} from 'lucide-react';
import { ScreenView, StoreInfo } from '../../types/pos';

interface HeaderProps {
  currentScreen: ScreenView;
  onNavigate: (screen: ScreenView) => void;
  heldOrdersCount: number;
  onOpenScanner: () => void;
  onOpenShortcuts: () => void;
  onResetSale: () => void;
  storeInfo: StoreInfo;
  cartCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  currentScreen,
  onNavigate,
  heldOrdersCount,
  onOpenScanner,
  onOpenShortcuts,
  onResetSale,
  storeInfo,
  cartCount,
}) => {
  return (
    <header className="bg-white border-b border-[#e6dfd5] shrink-0 z-30 safe-area-top shadow-2xs">
      <div className="max-w-[1920px] mx-auto px-4 py-2 flex items-center justify-between gap-2">
        {/* Left: Brand Identity / Back Button */}
        <div className="flex items-center gap-2">
          {currentScreen !== 'checkout' ? (
            <button
              type="button"
              onClick={() => onNavigate('checkout')}
              aria-label="Back to sale register"
              className="min-h-[44px] min-w-[44px] px-3 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 font-bold text-xs flex items-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#064e3b] transition"
            >
              <ArrowLeft className="w-5 h-5" aria-hidden="true" />
              <span className="hidden sm:inline">Register</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <div
                className="w-10 h-10 rounded-xl bg-[#064e3b] text-white flex items-center justify-center font-black text-lg shadow-sm"
                aria-hidden="true"
              >
                S
              </div>
              <div>
                <h1 className="font-extrabold text-sm sm:text-base leading-tight text-stone-900 tracking-tight flex items-center gap-1.5">
                  <span>{storeInfo.name}</span>
                </h1>
                <p className="text-[11px] text-stone-500 font-medium hidden sm:block">
                  Fast Touch POS Terminal
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Center: Current Screen Badge or Title */}
        <div className="flex items-center gap-2">
          {currentScreen === 'payment' && (
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-[#064e3b] border border-emerald-300">
              Payment &amp; Tender
            </span>
          )}
          {currentScreen === 'receipt' && (
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-900 border border-blue-300">
              Receipt Preview &amp; Print
            </span>
          )}
          {currentScreen === 'held-orders' && (
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
              Held &amp; Open Orders
            </span>
          )}
        </div>

        {/* Right: Quick Action Buttons (Min 44x44px Touch Targets, 8px+ Gaps) */}
        <div className="flex items-center gap-2">
          {/* Camera Barcode Scanner Button (Always one tap away on mobile) */}
          <button
            type="button"
            onClick={onOpenScanner}
            aria-label="Scan barcode with camera (F3)"
            className="min-h-[44px] min-w-[44px] px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-[#064e3b] border border-emerald-300 text-xs font-bold flex items-center justify-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#064e3b] transition"
            title="Scan barcode with camera (F3)"
          >
            <Camera className="w-5 h-5 shrink-0" aria-hidden="true" />
            <span className="hidden md:inline">Camera Scan</span>
          </button>

          {/* Held / Parked Orders Button */}
          <button
            type="button"
            onClick={() => onNavigate('held-orders')}
            aria-label={`View held orders (${heldOrdersCount} parked orders)`}
            className={`min-h-[44px] min-w-[44px] px-3 py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 relative focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#064e3b] transition ${
              currentScreen === 'held-orders'
                ? 'bg-[#064e3b] text-white border-[#064e3b]'
                : 'bg-stone-100 hover:bg-stone-200 text-stone-800 border-stone-200'
            }`}
            title="View held & parked orders (F6)"
          >
            <FolderArchive className="w-5 h-5 shrink-0" aria-hidden="true" />
            <span className="hidden lg:inline">Held Orders</span>
            {heldOrdersCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-rose-600 text-white font-mono text-[10px] font-bold min-w-[18px] text-center">
                {heldOrdersCount}
              </span>
            )}
          </button>

          {/* Reset / New Sale (if on checkout with items) */}
          {currentScreen === 'checkout' && cartCount > 0 && (
            <button
              type="button"
              onClick={onResetSale}
              aria-label="Clear active cart and reset register"
              className="min-h-[44px] min-w-[44px] px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold flex items-center justify-center gap-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-700 transition"
              title="Reset register cart"
            >
              <RotateCcw className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span className="hidden xl:inline">Clear</span>
            </button>
          )}

          {/* Keyboard Shortcuts Trigger (Desktop) */}
          <button
            type="button"
            onClick={onOpenShortcuts}
            aria-label="Show keyboard shortcuts (F1)"
            className="min-h-[44px] min-w-[44px] px-2.5 py-2 rounded-xl bg-stone-50 hover:bg-stone-100 text-stone-600 border border-stone-200 text-xs font-medium hidden md:flex items-center justify-center gap-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#064e3b] transition"
            title="Keyboard shortcuts (F1)"
          >
            <Keyboard className="w-4 h-4" aria-hidden="true" />
            <span className="font-mono text-[11px] hidden lg:inline">F1</span>
          </button>
        </div>
      </div>
    </header>
  );
};
