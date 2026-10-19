import React from 'react';
import {Keyboard, X} from 'lucide-react';

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
    {key: 'F1', desc: 'Open Keyboard Shortcuts Help'},
    {key: 'F2', desc: 'Focus Product Search Field'},
    {key: 'F3', desc: 'Open Barcode / QR Camera Scanner'},
    {key: 'F4', desc: 'Park / Hold Current Cart'},
    {key: 'F5', desc: 'View Held & Parked Orders'},
    {key: 'F6', desc: 'Select or Assign Customer'},
    {key: 'F7', desc: 'Apply Cart or Item Discount'},
    {key: 'F8', desc: 'Open Checkout & Payment Modal'},
    {key: 'F9', desc: 'Complete Sale / Quick Cash Checkout'},
    {key: 'ESC', desc: 'Close any open modal or cancel current action'},
    {key: 'Ctrl / Cmd + K', desc: 'Global fast search'},
    {key: 'Hardware Scanner', desc: 'Scan USB/BT barcode at any time to add item'},
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl shadow-2xl p-5 text-stone-900 dark:text-stone-100">
        <div className="flex items-center justify-between pb-3 border-b border-stone-100 dark:border-stone-800 mb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-400 rounded-lg">
              <Keyboard className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base">POS Register Shortcuts</h3>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                Operate the register swiftly with minimal clicks
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[60vh] overflow-y-auto pr-1">
          {shortcuts.map((s) => (
            <div
              key={s.key}
              className="flex items-center justify-between p-2 rounded-lg bg-stone-50 dark:bg-stone-800/60 border border-stone-200 dark:border-stone-800 text-xs"
            >
              <span className="text-stone-700 dark:text-stone-300 font-medium">
                {s.desc}
              </span>
              <kbd className="px-2 py-1 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded font-mono font-bold text-emerald-700 dark:text-emerald-400 shadow-xs">
                {s.key}
              </kbd>
            </div>
          ))}
        </div>

        <div className="mt-4 pt-3 border-t border-stone-100 dark:border-stone-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 font-medium text-xs rounded-lg hover:opacity-90 transition"
          >
            Got it (ESC)
          </button>
        </div>
      </div>
    </div>
  );
};
