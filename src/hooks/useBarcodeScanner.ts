import {useEffect, useRef} from 'react';

interface UseHardwareScannerProps {
  onScan: (scannedValue: string) => void;
  enabled?: boolean;
}

/**
 * Listens for hardware USB / Bluetooth barcode scanners.
 * Hardware scanners type characters very quickly (< 40ms per keystroke)
 * followed by an Enter key.
 */
export function useHardwareScanner({onScan, enabled = true}: UseHardwareScannerProps) {
  const bufferRef = useRef<string>('');
  const lastTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is focusing inside an input unless it's a dedicated scanner listener
      const target = e.target as HTMLElement | null;
      const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      
      const currentTime = Date.now();
      const timeDiff = currentTime - lastTimeRef.current;
      lastTimeRef.current = currentTime;

      if (e.key === 'Enter') {
        if (bufferRef.current.length >= 3) {
          const scannedCode = bufferRef.current.trim();
          bufferRef.current = '';
          if (scannedCode) {
            // Prevent form submit if inside input
            e.preventDefault();
            e.stopPropagation();
            onScan(scannedCode);
          }
        } else {
          bufferRef.current = '';
        }
        return;
      }

      // Scanner characters arrive rapidly
      if (e.key.length === 1) {
        // If time between keystrokes is more than 80ms and user is in an input field, reset buffer to not capture slow typing
        if (isInput && timeDiff > 90) {
          bufferRef.current = '';
          return;
        }

        if (timeDiff > 120 && bufferRef.current.length > 0) {
          // Reset buffer if delay too long (user typing manually)
          bufferRef.current = '';
        }

        bufferRef.current += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [onScan, enabled]);
}
