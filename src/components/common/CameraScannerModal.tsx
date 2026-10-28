import React, { useState, useEffect, useRef } from 'react';
import {
  Camera,
  X,
  AlertCircle,
  Barcode,
  Search,
  CheckCircle2,
  RefreshCw,
  VideoOff,
} from 'lucide-react';
import { Product } from '../../types/pos';

interface CameraScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBarcodeDetected?: (barcode: string) => void;
  onScanSuccess?: (barcode: string) => boolean | void;
  products?: Product[] | any[];
  title?: string;
  subtitle?: string;
  cartItemCount?: number;
  cartTotal?: number;
  currency?: string;
}

export const CameraScannerModal: React.FC<CameraScannerModalProps> = ({
  isOpen,
  onClose,
  onBarcodeDetected,
  onScanSuccess,
  products = [],
  title = 'Camera Barcode Scanner',
  subtitle = 'Point camera at barcode or enter code below',
}) => {
  const triggerScanSuccess = (code: string) => {
    if (onBarcodeDetected) {
      onBarcodeDetected(code);
    }
    if (onScanSuccess) {
      onScanSuccess(code);
    }
  };
  const [manualCode, setManualCode] = useState('');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const manualInputRef = useRef<HTMLInputElement>(null);

  // Stop camera media tracks cleanly
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsScanning(false);
  };

  // Start browser MediaDevices camera stream
  const startCamera = async () => {
    setCameraError(null);
    setIsScanning(true);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API is not supported in this browser environment.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
    } catch (err: any) {
      setCameraError(
        err?.message ||
          'Camera access was denied or is unavailable. Please enter the barcode or SKU manually below.'
      );
      setIsScanning(false);
      // Focus fallback manual input
      setTimeout(() => {
        manualInputRef.current?.focus();
      }, 100);
    }
  };

  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [isOpen]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    triggerScanSuccess(manualCode.trim());
    setManualCode('');
    onClose();
  };

  const handleSimulatedScan = (code: string) => {
    triggerScanSuccess(code);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Barcode & QR Code Camera Scanner"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in"
    >
      <div className="w-full max-w-md bg-white rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 bg-white border-b border-[#e6dfd5] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-[#064e3b] flex items-center justify-center">
              <Camera className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-stone-900">
                {title}
              </h3>
              <p className="text-[11px] text-stone-500">
                {subtitle}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close camera scanner"
            className="min-h-[44px] min-w-[44px] p-2 text-stone-400 hover:text-stone-900 rounded-xl flex items-center justify-center transition"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Video Camera Viewport & Fallback Container */}
        <div className="relative bg-black flex-1 min-h-[220px] max-h-[300px] flex items-center justify-center overflow-hidden">
          {isScanning && !cameraError ? (
            <>
              <video
                ref={videoRef}
                playsInline
                muted
                className="w-full h-full object-cover"
              />

              {/* Aiming Reticle Overlay with Animated Scanning Line */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="relative w-64 h-36 border-2 border-emerald-400 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]">
                  {/* Glowing Laser Scan Bar */}
                  <div className="absolute left-2 right-2 h-0.5 bg-emerald-300 shadow-[0_0_8px_#10b981] animate-pulse top-1/2 -translate-y-1/2" />
                  <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] text-emerald-200 font-mono whitespace-nowrap bg-black/60 px-2 py-0.5 rounded">
                    Align Barcode in Box
                  </span>
                </div>
              </div>
            </>
          ) : (
            <div className="p-6 text-center text-white space-y-2">
              <VideoOff className="w-10 h-10 mx-auto text-stone-400" aria-hidden="true" />
              <p className="text-xs font-bold text-stone-200">
                {cameraError || 'Camera stream is unavailable'}
              </p>
              <p className="text-[11px] text-stone-400">
                Use the manual entry input below to add any product barcode or SKU.
              </p>
            </div>
          )}
        </div>

        {/* Graceful Fallback: Manual Barcode / SKU Entry Form */}
        <div className="p-4 bg-[#fdfbf7] border-t border-[#e6dfd5] space-y-3 shrink-0">
          <form onSubmit={handleManualSubmit} className="space-y-2">
            <label
              htmlFor="manual-barcode-input"
              className="block text-xs font-bold text-stone-700 flex items-center gap-1.5"
            >
              <Barcode className="w-4 h-4 text-stone-500" aria-hidden="true" />
              <span>Manual Barcode or SKU Entry:</span>
            </label>

            <div className="flex gap-2">
              <input
                id="manual-barcode-input"
                ref={manualInputRef}
                type="text"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="e.g. 8851234560012 or PAP-A4-80G"
                className="flex-1 min-h-[44px] bg-white border border-stone-300 rounded-xl px-3 py-2 text-xs sm:text-sm font-mono font-bold text-stone-900 focus:outline-hidden focus:ring-2 focus:ring-[#064e3b]"
              />

              <button
                type="submit"
                aria-label="Add barcode to cart"
                disabled={!manualCode.trim()}
                className="min-h-[44px] px-4 bg-[#064e3b] hover:bg-[#043b2c] disabled:opacity-40 text-white font-bold text-xs rounded-xl shadow-xs transition shrink-0"
              >
                Add Item
              </button>
            </div>
          </form>

          {/* Quick Demo Barcode Buttons for Instant Testing */}
          <div className="pt-2 border-t border-stone-200">
            <span className="text-[10px] text-stone-500 font-bold uppercase tracking-wider block mb-1">
              Sample Barcodes for Quick Testing:
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              {products.slice(0, 4).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSimulatedScan(p.barcode)}
                  className="min-h-[44px] p-2 rounded-xl bg-white hover:bg-emerald-50 border border-stone-200 text-left transition text-[11px]"
                >
                  <div className="font-bold text-stone-800 truncate">{p.name.split(' ')[0]} {p.name.split(' ')[1]}</div>
                  <div className="font-mono text-[10px] text-emerald-800">{p.barcode}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
