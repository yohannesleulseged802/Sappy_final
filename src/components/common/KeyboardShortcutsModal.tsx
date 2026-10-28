import React from 'react';
import { Keyboard, X } from 'lucide-react';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  const shortcuts = [
    { key: 'F1', desc: 'Open this Keyboard Shortcuts cheat sheet' },
    { key: 'F2', desc: 'Focus product & barcode search input' },
    { key: 'F3', desc: 'Trigger camera barcode scanner modal' },
    { key: 'F4', desc: 'Park / hold current cart order' },
    { key: 'F6', desc: 'Open held & parked orders screen' },
    { key: 'F8', desc: 'Proceed to Charge / Complete payment' },
    { key: 'Esc', desc: 'Close open sheets or return to register' },
    { key: 'Enter', desc: 'Automatic hardware barcode gun scan confirmation' },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Desktop POS Keyboard Shortcuts"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in"
    >
      <div className="w-full max-w-md bg-white rounded-3xl p-5 shadow-2xl space-y-4 border border-[#e6dfd5]">
        <div className="flex items-center justify-between pb-3 border-b border-stone-200">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-[#064e3b] flex items-center justify-center">
              <Keyboard className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm sm:text-base text-stone-900">
                POS Keyboard Shortcuts
              </h3>
              <p className="text-xs text-stone-500">Fast cashier operation commands</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close keyboard shortcuts dialog"
            className="min-h-[44px] min-w-[44px] p-2 text-stone-400 hover:text-stone-900 rounded-xl flex items-center justify-center transition"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-2 text-xs">
          {shortcuts.map((sc) => (
            <div
              key={sc.key}
              className="flex items-center justify-between p-2.5 rounded-xl bg-[#fdfbf7] border border-stone-200"
            >
              <span className="text-stone-700 font-medium">{sc.desc}</span>
              <kbd className="px-2.5 py-1 bg-white border border-stone-300 rounded-lg font-mono font-bold text-stone-900 shadow-2xs">
                {sc.key}
              </kbd>
            </div>
          ))}
        </div>

        <div className="pt-2 text-center">
          <button
            type="button"
            onClick={onClose}
            className="w-full min-h-[44px] py-2.5 bg-[#064e3b] text-white text-xs font-bold rounded-xl shadow-xs"
          >
            Got It
          </button>
        </div>
      </div>
    </div>
  );
};
