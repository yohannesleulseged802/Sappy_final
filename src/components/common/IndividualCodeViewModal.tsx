import React, {useState, useRef, useEffect} from 'react';
import {
  X,
  Barcode,
  QrCode,
  Copy,
  Check,
  Download,
  Printer,
  Sparkles,
  ExternalLink,
  Tag,
  Volume2,
  Sliders,
  Layers,
  FileCode,
  Package,
  AlertTriangle,
  Share2,
  FileDown,
} from 'lucide-react';
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import {Product, ProductCode, StoreSettings, CodeType, LabelItem} from '../../types';
import {sound} from '../../services/sound';
import {ExportService} from '../../services/export';

interface IndividualCodeViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  initialCode?: ProductCode | null;
  settings: StoreSettings;
  onSendToStudio?: (items: LabelItem[]) => void;
  onRefreshData?: () => void;
}

export const IndividualCodeViewModal: React.FC<IndividualCodeViewModalProps> = ({
  isOpen,
  onClose,
  product,
  initialCode,
  settings,
  onSendToStudio,
  onRefreshData,
}) => {
  if (!isOpen || !product) return null;

  // Active Code: start with initialCode or primary code or first code or SKU
  const [activeCodeId, setActiveCodeId] = useState<string>(() => {
    if (initialCode) return initialCode.id;
    const primary = product.codes.find((c) => c.isPrimary) || product.codes[0];
    return primary ? primary.id : 'sku-code';
  });

  // Keep synced if product or initialCode changes
  useEffect(() => {
    if (initialCode) {
      setActiveCodeId(initialCode.id);
    } else {
      const primary = product.codes.find((c) => c.isPrimary) || product.codes[0];
      setActiveCodeId(primary ? primary.id : 'sku-code');
    }
  }, [product, initialCode]);

  // Find active code object
  const activeCodeObj: {code: string; type: CodeType; format?: string; label?: string; source?: string} = (() => {
    const found = product.codes.find((c) => c.id === activeCodeId);
    if (found) {
      return {
        code: found.code,
        type: found.type,
        format: found.format || 'CODE128',
        label: found.label || 'Assigned Code',
        source: found.source,
      };
    }
    // Fallback to SKU
    return {
      code: product.sku,
      type: 'barcode',
      format: 'CODE128',
      label: 'Default Product SKU',
      source: 'sku',
    };
  })();

  // Display Mode: 'barcode' | 'qr' | 'both' | 'sticker'
  const [displayMode, setDisplayMode] = useState<'barcode' | 'qr' | 'both' | 'sticker'>(() => {
    if (activeCodeObj.type === 'qr') return 'qr';
    if (activeCodeObj.type === 'both') return 'both';
    return 'barcode';
  });

  // Barcode format override for 1D
  const [selectedFormat, setSelectedFormat] = useState<string>(activeCodeObj.format || 'CODE128');

  // Print copies state for quick print
  const [printCopies, setPrintCopies] = useState<number>(4);

  // Copy to clipboard state
  const [isCopied, setIsCopied] = useState(false);

  // Test scan simulation state
  const [isTestScanning, setIsTestScanning] = useState(false);
  const [testScanResult, setTestScanResult] = useState<string | null>(null);

  // Customization options
  const [barcodeScale, setBarcodeScale] = useState<'compact' | 'standard' | 'large'>('standard');
  const [showTextUnderBarcode, setShowTextUnderBarcode] = useState(true);
  const [showPriceOnSticker, setShowPriceOnSticker] = useState(true);

  // Canvas and SVG refs
  const svgBarcodeRef = useRef<SVGSVGElement>(null);
  const canvasQrRef = useRef<HTMLCanvasElement>(null);

  // Render Barcode via JsBarcode
  useEffect(() => {
    if (svgBarcodeRef.current && (displayMode === 'barcode' || displayMode === 'both' || displayMode === 'sticker')) {
      try {
        let fmt = selectedFormat.toUpperCase();
        if (fmt === 'EAN13' && activeCodeObj.code.length !== 12 && activeCodeObj.code.length !== 13) {
          fmt = 'CODE128';
        }
        if (fmt === 'UPC' && activeCodeObj.code.length !== 11 && activeCodeObj.code.length !== 12) {
          fmt = 'CODE128';
        }

        const barWidth = barcodeScale === 'compact' ? 1.5 : barcodeScale === 'large' ? 2.5 : 2;
        const barHeight = barcodeScale === 'compact' ? 45 : barcodeScale === 'large' ? 75 : 60;

        JsBarcode(svgBarcodeRef.current, activeCodeObj.code, {
          format: fmt,
          width: barWidth,
          height: barHeight,
          displayValue: showTextUnderBarcode,
          fontSize: 14,
          font: 'JetBrains Mono',
          lineColor: '#26201b',
          margin: 10,
          background: '#ffffff',
        });
      } catch (err) {
        // Fallback to CODE128
        try {
          if (svgBarcodeRef.current) {
            JsBarcode(svgBarcodeRef.current, activeCodeObj.code, {
              format: 'CODE128',
              width: 2,
              height: 55,
              displayValue: showTextUnderBarcode,
              fontSize: 14,
              font: 'JetBrains Mono',
              lineColor: '#26201b',
              margin: 10,
              background: '#ffffff',
            });
          }
        } catch {}
      }
    }
  }, [activeCodeObj.code, selectedFormat, displayMode, barcodeScale, showTextUnderBarcode]);

  // Render QR Code via QRCode.toCanvas
  useEffect(() => {
    if (canvasQrRef.current && (displayMode === 'qr' || displayMode === 'both' || displayMode === 'sticker')) {
      const qrWidth = barcodeScale === 'compact' ? 140 : barcodeScale === 'large' ? 240 : 190;
      QRCode.toCanvas(
        canvasQrRef.current,
        activeCodeObj.code,
        {
          width: qrWidth,
          margin: 1,
          color: {
            dark: '#26201b',
            light: '#ffffff',
          },
        },
        () => {}
      );
    }
  }, [activeCodeObj.code, displayMode, barcodeScale]);

  // Copy code to clipboard
  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(activeCodeObj.code);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      // Fallback
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  // Test scan simulation
  const handleTestScan = () => {
    sound.playScanSuccess();
    setIsTestScanning(true);
    setTestScanResult(`DECODED: ${activeCodeObj.code} (${product.name})`);
    setTimeout(() => {
      setIsTestScanning(false);
    }, 1200);
  };

  // Download high-resolution PNG
  const handleDownloadPNG = async () => {
    try {
      if (displayMode === 'qr') {
        const url = await QRCode.toDataURL(activeCodeObj.code, {
          width: 600,
          margin: 2,
          color: {
            dark: '#26201b',
            light: '#ffffff',
          },
        });
        const a = document.createElement('a');
        a.href = url;
        a.download = `${product.sku}_qr_${activeCodeObj.code}.png`;
        a.click();
      } else {
        // Render barcode onto offscreen high-res canvas
        const canvas = document.createElement('canvas');
        JsBarcode(canvas, activeCodeObj.code, {
          format: selectedFormat === 'EAN13' && (activeCodeObj.code.length === 12 || activeCodeObj.code.length === 13) ? 'EAN13' : 'CODE128',
          width: 3,
          height: 100,
          displayValue: true,
          fontSize: 16,
          font: 'JetBrains Mono',
          lineColor: '#26201b',
          margin: 15,
          background: '#ffffff',
        });
        const a = document.createElement('a');
        a.href = canvas.toDataURL('image/png');
        a.download = `${product.sku}_barcode_${activeCodeObj.code}.png`;
        a.click();
      }
    } catch (e) {
      alert('Unable to download PNG image.');
    }
  };

  // Download SVG Vector
  const handleDownloadSVG = () => {
    if (svgBarcodeRef.current && (displayMode === 'barcode' || displayMode === 'both' || displayMode === 'sticker')) {
      const serializer = new XMLSerializer();
      const source = serializer.serializeToString(svgBarcodeRef.current);
      const blob = new Blob([source], {type: 'image/svg+xml;charset=utf-8'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${product.sku}_barcode_${activeCodeObj.code}.svg`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      handleDownloadPNG();
    }
  };

  // Send to Barcode & QR Studio Queue
  const handleOpenInStudio = () => {
    if (onSendToStudio) {
      const item: LabelItem = {
        id: `lbl-${Date.now()}-${product.id}`,
        productId: product.id,
        name: product.name,
        sku: product.sku,
        code: activeCodeObj.code,
        price: product.sellingPrice,
        type: displayMode === 'qr' ? 'qr' : displayMode === 'both' ? 'both' : 'barcode',
        copies: printCopies,
      };
      onSendToStudio([item]);
      onClose();
    }
  };

  // Direct print single label
  const handlePrintIndividual = () => {
    window.print();
  };

  // Export individual barcode / QR code to PDF
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const handleExportPDF = async () => {
    setIsExportingPDF(true);
    try {
      await ExportService.exportIndividualBarcodeToPDF(
        product,
        activeCodeObj.code,
        displayMode === 'qr' ? 'qr' : displayMode === 'both' ? 'both' : 'barcode',
        printCopies,
        settings,
        {
          template: 'a4_30up',
          showStoreName: true,
          showPrice: showPriceOnSticker,
          showSku: true,
          showProductName: true,
          showBorder: true,
          barcodeFormat: selectedFormat,
        }
      );
    } catch (err: any) {
      alert(err?.message || 'Failed to generate PDF.');
    } finally {
      setIsExportingPDF(false);
    }
  };

  const isLowStock = product.currentStock > 0 && product.currentStock <= product.minStockThreshold;
  const isOutOfStock = product.currentStock <= 0 && product.category !== 'Print Services';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-xs">
      <div className="w-full max-w-4xl bg-white dark:bg-[#1a1714] border border-[#e6dfd5] dark:border-[#382f27] rounded-3xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* ================= HEADER ================= */}
        <div className="p-4 sm:px-6 bg-[#fdfbf7] dark:bg-[#201b17] border-b border-[#e6dfd5] dark:border-[#382f27] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#064e3b] dark:bg-[#6ee7b7]/20 flex items-center justify-center text-white dark:text-[#6ee7b7] shadow-sm">
              {displayMode === 'qr' ? <QrCode className="w-5 h-5" /> : <Barcode className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-stone-900 dark:text-stone-100 leading-snug">
                  Individual Barcode &amp; QR Code View
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold">
                  {product.sku}
                </span>
              </div>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                {product.name} • {product.category}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ================= BODY SPLIT VIEW ================= */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          {/* ================= LEFT: HIGH-RES CODE VIEWER & GRAPHIC ================= */}
          <div className="flex-1 bg-stone-100/60 dark:bg-[#12100e] p-4 sm:p-6 flex flex-col justify-between overflow-y-auto border-b lg:border-b-0 lg:border-r border-[#e6dfd5] dark:border-[#382f27]">
            {/* Display Mode Switcher Tabs */}
            <div className="flex items-center justify-between gap-2 mb-4 shrink-0">
              <div className="inline-flex rounded-xl bg-white dark:bg-stone-900 p-1 border border-stone-200 dark:border-stone-800 shadow-2xs text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setDisplayMode('barcode')}
                  className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                    displayMode === 'barcode'
                      ? 'bg-[#064e3b] text-white shadow-xs'
                      : 'text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800'
                  }`}
                >
                  <Barcode className="w-3.5 h-3.5" />
                  <span>1D Barcode</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDisplayMode('qr')}
                  className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                    displayMode === 'qr'
                      ? 'bg-[#064e3b] text-white shadow-xs'
                      : 'text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800'
                  }`}
                >
                  <QrCode className="w-3.5 h-3.5" />
                  <span>2D QR Code</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDisplayMode('both')}
                  className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                    displayMode === 'both'
                      ? 'bg-[#064e3b] text-white shadow-xs'
                      : 'text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Dual View</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDisplayMode('sticker')}
                  className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                    displayMode === 'sticker'
                      ? 'bg-[#064e3b] text-white shadow-xs'
                      : 'text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800'
                  }`}
                >
                  <Tag className="w-3.5 h-3.5" />
                  <span>Retail Sticker</span>
                </button>
              </div>

              {/* Laser Scan Test Button */}
              <button
                type="button"
                onClick={handleTestScan}
                className="px-3 py-1.5 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 hover:border-emerald-500 rounded-xl text-xs font-bold text-stone-700 dark:text-stone-200 flex items-center gap-1.5 shadow-2xs transition cursor-pointer"
                title="Simulate barcode laser scan with sound confirmation"
              >
                <Volume2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Test Beep</span>
              </button>
            </div>

            {/* Graphic Stage Card */}
            <div className="relative my-auto flex-1 flex flex-col items-center justify-center p-6 bg-white rounded-2xl border border-stone-200 dark:border-stone-800 shadow-sm min-h-[260px] overflow-hidden">
              {/* Laser Animation Simulation */}
              {isTestScanning && (
                <div className="absolute inset-0 pointer-events-none z-20 flex items-center">
                  <div className="w-full h-1 bg-red-500 shadow-[0_0_12px_#ef4444] animate-pulse" />
                </div>
              )}

              {/* 1. Barcode View */}
              {displayMode === 'barcode' && (
                <div className="flex flex-col items-center justify-center max-w-full">
                  <svg ref={svgBarcodeRef} className="max-w-full" />
                </div>
              )}

              {/* 2. QR Code View */}
              {displayMode === 'qr' && (
                <div className="flex flex-col items-center justify-center">
                  <canvas ref={canvasQrRef} className="rounded-xl shadow-xs" />
                  <span className="text-xs font-mono font-bold text-stone-700 mt-3 px-3 py-1 bg-stone-100 rounded-lg">
                    {activeCodeObj.code}
                  </span>
                </div>
              )}

              {/* 3. Dual View */}
              {displayMode === 'both' && (
                <div className="flex flex-col sm:flex-row items-center justify-center gap-6 max-w-full">
                  <div className="flex flex-col items-center">
                    <svg ref={svgBarcodeRef} className="max-w-full" />
                    <span className="text-[10px] text-stone-400 uppercase font-bold mt-1">
                      1D Linear Barcode
                    </span>
                  </div>
                  <div className="h-28 w-px bg-stone-200 hidden sm:block" />
                  <div className="flex flex-col items-center">
                    <canvas ref={canvasQrRef} className="rounded-xl shadow-2xs" />
                    <span className="text-[10px] text-stone-400 uppercase font-bold mt-1">
                      2D Matrix QR Code
                    </span>
                  </div>
                </div>
              )}

              {/* 4. Realistic Retail Sticker Preview */}
              {displayMode === 'sticker' && (
                <div
                  id="thermal-receipt-area"
                  className="w-[72mm] p-4 bg-white text-black border-2 border-dashed border-stone-400 rounded-lg shadow-md flex flex-col items-center text-center leading-tight"
                >
                  <div className="text-[9px] font-black uppercase tracking-widest text-stone-700">
                    {settings.storeName}
                  </div>
                  <div className="text-[11px] font-extrabold text-black mt-1 line-clamp-1 max-w-[220px]">
                    {product.name}
                  </div>

                  <div className="my-1 scale-95">
                    <svg ref={svgBarcodeRef} className="max-w-full" />
                  </div>

                  <div className="flex items-center justify-between w-full px-2 text-[9px] font-mono mt-1 pt-1 border-t border-stone-200">
                    <span>{product.sku}</span>
                    {showPriceOnSticker && (
                      <span className="text-[11px] font-black">
                        {product.sellingPrice.toFixed(2)} {settings.currency}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Test Scan Status Feedback */}
              {testScanResult && (
                <div className="mt-3 px-3 py-1 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-full text-xs font-bold animate-in fade-in flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-700" />
                  <span>{testScanResult}</span>
                </div>
              )}
            </div>

            {/* Viewer Controls Toolbar */}
            <div className="mt-4 pt-3 border-t border-stone-200 dark:border-stone-800 flex flex-wrap items-center justify-between gap-2 text-xs">
              {/* Size Scale */}
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-stone-500 dark:text-stone-400 font-semibold">
                  Scale:
                </span>
                <div className="inline-flex rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-0.5 text-[11px] font-bold">
                  {(['compact', 'standard', 'large'] as const).map((sc) => (
                    <button
                      key={sc}
                      type="button"
                      onClick={() => setBarcodeScale(sc)}
                      className={`px-2 py-0.5 rounded capitalize transition ${
                        barcodeScale === sc
                          ? 'bg-[#064e3b] text-white shadow-xs'
                          : 'text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800'
                      }`}
                    >
                      {sc}
                    </button>
                  ))}
                </div>
              </div>

              {/* Format Switcher (for 1D barcode) */}
              {displayMode !== 'qr' && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-stone-500 dark:text-stone-400 font-semibold">
                    1D Format:
                  </span>
                  <select
                    value={selectedFormat}
                    onChange={(e) => setSelectedFormat(e.target.value)}
                    className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg px-2 py-0.5 text-[11px] font-mono font-bold"
                  >
                    <option value="CODE128">CODE 128 (Standard)</option>
                    <option value="EAN13">EAN-13 (Packaging)</option>
                    <option value="UPC">UPC-A (Retail)</option>
                    <option value="CODE39">CODE 39 (Alphanumeric)</option>
                  </select>
                </div>
              )}

              {/* Toggle text under code */}
              <label className="flex items-center gap-1.5 text-[11px] text-stone-600 dark:text-stone-300 cursor-pointer font-medium">
                <input
                  type="checkbox"
                  checked={showTextUnderBarcode}
                  onChange={(e) => setShowTextUnderBarcode(e.target.checked)}
                />
                <span>Human-Readable Text</span>
              </label>
            </div>
          </div>

          {/* ================= RIGHT: PRODUCT METADATA & ACTIONS ================= */}
          <div className="w-full lg:w-96 bg-white dark:bg-[#1c1815] p-4 sm:p-6 flex flex-col justify-between overflow-y-auto space-y-5 shrink-0">
            <div className="space-y-4">
              {/* Product Info Card */}
              <div className="p-3.5 bg-[#fdfbf7] dark:bg-[#201b17] border border-[#e6dfd5] dark:border-[#382f27] rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-black tracking-wider text-stone-400">
                    Product Summary
                  </span>
                  {isOutOfStock ? (
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                      Out of Stock
                    </span>
                  ) : isLowStock ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                      Low: {product.currentStock} {product.unit}
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      In Stock: {product.currentStock} {product.unit}
                    </span>
                  )}
                </div>

                <div>
                  <h3 className="font-extrabold text-sm text-stone-900 dark:text-stone-100">
                    {product.name}
                  </h3>
                  <div className="text-xs text-stone-500 font-mono mt-0.5">
                    SKU: <span className="font-bold text-stone-700 dark:text-stone-300">{product.sku}</span>
                    {product.brand && <span> • {product.brand}</span>}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-stone-200 dark:border-stone-800 text-xs">
                  <div>
                    <span className="text-stone-400 text-[10px] block">Selling Price</span>
                    <span className="font-extrabold text-[#064e3b] dark:text-[#6ee7b7] text-sm font-mono">
                      {product.sellingPrice.toFixed(2)} {settings.currency}
                    </span>
                  </div>
                  <div>
                    <span className="text-stone-400 text-[10px] block">Cost Price</span>
                    <span className="font-medium text-stone-600 dark:text-stone-400 text-xs font-mono">
                      {product.costPrice.toFixed(2)} {settings.currency}
                    </span>
                  </div>
                </div>
              </div>

              {/* Code String Card with Copy Button */}
              <div className="p-3 bg-stone-50 dark:bg-stone-900/80 border border-stone-200 dark:border-stone-800 rounded-2xl space-y-2">
                <span className="text-[10px] uppercase font-bold text-stone-400 block">
                  Active Code String
                </span>
                <div className="flex items-center justify-between gap-2 p-2 bg-white dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-xl">
                  <span className="font-mono font-black text-sm text-stone-900 dark:text-stone-100 truncate">
                    {activeCodeObj.code}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyCode}
                    className="p-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-500 hover:text-emerald-700 transition cursor-pointer"
                    title="Copy code value to clipboard"
                  >
                    {isCopied ? (
                      <Check className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>

                <div className="flex items-center justify-between text-[11px] text-stone-500 dark:text-stone-400 pt-1">
                  <span>Type: <strong className="text-stone-700 dark:text-stone-300 uppercase">{activeCodeObj.type}</strong></span>
                  <span>Format: <strong className="font-mono text-stone-700 dark:text-stone-300">{selectedFormat}</strong></span>
                </div>
              </div>

              {/* Assigned Codes List for This Product */}
              {product.codes.length > 0 && (
                <div>
                  <span className="text-[11px] font-bold text-stone-700 dark:text-stone-300 block mb-1.5">
                    Assigned Product Identifiers ({product.codes.length})
                  </span>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto">
                    {product.codes.map((c) => {
                      const isActive = c.id === activeCodeId;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setActiveCodeId(c.id);
                            if (c.type === 'qr') setDisplayMode('qr');
                            else if (c.type === 'both') setDisplayMode('both');
                            else setDisplayMode('barcode');
                          }}
                          className={`w-full text-left p-2 rounded-xl border text-xs flex items-center justify-between transition cursor-pointer ${
                            isActive
                              ? 'border-[#064e3b] dark:border-[#6ee7b7] bg-emerald-50/50 dark:bg-[#142920]'
                              : 'border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-850'
                          }`}
                        >
                          <div className="truncate pr-2">
                            <div className="font-mono font-bold text-stone-900 dark:text-stone-100 truncate">
                              {c.code}
                            </div>
                            <div className="text-[10px] text-stone-400">
                              {c.label || c.source || c.type} {c.isPrimary && '• PRIMARY'}
                            </div>
                          </div>
                          <div className="shrink-0 text-stone-400">
                            {c.type === 'qr' ? <QrCode className="w-3.5 h-3.5" /> : <Barcode className="w-3.5 h-3.5" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* ================= ACTION BUTTONS FOOTER ================= */}
            <div className="pt-3 border-t border-stone-200 dark:border-stone-800 space-y-2 shrink-0">
              {/* Quick Print Row */}
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-stone-100 dark:bg-stone-850 p-1 rounded-xl text-xs">
                  <span className="text-[11px] font-semibold text-stone-500 pl-1">Copies:</span>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={printCopies}
                    onChange={(e) => setPrintCopies(parseInt(e.target.value, 10) || 1)}
                    className="w-10 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-center font-bold font-mono rounded py-1 text-xs"
                  />
                </div>

                {onSendToStudio && (
                  <button
                    type="button"
                    onClick={handleOpenInStudio}
                    className="flex-1 py-2 px-3 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 text-[#064e3b] dark:text-[#6ee7b7] border border-emerald-300 dark:border-emerald-800 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                    title="Send this item into the batch Barcode Studio print queue"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Send to Studio</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handlePrintIndividual}
                  className="py-2 px-3 bg-[#064e3b] hover:bg-[#043b2c] text-white rounded-xl text-xs font-extrabold shadow-sm transition flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                  title="Print this label right now"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Label</span>
                </button>
              </div>

              {/* PDF Export & Image/Vector Download Row */}
              <div className="space-y-1.5 pt-1">
                <button
                  type="button"
                  onClick={handleExportPDF}
                  disabled={isExportingPDF}
                  className="w-full py-2 px-3 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-[#064e3b] dark:text-[#6ee7b7] border border-emerald-300 dark:border-emerald-800 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-2xs"
                  title={`Export ${printCopies} label copies as print-ready PDF`}
                >
                  <FileDown className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>{isExportingPDF ? 'GENERATING PDF...' : `EXPORT PDF (${printCopies} COPIES)`}</span>
                </button>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={handleDownloadPNG}
                    className="py-1.5 px-3 border border-stone-200 dark:border-stone-800 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-xl text-stone-700 dark:text-stone-300 font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download PNG</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadSVG}
                    className="py-1.5 px-3 border border-stone-200 dark:border-stone-800 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-xl text-stone-700 dark:text-stone-300 font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <FileCode className="w-3.5 h-3.5" />
                    <span>Download SVG</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
