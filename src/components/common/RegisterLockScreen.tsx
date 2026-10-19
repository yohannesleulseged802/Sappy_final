import React, {useState, useEffect} from 'react';
import {Lock, Delete, UserCheck, ArrowRight, AlertCircle, LogOut} from 'lucide-react';
import {Staff} from '../../types';
import {storage} from '../../services/storage';
import {sound} from '../../services/sound';
import {SappyBrandLogo} from './SappyBrandLogo';

interface RegisterLockScreenProps {
  currentStaff: Staff;
  onUnlock: () => void;
  onSwitchUser: () => void;
}

export const RegisterLockScreen: React.FC<RegisterLockScreenProps> = ({
  currentStaff,
  onUnlock,
  onSwitchUser,
}) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Keyboard number listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(e.key)) {
        if (pin.length < 4) {
          const nextPin = pin + e.key;
          setPin(nextPin);
          if (nextPin.length === 4) {
            verifyUnlock(nextPin);
          }
        }
      } else if (e.key === 'Backspace') {
        setPin((prev) => prev.slice(0, -1));
        setError(null);
      } else if (e.key === 'Escape') {
        setPin('');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pin, currentStaff]);

  const verifyUnlock = (code: string) => {
    const isValid = storage.verifyPin(currentStaff.id, code);
    if (isValid) {
      sound.playCheckoutSuccess();
      storage.setRegisterLocked(false);
      onUnlock();
    } else {
      sound.playError();
      setError('Incorrect PIN. Please try again.');
      setPin('');
    }
  };

  const handleDigit = (digit: string) => {
    if (pin.length < 4) {
      const nextPin = pin + digit;
      setPin(nextPin);
      setError(null);
      if (nextPin.length === 4) {
        verifyUnlock(nextPin);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200 text-stone-100">
      <div className="w-full max-w-sm bg-stone-900 border border-stone-800 rounded-3xl shadow-2xl p-6 text-center space-y-5">
        {/* Brand Logo & Lock Icon */}
        <div className="flex flex-col items-center">
          <div className="w-16 h-16 rounded-2xl bg-[#fbf9f4] text-[#244834] flex items-center justify-center mb-3 shadow-xl border border-white/20 p-2 relative">
            <SappyBrandLogo size="lg" className="text-[#244834]" />
            <div className="absolute -bottom-1 -right-1 p-1 rounded-full bg-stone-900 border border-stone-700 text-amber-400 shadow-sm">
              <Lock className="w-3 h-3" />
            </div>
          </div>
          <h2 className="font-extrabold text-lg tracking-widest text-white font-sans">
            SAPPY
          </h2>
          <p className="text-[11px] font-serif text-[#6ee7b7] italic tracking-wide mt-0.5">
            stationery &amp; printing.
          </p>
        </div>

        {/* Current Cashier Card */}
        <div className="p-3 bg-stone-950/70 border border-stone-800 rounded-2xl flex items-center justify-between text-left">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[#064e3b] text-white flex items-center justify-center font-bold text-xs">
              {currentStaff.name.charAt(0)}
            </div>
            <div>
              <div className="font-bold text-xs text-white">{currentStaff.name}</div>
              <div className="text-[10px] text-stone-400 uppercase font-mono">{currentStaff.role}</div>
            </div>
          </div>
          <span className="text-[10px] text-stone-400">Cart Preserved</span>
        </div>

        {/* Masked PIN Indicators (● ● ● ●) */}
        <div>
          <div className="flex justify-center gap-4 my-2">
            {[0, 1, 2, 3].map((idx) => (
              <div
                key={idx}
                className={`w-4 h-4 rounded-full border-2 transition-all ${
                  pin.length > idx
                    ? 'bg-[#6ee7b7] border-[#6ee7b7] scale-125'
                    : 'border-stone-700'
                }`}
              />
            ))}
          </div>
          <p className="text-[11px] text-stone-400 mt-2">Enter PIN to unlock register</p>
        </div>

        {error && (
          <p className="text-xs text-rose-400 font-semibold">{error}</p>
        )}

        {/* Touch Keypad */}
        <div className="grid grid-cols-3 gap-2 max-w-[260px] mx-auto">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => handleDigit(digit)}
              className="h-11 text-base font-bold rounded-xl bg-stone-800 hover:bg-stone-700 active:scale-95 transition text-white"
            >
              {digit}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setPin('');
              setError(null);
            }}
            className="h-11 text-xs font-bold rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-400 active:scale-95 transition"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => handleDigit('0')}
            className="h-11 text-base font-bold rounded-xl bg-stone-800 hover:bg-stone-700 active:scale-95 transition text-white"
          >
            0
          </button>
          <button
            type="button"
            onClick={() => setPin((prev) => prev.slice(0, -1))}
            className="h-11 flex items-center justify-center rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 active:scale-95 transition"
          >
            <Delete className="w-4 h-4" />
          </button>
        </div>

        {/* Bottom Actions: Switch User or Sign Out */}
        <div className="pt-2 border-t border-stone-800 flex items-center justify-between text-xs">
          <button
            type="button"
            onClick={onSwitchUser}
            className="text-stone-400 hover:text-white font-medium flex items-center gap-1 transition"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Switch User / Sign In</span>
          </button>

          <span className="text-[10px] text-stone-500 font-mono">
            PIN: {currentStaff.pin}
          </span>
        </div>
      </div>
    </div>
  );
};
