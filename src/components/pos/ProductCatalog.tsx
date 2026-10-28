import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Search,
  X,
  Barcode,
  Camera,
  AlertTriangle,
  Check,
  Plus,
  Package,
  Layers,
  Sparkles,
} from 'lucide-react';
import { Product } from '../../types/pos';
import { MOCK_CATEGORIES } from '../../data/mockData';

interface ProductCatalogProps {
  products: Product[];
  onAddToCart: (product: Product) => void;
  onOpenScanner: () => void;
  currency: string;
  focusSearchTrigger?: number;
}

export const ProductCatalog: React.FC<ProductCatalogProps> = ({
  products,
  onAddToCart,
  onOpenScanner,
  currency,
  focusSearchTrigger,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All Items');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // When system-driven focus change is requested (e.g. after starting a new transaction),
  // autofocus the search field with a clear visible highlight
  useEffect(() => {
    if (focusSearchTrigger && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [focusSearchTrigger]);

  // Filter products by category and search (name, SKU, barcode)
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesCategory =
        selectedCategory === 'All Items' || p.category === selectedCategory;

      if (!matchesCategory) return false;

      if (!searchQuery.trim()) return true;

      const q = searchQuery.toLowerCase().trim();
      return (
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.barcode.includes(q) ||
        (p.description && p.description.toLowerCase().includes(q))
      );
    });
  }, [products, selectedCategory, searchQuery]);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#fdfbf7] overflow-hidden">
      {/* 1. Search Bar & Barcode Direct Input (Always one tap away) */}
      <div className="p-3 bg-white border-b border-[#e6dfd5] shrink-0">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <label htmlFor="product-search-input" className="sr-only">
              Search products by name, SKU, or barcode
            </label>
            <Search
              className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none"
              aria-hidden="true"
            />
            <input
              id="product-search-input"
              ref={searchInputRef}
              type="search"
              inputMode="search"
              enterKeyHint="search"
              autoComplete="off"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search item, SKU, or scan barcode (F2)..."
              className="w-full min-h-[44px] bg-[#f5f1e8] border border-stone-200 focus:border-[#064e3b] focus:bg-white rounded-xl pl-10 pr-10 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-hidden focus:ring-2 focus:ring-[#064e3b] focus:ring-offset-1 transition font-medium"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search query"
                className="min-h-[44px] min-w-[44px] absolute right-0 top-1/2 -translate-y-1/2 flex items-center justify-center text-stone-400 hover:text-stone-700"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
          </div>

          {/* Direct Camera Scan Trigger (Always one tap away on mobile) */}
          <button
            type="button"
            onClick={onOpenScanner}
            aria-label="Scan barcode directly"
            className="min-h-[44px] min-w-[44px] px-3 py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-[#064e3b] rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#064e3b] transition"
            title="Scan barcode with camera"
          >
            <Barcode className="w-5 h-5 shrink-0" aria-hidden="true" />
            <span className="hidden sm:inline">Scan</span>
          </button>
        </div>

        {/* 2. Category Filter Pills (Minimum 44px touch targets) */}
        <div className="flex items-center gap-2 overflow-x-auto pt-2 scrollbar-none">
          {MOCK_CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                aria-pressed={isSelected}
                className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#064e3b] ${
                  isSelected
                    ? 'bg-[#064e3b] text-white shadow-xs'
                    : 'bg-white text-stone-700 hover:bg-stone-100 border border-stone-200'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Responsive Product Grid:
             - Mobile (<768px): 1–2 columns (grid-cols-1 sm:grid-cols-2) - NEVER 4 columns on a phone
             - Tablet (768px): 2–3 columns (md:grid-cols-2 lg:grid-cols-3)
             - Desktop (>=1024px): 3–5 columns (xl:grid-cols-3 2xl:grid-cols-4)
             - Spacing scale in 4px increments: p-3 (12px), gap-2 (8px), gap-3 (12px)
      */}
      <div
        role="region"
        aria-label="Product Catalog"
        className="flex-1 min-h-0 overflow-y-auto touch-scroll overscroll-contain p-3 pb-24 md:pb-4"
      >
        {filteredProducts.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center text-center p-4">
            <Package className="w-10 h-10 text-stone-400 mb-2" aria-hidden="true" />
            <p className="text-sm font-bold text-stone-700">No matching products found</p>
            <p className="text-xs text-stone-500 mt-1">
              Try a different keyword or scan a product barcode directly.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 gap-2 sm:gap-3">
            {filteredProducts.map((prod) => {
              const isOutOfStock = prod.stock <= 0 && prod.category !== 'Print & Services';
              const isLowStock =
                prod.stock > 0 &&
                prod.stock <= prod.minStock &&
                prod.category !== 'Print & Services';

              return (
                <button
                  key={prod.id}
                  type="button"
                  onClick={() => !isOutOfStock && onAddToCart(prod)}
                  disabled={isOutOfStock}
                  aria-label={`${prod.name}, Price: ${prod.price} ${currency}, ${
                    isOutOfStock
                      ? 'Out of stock'
                      : isLowStock
                      ? `Low stock: ${prod.stock} left`
                      : `${prod.stock} in stock`
                  }`}
                  className={`group relative text-left p-3 rounded-2xl border transition flex flex-col justify-between min-h-[96px] select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#064e3b] ${
                    isOutOfStock
                      ? 'bg-stone-100 border-stone-200 opacity-60 cursor-not-allowed'
                      : 'bg-white hover:bg-emerald-50/40 border-[#e6dfd5] hover:border-[#064e3b] shadow-2xs hover:shadow-xs active:scale-[0.98]'
                  }`}
                >
                  {/* Top: Category Tag + Stock Status (Icon + Text: Never color alone) */}
                  <div className="flex items-start justify-between gap-1 w-full">
                    <span className="text-[10px] font-semibold text-stone-500 uppercase tracking-wider line-clamp-1">
                      {prod.category}
                    </span>

                    {/* Status Badges with Icon + Text */}
                    {isOutOfStock ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200 shrink-0">
                        <AlertTriangle className="w-3 h-3 text-rose-600" aria-hidden="true" />
                        <span>Out of stock</span>
                      </span>
                    ) : isLowStock ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 shrink-0">
                        <AlertTriangle className="w-3 h-3 text-amber-700" aria-hidden="true" />
                        <span>Low: {prod.stock}</span>
                      </span>
                    ) : prod.category !== 'Print & Services' ? (
                      <span className="text-[10px] text-stone-400 font-mono">
                        {prod.stock} {prod.unit}
                      </span>
                    ) : (
                      <span className="text-[10px] text-emerald-700 font-semibold">
                        Service
                      </span>
                    )}
                  </div>

                  {/* Middle: Product Name & SKU */}
                  <div className="my-1.5">
                    <h3 className="font-bold text-xs sm:text-sm text-stone-900 line-clamp-2 leading-snug group-hover:text-[#064e3b]">
                      {prod.name}
                    </h3>
                    <p className="text-[10px] text-stone-400 font-mono mt-0.5">
                      {prod.sku} • {prod.barcode}
                    </p>
                  </div>

                  {/* Bottom: Price and Quick Add Button (Touch Target >=44px) */}
                  <div className="flex items-center justify-between pt-1 border-t border-stone-100 w-full mt-auto">
                    <div className="flex items-baseline gap-1">
                      <span className="text-sm sm:text-base font-extrabold font-mono text-[#064e3b]">
                        {prod.price.toFixed(2)}
                      </span>
                      <span className="text-[10px] font-bold text-stone-500">
                        {currency}
                      </span>
                    </div>

                    {!isOutOfStock && (
                      <div
                        className="w-8 h-8 rounded-xl bg-emerald-50 group-hover:bg-[#064e3b] text-[#064e3b] group-hover:text-white flex items-center justify-center transition shrink-0"
                        aria-hidden="true"
                      >
                        <Plus className="w-4 h-4 stroke-[2.5]" />
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
