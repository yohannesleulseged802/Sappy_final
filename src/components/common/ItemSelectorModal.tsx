import React, {useState, useMemo, useEffect} from 'react';
import {
  Search,
  CheckSquare,
  Square,
  Barcode,
  QrCode,
  Layers,
  AlertTriangle,
  Sparkles,
  Plus,
  Minus,
  X,
  Filter,
  Check,
  Package,
  FileDown,
} from 'lucide-react';
import {Product, StoreSettings, CodeType, LabelItem} from '../../types';
import {storage} from '../../services/storage';
import {ExportService} from '../../services/export';

export interface SelectedItemConfig {
  product: Product;
  code: string;
  type: CodeType;
  copies: number;
}

interface ItemSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  settings: StoreSettings;
  title?: string;
  description?: string;
  initialSelectedProductIds?: string[];
  defaultCopies?: number;
  defaultType?: CodeType;
  actionButtonText?: string;
  onConfirmSelection: (items: SelectedItemConfig[]) => void;
  onRefreshData?: () => void;
}

export const ItemSelectorModal: React.FC<ItemSelectorModalProps> = ({
  isOpen,
  onClose,
  products,
  settings,
  title = 'Select Items for Barcode & QR Code Generation',
  description = 'Choose products from inventory catalog to generate printable barcodes or QR code stickers.',
  initialSelectedProductIds = [],
  defaultCopies = 4,
  defaultType = 'barcode',
  actionButtonText = 'Add Selected Items to Generator',
  onConfirmSelection,
  onRefreshData,
}) => {
  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [stockStatusFilter, setStockStatusFilter] = useState<'all' | 'in_stock' | 'low_stock' | 'missing_code'>('all');

  // Selection Map: productId -> { isSelected, copies, type, code }
  const [selectionMap, setSelectionMap] = useState<
    Record<
      string,
      {
        isSelected: boolean;
        copies: number;
        type: CodeType;
        code: string;
      }
    >
  >({});

  // Initialize selection when modal opens
  useEffect(() => {
    if (!isOpen) return;

    const initialMap: Record<
      string,
      {
        isSelected: boolean;
        copies: number;
        type: CodeType;
        code: string;
      }
    > = {};

    products.forEach((p) => {
      const primary = p.codes.find((c) => c.isPrimary) || p.codes[0];
      const isPreSelected = initialSelectedProductIds.includes(p.id);
      initialMap[p.id] = {
        isSelected: isPreSelected,
        copies: defaultCopies,
        type: primary?.type || defaultType,
        code: primary?.code || p.sku,
      };
    });

    setSelectionMap(initialMap);
    setSearchQuery('');
    setSelectedCategory('All');
    setStockStatusFilter('all');
  }, [isOpen, products, initialSelectedProductIds, defaultCopies, defaultType]);

  // Unique Categories
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

      if (stockStatusFilter === 'in_stock' && p.currentStock <= 0) return false;
      if (stockStatusFilter === 'low_stock' && (p.currentStock > p.minStockThreshold || p.currentStock === 0))
        return false;
      if (stockStatusFilter === 'missing_code' && p.codes.length > 0) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = p.name.toLowerCase().includes(q);
        const matchesSku = p.sku.toLowerCase().includes(q);
        const matchesBrand = p.brand?.toLowerCase().includes(q);
        const matchesCode = p.codes.some((c) => c.code.toLowerCase().includes(q));
        if (!matchesName && !matchesSku && !matchesBrand && !matchesCode) return false;
      }

      return true;
    });
  }, [products, selectedCategory, stockStatusFilter, searchQuery]);

  // Selected Count Calculation
  const selectedCount = useMemo(() => {
    return Object.values(selectionMap).filter((item) => item.isSelected).length;
  }, [selectionMap]);

  const totalCopiesCount = useMemo(() => {
    return Object.values(selectionMap).reduce((sum, item) => {
      return item.isSelected ? sum + (item.copies || 1) : sum;
    }, 0);
  }, [selectionMap]);

  // Toggle single item selection
  const toggleItem = (productId: string) => {
    setSelectionMap((prev) => {
      const current = prev[productId] || {
        isSelected: false,
        copies: defaultCopies,
        type: defaultType,
        code: '',
      };
      return {
        ...prev,
        [productId]: {
          ...current,
          isSelected: !current.isSelected,
        },
      };
    });
  };

  // Select / Deselect all visible
  const selectAllVisible = () => {
    setSelectionMap((prev) => {
      const updated = {...prev};
      filteredProducts.forEach((p) => {
        const primary = p.codes.find((c) => c.isPrimary) || p.codes[0];
        updated[p.id] = {
          ...(updated[p.id] || {
            copies: defaultCopies,
            type: primary?.type || defaultType,
            code: primary?.code || p.sku,
          }),
          isSelected: true,
        };
      });
      return updated;
    });
  };

  const deselectAll = () => {
    setSelectionMap((prev) => {
      const updated = {...prev};
      Object.keys(updated).forEach((id) => {
        updated[id] = {...updated[id], isSelected: false};
      });
      return updated;
    });
  };

  // Preset: Select All Low-Stock Items
  const selectLowStockItems = () => {
    setSelectionMap((prev) => {
      const updated = {...prev};
      products.forEach((p) => {
        const isLow = p.currentStock > 0 && p.currentStock <= p.minStockThreshold;
        if (isLow) {
          const primary = p.codes.find((c) => c.isPrimary) || p.codes[0];
          updated[p.id] = {
            ...(updated[p.id] || {
              copies: defaultCopies,
              type: primary?.type || defaultType,
              code: primary?.code || p.sku,
            }),
            isSelected: true,
          };
        }
      });
      return updated;
    });
  };

  // Preset: Select Items with Missing Codes
  const selectMissingCodes = () => {
    setSelectionMap((prev) => {
      const updated = {...prev};
      products.forEach((p) => {
        if (!p.codes || p.codes.length === 0) {
          updated[p.id] = {
            ...(updated[p.id] || {
              copies: defaultCopies,
              type: defaultType,
              code: p.sku,
            }),
            isSelected: true,
          };
        }
      });
      return updated;
    });
  };

  // Bulk Apply Copies to all currently selected
  const applyCopiesToSelected = (copies: number) => {
    setSelectionMap((prev) => {
      const updated = {...prev};
      Object.keys(updated).forEach((id) => {
        if (updated[id].isSelected) {
          updated[id] = {...updated[id], copies};
        }
      });
      return updated;
    });
  };

  // Bulk Apply: Match stock level for each selected product
  const applyStockLevelCopies = () => {
    setSelectionMap((prev) => {
      const updated = {...prev};
      products.forEach((p) => {
        if (updated[p.id]?.isSelected) {
          const stockQty = Math.max(1, Math.min(50, p.currentStock));
          updated[p.id] = {...updated[p.id], copies: stockQty};
        }
      });
      return updated;
    });
  };

  // Bulk Apply Code Type to all currently selected
  const applyTypeToSelected = (type: CodeType) => {
    setSelectionMap((prev) => {
      const updated = {...prev};
      Object.keys(updated).forEach((id) => {
        if (updated[id].isSelected) {
          updated[id] = {...updated[id], type};
        }
      });
      return updated;
    });
  };

  // Update copies for individual item
  const updateItemCopies = (productId: string, deltaOrValue: number, isAbsolute = false) => {
    setSelectionMap((prev) => {
      const current = prev[productId];
      if (!current) return prev;
      const nextCopies = isAbsolute
        ? Math.max(1, deltaOrValue)
        : Math.max(1, (current.copies || 1) + deltaOrValue);
      return {
        ...prev,
        [productId]: {
          ...current,
          copies: nextCopies,
        },
      };
    });
  };

  // Update type for individual item
  const updateItemType = (productId: string, type: CodeType) => {
    setSelectionMap((prev) => {
      const current = prev[productId];
      if (!current) return prev;
      return {
        ...prev,
        [productId]: {
          ...current,
          type,
        },
      };
    });
  };

  // Auto-generate code for a product if missing
  const autoGenerateCodeForProduct = (product: Product, e: React.MouseEvent) => {
    e.stopPropagation();
    const randomDigits = Math.floor(1000000000 + Math.random() * 9000000000);
    const newCodeVal = `${settings.barcodePrefix || 'SAP'}-${randomDigits}`;

    // Update in storage
    const updatedCodes = [
      ...product.codes,
      {
        id: `code-${Date.now()}`,
        code: newCodeVal,
        type: 'barcode' as CodeType,
        format: 'CODE128' as const,
        source: 'generated' as const,
        isPrimary: true,
        active: true,
        label: 'Auto Store Barcode',
        createdDate: new Date().toISOString(),
      },
    ];

    const updatedProduct = {...product, codes: updatedCodes};
    storage.saveProduct(updatedProduct, false);

    // Update local state
    setSelectionMap((prev) => ({
      ...prev,
      [product.id]: {
        ...(prev[product.id] || {copies: defaultCopies, type: 'barcode'}),
        code: newCodeVal,
        isSelected: true,
      },
    }));

    if (onRefreshData) onRefreshData();
  };

  // Submit confirmation
  const handleConfirm = () => {
    const result: SelectedItemConfig[] = [];
    products.forEach((p) => {
      const state = selectionMap[p.id];
      if (state && state.isSelected) {
        result.push({
          product: p,
          code: state.code || p.sku,
          type: state.type || defaultType,
          copies: state.copies || 1,
        });
      }
    });

    onConfirmSelection(result);
    onClose();
  };

  // Direct export to PDF
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const handleDirectPDFExport = async () => {
    const itemsToExport: LabelItem[] = [];
    products.forEach((p) => {
      const state = selectionMap[p.id];
      if (state && state.isSelected) {
        itemsToExport.push({
          id: `lbl-${p.id}`,
          productId: p.id,
          name: p.name,
          sku: p.sku,
          code: state.code || p.sku,
          price: p.sellingPrice,
          type: state.type || defaultType,
          copies: state.copies || 1,
        });
      }
    });

    if (itemsToExport.length === 0) return;

    setIsExportingPDF(true);
    try {
      await ExportService.exportBarcodeLabelsToPDF(itemsToExport, settings, {
        template: 'a4_30up',
        showStoreName: true,
        showPrice: true,
        showSku: true,
        showProductName: true,
        showBorder: true,
      });
    } catch (err: any) {
      alert(err?.message || 'Failed to export PDF.');
    } finally {
      setIsExportingPDF(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-xs">
      <div className="w-full max-w-5xl bg-white dark:bg-[#1a1714] border border-[#e6dfd5] dark:border-[#382f27] rounded-2xl shadow-2xl flex flex-col h-[92vh] max-h-[820px] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* ================= MODAL HEADER ================= */}
        <div className="p-4 sm:px-6 bg-[#fdfbf7] dark:bg-[#201b17] border-b border-[#e6dfd5] dark:border-[#382f27] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#064e3b] dark:bg-[#6ee7b7]/20 flex items-center justify-center text-white dark:text-[#6ee7b7] shadow-sm">
              <Barcode className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-[#064e3b] dark:text-[#6ee7b7] flex items-center gap-2">
                <span>{title}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-mono font-bold">
                  {selectedCount} Selected
                </span>
              </h2>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                {description}
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

        {/* ================= FILTER & SEARCH BAR ================= */}
        <div className="p-3 sm:px-6 bg-white dark:bg-[#1c1815] border-b border-[#e6dfd5] dark:border-[#382f27] space-y-2.5 shrink-0">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search products by title, SKU, barcode, brand..."
                className="w-full bg-[#f5f1e8] dark:bg-[#25201b] border border-transparent focus:border-[#064e3b] dark:focus:border-[#6ee7b7] rounded-xl pl-9 pr-4 py-2 text-xs text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-hidden"
                autoFocus
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-stone-400 hover:text-stone-600"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Quick Action Selection Buttons */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={selectAllVisible}
                className="px-2.5 py-1.5 bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300 rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                title="Select all products currently visible in the table"
              >
                <CheckSquare className="w-3.5 h-3.5 text-emerald-600" />
                <span>Select All ({filteredProducts.length})</span>
              </button>

              <button
                type="button"
                onClick={deselectAll}
                disabled={selectedCount === 0}
                className="px-2.5 py-1.5 bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 disabled:opacity-40 text-stone-600 dark:text-stone-400 rounded-lg text-xs font-semibold transition cursor-pointer"
              >
                Clear
              </button>

              <div className="h-5 w-px bg-stone-200 dark:bg-stone-700 mx-0.5" />

              <button
                type="button"
                onClick={selectLowStockItems}
                className="px-2.5 py-1.5 bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-900/60 rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                title="Select all products below their low-stock threshold"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Low-Stock</span>
              </button>

              <button
                type="button"
                onClick={selectMissingCodes}
                className="px-2.5 py-1.5 bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60 rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                title="Select products that don't have barcodes yet"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Missing Codes</span>
              </button>
            </div>
          </div>

          {/* Categories and Status Filter Chips */}
          <div className="flex items-center justify-between gap-2 overflow-x-auto pt-1 pb-0.5 text-xs">
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider shrink-0 flex items-center gap-1">
                <Filter className="w-3 h-3" /> Cat:
              </span>
              <div className="flex gap-1 overflow-x-auto scrollbar-none">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-2 py-0.5 rounded-lg text-xs font-medium whitespace-nowrap transition cursor-pointer ${
                      selectedCategory === cat
                        ? 'bg-[#064e3b] text-white shadow-xs'
                        : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-700'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Stock State filter */}
            <div className="flex items-center gap-1 bg-stone-100 dark:bg-stone-800 p-0.5 rounded-lg shrink-0 text-[11px] font-semibold">
              <button
                onClick={() => setStockStatusFilter('all')}
                className={`px-2 py-0.5 rounded-md transition ${
                  stockStatusFilter === 'all'
                    ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 shadow-2xs'
                    : 'text-stone-500'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setStockStatusFilter('in_stock')}
                className={`px-2 py-0.5 rounded-md transition ${
                  stockStatusFilter === 'in_stock'
                    ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 shadow-2xs'
                    : 'text-stone-500'
                }`}
              >
                In Stock
              </button>
              <button
                onClick={() => setStockStatusFilter('low_stock')}
                className={`px-2 py-0.5 rounded-md transition ${
                  stockStatusFilter === 'low_stock'
                    ? 'bg-amber-100 dark:bg-amber-900 text-amber-900 dark:text-amber-100 shadow-2xs'
                    : 'text-stone-500'
                }`}
              >
                Low
              </button>
            </div>
          </div>
        </div>

        {/* ================= BATCH CONFIGURATION BAR ================= */}
        {selectedCount > 0 && (
          <div className="px-4 sm:px-6 py-2 bg-emerald-50 dark:bg-[#142920] border-b border-emerald-200 dark:border-emerald-900/60 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0 animate-in fade-in">
            <div className="flex items-center gap-2">
              <span className="font-bold text-[#064e3b] dark:text-[#6ee7b7] flex items-center gap-1.5">
                <Check className="w-4 h-4" />
                <span>{selectedCount} Products Selected</span>
              </span>
              <span className="text-stone-400">•</span>
              <span className="text-stone-600 dark:text-stone-300 font-semibold">
                {totalCopiesCount} Total Labels to Print
              </span>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              {/* Batch Copies Preset */}
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-stone-500 dark:text-stone-400 font-medium">
                  Set Copies:
                </span>
                <div className="inline-flex rounded-lg border border-emerald-300 dark:border-emerald-800 bg-white dark:bg-stone-900 p-0.5 text-[11px] font-bold">
                  {[1, 2, 4, 10].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => applyCopiesToSelected(num)}
                      className="px-2 py-0.5 rounded hover:bg-emerald-100 dark:hover:bg-emerald-950 text-stone-700 dark:text-stone-200 transition cursor-pointer"
                    >
                      {num}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={applyStockLevelCopies}
                    className="px-2 py-0.5 rounded hover:bg-emerald-100 dark:hover:bg-emerald-950 text-[#064e3b] dark:text-[#6ee7b7] transition cursor-pointer font-bold"
                    title="Set label copies equal to current inventory stock level"
                  >
                    Match Stock
                  </button>
                </div>
              </div>

              {/* Batch Format Preset */}
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-stone-500 dark:text-stone-400 font-medium">
                  Format:
                </span>
                <div className="inline-flex rounded-lg border border-emerald-300 dark:border-emerald-800 bg-white dark:bg-stone-900 p-0.5 text-[11px] font-bold">
                  <button
                    type="button"
                    onClick={() => applyTypeToSelected('barcode')}
                    className="px-2 py-0.5 rounded hover:bg-emerald-100 dark:hover:bg-emerald-950 text-stone-700 dark:text-stone-200 transition cursor-pointer flex items-center gap-1"
                  >
                    <Barcode className="w-3 h-3" /> Barcode
                  </button>
                  <button
                    type="button"
                    onClick={() => applyTypeToSelected('qr')}
                    className="px-2 py-0.5 rounded hover:bg-emerald-100 dark:hover:bg-emerald-950 text-stone-700 dark:text-stone-200 transition cursor-pointer flex items-center gap-1"
                  >
                    <QrCode className="w-3 h-3" /> QR
                  </button>
                  <button
                    type="button"
                    onClick={() => applyTypeToSelected('both')}
                    className="px-2 py-0.5 rounded hover:bg-emerald-100 dark:hover:bg-emerald-950 text-stone-700 dark:text-stone-200 transition cursor-pointer flex items-center gap-1"
                  >
                    <Layers className="w-3 h-3" /> Both
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================= PRODUCTS TABLE ================= */}
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="sticky top-0 bg-[#f5f1e8] dark:bg-[#25201b] border-b border-[#e6dfd5] dark:border-[#382f27] text-stone-700 dark:text-stone-300 font-bold uppercase tracking-wider z-10">
              <tr>
                <th className="p-3 w-12 text-center">
                  <span className="sr-only">Select</span>
                </th>
                <th className="p-3">Product &amp; SKU</th>
                <th className="p-3">Category</th>
                <th className="p-3 text-center">Stock Level</th>
                <th className="p-3">Code Value</th>
                <th className="p-3 text-center">Code Type</th>
                <th className="p-3 text-center w-36">Label Copies</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e6dfd5] dark:divide-[#2d251f]">
              {filteredProducts.map((p) => {
                const config = selectionMap[p.id] || {
                  isSelected: false,
                  copies: defaultCopies,
                  type: defaultType,
                  code: p.codes[0]?.code || p.sku,
                };
                const isSelected = !!config.isSelected;
                const isOutOfStock = p.currentStock <= 0 && p.category !== 'Print Services';
                const isLowStock = p.currentStock <= p.minStockThreshold && !isOutOfStock;
                const primaryCode = p.codes.find((c) => c.isPrimary) || p.codes[0];
                const hasExistingCode = !!primaryCode;

                return (
                  <tr
                    key={p.id}
                    onClick={() => toggleItem(p.id)}
                    className={`transition cursor-pointer select-none ${
                      isSelected
                        ? 'bg-emerald-50/70 dark:bg-[#142920]/60 hover:bg-emerald-100/70 dark:hover:bg-[#142920]'
                        : 'hover:bg-[#fdfbf7] dark:hover:bg-[#201b17]'
                    }`}
                  >
                    {/* Checkbox */}
                    <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => toggleItem(p.id)}
                        className="text-stone-400 hover:text-emerald-700 transition"
                      >
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-[#064e3b] dark:text-[#6ee7b7]" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    </td>

                    {/* Product Name & SKU */}
                    <td className="p-3">
                      <div className="font-bold text-stone-900 dark:text-stone-100 leading-snug">
                        {p.name}
                      </div>
                      <div className="text-[11px] text-stone-400 font-mono flex items-center gap-1.5 mt-0.5">
                        <span>{p.sku}</span>
                        {p.brand && <span>• {p.brand}</span>}
                        <span className="text-[#064e3b] dark:text-[#6ee7b7] font-semibold">
                          • {p.sellingPrice.toFixed(2)} {settings.currency}
                        </span>
                      </div>
                    </td>

                    {/* Category */}
                    <td className="p-3 text-stone-600 dark:text-stone-300 font-medium">
                      {p.category}
                    </td>

                    {/* Stock level */}
                    <td className="p-3 text-center">
                      {isOutOfStock ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                          OUT OF STOCK
                        </span>
                      ) : isLowStock ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                          <AlertTriangle className="w-3 h-3" />
                          LOW ({p.currentStock})
                        </span>
                      ) : (
                        <span className="font-mono font-semibold text-stone-800 dark:text-stone-200">
                          {p.category === 'Print Services' ? 'Service' : `${p.currentStock} ${p.unit}`}
                        </span>
                      )}
                    </td>

                    {/* Code Value / Generator */}
                    <td className="p-3" onClick={(e) => e.stopPropagation()}>
                      {hasExistingCode ? (
                        <div className="flex items-center gap-1.5 font-mono text-[11px]">
                          {primaryCode.type === 'qr' ? (
                            <QrCode className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                          ) : (
                            <Barcode className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                          )}
                          <span className="font-bold text-stone-800 dark:text-stone-200 truncate max-w-[140px]">
                            {primaryCode.code}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 font-semibold">
                            No Code
                          </span>
                          <button
                            type="button"
                            onClick={(e) => autoGenerateCodeForProduct(p, e)}
                            className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold hover:underline flex items-center gap-0.5"
                          >
                            <Sparkles className="w-3 h-3" /> Auto
                          </button>
                        </div>
                      )}
                    </td>

                    {/* Code Type Buttons */}
                    <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="inline-flex rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-0.5 text-[10px]">
                        <button
                          type="button"
                          onClick={() => updateItemType(p.id, 'barcode')}
                          className={`px-1.5 py-0.5 rounded font-semibold transition ${
                            config.type === 'barcode'
                              ? 'bg-[#064e3b] text-white'
                              : 'text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800'
                          }`}
                          title="Generate 1D Barcode"
                        >
                          1D
                        </button>
                        <button
                          type="button"
                          onClick={() => updateItemType(p.id, 'qr')}
                          className={`px-1.5 py-0.5 rounded font-semibold transition ${
                            config.type === 'qr'
                              ? 'bg-[#064e3b] text-white'
                              : 'text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800'
                          }`}
                          title="Generate 2D QR Code"
                        >
                          QR
                        </button>
                        <button
                          type="button"
                          onClick={() => updateItemType(p.id, 'both')}
                          className={`px-1.5 py-0.5 rounded font-semibold transition ${
                            config.type === 'both'
                              ? 'bg-[#064e3b] text-white'
                              : 'text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800'
                          }`}
                          title="Generate Both Barcode and QR"
                        >
                          Both
                        </button>
                      </div>
                    </td>

                    {/* Copies Input */}
                    <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => updateItemCopies(p.id, -1)}
                          className="p-1 rounded bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 text-stone-600 dark:text-stone-300 transition"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <input
                          type="number"
                          min="1"
                          max="200"
                          value={config.copies || 1}
                          onChange={(e) =>
                            updateItemCopies(p.id, parseInt(e.target.value, 10) || 1, true)
                          }
                          className="w-12 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-center font-bold text-xs py-0.5 rounded font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => updateItemCopies(p.id, 1)}
                          className="p-1 rounded bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 text-stone-600 dark:text-stone-300 transition"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-stone-400">
                    <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="font-semibold text-xs">No matching products found</p>
                    <p className="text-[11px] mt-0.5">Try adjusting your search query or category filter.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ================= MODAL FOOTER ================= */}
        <div className="p-4 sm:px-6 bg-[#fdfbf7] dark:bg-[#201b17] border-t border-[#e6dfd5] dark:border-[#382f27] flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-stone-600 dark:text-stone-400 flex items-center gap-2">
            <span className="font-bold text-stone-900 dark:text-stone-100">
              {selectedCount} Products
            </span>
            <span>•</span>
            <span className="font-extrabold text-[#064e3b] dark:text-[#6ee7b7] font-mono">
              {totalCopiesCount} Total Sticker Labels
            </span>
            <span className="text-stone-400 hidden sm:inline">
              (will be formatted for selected template)
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 border border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleDirectPDFExport}
              disabled={selectedCount === 0 || isExportingPDF}
              className="px-4 py-2 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 border border-emerald-300 dark:border-emerald-800 disabled:opacity-40 text-[#064e3b] dark:text-[#6ee7b7] rounded-xl text-xs font-extrabold shadow-2xs transition flex items-center justify-center gap-1.5 cursor-pointer"
              title="Immediately generate and download PDF sheet for selected items"
            >
              <FileDown className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>{isExportingPDF ? 'Generating...' : 'Export PDF'}</span>
            </button>

            <button
              type="button"
              onClick={handleConfirm}
              disabled={selectedCount === 0}
              className="px-5 py-2.5 bg-[#064e3b] hover:bg-[#043b2c] disabled:opacity-40 text-white rounded-xl text-xs font-extrabold shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <Barcode className="w-4 h-4" />
              <span>
                {actionButtonText} ({selectedCount} items / {totalCopiesCount} labels)
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
