import React, {useState, useMemo} from 'react';
import {
  Search,
  CheckSquare,
  Square,
  Plus,
  Minus,
  Barcode,
  QrCode,
  Package,
  Layers,
  Sparkles,
  Check,
  X,
  AlertTriangle,
  RotateCcw,
  Sliders,
} from 'lucide-react';
import {Product, StoreSettings} from '../../types';
import {storage} from '../../services/storage';
import {sound} from '../../services/sound';

export interface ConfirmedSelectedItem {
  product: Product;
  copies: number;
  codeType: 'barcode' | 'qr' | 'both';
  codeToUse: string;
}

interface ItemSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  settings: StoreSettings;
  onConfirmSelection: (items: ConfirmedSelectedItem[]) => void;
}

export const ItemSelectionModal: React.FC<ItemSelectionModalProps> = ({
  isOpen,
  onClose,
  products,
  settings,
  onConfirmSelection,
}) => {
  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [filterType, setFilterType] = useState<'all' | 'in_stock' | 'low_stock' | 'no_code'>('all');

  // Global Batch Settings
  const [defaultCopies, setDefaultCopies] = useState<number>(2);
  const [matchStockQuantity, setMatchStockQuantity] = useState<boolean>(false);
  const [targetCodeType, setTargetCodeType] = useState<'barcode' | 'qr' | 'both'>('barcode');
  const [autoGenerateIfMissing, setAutoGenerateIfMissing] = useState<boolean>(true);

  // Per-item selection map: { [productId]: { selected: boolean; copies: number } }
  const [selectedMap, setSelectedMap] = useState<Record<string, {selected: boolean; copies: number}>>(() => {
    // Initial state: empty selection
    return {};
  });

  // Extract unique categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return ['All', ...Array.from(set)];
  }, [products]);

  // Filtered products list
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (selectedCategory !== 'All' && p.category !== selectedCategory) return false;

      // Filter type checks
      if (filterType === 'in_stock' && p.currentStock <= 0) return false;
      if (filterType === 'low_stock' && (p.currentStock > p.minStockThreshold || p.currentStock === 0)) return false;
      if (filterType === 'no_code' && p.codes.length > 0) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const hasCode = p.codes.some((c) => c.code.toLowerCase().includes(q));
        return (
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.brand.toLowerCase().includes(q) ||
          hasCode
        );
      }
      return true;
    });
  }, [products, selectedCategory, filterType, searchQuery]);

  // Toggle selection for a single product
  const toggleItem = (p: Product) => {
    setSelectedMap((prev) => {
      const current = prev[p.id];
      const isSelected = !current?.selected;
      const copies = isSelected
        ? matchStockQuantity
          ? Math.max(1, p.currentStock)
          : defaultCopies
        : current?.copies || defaultCopies;

      return {
        ...prev,
        [p.id]: {
          selected: isSelected,
          copies,
        },
      };
    });
  };

  // Update copies for a single item
  const updateItemCopies = (productId: string, copies: number) => {
    const validCopies = Math.max(1, copies);
    setSelectedMap((prev) => ({
      ...prev,
      [productId]: {
        selected: prev[productId]?.selected ?? true,
        copies: validCopies,
      },
    }));
  };

  // Bulk Selection Presets
  const selectAllFiltered = () => {
    setSelectedMap((prev) => {
      const next = {...prev};
      filteredProducts.forEach((p) => {
        next[p.id] = {
          selected: true,
          copies: matchStockQuantity ? Math.max(1, p.currentStock) : defaultCopies,
        };
      });
      return next;
    });
  };

  const selectInStockOnly = () => {
    setSelectedMap((prev) => {
      const next = {...prev};
      products.forEach((p) => {
        if (p.currentStock > 0 && p.category !== 'Print Services') {
          next[p.id] = {
            selected: true,
            copies: matchStockQuantity ? Math.max(1, p.currentStock) : defaultCopies,
          };
        } else {
          next[p.id] = {selected: false, copies: defaultCopies};
        }
      });
      return next;
    });
  };

  const selectLowStockOnly = () => {
    setSelectedMap((prev) => {
      const next = {...prev};
      products.forEach((p) => {
        if (p.currentStock > 0 && p.currentStock <= p.minStockThreshold) {
          next[p.id] = {
            selected: true,
            copies: defaultCopies,
          };
        } else {
          next[p.id] = {selected: false, copies: defaultCopies};
        }
      });
      return next;
    });
  };

  const deselectAll = () => {
    setSelectedMap({});
  };

  // Apply default copies to all currently selected items
  const applyDefaultCopiesToSelected = (newDefault: number) => {
    setDefaultCopies(newDefault);
    setSelectedMap((prev) => {
      const next: Record<string, {selected: boolean; copies: number}> = {};
      Object.keys(prev).forEach((id) => {
        if (prev[id]?.selected) {
          next[id] = {selected: true, copies: newDefault};
        }
      });
      return next;
    });
  };

  // Count currently selected items and total labels
  const {selectedCount, totalStickersToGenerate} = useMemo(() => {
    let count = 0;
    let stickers = 0;
    Object.keys(selectedMap).forEach((id) => {
      if (selectedMap[id]?.selected) {
        count += 1;
        stickers += selectedMap[id].copies;
      }
    });
    return {selectedCount: count, totalStickersToGenerate: stickers};
  }, [selectedMap]);

  // Submit and Confirm Selection
  const handleConfirm = () => {
    const confirmed: ConfirmedSelectedItem[] = [];

    products.forEach((p) => {
      const sel = selectedMap[p.id];
      if (sel && sel.selected) {
        let primaryCode = p.codes.find((c) => c.isPrimary)?.code || p.codes[0]?.code;

        // If product has no code and autoGenerateIfMissing is true, generate a unique barcode
        if (!primaryCode && autoGenerateIfMissing) {
          const randomDigits = Math.floor(1000000000 + Math.random() * 9000000000);
          const generatedCode = `${settings.barcodePrefix || 'SAP'}-${randomDigits}`;

          const newCodeObj = {
            id: `code-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
            code: generatedCode,
            type: targetCodeType,
            format: 'CODE128' as const,
            source: 'generated' as const,
            isPrimary: true,
            active: true,
            label: 'Auto Generated Barcode',
            createdDate: new Date().toISOString(),
          };

          // Save newly generated code to product permanently in store
          p.codes = [newCodeObj, ...p.codes];
          storage.saveProduct(p, false);
          primaryCode = generatedCode;
        }

        confirmed.push({
          product: p,
          copies: sel.copies,
          codeType: targetCodeType,
          codeToUse: primaryCode || p.sku,
        });
      }
    });

    if (confirmed.length === 0) {
      alert('Please select at least one product.');
      return;
    }

    sound.playCheckoutSuccess();
    onConfirmSelection(confirmed);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150 text-stone-900 dark:text-stone-100">
      <div className="w-full max-w-4xl bg-white dark:bg-[#1c1815] border border-stone-200 dark:border-stone-800 rounded-3xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        
        {/* ================= MODAL HEADER ================= */}
        <div className="p-4 sm:p-5 border-b border-[#e6dfd5] dark:border-[#362e26] bg-[#fdfbf7] dark:bg-[#171412] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#064e3b] text-[#6ee7b7] shadow-sm">
              <CheckSquare className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base sm:text-lg text-[#064e3b] dark:text-[#6ee7b7]">
                Select Items for Barcode &amp; QR Generation
              </h3>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                Pick products from your catalog to generate printable sticker batches
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ================= TOP CONTROLS & BATCH SETTINGS ================= */}
        <div className="p-4 border-b border-[#e6dfd5] dark:border-[#362e26] bg-white dark:bg-[#1c1815] space-y-3">
          {/* Search & Quick Filters */}
          <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search catalog by product name, SKU, or brand..."
                className="w-full bg-[#f5f1e8] dark:bg-[#25201b] border border-transparent focus:border-[#064e3b] rounded-xl pl-9 pr-4 py-2 text-xs text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-hidden"
                autoFocus
              />
            </div>

            {/* Quick Status Filter Pills */}
            <div className="flex items-center gap-1 bg-stone-100 dark:bg-stone-800 p-0.5 rounded-xl text-xs font-semibold shrink-0 overflow-x-auto">
              <button
                type="button"
                onClick={() => setFilterType('all')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  filterType === 'all'
                    ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 shadow-xs'
                    : 'text-stone-500'
                }`}
              >
                All ({products.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterType('in_stock')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  filterType === 'in_stock'
                    ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                    : 'text-stone-500'
                }`}
              >
                In Stock
              </button>
              <button
                type="button"
                onClick={() => setFilterType('low_stock')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  filterType === 'low_stock'
                    ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                    : 'text-stone-500'
                }`}
              >
                Low Stock
              </button>
              <button
                type="button"
                onClick={() => setFilterType('no_code')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  filterType === 'no_code'
                    ? 'bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300'
                    : 'text-stone-500'
                }`}
              >
                Missing Code
              </button>
            </div>
          </div>

          {/* Category Chips */}
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-2.5 py-0.5 rounded-lg text-[11px] font-medium whitespace-nowrap transition ${
                  selectedCategory === cat
                    ? 'bg-[#064e3b] text-white font-bold'
                    : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 hover:bg-stone-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Quick Selection Presets & Copies Controls Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-stone-100 dark:border-stone-800 text-xs">
            {/* Left Presets */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-stone-400 text-[11px] font-semibold">Select:</span>
              <button
                type="button"
                onClick={selectAllFiltered}
                className="px-2 py-0.5 rounded-md bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300 font-bold text-[11px]"
              >
                All Shown ({filteredProducts.length})
              </button>
              <button
                type="button"
                onClick={selectInStockOnly}
                className="px-2 py-0.5 rounded-md bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300 font-bold text-[11px]"
              >
                In-Stock Only
              </button>
              <button
                type="button"
                onClick={selectLowStockOnly}
                className="px-2 py-0.5 rounded-md bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300 font-bold text-[11px]"
              >
                Low-Stock Only
              </button>
              {selectedCount > 0 && (
                <button
                  type="button"
                  onClick={deselectAll}
                  className="px-2 py-0.5 rounded-md text-rose-600 dark:text-rose-400 hover:underline font-bold text-[11px]"
                >
                  Deselect All
                </button>
              )}
            </div>

            {/* Right: Default Copies & Code Type Customizer */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-stone-400 text-[11px]">Format:</span>
                <select
                  value={targetCodeType}
                  onChange={(e) => setTargetCodeType(e.target.value as any)}
                  className="bg-stone-100 dark:bg-stone-800 rounded-lg px-2 py-0.5 text-xs font-semibold"
                >
                  <option value="barcode">Barcode</option>
                  <option value="qr">QR Code</option>
                  <option value="both">Both</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-stone-400 text-[11px]">Default Copies:</span>
                <div className="flex items-center gap-1">
                  {[1, 2, 4, 10].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => applyDefaultCopiesToSelected(num)}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                        defaultCopies === num && !matchStockQuantity
                          ? 'bg-[#064e3b] text-white'
                          : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400'
                      }`}
                    >
                      {num}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-1.5 text-[11px] text-stone-600 dark:text-stone-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={matchStockQuantity}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setMatchStockQuantity(checked);
                    if (checked) {
                      // Update selected items copies to match current stock
                      setSelectedMap((prev) => {
                        const next = {...prev};
                        products.forEach((p) => {
                          if (next[p.id]?.selected) {
                            next[p.id].copies = Math.max(1, p.currentStock);
                          }
                        });
                        return next;
                      });
                    }
                  }}
                />
                <span className="font-semibold">Match Stock Qty</span>
              </label>
            </div>
          </div>
        </div>

        {/* ================= MIDDLE: PRODUCTS SELECTION TABLE ================= */}
        <div className="flex-1 overflow-y-auto p-4 divide-y divide-stone-100 dark:divide-stone-800/80">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {filteredProducts.map((p) => {
              const isSelected = selectedMap[p.id]?.selected || false;
              const copies = selectedMap[p.id]?.copies || defaultCopies;
              const primaryCode = p.codes.find((c) => c.isPrimary)?.code || p.codes[0]?.code;
              const isOutOfStock = p.currentStock <= 0 && p.category !== 'Print Services';
              const isLowStock = p.currentStock <= p.minStockThreshold && !isOutOfStock;

              return (
                <div
                  key={p.id}
                  onClick={() => toggleItem(p)}
                  className={`p-3 rounded-2xl border transition flex items-center justify-between gap-3 cursor-pointer select-none ${
                    isSelected
                      ? 'border-[#064e3b] dark:border-[#6ee7b7] bg-emerald-50/70 dark:bg-emerald-950/40 shadow-xs ring-2 ring-[#064e3b]/20'
                      : 'border-stone-200 dark:border-stone-800 bg-white dark:bg-[#1c1815] hover:bg-stone-50 dark:hover:bg-stone-800/50'
                  }`}
                >
                  {/* Left: Checkbox & Product Details */}
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="mt-0.5">
                      {isSelected ? (
                        <div className="w-5 h-5 rounded-md bg-[#064e3b] text-white flex items-center justify-center">
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </div>
                      ) : (
                        <div className="w-5 h-5 rounded-md border-2 border-stone-300 dark:border-stone-600" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <h4 className="font-bold text-xs text-stone-900 dark:text-stone-100 truncate">
                        {p.name}
                      </h4>
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-stone-500 font-mono">
                        <span>{p.sku}</span>
                        <span>•</span>
                        <span className="font-bold text-stone-700 dark:text-stone-300">
                          {p.sellingPrice.toFixed(2)} {settings.currency}
                        </span>
                        <span>•</span>
                        <span
                          className={`font-semibold ${
                            isOutOfStock
                              ? 'text-rose-600'
                              : isLowStock
                              ? 'text-amber-600'
                              : 'text-stone-500'
                          }`}
                        >
                          {p.category === 'Print Services' ? 'Service' : `${p.currentStock} ${p.unit}`}
                        </span>
                      </div>

                      {/* Code status badge */}
                      <div className="mt-1 flex items-center gap-1 font-mono text-[10px]">
                        {primaryCode ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300">
                            <Barcode className="w-3 h-3 text-emerald-600" />
                            <span>{primaryCode}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 text-[9px] font-sans font-bold">
                            <Sparkles className="w-3 h-3" />
                            Auto-Generate Code
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Per-Item Copies Stepper (Visible if selected) */}
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className={`flex items-center gap-1 shrink-0 ${
                      !isSelected ? 'opacity-30 pointer-events-none' : ''
                    }`}
                  >
                    <span className="text-[10px] text-stone-400 font-semibold mr-1">Copies:</span>
                    <div className="flex items-center bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-lg p-0.5 shadow-xs">
                      <button
                        type="button"
                        onClick={() => updateItemCopies(p.id, copies - 1)}
                        className="p-1 hover:bg-stone-100 dark:hover:bg-stone-800 rounded text-stone-600 dark:text-stone-300"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <input
                        type="number"
                        min="1"
                        value={copies}
                        onChange={(e) => updateItemCopies(p.id, parseInt(e.target.value, 10) || 1)}
                        className="w-10 text-center font-bold font-mono text-xs bg-transparent focus:outline-hidden"
                      />
                      <button
                        type="button"
                        onClick={() => updateItemCopies(p.id, copies + 1)}
                        className="p-1 hover:bg-stone-100 dark:hover:bg-stone-800 rounded text-stone-600 dark:text-stone-300"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {filteredProducts.length === 0 && (
            <div className="py-16 text-center text-stone-400 text-xs">
              <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="font-semibold">No products match your search or filter.</p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('All');
                  setFilterType('all');
                }}
                className="mt-2 text-emerald-700 font-bold hover:underline"
              >
                Reset filters
              </button>
            </div>
          )}
        </div>

        {/* ================= BOTTOM STICKY ACTION FOOTER ================= */}
        <div className="p-4 border-t border-[#e6dfd5] dark:border-[#362e26] bg-[#fdfbf7] dark:bg-[#171412] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="text-xs">
              <span className="text-stone-500">Selected Products: </span>
              <span className="font-extrabold text-sm text-[#064e3b] dark:text-[#6ee7b7]">
                {selectedCount}
              </span>
            </div>
            <span className="text-stone-300 dark:text-stone-700">•</span>
            <div className="text-xs">
              <span className="text-stone-500">Total Labels: </span>
              <span className="font-black text-sm font-mono text-stone-900 dark:text-stone-100">
                {totalStickersToGenerate} stickers
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-xl transition"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleConfirm}
              disabled={selectedCount === 0}
              className="px-6 py-2.5 bg-[#064e3b] hover:bg-[#043b2c] disabled:opacity-40 text-white font-extrabold text-xs sm:text-sm rounded-xl shadow-md transition flex items-center gap-2 cursor-pointer"
            >
              <Check className="w-4 h-4 stroke-[3]" />
              <span>Generate &amp; Add {selectedCount} Selected Items</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
