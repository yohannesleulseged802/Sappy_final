import React, {useEffect, useRef, useState, useCallback} from 'react';
import {Html5Qrcode, Html5QrcodeSupportedFormats} from 'html5-qrcode';
import {
  Camera,
  X,
  Flashlight,
  ArrowRight,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  ShoppingCart,
  QrCode,
  SwitchCamera,
  ChevronDown,
  Check,
  ZoomIn,
  Video,
  SlidersHorizontal,
  Info,
} from 'lucide-react';
import {sound} from '../../services/sound';

interface CameraScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (code: string) => boolean | void; // returns true if matched
  title?: string;
  subtitle?: string;
  cartItemCount?: number;
  cartTotal?: number;
  currency?: string;
}

export interface CameraDevice {
  id: string;
  label: string;
  isBack: boolean;
  badge: string;
  displayName: string;
  isRecommended: boolean;
}

const PREFERRED_CAM_KEY = 'sappy_scanner_preferred_camera_id';

/**
 * Parses and formats mobile camera labels into clear human-readable names
 */
function parseCameraDevice(
  rawDevice: {id: string; label: string},
  index: number,
  allDevices: {id: string; label: string}[]
): CameraDevice {
  const lbl = (rawDevice.label || '').toLowerCase();
  
  // Detect orientation
  const isFront =
    lbl.includes('front') ||
    lbl.includes('user') ||
    lbl.includes('selfie') ||
    lbl.includes('forward') ||
    (lbl.includes('facing front') || (!lbl.includes('back') && lbl.includes(' 1,')));
  
  const isBack = !isFront && (
    lbl.includes('back') ||
    lbl.includes('rear') ||
    lbl.includes('environment') ||
    lbl.includes('0,') ||
    lbl.includes('facing back') ||
    index === 0
  );

  const isUltraWide = lbl.includes('ultra') || lbl.includes('wide-angle') || lbl.includes('0.5x');
  const isTelephoto = lbl.includes('tele') || lbl.includes('zoom') || lbl.includes('2x') || lbl.includes('3x');
  const isMacro = lbl.includes('macro');

  let badge = 'Back';
  if (isFront) {
    badge = 'Front / Selfie';
  } else if (isUltraWide) {
    badge = 'Rear Ultra-Wide';
  } else if (isTelephoto) {
    badge = 'Rear Telephoto';
  } else if (isMacro) {
    badge = 'Rear Macro';
  } else if (isBack) {
    badge = 'Rear Main (1x)';
  }

  // Generate clean display name
  let displayName = rawDevice.label || `Camera ${index + 1}`;
  
  // Clean technical android names like "camera2 0, facing back"
  if (/camera\d*\s+\d+/i.test(displayName) || displayName.includes('facing')) {
    if (isBack) {
      displayName = isUltraWide
        ? `Rear Ultra-Wide Lens`
        : isTelephoto
        ? `Rear Telephoto Lens`
        : `Rear Main Camera (${index + 1})`;
    } else if (isFront) {
      displayName = `Front Selfie Camera`;
    }
  }

  // The first back camera found is usually the primary 1x sensor with auto-focus (best for barcodes)
  const isFirstBack = isBack && !allDevices.slice(0, index).some((d) => {
    const l = (d.label || '').toLowerCase();
    return l.includes('back') || l.includes('rear') || l.includes('environment');
  });

  return {
    id: rawDevice.id,
    label: rawDevice.label,
    isBack,
    badge,
    displayName,
    isRecommended: isFirstBack,
  };
}

export const CameraScannerModal: React.FC<CameraScannerModalProps> = ({
  isOpen,
  onClose,
  onScanSuccess,
  title = 'QR Code & Barcode Scanner to Sell',
  subtitle = 'Aim camera at product QR code or Barcode to add to cart',
  cartItemCount = 0,
  cartTotal = 0,
  currency = 'ETB',
}) => {
  const [manualCode, setManualCode] = useState('');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isSwitchingCamera, setIsSwitchingCamera] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [continuousMode, setContinuousMode] = useState(true);
  
  // Camera selection state
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(() => {
    return localStorage.getItem(PREFERRED_CAM_KEY);
  });
  const [isCameraPickerOpen, setIsCameraPickerOpen] = useState(false);

  // Digital Zoom control state (if supported by hardware)
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [maxZoom, setMaxZoom] = useState<number>(1);
  const [zoomSupported, setZoomSupported] = useState(false);

  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [lastScannedFeedback, setLastScannedFeedback] = useState<{
    code: string;
    time: number;
    success: boolean;
  } | null>(null);

  const lastScannedCodeRef = useRef<{code: string; time: number}>({code: '', time: 0});
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isStartingRef = useRef(false);
  const containerId = 'interactive-barcode-reader';

  // Helper to query camera capabilities (zoom, torch) from active video track
  const checkTrackCapabilities = useCallback(() => {
    try {
      const container = document.getElementById(containerId);
      const video = container?.querySelector('video') as HTMLVideoElement | null;
      if (video && video.srcObject) {
        const stream = video.srcObject as MediaStream;
        const track = stream.getVideoTracks()[0];
        if (track && typeof track.getCapabilities === 'function') {
          const caps = (track.getCapabilities as any)();
          if (caps) {
            // Torch check
            if ('torch' in caps) {
              setTorchSupported(true);
            } else {
              setTorchSupported(false);
            }
            // Zoom check
            if ('zoom' in caps && caps.zoom) {
              setZoomSupported(true);
              setMaxZoom(Math.min(caps.zoom.max || 3, 5));
              setZoomLevel(caps.zoom.min || 1);
            } else {
              setZoomSupported(false);
            }
          }
        }
      }
    } catch (e) {
      console.warn('Could not inspect video track capabilities:', e);
    }
  }, [containerId]);

  // Discover and refresh cameras
  const refreshCameraList = useCallback(async (): Promise<CameraDevice[]> => {
    try {
      const rawDevices = await Html5Qrcode.getCameras();
      if (rawDevices && rawDevices.length > 0) {
        const parsed = rawDevices.map((d, idx) => parseCameraDevice(d, idx, rawDevices));
        setCameras(parsed);
        return parsed;
      }
    } catch (e) {
      console.warn('Failed to get cameras:', e);
    }
    return [];
  }, []);

  // Stop scanner safely
  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        await scannerRef.current.clear();
      } catch (err) {
        console.warn('Error clearing scanner instance:', err);
      }
      scannerRef.current = null;
    }
    setIsScanning(false);
    setTorchOn(false);
    setTorchSupported(false);
    setZoomSupported(false);
  }, []);

  // Handle scanned code
  const handleScanCode = useCallback((decodedText: string) => {
    const trimmed = decodedText.trim();
    if (!trimmed) return;

    // Debounce same code within 1.2s to prevent rapid duplicate triggers
    const now = Date.now();
    if (
      lastScannedCodeRef.current.code === trimmed &&
      now - lastScannedCodeRef.current.time < 1200
    ) {
      return;
    }
    lastScannedCodeRef.current = {code: trimmed, time: now};

    // Haptic vibration feedback on mobile
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate([40, 30, 40]);
      } catch {}
    }

    sound.playScanSuccess();
    const matchResult = onScanSuccess(trimmed);
    const isSuccess = matchResult !== false;

    setLastScannedFeedback({
      code: trimmed,
      time: now,
      success: isSuccess,
    });

    if (!continuousMode) {
      stopScanner();
      onClose();
    }
  }, [continuousMode, onClose, onScanSuccess, stopScanner]);

  // Start scanner with targeted camera ID or fallback
  const startScannerWithCamera = useCallback(async (targetCameraId?: string | null) => {
    if (isStartingRef.current) return;
    isStartingRef.current = true;
    setCameraError(null);
    setIsSwitchingCamera(true);

    try {
      await stopScanner();

      // Ensure DOM element is ready
      const container = document.getElementById(containerId);
      if (!container) {
        throw new Error('Scanner container element not found.');
      }
      container.innerHTML = '';

      const formatsToSupport = [
        Html5QrcodeSupportedFormats.QR_CODE,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.CODE_93,
        Html5QrcodeSupportedFormats.ITF,
        Html5QrcodeSupportedFormats.DATA_MATRIX,
        Html5QrcodeSupportedFormats.CODABAR,
      ];

      const html5QrCode = new Html5Qrcode(containerId, {
        formatsToSupport,
        verbose: false,
      });
      scannerRef.current = html5QrCode;

      const qrConfig = {
        fps: 25,
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          const minDimension = Math.min(viewfinderWidth, viewfinderHeight);
          const size = Math.floor(minDimension * 0.82);
          return {
            width: Math.max(180, Math.min(size, 340)),
            height: Math.max(140, Math.min(size, 240)),
          };
        },
      };

      // Determine camera parameter
      let cameraConfig: any = {facingMode: 'environment'};
      if (targetCameraId) {
        cameraConfig = {deviceId: {exact: targetCameraId}};
      }

      await html5QrCode.start(
        cameraConfig,
        qrConfig,
        (decodedText) => {
          handleScanCode(decodedText);
        },
        () => {
          // Frame error (no barcode detected in frame, normal loop)
        }
      );

      setIsScanning(true);
      if (targetCameraId) {
        setSelectedCameraId(targetCameraId);
        localStorage.setItem(PREFERRED_CAM_KEY, targetCameraId);
      }

      // Re-query cameras once permissions are granted so Android/iOS labels populate
      setTimeout(async () => {
        const updatedList = await refreshCameraList();
        if (!targetCameraId && updatedList.length > 0) {
          const rec = updatedList.find((c) => c.isRecommended) || updatedList[0];
          setSelectedCameraId(rec.id);
          localStorage.setItem(PREFERRED_CAM_KEY, rec.id);
        }
        checkTrackCapabilities();
      }, 500);

    } catch (err: any) {
      console.warn('Failed to start scanner with camera:', targetCameraId, err);
      // Fallback: If specific camera ID failed, attempt general environment facing mode
      if (targetCameraId) {
        try {
          console.log('Retrying with default facingMode: environment...');
          if (scannerRef.current) {
            try { await scannerRef.current.clear(); } catch {}
          }
          const html5QrCode = new Html5Qrcode(containerId, {verbose: false});
          scannerRef.current = html5QrCode;
          await html5QrCode.start(
            {facingMode: 'environment'},
            {fps: 25, qrbox: {width: 250, height: 180}},
            handleScanCode,
            () => {}
          );
          setIsScanning(true);
          setSelectedCameraId(null);
          setTimeout(() => {
            refreshCameraList();
            checkTrackCapabilities();
          }, 500);
          return;
        } catch (fallbackErr: any) {
          setCameraError(
            fallbackErr?.message ||
            'Camera access not granted or unavailable. You can use Snap Barcode Photo or manual entry below.'
          );
        }
      } else {
        setCameraError(
          err?.message ||
          'Camera access not granted or unavailable. You can use Snap Barcode Photo or manual entry below.'
        );
      }
      setIsScanning(false);
    } finally {
      setIsSwitchingCamera(false);
      isStartingRef.current = false;
    }
  }, [checkTrackCapabilities, containerId, handleScanCode, refreshCameraList, stopScanner]);

  // Main lifecycle when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      stopScanner();
      setManualCode('');
      setCameraError(null);
      setLastScannedFeedback(null);
      setIsCameraPickerOpen(false);
      lastScannedCodeRef.current = {code: '', time: 0};
      return;
    }

    // Modal just opened: discover cameras and start
    (async () => {
      const devices = await refreshCameraList();
      const savedId = localStorage.getItem(PREFERRED_CAM_KEY);
      
      let initialCameraId: string | null = null;
      if (savedId && devices.some((d) => d.id === savedId)) {
        initialCameraId = savedId;
      } else if (devices.length > 0) {
        const recommended = devices.find((d) => d.isRecommended) || devices.find((d) => d.isBack) || devices[0];
        initialCameraId = recommended.id;
      }

      await startScannerWithCamera(initialCameraId);
    })();

    return () => {
      stopScanner();
    };
  }, [isOpen]);

  // Switch to a chosen camera
  const handleSelectCamera = async (cameraId: string) => {
    setIsCameraPickerOpen(false);
    if (cameraId === selectedCameraId && isScanning) return;
    await startScannerWithCamera(cameraId);
  };

  // Flip camera (Rear <-> Front, or Next Lens)
  const handleFlipCamera = async () => {
    if (cameras.length <= 1) return;
    const currentIndex = cameras.findIndex((c) => c.id === selectedCameraId);
    
    // Find next camera, prioritizing switching between rear and front
    const currentCam = cameras[currentIndex];
    let nextCam: CameraDevice;

    if (currentCam) {
      if (currentCam.isBack) {
        // Switch to front if available, or next rear lens
        const frontCam = cameras.find((c) => !c.isBack);
        nextCam = frontCam || cameras[(currentIndex + 1) % cameras.length];
      } else {
        // Currently front: switch to recommended back camera
        const backCam = cameras.find((c) => c.isRecommended) || cameras.find((c) => c.isBack);
        nextCam = backCam || cameras[(currentIndex + 1) % cameras.length];
      }
    } else {
      nextCam = cameras[0];
    }

    await handleSelectCamera(nextCam.id);
  };

  // Toggle Torch / Flashlight
  const toggleTorch = async () => {
    if (!scannerRef.current) return;
    try {
      // @ts-ignore
      await (scannerRef.current as any).applyVideoConstraints({
        advanced: [{torch: !torchOn}],
      });
      setTorchOn(!torchOn);
    } catch (e) {
      console.warn('Torch toggle not supported:', e);
    }
  };

  // Toggle Zoom Level (1x <-> 2x)
  const handleToggleZoom = async () => {
    if (!zoomSupported) return;
    const targetZoom = zoomLevel >= 2 ? 1 : Math.min(2, maxZoom);
    try {
      const container = document.getElementById(containerId);
      const video = container?.querySelector('video') as HTMLVideoElement | null;
      const stream = video?.srcObject as MediaStream | undefined;
      const track = stream?.getVideoTracks()[0];
      if (track && typeof (track as any).applyConstraints === 'function') {
        await (track as any).applyConstraints({
          advanced: [{zoom: targetZoom}],
        });
        setZoomLevel(targetZoom);
      }
    } catch (err) {
      console.warn('Failed to apply digital zoom constraint:', err);
    }
  };

  // Photo upload / native camera snapshot fallback
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingFile(true);
    try {
      let tempScanner = scannerRef.current;
      if (!tempScanner) {
        tempScanner = new Html5Qrcode(containerId, {verbose: false});
      }
      const decodedResult = await tempScanner.scanFile(file, true);
      if (decodedResult) {
        handleScanCode(decodedResult);
      }
    } catch {
      sound.playError();
      setLastScannedFeedback({
        code: 'Image barcode could not be decoded',
        time: Date.now(),
        success: false,
      });
    } finally {
      setIsProcessingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Manual code entry
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    handleScanCode(manualCode.trim());
    setManualCode('');
  };

  const activeCameraObj = cameras.find((c) => c.id === selectedCameraId) || cameras[0];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-black/85 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-md bg-stone-900 border border-stone-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-stone-100 max-h-[94vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-stone-800 bg-stone-950/95 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-950 text-emerald-400 border border-emerald-800/60 shadow-xs">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-sm text-stone-100">{title}</h3>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-900/70 text-emerald-300 border border-emerald-700/60 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  SCAN TO SELL
                </span>
              </div>
              <p className="text-xs text-stone-400">{subtitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-white rounded-lg hover:bg-stone-800 transition cursor-pointer"
            title="Close Scanner"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Live Cart Counter & Continuous Scan Mode Bar */}
        <div className="px-3.5 py-2 bg-stone-950/80 border-b border-stone-800/80 flex items-center justify-between text-xs shrink-0">
          <div className="flex items-center gap-2 text-stone-300">
            <ShoppingCart className="w-4 h-4 text-emerald-400" />
            <span className="font-bold text-white font-mono-numbers">
              {cartItemCount} item{cartItemCount === 1 ? '' : 's'}
            </span>
            <span className="text-stone-500">•</span>
            <span className="font-extrabold text-emerald-400 font-mono-numbers">
              {cartTotal.toFixed(2)} {currency}
            </span>
          </div>

          <label className="flex items-center gap-1.5 text-[11px] text-stone-300 font-medium cursor-pointer select-none">
            <input
              type="checkbox"
              checked={continuousMode}
              onChange={(e) => setContinuousMode(e.target.checked)}
              className="rounded accent-emerald-500 w-3.5 h-3.5"
            />
            <span>Continuous Fast Scan</span>
          </label>
        </div>

        {/* CAMERA SELECTION BAR (Mobile First) */}
        <div className="px-3 py-1.5 bg-stone-900/90 border-b border-stone-800 flex items-center justify-between gap-2 shrink-0 text-xs">
          {/* Active Camera Picker Button */}
          <div className="relative flex-1 min-w-0">
            <button
              type="button"
              onClick={() => setIsCameraPickerOpen(!isCameraPickerOpen)}
              className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-750 border border-stone-700/80 text-stone-200 text-left transition cursor-pointer shadow-xs active:scale-[0.99]"
              title="Tap to select camera lens on this device"
            >
              <div className="flex items-center gap-1.5 truncate">
                <Camera className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <div className="truncate">
                  <span className="font-bold text-white text-[11px] block truncate">
                    {activeCameraObj ? activeCameraObj.displayName : 'Detecting Camera...'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {activeCameraObj && (
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                    activeCameraObj.isBack
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/60'
                      : 'bg-indigo-950 text-indigo-300 border border-indigo-800/60'
                  }`}>
                    {activeCameraObj.badge}
                  </span>
                )}
                <ChevronDown className={`w-3.5 h-3.5 text-stone-400 transition-transform ${isCameraPickerOpen ? 'rotate-180' : ''}`} />
              </div>
            </button>
          </div>

          {/* Quick 1-Tap Flip Camera Button (Rear <-> Front) */}
          {cameras.length > 1 && (
            <button
              type="button"
              disabled={isSwitchingCamera}
              onClick={handleFlipCamera}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-750 active:bg-stone-700 border border-stone-700/80 text-stone-200 text-[11px] font-bold transition cursor-pointer shrink-0 disabled:opacity-50"
              title="Flip between Rear and Front cameras"
            >
              <SwitchCamera className={`w-3.5 h-3.5 text-emerald-400 ${isSwitchingCamera ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Flip</span>
            </button>
          )}

          {/* Digital Zoom Toggle (1x / 2x) on supported mobile cameras */}
          {zoomSupported && (
            <button
              type="button"
              onClick={handleToggleZoom}
              className={`flex items-center gap-1 px-2 py-1.5 rounded-xl border text-[11px] font-mono font-bold transition cursor-pointer shrink-0 ${
                zoomLevel > 1
                  ? 'bg-emerald-900/80 border-emerald-500 text-emerald-200'
                  : 'bg-stone-800 border-stone-700/80 text-stone-300 hover:text-white'
              }`}
              title="Toggle 1x or 2x Digital Zoom for close barcodes"
            >
              <ZoomIn className="w-3.5 h-3.5" />
              <span>{zoomLevel}x</span>
            </button>
          )}

          {/* Torch / Flashlight Toggle */}
          {torchSupported && (
            <button
              type="button"
              onClick={toggleTorch}
              className={`p-1.5 rounded-xl border text-[11px] transition cursor-pointer shrink-0 ${
                torchOn
                  ? 'bg-amber-400 border-amber-300 text-stone-950 shadow-[0_0_12px_rgba(251,191,36,0.5)]'
                  : 'bg-stone-800 border-stone-700/80 text-stone-300 hover:text-white'
              }`}
              title="Toggle Flashlight / Torch"
            >
              <Flashlight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Viewfinder Camera Box */}
        <div className="relative bg-black flex flex-col items-center justify-center min-h-[260px] max-h-[380px] overflow-hidden flex-1">
          <div id={containerId} className="w-full max-w-full overflow-hidden" />

          {/* Camera Switching Spinner Overlay */}
          {isSwitchingCamera && (
            <div className="absolute inset-0 z-30 bg-black/75 flex flex-col items-center justify-center gap-2 backdrop-blur-xs">
              <RefreshCw className="w-7 h-7 text-emerald-400 animate-spin" />
              <span className="text-xs font-bold text-stone-200">Starting Selected Camera...</span>
            </div>
          )}

          {/* CAMERA SELECTION POPUP / DRAWER OVERLAY */}
          {isCameraPickerOpen && (
            <div className="absolute inset-x-0 top-0 z-40 bg-stone-950/95 border-b border-stone-800 p-3.5 shadow-2xl backdrop-blur-md animate-in slide-in-from-top duration-150 max-h-[85%] overflow-y-auto">
              <div className="flex items-center justify-between pb-2 border-b border-stone-800 mb-2">
                <div className="flex items-center gap-1.5">
                  <Video className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold text-white">Choose Scanner Camera ({cameras.length})</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCameraPickerOpen(false)}
                  className="p-1 text-stone-400 hover:text-white rounded-lg hover:bg-stone-800 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {cameras.length === 0 ? (
                <div className="py-4 text-center text-xs text-stone-400">
                  <p>Detecting cameras on your mobile device...</p>
                  <button
                    type="button"
                    onClick={() => refreshCameraList()}
                    className="mt-2 inline-flex items-center gap-1 px-3 py-1 bg-stone-800 text-stone-200 rounded-lg text-xs"
                  >
                    <RefreshCw className="w-3 h-3" /> Refresh
                  </button>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {cameras.map((cam, idx) => {
                    const isSelected = cam.id === selectedCameraId;
                    return (
                      <button
                        key={cam.id || idx}
                        type="button"
                        onClick={() => handleSelectCamera(cam.id)}
                        className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-left transition cursor-pointer ${
                          isSelected
                            ? 'bg-emerald-950/70 border-emerald-500 text-emerald-100 shadow-sm'
                            : 'bg-stone-900 hover:bg-stone-850 border-stone-800 text-stone-300'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={`p-1.5 rounded-lg shrink-0 ${
                            isSelected ? 'bg-emerald-800 text-white' : 'bg-stone-800 text-stone-400'
                          }`}>
                            <Camera className="w-4 h-4" />
                          </div>
                          <div className="truncate">
                            <div className="flex items-center gap-1.5">
                              <span className="font-extrabold text-xs text-white truncate">
                                {cam.displayName}
                              </span>
                              {cam.isRecommended && (
                                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-800/80">
                                  Best for Barcodes
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-stone-400 block truncate">
                              Lens Type: {cam.badge}
                            </span>
                          </div>
                        </div>

                        <div className="shrink-0 flex items-center gap-1.5 ml-2">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            cam.isBack
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/60'
                              : 'bg-indigo-950 text-indigo-300 border border-indigo-800/60'
                          }`}>
                            {cam.isBack ? 'Rear' : 'Front'}
                          </span>
                          {isSelected && <Check className="w-4 h-4 text-emerald-400" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="mt-3 pt-2 border-t border-stone-800/80 flex items-center gap-1.5 text-[10px] text-stone-400">
                <Info className="w-3.5 h-3.5 text-stone-500 shrink-0" />
                <span>Tip: If scanning small barcodes, use the Main Rear (1x) camera or enable 2x zoom.</span>
              </div>
            </div>
          )}

          {/* Overlaid Target Reticle */}
          {isScanning && !cameraError && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="w-68 h-44 border-2 border-emerald-400/80 rounded-2xl relative shadow-[0_0_30px_rgba(16,185,129,0.3)]">
                {/* Corner Accents */}
                <span className="absolute -top-1 -left-1 w-5 h-5 border-t-3 border-l-3 border-emerald-400 rounded-tl-lg" />
                <span className="absolute -top-1 -right-1 w-5 h-5 border-t-3 border-r-3 border-emerald-400 rounded-tr-lg" />
                <span className="absolute -bottom-1 -left-1 w-5 h-5 border-b-3 border-l-3 border-emerald-400 rounded-bl-lg" />
                <span className="absolute -bottom-1 -right-1 w-5 h-5 border-b-3 border-r-3 border-emerald-400 rounded-br-lg" />
                {/* Laser animation */}
                <div className="w-full h-0.5 bg-emerald-400 shadow-[0_0_12px_#34d399] animate-pulse absolute top-1/2 -translate-y-1/2" />
              </div>
            </div>
          )}

          {/* Last Scanned Feedback Toast */}
          {lastScannedFeedback && (
            <div className="absolute top-3 left-4 right-4 z-20 animate-in fade-in slide-in-from-top-2 duration-150">
              {lastScannedFeedback.success ? (
                <div className="p-2.5 rounded-xl bg-emerald-950/95 border border-emerald-500 text-emerald-200 text-xs font-bold flex items-center gap-2 shadow-2xl backdrop-blur-md">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="truncate flex-1">
                    ✓ Scanned &amp; Added to Cart: <strong className="text-white font-mono">{lastScannedFeedback.code}</strong>
                  </span>
                </div>
              ) : (
                <div className="p-2.5 rounded-xl bg-amber-950/95 border border-amber-500 text-amber-200 text-xs font-bold flex items-center gap-2 shadow-2xl backdrop-blur-md">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="truncate flex-1">
                    Code <strong className="text-white font-mono">{lastScannedFeedback.code}</strong> not found in catalog
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Camera Error / Permission Fallback */}
          {cameraError && (
            <div className="p-6 text-center max-w-xs z-10">
              <AlertCircle className="w-10 h-10 text-amber-400 mx-auto mb-2" />
              <p className="text-xs text-stone-300 mb-3">{cameraError}</p>
              <div className="flex gap-2 justify-center">
                <button
                  type="button"
                  onClick={() => startScannerWithCamera(selectedCameraId)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs rounded-xl transition cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Retry Camera
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-800 hover:bg-emerald-700 text-white text-xs rounded-xl transition cursor-pointer"
                >
                  <Camera className="w-3.5 h-3.5" />
                  Snap Photo
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Snap / Upload Photo Scanner Fallback */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileUpload}
          className="hidden"
        />

        {/* Modal Footer Controls */}
        <div className="p-3 bg-stone-950 border-t border-stone-800 space-y-2.5 shrink-0">
          <div className="grid grid-cols-2 gap-2">
            {/* Native Camera Photo Scan Button */}
            <button
              type="button"
              disabled={isProcessingFile}
              onClick={() => fileInputRef.current?.click()}
              className="py-2 px-3 bg-stone-800 hover:bg-stone-750 text-stone-200 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer border border-stone-700"
              title="Snap a photo of the barcode or QR code with device camera"
            >
              <Camera className="w-4 h-4 text-emerald-400" />
              <span>{isProcessingFile ? 'Decoding...' : 'Snap Barcode Photo'}</span>
            </button>

            {/* Done Scanning / View Cart Button */}
            <button
              type="button"
              onClick={onClose}
              className="py-2 px-3 bg-[#064e3b] hover:bg-[#043b2c] text-white font-extrabold text-xs rounded-xl transition flex items-center justify-center gap-1.5 shadow-md cursor-pointer border border-emerald-600/40"
            >
              <ShoppingCart className="w-4 h-4 text-[#6ee7b7]" />
              <span>View Cart ({cartItemCount})</span>
            </button>
          </div>

          {/* Manual Barcode / SKU Fallback Form */}
          <form onSubmit={handleManualSubmit} className="pt-2 border-t border-stone-800/80">
            <div className="flex items-center justify-between text-[11px] text-stone-400 mb-1">
              <span>Or Enter Barcode / SKU Manually:</span>
              <span className="font-mono text-[10px] text-stone-500">Press Enter</span>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="Type barcode, SKU, or product code..."
                className="flex-1 bg-stone-900 border border-stone-700 rounded-xl px-3 py-1.5 text-xs sm:text-sm text-stone-100 placeholder-stone-500 font-mono focus:outline-hidden focus:border-emerald-500"
              />
              <button
                type="submit"
                disabled={!manualCode.trim()}
                className="px-4 py-1.5 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white font-bold text-xs rounded-xl transition flex items-center gap-1 cursor-pointer shrink-0"
              >
                <span>Add to Cart</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
