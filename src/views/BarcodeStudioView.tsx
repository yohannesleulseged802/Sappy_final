import React, {useState, useMemo, useEffect} from 'react';
import {
  QrCode,
  Barcode,
  Printer,
  Copy,
  Plus,
  Minus,
  Trash2,
  Check,
  Search,
  Settings2,
  FileDown,
  Layers,
  Sparkles,
  Camera,
  CheckSquare,
  ListPlus,
  SlidersHorizontal,
  AlertTriangle,
  RotateCcw,
  Package,
} from 'lucide-react';
import {Product, StoreSettings, LabelItem, CodeType} from '../types';
import {BarcodeRenderer} from '../components/common/BarcodeRenderer';
import {CameraScannerModal} from '../components/common/CameraScannerModal';
import {ItemSelectorModal, SelectedItemConfig} from '../components/common/ItemSelectorModal';
import {IndividualCodeViewModal} from '../components/common/IndividualCodeViewModal';
import {storage} from '../services/storage';
import {ExportService} from '../services/export';

interface BarcodeStudioViewProps {
  products: Product[];
  settings: StoreSettings;
  queuedItems?: LabelItem[];
  onQueueChanged?: (items: LabelItem[]) => void;
  onRefreshData: () => void;
}

export const BarcodeStudioView: React.FC<BarcodeStudioViewProps> = ({
  products,
  settings,
  queuedItems,
  onQueueChanged,
  onRefreshData,
}) => {
  // Label Sheet Settings
  const [labelTemplate, setLabelTemplate] = useState<
    'a4_30up' | 'a4_24up' | 'thermal_50x30' | 'thermal_40x25' | 'thermal_60x40'
  >('a4_30up');
  const [showStoreName, setShowStoreName] = useState(true);
  const [showPrice, setShowPrice] = useState(true);
  const [showSku, setShowSku] = useState(true);
  const [showProductName, setShowProductName] = useState(true);
  const [mobileTab, setMobileTab] = useState<'controls' | 'preview'>('controls');

  // Individual Code View Modal State
  const [individualViewProduct, setIndividualViewProduct] = useState<Product | null>(null);
  const [individualViewCode, setIndividualViewCode] = useState<any | null>(null);
  const [isIndividualModalOpen, setIsIndividualModalOpen] = useState(false);

  const handleOpenLabelIndividualView = (lbl: LabelItem) => {
    const existing = products.find((p) => p.id === lbl.productId);
    if (existing) {
      setIndividualViewProduct(existing);
      const codeObj = existing.codes.find((c) => c.code === lbl.code) || {
        id: `code-${lbl.id}`,
        code: lbl.code,
        type: lbl.type,
        format: 'CODE128',
        source: 'generated',
        isPrimary: true,
        active: true,
        createdDate: new Date().toISOString(),
      };
      setIndividualViewCode(codeObj);
    } else {
      const tempProd: Product = {
        id: lbl.productId || `custom-${lbl.id}`,
        name: lbl.name,
        sku: lbl.sku,
        description: '',
        category: 'Custom Label',
        brand: 'Standard',
        costPrice: 0,
        sellingPrice: lbl.price,
        currentStock: 100,
        minStockThreshold: 5,
        unit: 'pcs',
        codes: [
          {
            id: `code-${lbl.id}`,
            code: lbl.code,
            type: lbl.type,
            format: 'CODE128',
            source: 'generated',
            isPrimary: true,
            active: true,
            createdDate: new Date().toISOString(),
          },
        ],
        createdDate: new Date().toISOString(),
        updatedDate: new Date().toISOString(),
      };
      setIndividualViewProduct(tempProd);
      setIndividualViewCode(tempProd.codes[0]);
    }
    setIsIndividualModalOpen(true);
  };

  // Queue of labels to print
  const [selectedLabels, setSelectedLabels] = useState<LabelItem[]>(() => {
    if (queuedItems && queuedItems.length > 0) {
      return queuedItems;
    }
    // Pre-populate with first 3 products
    return products.slice(0, 3).map((p) => {
      const primary = p.codes.find((c) => c.isPrimary) || p.codes[0];
      return {
        id: `lbl-${p.id}`,
        productId: p.id,
        name: p.name,
        sku: p.sku,
        code: primary?.code || p.sku,
        price: p.sellingPrice,
        type: (primary?.type as CodeType) || 'barcode',
        copies: 4,
      };
    });
  });

  // Sync if queuedItems changed from outside (e.g., from InventoryView)
  useEffect(() => {
    if (queuedItems && queuedItems.length > 0) {
      setSelectedLabels(queuedItems);
    }
  }, [queuedItems]);

  // Keep parent notified if callback provided
  const updateQueue = (newItems: LabelItem[]) => {
    setSelectedLabels(newItems);
    if (onQueueChanged) onQueueChanged(newItems);
  };

  // Quick product search to add to print batch
  const [searchProductQuery, setSearchProductQuery] = useState('');
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isSelectorModalOpen, setIsSelectorModalOpen] = useState(false);
  const [isExportingPDF, setIsExportingPDF] = useState(false);

  const handleExportPDF = async () => {
    if (selectedLabels.length === 0 || totalStickersCount === 0) return;
    setIsExportingPDF(true);
    try {
      await ExportService.exportBarcodeLabelsToPDF(selectedLabels, settings, {
        template: labelTemplate,
        showStoreName,
        showPrice,
        showSku,
        showProductName,
        showBorder: true,
        barcodeFormat: 'CODE128',
      });
    } catch (err: any) {
      alert(err?.message || 'Failed to export PDF.');
    } finally {
      setIsExportingPDF(false);
    }
  };

  // Custom standalone code generator state
  const [customText, setCustomText] = useState('');
  const [customCode, setCustomCode] = useState('');
  const [customPrice, setCustomPrice] = useState<number>(0);
  const [customType, setCustomType] = useState<CodeType>('barcode');
  const [customCopies, setCustomCopies] = useState<number>(6);

  const filteredProducts = useMemo(() => {
    if (!searchProductQuery.trim()) return [];
    const q = searchProductQuery.toLowerCase();
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.codes.some((c) => c.code.toLowerCase().includes(q))
      )
      .slice(0, 8);
  }, [products, searchProductQuery]);

  const addProductToLabels = (p: Product) => {
    const primary = p.codes.find((c) => c.isPrimary) || p.codes[0];
    const exists = selectedLabels.find((l) => l.productId === p.id);
    if (exists) {
      updateQueue(
        selectedLabels.map((l) =>
          l.productId === p.id ? {...l, copies: l.copies + 2} : l
        )
      );
    } else {
      updateQueue([
        ...selectedLabels,
        {
          id: `lbl-${Date.now()}-${p.id}`,
          productId: p.id,
          name: p.name,
          sku: p.sku,
          code: primary?.code || p.sku,
          price: p.sellingPrice,
          type: (primary?.type as CodeType) || 'barcode',
          copies: 4,
        },
      ]);
    }
    setSearchProductQuery('');
  };

  // Callback from ItemSelectorModal
  const handleBatchSelectedItems = (configs: SelectedItemConfig[]) => {
    // Map configs to LabelItem format
    const newItems: LabelItem[] = configs.map((c) => ({
      id: `lbl-${Date.now()}-${c.product.id}-${Math.random().toString(36).substring(2, 5)}`,
      productId: c.product.id,
      name: c.product.name,
      sku: c.product.sku,
      code: c.code || c.product.sku,
      price: c.product.sellingPrice,
      type: c.type,
      copies: c.copies,
    }));

    // Merge or replace: if queue is empty or user wants replace, replace; otherwise append non-duplicates or update
    const existingMap = new Map(selectedLabels.map((l) => [l.productId, l]));
    const merged: LabelItem[] = [];

    newItems.forEach((item) => {
      if (item.productId && existingMap.has(item.productId)) {
        // update existing
        const old = existingMap.get(item.productId)!;
        merged.push({
          ...old,
          code: item.code,
          type: item.type,
          copies: item.copies,
        });
        existingMap.delete(item.productId);
      } else {
        merged.push(item);
      }
    });

    // Add remaining existing
    existingMap.forEach((val) => merged.push(val));

    updateQueue(merged);
  };

  // Add custom standalone label
  const addCustomLabel = () => {
    if (!customCode.trim()) return;
    updateQueue([
      ...selectedLabels,
      {
        id: `custom-${Date.now()}`,
        name: customText.trim() || 'Custom Label',
        sku: 'CUSTOM',
        code: customCode.trim(),
        price: customPrice,
        type: customType,
        copies: customCopies,
      },
    ]);
    setCustomText('');
    setCustomCode('');
    setCustomPrice(0);
  };

  // Batch actions on queue
  const setAllQueueCopies = (copies: number) => {
    updateQueue(selectedLabels.map((l) => ({...l, copies})));
  };

  const setAllQueueCopiesToStock = () => {
    const prodMap = new Map(products.map((p) => [p.id, p]));
    updateQueue(
      selectedLabels.map((l) => {
        if (l.productId && prodMap.has(l.productId)) {
          const st = prodMap.get(l.productId)!.currentStock;
          return {...l, copies: Math.max(1, Math.min(50, st))};
        }
        return l;
      })
    );
  };

  const setAllQueueType = (type: CodeType) => {
    updateQueue(selectedLabels.map((l) => ({...l, type})));
  };

  // Generate flat array of all individual stickers based on copies
  const flatLabels = useMemo(() => {
    const result: LabelItem[] = [];
    selectedLabels.forEach((item) => {
      for (let i = 0; i < item.copies; i++) {
        result.push(item);
      }
    });
    return result;
  }, [selectedLabels]);

  const totalStickersCount = flatLabels.length;

  return (
    <div className="flex-1 min-h-0 flex flex-col xl:flex-row h-full max-h-full overflow-hidden bg-[#fdfbf7] dark:bg-[#12100e]">
      {/* Mobile / Small Screen View Switcher (< xl) */}
      <div className="xl:hidden flex items-center justify-between border-b border-[#e6dfd5] dark:border-[#362e26] bg-[#f5f1e8] dark:bg-[#1a1613] p-1.5 shrink-0 z-20">
        <button
          onClick={() => setMobileTab('controls')}
          className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
            mobileTab === 'controls'
              ? 'bg-[#064e3b] text-white shadow-xs'
              : 'text-stone-600 dark:text-stone-300 hover:bg-stone-200/60 dark:hover:bg-stone-800'
          }`}
        >
          <QrCode className="w-3.5 h-3.5" />
          <span>Queue &amp; Settings ({selectedLabels.length})</span>
        </button>
        <button
          onClick={() => setMobileTab('preview')}
          className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
            mobileTab === 'preview'
              ? 'bg-[#064e3b] text-white shadow-xs'
              : 'text-stone-600 dark:text-stone-300 hover:bg-stone-200/60 dark:hover:bg-stone-800'
          }`}
        >
          <Printer className="w-3.5 h-3.5" />
          <span>Live Sheet ({totalStickersCount} Stickers)</span>
        </button>
      </div>

      {/* ================= LEFT CONTROLS: QUEUE & GENERATOR ================= */}
      <div className={`w-full xl:w-96 bg-white dark:bg-[#1c1815] border-r border-[#e6dfd5] dark:border-[#362e26] flex-1 min-h-0 xl:flex-none flex-col xl:h-full xl:shrink-0 overflow-y-auto touch-scroll overscroll-contain pb-24 xl:pb-4 ${mobileTab === 'controls' ? 'flex' : 'hidden xl:flex'}`}>
        {/* Header */}
        <div className="p-4 border-b border-[#e6dfd5] dark:border-[#362e26]">
          <div className="flex items-center justify-between">
            <h2 className="font-extrabold text-base text-[#064e3b] dark:text-[#6ee7b7] flex items-center gap-2">
              <QrCode className="w-5 h-5" />
              <span>Barcode &amp; QR Studio</span>
            </h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-mono font-bold">
              {selectedLabels.length} Items
            </span>
          </div>
          <p className="text-xs text-stone-500 mt-0.5">
            Design and batch print retail barcode &amp; QR stickers
          </p>
        </div>

        <div className="p-4 space-y-5 flex-1">
          {/* PRIMARY: BROWSE & SELECT ITEMS FROM CATALOG */}
          <div className="p-3.5 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-[#142920] dark:to-[#172e25] border border-emerald-200 dark:border-emerald-800/80 rounded-2xl shadow-xs space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-[#064e3b] dark:text-[#6ee7b7] flex items-center gap-1.5">
                <CheckSquare className="w-4 h-4" />
                <span>Select Items to Generate</span>
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-white/80 dark:bg-stone-900/80 text-stone-600 dark:text-stone-300">
                {products.length} In Catalog
              </span>
            </div>

            <p className="text-[11px] text-stone-600 dark:text-stone-300">
              Pick multiple products, customize label copies, and choose Barcode (1D) or QR Code formats.
            </p>

            <button
              type="button"
              onClick={() => setIsSelectorModalOpen(true)}
              className="w-full py-2.5 px-3 bg-[#064e3b] hover:bg-[#043b2c] text-white rounded-xl text-xs font-extrabold shadow-sm flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <ListPlus className="w-4 h-4" />
              <span>Browse &amp; Select Items ({selectedLabels.length} queued)</span>
            </button>

            {/* Quick Preset Buttons */}
            <div className="grid grid-cols-2 gap-1.5 pt-1 text-[11px]">
              <button
                type="button"
                onClick={() => {
                  // Select all products
                  const allItems: LabelItem[] = products.map((p) => {
                    const primary = p.codes.find((c) => c.isPrimary) || p.codes[0];
                    return {
                      id: `lbl-${p.id}`,
                      productId: p.id,
                      name: p.name,
                      sku: p.sku,
                      code: primary?.code || p.sku,
                      price: p.sellingPrice,
                      type: (primary?.type as CodeType) || 'barcode',
                      copies: 2,
                    };
                  });
                  updateQueue(allItems);
                }}
                className="py-1 px-2 bg-white dark:bg-stone-900 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950 text-stone-700 dark:text-stone-200 rounded-lg font-semibold text-center transition cursor-pointer"
              >
                + Select All Catalog
              </button>

              <button
                type="button"
                onClick={() => {
                  // Select low-stock items
                  const lowStockItems = products
                    .filter((p) => p.currentStock > 0 && p.currentStock <= p.minStockThreshold)
                    .map((p) => {
                      const primary = p.codes.find((c) => c.isPrimary) || p.codes[0];
                      return {
                        id: `lbl-${p.id}`,
                        productId: p.id,
                        name: p.name,
                        sku: p.sku,
                        code: primary?.code || p.sku,
                        price: p.sellingPrice,
                        type: (primary?.type as CodeType) || 'barcode',
                        copies: 4,
                      };
                    });
                  updateQueue(lowStockItems);
                }}
                className="py-1 px-2 bg-white dark:bg-stone-900 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950 text-stone-700 dark:text-stone-200 rounded-lg font-semibold text-center transition cursor-pointer"
              >
                + Select Low-Stock
              </button>
            </div>
          </div>

          {/* Quick Single Product Search */}
          <div>
            <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1.5">
              Quick Add Single Product
            </label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                type="search"
                inputMode="search"
                enterKeyHint="search"
                autoComplete="off"
                value={searchProductQuery}
                onChange={(e) => setSearchProductQuery(e.target.value)}
                placeholder="Search name, SKU, or code..."
                className="w-full bg-[#f5f1e8] dark:bg-[#25201b] border border-transparent focus:border-[#064e3b] dark:focus:border-[#6ee7b7] rounded-xl pl-9 pr-4 py-2 text-xs sm:text-xs text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-hidden"
              />
            </div>

            {filteredProducts.length > 0 && (
              <div className="mt-1 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl shadow-lg max-h-48 overflow-y-auto divide-y divide-stone-100 dark:divide-stone-800">
                {filteredProducts.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => addProductToLabels(p)}
                    className="w-full p-2 text-left text-xs hover:bg-stone-50 dark:hover:bg-stone-800 flex items-center justify-between cursor-pointer"
                  >
                    <div>
                      <div className="font-bold truncate max-w-[200px]">{p.name}</div>
                      <div className="text-[10px] text-stone-400 font-mono">{p.sku}</div>
                    </div>
                    <span className="text-[11px] font-bold text-[#064e3b] dark:text-[#6ee7b7]">
                      +{p.sellingPrice} {settings.currency}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Quick Standalone Code Creator */}
          <div className="p-3 bg-[#fdfbf7] dark:bg-[#201b17] border border-[#e6dfd5] dark:border-[#362e26] rounded-xl space-y-2.5">
            <h4 className="text-xs font-bold text-stone-800 dark:text-stone-200 flex items-center justify-between">
              <span>Or Custom Label Entry</span>
              <button
                type="button"
                onClick={() => setIsCameraOpen(true)}
                className="text-[10px] text-emerald-700 dark:text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Camera className="w-3 h-3" />
                Scan Code
              </button>
            </h4>

            <input
              type="text"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder="Label Title (e.g. Spiral Binding 10mm)"
              className="w-full bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-lg p-2 text-xs"
            />

            <input
              type="text"
              value={customCode}
              onChange={(e) => setCustomCode(e.target.value)}
              placeholder="Barcode or QR data value..."
              className="w-full bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-lg p-2 text-xs font-mono font-bold"
            />

            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                value={customPrice || ''}
                onChange={(e) => setCustomPrice(parseFloat(e.target.value) || 0)}
                placeholder="Price"
                className="w-full bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-lg p-2 text-xs font-mono"
              />
              <select
                value={customType}
                onChange={(e) => setCustomType(e.target.value as any)}
                className="w-full bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-lg p-2 text-xs font-semibold"
              >
                <option value="barcode">Barcode (1D)</option>
                <option value="qr">QR Code (2D)</option>
                <option value="both">Both (1D+2D)</option>
              </select>
            </div>

            <button
              onClick={addCustomLabel}
              disabled={!customCode.trim()}
              className="w-full py-1.5 bg-[#064e3b] hover:bg-[#043b2c] disabled:opacity-40 text-white rounded-lg text-xs font-bold transition cursor-pointer"
            >
              Add Custom Code to Queue
            </button>
          </div>

          {/* Sheet Layout Settings */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-stone-700 dark:text-stone-300">
              Paper &amp; Sticker Dimensions
            </label>
            <select
              value={labelTemplate}
              onChange={(e) => setLabelTemplate(e.target.value as any)}
              className="w-full bg-[#f5f1e8] dark:bg-[#25201b] border border-stone-200 dark:border-stone-700 rounded-xl p-2.5 text-xs font-semibold text-stone-900 dark:text-stone-100"
            >
              <option value="a4_30up">A4 Sheet — 30 Labels (3 x 10, 70mm x 29.7mm)</option>
              <option value="a4_24up">A4 Sheet — 24 Labels (3 x 8, 70mm x 37mm)</option>
              <option value="thermal_50x30">Thermal Roll — 50mm x 30mm (Single Column)</option>
              <option value="thermal_40x25">Thermal Roll — 40mm x 25mm (Compact)</option>
              <option value="thermal_60x40">Thermal Roll — 60mm x 40mm (Large Product)</option>
            </select>

            {/* Elements Toggles */}
            <div className="grid grid-cols-2 gap-2 pt-1 text-xs text-stone-600 dark:text-stone-400 font-medium">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showStoreName}
                  onChange={(e) => setShowStoreName(e.target.checked)}
                />
                <span>Store Name</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showPrice}
                  onChange={(e) => setShowPrice(e.target.checked)}
                />
                <span>Selling Price</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showProductName}
                  onChange={(e) => setShowProductName(e.target.checked)}
                />
                <span>Product Name</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showSku}
                  onChange={(e) => setShowSku(e.target.checked)}
                />
                <span>SKU Code</span>
              </label>
            </div>
          </div>

          {/* Selected Labels Queue Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-stone-700 dark:text-stone-300">
                Queued Items ({selectedLabels.length} items / {totalStickersCount} stickers)
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsSelectorModalOpen(true)}
                  className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold hover:underline"
                >
                  Edit Selection
                </button>
                {selectedLabels.length > 0 && (
                  <button
                    onClick={() => updateQueue([])}
                    className="text-[10px] text-rose-500 hover:underline"
                  >
                    Clear All
                  </button>
                )}
              </div>
            </div>

            {/* Batch Controls for Queued Items */}
            {selectedLabels.length > 0 && (
              <div className="p-2 bg-stone-100 dark:bg-stone-800/80 rounded-xl space-y-1.5 text-[11px]">
                <div className="flex items-center justify-between text-stone-600 dark:text-stone-300">
                  <span className="font-semibold">Batch Copies:</span>
                  <div className="flex gap-1 font-bold">
                    <button
                      onClick={() => setAllQueueCopies(1)}
                      className="px-1.5 py-0.5 bg-white dark:bg-stone-900 rounded border border-stone-200 dark:border-stone-700 hover:bg-stone-50"
                    >
                      1
                    </button>
                    <button
                      onClick={() => setAllQueueCopies(2)}
                      className="px-1.5 py-0.5 bg-white dark:bg-stone-900 rounded border border-stone-200 dark:border-stone-700 hover:bg-stone-50"
                    >
                      2
                    </button>
                    <button
                      onClick={() => setAllQueueCopies(4)}
                      className="px-1.5 py-0.5 bg-white dark:bg-stone-900 rounded border border-stone-200 dark:border-stone-700 hover:bg-stone-50"
                    >
                      4
                    </button>
                    <button
                      onClick={setAllQueueCopiesToStock}
                      className="px-1.5 py-0.5 bg-white dark:bg-stone-900 rounded border border-stone-200 dark:border-stone-700 hover:bg-stone-50 text-[#064e3b] dark:text-[#6ee7b7]"
                      title="Set each item's copy count to match its current stock"
                    >
                      Stock
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-stone-600 dark:text-stone-300">
                  <span className="font-semibold">Batch Format:</span>
                  <div className="flex gap-1 font-bold">
                    <button
                      onClick={() => setAllQueueType('barcode')}
                      className="px-1.5 py-0.5 bg-white dark:bg-stone-900 rounded border border-stone-200 dark:border-stone-700 hover:bg-stone-50"
                    >
                      Barcode
                    </button>
                    <button
                      onClick={() => setAllQueueType('qr')}
                      className="px-1.5 py-0.5 bg-white dark:bg-stone-900 rounded border border-stone-200 dark:border-stone-700 hover:bg-stone-50"
                    >
                      QR
                    </button>
                    <button
                      onClick={() => setAllQueueType('both')}
                      className="px-1.5 py-0.5 bg-white dark:bg-stone-900 rounded border border-stone-200 dark:border-stone-700 hover:bg-stone-50"
                    >
                      Both
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-1.5 max-h-56 overflow-y-auto">
              {selectedLabels.map((lbl) => (
                <div
                  key={lbl.id}
                  className="flex items-center justify-between p-2 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 text-xs"
                >
                  <button
                    type="button"
                    onClick={() => handleOpenLabelIndividualView(lbl)}
                    className="flex-1 truncate pr-2 text-left cursor-pointer group"
                    title="Click to view Individual Barcode / QR Code"
                  >
                    <div className="font-bold truncate text-stone-900 dark:text-stone-100 group-hover:text-emerald-700 dark:group-hover:text-emerald-400">
                      {lbl.name}
                    </div>
                    <div className="text-[10px] text-stone-400 font-mono flex items-center gap-1.5">
                      <span className="group-hover:underline">{lbl.code}</span>
                      {lbl.price > 0 && (
                        <span className="text-[#064e3b] dark:text-[#6ee7b7] font-semibold">
                          • {lbl.price} {settings.currency}
                        </span>
                      )}
                    </div>
                  </button>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Format selector */}
                    <div className="flex bg-stone-100 dark:bg-stone-800 rounded p-0.5 text-[9px] font-bold">
                      <button
                        onClick={() =>
                          updateQueue(
                            selectedLabels.map((l) =>
                              l.id === lbl.id ? {...l, type: 'barcode'} : l
                            )
                          )
                        }
                        className={`px-1 rounded ${
                          lbl.type === 'barcode'
                            ? 'bg-white dark:bg-stone-900 text-[#064e3b] dark:text-[#6ee7b7] shadow-2xs'
                            : 'text-stone-400'
                        }`}
                        title="1D Barcode"
                      >
                        Bar
                      </button>
                      <button
                        onClick={() =>
                          updateQueue(
                            selectedLabels.map((l) =>
                              l.id === lbl.id ? {...l, type: 'qr'} : l
                            )
                          )
                        }
                        className={`px-1 rounded ${
                          lbl.type === 'qr'
                            ? 'bg-white dark:bg-stone-900 text-[#064e3b] dark:text-[#6ee7b7] shadow-2xs'
                            : 'text-stone-400'
                        }`}
                        title="2D QR Code"
                      >
                        QR
                      </button>
                      <button
                        onClick={() =>
                          updateQueue(
                            selectedLabels.map((l) =>
                              l.id === lbl.id ? {...l, type: 'both'} : l
                            )
                          )
                        }
                        className={`px-1 rounded ${
                          lbl.type === 'both'
                            ? 'bg-white dark:bg-stone-900 text-[#064e3b] dark:text-[#6ee7b7] shadow-2xs'
                            : 'text-stone-400'
                        }`}
                        title="Both Barcode and QR"
                      >
                        Both
                      </button>
                    </div>

                    {/* Copies Input */}
                    <input
                      type="number"
                      min="1"
                      max="200"
                      value={lbl.copies}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10) || 1;
                        updateQueue(
                          selectedLabels.map((l) => (l.id === lbl.id ? {...l, copies: val} : l))
                        );
                      }}
                      className="w-10 bg-stone-100 dark:bg-stone-800 p-1 text-center font-bold text-xs rounded border border-stone-200 dark:border-stone-700 font-mono"
                    />

                    {/* Remove */}
                    <button
                      onClick={() =>
                        updateQueue(selectedLabels.filter((l) => l.id !== lbl.id))
                      }
                      className="p-1 text-stone-400 hover:text-rose-600 transition cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}

              {selectedLabels.length === 0 && (
                <div className="text-center py-6 border border-dashed border-stone-200 dark:border-stone-800 rounded-xl space-y-2">
                  <p className="text-xs text-stone-400">
                    Queue is currently empty.
                  </p>
                  <button
                    type="button"
                    onClick={() => setIsSelectorModalOpen(true)}
                    className="px-3 py-1 bg-emerald-50 dark:bg-emerald-950 text-[#064e3b] dark:text-[#6ee7b7] rounded-lg text-xs font-bold hover:bg-emerald-100"
                  >
                    Select Items from Catalog
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Print & PDF Export Buttons Footer */}
        <div className="p-4 border-t border-[#e6dfd5] dark:border-[#362e26] space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleExportPDF}
              disabled={totalStickersCount === 0 || isExportingPDF}
              className="py-3 px-2 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 text-[#064e3b] dark:text-[#6ee7b7] border border-emerald-300 dark:border-emerald-800 disabled:opacity-40 font-extrabold text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
              title="Download vector print-ready PDF"
            >
              <FileDown className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>{isExportingPDF ? 'GENERATING...' : 'EXPORT PDF'}</span>
            </button>

            <button
              onClick={() => window.print()}
              disabled={totalStickersCount === 0}
              className="py-3 px-2 bg-[#064e3b] hover:bg-[#043b2c] disabled:opacity-40 text-white font-extrabold text-xs rounded-xl shadow-md transition flex items-center justify-center gap-1.5 cursor-pointer"
              title="Print stickers directly to printer"
            >
              <Printer className="w-4 h-4" />
              <span>PRINT ({totalStickersCount})</span>
            </button>
          </div>
        </div>
      </div>

      {/* ================= RIGHT PREVIEW: LIVE PRINTABLE SHEET ================= */}
      <div className={`flex-1 min-h-0 flex-col xl:h-full overflow-hidden bg-[#e6dfd5]/40 dark:bg-[#151210] ${mobileTab === 'preview' ? 'flex' : 'hidden xl:flex'}`}>
        <div className="p-3 bg-white/80 dark:bg-[#1c1815]/80 border-b border-[#e6dfd5] dark:border-[#362e26] flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-stone-700 dark:text-stone-300">
              Interactive Print Sheet Preview ({totalStickersCount} stickers)
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-mono font-bold">
              {labelTemplate.toUpperCase().replace('_', ' ')}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsSelectorModalOpen(true)}
              className="px-2.5 py-1 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 hover:bg-stone-50 rounded-lg text-xs font-semibold text-stone-700 dark:text-stone-300 flex items-center gap-1 cursor-pointer"
            >
              <ListPlus className="w-3.5 h-3.5 text-emerald-600" />
              <span>Select Items</span>
            </button>
            <button
              onClick={handleExportPDF}
              disabled={totalStickersCount === 0 || isExportingPDF}
              className="px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 hover:bg-emerald-100 text-[#064e3b] dark:text-[#6ee7b7] disabled:opacity-40 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
              title="Download Barcode / QR Label Sheet as PDF"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span>{isExportingPDF ? 'Exporting...' : 'Export PDF'}</span>
            </button>
            <button
              onClick={() => window.print()}
              disabled={totalStickersCount === 0}
              className="px-3 py-1 bg-[#064e3b] text-white hover:bg-[#043b2c] disabled:opacity-40 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Sheet</span>
            </button>
          </div>
        </div>

        {/* Scrollable Printable Canvas Container */}
        <div className="flex-1 min-h-0 overflow-y-auto touch-scroll overscroll-contain p-4 sm:p-6 pb-24 xl:pb-6 flex justify-center">
          <div
            id="thermal-receipt-area"
            className={`bg-white text-black shadow-xl p-4 transition-all ${
              labelTemplate.startsWith('thermal')
                ? 'w-[80mm] min-h-[120mm]'
                : 'w-[210mm] min-h-[297mm]'
            }`}
          >
            {/* Grid Layout depending on sheet type */}
            <div
              className={`grid gap-2 ${
                labelTemplate === 'a4_30up'
                  ? 'grid-cols-3'
                  : labelTemplate === 'a4_24up'
                  ? 'grid-cols-3'
                  : 'grid-cols-1'
              }`}
            >
              {flatLabels.map((lbl, idx) => (
                <div
                  key={`${lbl.id}-${idx}`}
                  onClick={() => handleOpenLabelIndividualView(lbl)}
                  className="border border-dashed border-stone-300 hover:border-emerald-500 hover:shadow-md p-2 rounded flex flex-col items-center justify-center text-center bg-white min-h-[85px] leading-tight cursor-pointer transition group"
                  title="Click to inspect Individual Barcode / QR Code View"
                >
                  {showStoreName && (
                    <span className="text-[8px] uppercase tracking-wider font-extrabold text-stone-600 block">
                      {settings.storeName}
                    </span>
                  )}

                  {showProductName && (
                    <span className="text-[9px] font-bold line-clamp-1 max-w-[170px] text-black group-hover:text-emerald-700">
                      {lbl.name}
                    </span>
                  )}

                  {/* Barcode / QR Graphic */}
                  <div className="my-1 scale-90 sm:scale-100">
                    <BarcodeRenderer
                      code={lbl.code}
                      type={lbl.type}
                      format="CODE128"
                      height={26}
                      width={1.2}
                      displayValue={false}
                    />
                  </div>

                  <div className="flex items-center justify-between w-full px-1 text-[8px] font-mono mt-0.5">
                    {showSku && <span>{lbl.sku}</span>}
                    <span className="font-bold text-stone-700">{lbl.code}</span>
                    {showPrice && lbl.price > 0 && (
                      <span className="font-extrabold text-[9px]">
                        {lbl.price.toFixed(2)} {settings.currency}
                      </span>
                    )}
                  </div>
                </div>
              ))}

              {flatLabels.length === 0 && (
                <div className="col-span-full py-24 text-center text-stone-400 text-xs">
                  <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="font-bold">No stickers to display</p>
                  <p className="text-[11px] mt-1">
                    Click "Browse &amp; Select Items" above to choose products from your catalog.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ================= BROWSE & SELECT ITEMS MODAL ================= */}
      <ItemSelectorModal
        isOpen={isSelectorModalOpen}
        onClose={() => setIsSelectorModalOpen(false)}
        products={products}
        settings={settings}
        title="Select Items for Barcode & QR Code Generation"
        description="Choose products from Sappy Stationary inventory to batch generate printable barcode and QR stickers."
        initialSelectedProductIds={selectedLabels.filter((l) => l.productId).map((l) => l.productId!)}
        defaultCopies={4}
        defaultType="barcode"
        actionButtonText="Apply to Barcode Studio Queue"
        onConfirmSelection={handleBatchSelectedItems}
        onRefreshData={onRefreshData}
      />

      {/* ================= INDIVIDUAL BARCODE & QR CODE VIEW MODAL ================= */}
      <IndividualCodeViewModal
        isOpen={isIndividualModalOpen}
        onClose={() => setIsIndividualModalOpen(false)}
        product={individualViewProduct}
        initialCode={individualViewCode}
        settings={settings}
        onRefreshData={onRefreshData}
      />

      {/* ================= CAMERA SCANNER MODAL ================= */}
      <CameraScannerModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onScanSuccess={(code) => setCustomCode(code)}
        title="Scan Label Code"
      />
    </div>
  );
};
