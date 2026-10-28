import React, { useEffect, useRef, useState } from 'react';
import { Barcode, CheckCircle2, Volume2 } from 'lucide-react';

interface HardwareScannerCaptureProps {
  onScan: (barcode: string) => void;
  scannerStatus?: string;
}

export const HardwareScannerCapture: React.FC<HardwareScannerCaptureProps> = ({
  onScan,
}) => {
  const hiddenInputRef = useRef<HTMLInputElement>(null);
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const bufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);

  // Play synthetic pleasant high-frequency beep using Web Audio API
  const playBeep = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1480, audioCtx.currentTime); // 1480Hz scanner chime
      gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start();
      osc.stop(audioCtx.currentTime + 0.08);
    } catch {
      // AudioContext unavailable or blocked
    }
  };

  const triggerHapticAndFeedback = (code: string) => {
    // 1. Haptic confirmation (Vibrate API if available on mobile/handheld POS)
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate?.([40, 20, 40]);
      } catch {}
    }

    // 2. Audible confirmation
    playBeep();

    // 3. Visual confirmation toast
    setLastScanned(code);
    setTimeout(() => {
      setLastScanned(null);
    }, 2400);

    // 4. Return focus to hidden scanner capture
    setTimeout(() => {
      if (hiddenInputRef.current) {
        hiddenInputRef.current.focus({ preventScroll: true });
      }
    }, 50);
  };

  useEffect(() => {
    // Hardware scanners typically emulate a USB/Bluetooth keyboard sending characters very rapidly (<35ms apart)
    // followed by an 'Enter' key.
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInput =
        activeEl?.tagName === 'INPUT' ||
        activeEl?.tagName === 'TEXTAREA' ||
        activeEl?.tagName === 'SELECT';

      // If user is typing in regular search or text input, let them type unless it's the hidden scanner input
      if (isInput && activeEl !== hiddenInputRef.current) {
        // Still allow Enter key on search to trigger barcode if it matches a barcode length
        return;
      }

      const now = Date.now();
      const elapsed = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      if (e.key === 'Enter') {
        if (bufferRef.current.length >= 3) {
          e.preventDefault();
          const barcode = bufferRef.current.trim();
          bufferRef.current = '';
          triggerHapticAndFeedback(barcode);
          onScan(barcode);
        } else {
          bufferRef.current = '';
        }
        return;
      }

      // If typed characters are separated by too much time (> 180ms), reset buffer
      if (elapsed > 180 && bufferRef.current.length > 0) {
        bufferRef.current = '';
      }

      // Append printable single characters
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        bufferRef.current += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    // Keep hidden input focused initially without scrolling viewport
    const focusTimer = setTimeout(() => {
      if (hiddenInputRef.current && document.activeElement === document.body) {
        hiddenInputRef.current.focus({ preventScroll: true });
      }
    }, 100);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(focusTimer);
    };
  }, [onScan]);

  return (
    <>
      {/* Hidden always-focused hardware scanner capture input */}
      <input
        ref={hiddenInputRef}
        type="text"
        aria-hidden="true"
        tabIndex={-1}
        className="opacity-0 pointer-events-none fixed -left-[9999px] -top-[9999px] h-0 w-0"
        onBlur={() => {
          // If focus moves away from any interactive element, refocus scanner
          setTimeout(() => {
            const active = document.activeElement;
            if (active === document.body || active === null) {
              hiddenInputRef.current?.focus({ preventScroll: true });
            }
          }, 300);
        }}
      />

      {/* Visual + Haptic Notification Pill when hardware or camera barcode is scanned */}
      {lastScanned && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-[#064e3b] text-white px-4 py-2 rounded-2xl shadow-xl border border-emerald-400 flex items-center gap-2 animate-bounce"
        >
          <div className="w-6 h-6 rounded-full bg-emerald-600 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-100" />
          </div>
          <div className="text-xs font-bold flex items-center gap-1.5">
            <Barcode className="w-4 h-4 text-emerald-200" />
            <span>Scanned:</span>
            <span className="font-mono bg-emerald-950 px-2 py-0.5 rounded text-emerald-300">
              {lastScanned}
            </span>
          </div>
        </div>
      )}
    </>
  );
};
