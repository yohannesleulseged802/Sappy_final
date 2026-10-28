import React from 'react';
import { Delete, Check } from 'lucide-react';

interface NumericKeypadProps {
  onKeyPress: (char: string) => void;
  onClear: () => void;
  onBackspace: () => void;
  onAddAmount?: (amount: number) => void;
  onExact?: () => void;
  totalDue?: number;
  currency?: string;
  className?: string;
}

export const NumericKeypad: React.FC<NumericKeypadProps> = ({
  onKeyPress,
  onClear,
  onBackspace,
  onAddAmount,
  onExact,
  totalDue = 0,
  currency = 'ETB',
  className = '',
}) => {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', '.'];

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {/* Quick Denominations presets for fast cash cashiering (if onAddAmount provided) */}
      {onAddAmount && (
        <div className="grid grid-cols-4 gap-2">
          {onExact && totalDue > 0 && (
            <button
              type="button"
              onClick={onExact}
              aria-label={`Exact cash tendered: ${totalDue} ${currency}`}
              className="min-h-[44px] py-2 px-1 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-[#064e3b] font-black text-xs flex flex-col items-center justify-center transition active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#064e3b]"
            >
              <span>Exact</span>
              <span className="font-mono text-[10px]">{Math.ceil(totalDue)}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => onAddAmount(100)}
            aria-label="Add 100 ETB cash"
            className="min-h-[44px] py-2 px-1 rounded-xl bg-stone-100 hover:bg-stone-200 border border-stone-200 text-stone-800 font-bold text-xs flex items-center justify-center transition active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#064e3b]"
          >
            +100
          </button>

          <button
            type="button"
            onClick={() => onAddAmount(200)}
            aria-label="Add 200 ETB cash"
            className="min-h-[44px] py-2 px-1 rounded-xl bg-stone-100 hover:bg-stone-200 border border-stone-200 text-stone-800 font-bold text-xs flex items-center justify-center transition active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#064e3b]"
          >
            +200
          </button>

          <button
            type="button"
            onClick={() => onAddAmount(500)}
            aria-label="Add 500 ETB cash"
            className="min-h-[44px] py-2 px-1 rounded-xl bg-stone-100 hover:bg-stone-200 border border-stone-200 text-stone-800 font-bold text-xs flex items-center justify-center transition active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#064e3b]"
          >
            +500
          </button>
        </div>
      )}

      {/* Main 4x3 Numeric Keypad Grid */}
      <div className="grid grid-cols-3 gap-2">
        {keys.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => onKeyPress(key)}
            aria-label={`Keypad digit ${key}`}
            className="min-h-[48px] py-2.5 px-3 rounded-2xl bg-white hover:bg-stone-50 active:bg-stone-100 border border-stone-200 text-stone-900 font-extrabold text-lg sm:text-xl font-mono shadow-2xs transition active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#064e3b]"
          >
            {key}
          </button>
        ))}

        {/* Clear & Backspace Controls */}
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear entered amount"
          className="min-h-[48px] py-2.5 px-3 rounded-2xl bg-rose-50 hover:bg-rose-100 active:bg-rose-200 border border-rose-200 text-rose-700 font-black text-sm uppercase transition active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-700"
        >
          C
        </button>

        <button
          type="button"
          onClick={() => onKeyPress('00')}
          aria-label="Keypad double zero"
          className="min-h-[48px] py-2.5 px-3 rounded-2xl bg-white hover:bg-stone-50 active:bg-stone-100 border border-stone-200 text-stone-900 font-extrabold text-lg font-mono shadow-2xs transition active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#064e3b]"
        >
          00
        </button>

        <button
          type="button"
          onClick={onBackspace}
          aria-label="Backspace delete last digit"
          className="min-h-[48px] py-2.5 px-3 rounded-2xl bg-stone-100 hover:bg-stone-200 active:bg-stone-300 border border-stone-200 text-stone-700 font-bold flex items-center justify-center transition active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#064e3b]"
        >
          <Delete className="w-5 h-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};
