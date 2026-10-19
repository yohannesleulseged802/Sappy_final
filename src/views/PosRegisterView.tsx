import React, {useState, useMemo, useEffect, useRef} from 'react';
import {
  Search,
  Barcode,
  QrCode,
  Trash2,
  Plus,
  Minus,
  Percent,
  UserPlus,
  BookmarkPlus,
  BookmarkCheck,
  CreditCard,
  DollarSign,
  Smartphone,
  FileText,
  RefreshCw,
  X,
  Check,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  Layers,
  ChevronDown,
  Tag,
  Clock,
  HelpCircle,
  Printer,
  FileDown,
} from 'lucide-react';
import {
  Product,
  CartItem,
  Customer,
  StoreSettings,
  Staff,
  Sale,
  PaymentSplit,
  PaymentMethod,
  HeldOrder,
} from '../types';
import {storage} from '../services/storage';
import {sound} from '../services/sound';
import {ExportService} from '../services/export';
import {CameraScannerModal} from '../components/common/CameraScannerModal';
import {BarcodeRenderer} from '../components/common/BarcodeRenderer';
import {IndividualCodeViewModal} from '../components/common/IndividualCodeViewModal';

interface PosRegisterViewProps {
  products: Product[];
  currentStaff: Staff;
  settings: StoreSettings;
  onRefreshData: () => void;
}

export const PosRegisterView: React.FC<PosRegisterViewProps> = ({
  products,
  currentStaff,
  settings,
  onRefreshData,
}) => {
  // Individual Code View Modal State
  const [inspectCodeProduct, setInspectCodeProduct] = useState<Product | null>(null);
  const [isIndividualCodeOpen, setIsIndividualCodeOpen] = useState(false);
  // --- Cart State ---
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartDiscountType, setCartDiscountType] = useState<'percent' | 'fixed'>('percent');
  const [cartDiscountValue, setCartDiscountValue] = useState<number>(0);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  // --- Search & Filtering ---
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // --- Modals ---
  const [isCameraScannerOpen, setIsCameraScannerOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [isDiscountModalOpen, setIsDiscountModalOpen] = useState(false);
  const [isHeldOrdersModalOpen, setIsHeldOrdersModalOpen] = useState(false);
  const [isCompletedModalOpen, setIsCompletedModalOpen] = useState(false);
  const [lastCompletedSale, setLastCompletedSale] = useState<Sale | null>(null);
  const [justRecordedNotice, setJustRecordedNotice] = useState<{
    receiptNumber: string;
    grandTotal: number;
    itemCount: number;
    customerName?: string;
  } | null>(null);

  // --- Item Discount Editing ---
  const [editingItemDiscount, setEditingItemDiscount] = useState<{
    productId: string;
    type: 'percent' | 'fixed';
    val: number;
  } | null>(null);

  // --- Split Payments State for Checkout ---
  const [cashAmount, setCashAmount] = useState<number>(0);
  const [cardAmount, setCardAmount] = useState<number>(0);
  const [mobileAmount, setMobileAmount] = useState<number>(0);
  const [creditAmount, setCreditAmount] = useState<number>(0);
  const [mobileRef, setMobileRef] = useState<string>('');
  const [cardRef, setCardRef] = useState<string>('');
  const [checkoutNotes, setCheckoutNotes] = useState<string>('');

  // --- Park / Hold Order Label ---
  const [holdLabel, setHoldLabel] = useState('');
  const [isHoldInputOpen, setIsHoldInputOpen] = useState(false);

  // Categories list
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return ['All', ...Array.from(set)];
  }, [products]);

  // Filtered Products
  const filteredProducts = useMemo(() => {
    let result = products;
    if (selectedCategory !== 'All') {
      result = result.filter((p) => p.category === selectedCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.brand.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q) ||
          p.codes.some((c) => c.active && c.code.toLowerCase().includes(q))
      );
    }
    return result;
  }, [products, selectedCategory, searchQuery]);

  // --- Cart Calculations ---
  const cartSubtotal = useMemo(() => {
    return cart.reduce((sum, item) => {
      let itemPrice = item.sellingPrice;
      if (item.discountType && item.discountValue) {
        if (item.discountType === 'percent') {
          itemPrice -= (itemPrice * item.discountValue) / 100;
        } else {
          itemPrice = Math.max(0, itemPrice - item.discountValue);
        }
      }
      return sum + itemPrice * item.quantity;
    }, 0);
  }, [cart]);

  const cartDiscountAmount = useMemo(() => {
    if (!cartDiscountValue) return 0;
    if (cartDiscountType === 'percent') {
      return (cartSubtotal * cartDiscountValue) / 100;
    }
    return Math.min(cartSubtotal, cartDiscountValue);
  }, [cartSubtotal, cartDiscountType, cartDiscountValue]);

  const discountedSubtotal = Math.max(0, cartSubtotal - cartDiscountAmount);

  const taxAmount = useMemo(() => {
    if (settings.taxRatePercent <= 0) return 0;
    return (discountedSubtotal * settings.taxRatePercent) / 100;
  }, [discountedSubtotal, settings.taxRatePercent]);

  const grandTotal = discountedSubtotal + taxAmount;

  // Payments total entered in checkout
  const totalEnteredPayment = cashAmount + cardAmount + mobileAmount + creditAmount;
  const remainingAmount = Math.max(0, grandTotal - totalEnteredPayment);
  const changeGiven = Math.max(0, cashAmount - (grandTotal - (cardAmount + mobileAmount + creditAmount)));

  // --- Add Product to Cart ---
  const handleAddToCart = (product: Product) => {
    if (product.currentStock <= 0 && product.category !== 'Print Services') {
      sound.playError();
      return;
    }

    sound.playScanSuccess();
    setCart((prevCart) => {
      const existing = prevCart.find((item) => item.productId === product.id);
      if (existing) {
        return prevCart.map((item) =>
          item.productId === product.id
            ? {...item, quantity: item.quantity + 1}
            : item
        );
      }
      return [
        ...prevCart,
        {
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          unit: product.unit,
          sellingPrice: product.sellingPrice,
          costPrice: product.costPrice,
          quantity: 1,
        },
      ];
    });
  };

  const updateItemQty = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.productId === productId) {
            const nextQty = item.quantity + delta;
            return nextQty > 0 ? {...item, quantity: nextQty} : null;
          }
          return item;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const removeItem = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.productId !== productId));
  };

  // --- Handle Scanned Value (Camera or Hardware Scanner) ---
  const handleBarcodeScanned = (scannedValue: string): boolean => {
    let targetCode = scannedValue.trim();
    try {
      if (targetCode.startsWith('{') && targetCode.endsWith('}')) {
        const parsed = JSON.parse(targetCode);
        targetCode = parsed.sku || parsed.code || parsed.productId || targetCode;
      }
    } catch {}

    // 1. Try finding product
    const matched = storage.findProductByCode(targetCode);
    if (matched) {
      handleAddToCart(matched);
      setSearchQuery('');
      return true;
    }

    // 2. Try finding customer by phone or ID
    const matchedCustomer = storage.getCustomers().find(
      (c) =>
        c.phone === targetCode ||
        c.id === targetCode ||
        c.name.toLowerCase() === targetCode.toLowerCase()
    );
    if (matchedCustomer) {
      sound.playCheckoutSuccess();
      setSelectedCustomer(matchedCustomer);
      setJustRecordedNotice({
        receiptNumber: 'CUSTOMER',
        grandTotal: 0,
        itemCount: 0,
        customerName: `Customer Assigned: ${matchedCustomer.name}`,
      });
      setTimeout(() => setJustRecordedNotice(null), 3000);
      return true;
    }

    // 3. Not found
    sound.playError();
    setSearchQuery(targetCode);
    return false;
  };

  // --- Global Keyboard & Hardware Barcode Gun Scanner Listener ---
  useEffect(() => {
    let barcodeBuffer = '';
    let lastKeyTime = 0;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Toggle Camera Scanner Modal with F3
      if (e.key === 'F3') {
        e.preventDefault();
        setIsCameraScannerOpen((prev) => !prev);
        return;
      }

      // Focus product search on F2
      if (e.key === 'F2') {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      // Close modal on Escape
      if (e.key === 'Escape' && isCameraScannerOpen) {
        setIsCameraScannerOpen(false);
        return;
      }

      // Hardware Barcode Scanner Detection:
      // Barcode scanners act as keyboard wedge typing characters rapidly (< 50ms) ending with Enter
      const now = Date.now();
      const targetElement = e.target as HTMLElement;
      const isInputOrTextarea = targetElement && (targetElement.tagName === 'INPUT' || targetElement.tagName === 'TEXTAREA');

      if (e.key === 'Enter') {
        if (barcodeBuffer.trim().length >= 3 && (now - lastKeyTime < 250)) {
          e.preventDefault();
          handleBarcodeScanned(barcodeBuffer.trim());
          barcodeBuffer = '';
          if (isInputOrTextarea && (targetElement as HTMLInputElement).value) {
            (targetElement as HTMLInputElement).value = '';
          }
          return;
        }
        barcodeBuffer = '';
        return;
      }

      // Collect single printable characters
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        // If elapsed time since last keystroke is long, it's human typing not a scanner
        if (now - lastKeyTime > 150) {
          barcodeBuffer = '';
        }
        barcodeBuffer += e.key;
        lastKeyTime = now;
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [products, isCameraScannerOpen]);

  // --- Park / Hold Cart ---
  const handleParkCart = () => {
    if (cart.length === 0) return;
    const label =
      holdLabel.trim() ||
      selectedCustomer?.name ||
      `Cart #${new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}`;

    storage.holdOrder({
      label,
      customerName: selectedCustomer?.name,
      items: cart,
      cartDiscountType,
      cartDiscountValue,
    });

    setCart([]);
    setSelectedCustomer(null);
    setCartDiscountValue(0);
    setHoldLabel('');
    setIsHoldInputOpen(false);
    onRefreshData();
  };

  const handleResumeCart = (order: HeldOrder) => {
    setCart(order.items);
    setCartDiscountType(order.cartDiscountType || 'percent');
    setCartDiscountValue(order.cartDiscountValue || 0);
    if (order.customerName) {
      const cust = storage.getCustomers().find((c) => c.name === order.customerName);
      if (cust) setSelectedCustomer(cust);
    }
    storage.deleteHeldOrder(order.id);
    setIsHeldOrdersModalOpen(false);
    onRefreshData();
  };

  // --- Checkout Initiation ---
  const openCheckout = () => {
    if (cart.length === 0) return;
    // Default to full cash payment
    setCashAmount(grandTotal);
    setCardAmount(0);
    setMobileAmount(0);
    setCreditAmount(0);
    setMobileRef('');
    setCardRef('');
    setIsCheckoutOpen(true);
  };

  // --- Complete Sale ---
  const handleCompleteCheckout = () => {
    if (totalEnteredPayment < grandTotal - 0.01) {
      sound.playError();
      alert(`Payment is incomplete. Remaining amount: ${remainingAmount.toFixed(2)} ${settings.currency}`);
      return;
    }

    // Validate customer credit limit if credit used
    if (creditAmount > 0) {
      if (!selectedCustomer) {
        sound.playError();
        alert('Please assign a customer account before processing store credit.');
        return;
      }
      const newPotentialBalance = selectedCustomer.currentBalance + creditAmount;
      if (newPotentialBalance > selectedCustomer.creditLimit) {
        sound.playError();
        alert(
          `Credit limit exceeded for ${selectedCustomer.name}! Limit: ${selectedCustomer.creditLimit} ${settings.currency}, Current Balance: ${selectedCustomer.currentBalance} ${settings.currency}. Max credit allowed: ${(selectedCustomer.creditLimit - selectedCustomer.currentBalance).toFixed(2)} ${settings.currency}`
        );
        return;
      }
    }

    const payments: PaymentSplit[] = [];
    if (cashAmount > 0) {
      // Record effective cash collected (minus change)
      const effectiveCash = Math.min(cashAmount, grandTotal - (cardAmount + mobileAmount + creditAmount));
      payments.push({method: 'cash', amount: effectiveCash});
    }
    if (cardAmount > 0) payments.push({method: 'card', amount: cardAmount, reference: cardRef});
    if (mobileAmount > 0) payments.push({method: 'mobile_transfer', amount: mobileAmount, reference: mobileRef});
    if (creditAmount > 0) payments.push({method: 'credit', amount: creditAmount});

    const sale = storage.completeSale({
      cashierId: currentStaff.id,
      cashierName: currentStaff.name,
      customerId: selectedCustomer?.id,
      customerName: selectedCustomer?.name,
      items: cart,
      subtotal: cartSubtotal,
      cartDiscountType,
      cartDiscountValue,
      totalDiscount: cartDiscountAmount,
      taxRate: settings.taxRatePercent,
      taxAmount,
      grandTotal,
      payments,
      amountPaid: totalEnteredPayment,
      changeGiven,
      creditAdded: creditAmount,
      notes: checkoutNotes,
    });

    sound.playCheckoutSuccess();
    setIsCheckoutOpen(false);

    // Record directly into ledger/records without any receipt popup or printing
    setJustRecordedNotice({
      receiptNumber: sale.receiptNumber,
      grandTotal: sale.grandTotal,
      itemCount: sale.items.reduce((s, i) => s + i.quantity, 0),
      customerName: sale.customerName,
    });
    setTimeout(() => {
      setJustRecordedNotice(null);
    }, 4500);

    // Reset Cart
    setCart([]);
    setSelectedCustomer(null);
    setCartDiscountValue(0);
    setCheckoutNotes('');
    onRefreshData();
  };

  // Instant 1-Click "Record Sale" for fast cash transactions
  const handleQuickRecordSale = (method: 'cash' | 'card' | 'mobile_transfer' = 'cash') => {
    if (cart.length === 0) return;

    const sale = storage.completeSale({
      cashierId: currentStaff.id,
      cashierName: currentStaff.name,
      customerId: selectedCustomer?.id,
      customerName: selectedCustomer?.name,
      items: cart,
      subtotal: cartSubtotal,
      cartDiscountType,
      cartDiscountValue,
      totalDiscount: cartDiscountAmount,
      taxRate: settings.taxRatePercent,
      taxAmount,
      grandTotal,
      payments: [{method, amount: grandTotal}],
      amountPaid: grandTotal,
      changeGiven: 0,
      creditAdded: 0,
      notes: 'Internal Sales Record',
    });

    sound.playCheckoutSuccess();
    setIsCheckoutOpen(false);
    setJustRecordedNotice({
      receiptNumber: sale.receiptNumber,
      grandTotal: sale.grandTotal,
      itemCount: sale.items.reduce((s, i) => s + i.quantity, 0),
      customerName: sale.customerName,
    });
    setTimeout(() => {
      setJustRecordedNotice(null);
    }, 4500);

    // Reset Cart
    setCart([]);
    setSelectedCustomer(null);
    setCartDiscountValue(0);
    setCheckoutNotes('');
    onRefreshData();
  };

  const heldOrders = storage.getHeldOrders();

  return (
    <div className="flex-1 flex flex-col lg:flex-row h-[calc(100vh-3.5rem)] overflow-hidden bg-[#fdfbf7] dark:bg-[#12100e] relative">
      {/* ================= SALE RECORDED BANNER (INTERNAL LEDGER ONLY) ================= */}
      {justRecordedNotice && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40 bg-emerald-900 text-white px-4 py-2.5 rounded-2xl shadow-2xl border border-emerald-600/50 flex items-center gap-3 animate-in fade-in slide-in-from-top-3 duration-200">
          <div className="w-8 h-8 rounded-full bg-emerald-700 flex items-center justify-center shrink-0">
            <Check className="w-5 h-5 text-emerald-200 stroke-[3]" />
          </div>
          <div className="text-xs">
            <div className="font-extrabold flex items-center gap-1.5">
              <span>Transaction Recorded in Internal Ledger</span>
              <span className="text-[10px] bg-emerald-800 text-emerald-200 px-1.5 py-0.5 rounded-sm font-mono">
                #{justRecordedNotice.receiptNumber}
              </span>
            </div>
            <div className="text-[11px] text-emerald-200">
              {justRecordedNotice.itemCount} item(s) •{' '}
              <span className="font-bold">
                {justRecordedNotice.grandTotal.toFixed(2)} {settings.currency}
              </span>
              {justRecordedNotice.customerName && ` • ${justRecordedNotice.customerName}`}
            </div>
          </div>
          <button
            onClick={() => setJustRecordedNotice(null)}
            className="p-1 hover:text-emerald-200 text-emerald-400 rounded-md ml-2"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ================= LEFT SIDE: PRODUCT CATALOG & SEARCH ================= */}
      <div className="flex-1 flex flex-col h-full border-r border-[#e6dfd5] dark:border-[#362e26] overflow-hidden">
        {/* Top Control Bar: Search & Quick Actions */}
        <div className="p-3 bg-white dark:bg-[#1c1815] border-b border-[#e6dfd5] dark:border-[#362e26] flex items-center gap-2">
          {/* Fast Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (!searchQuery.trim()) return;
                  const handled = handleBarcodeScanned(searchQuery.trim());
                  if (!handled && filteredProducts.length === 1) {
                    handleAddToCart(filteredProducts[0]);
                    setSearchQuery('');
                  }
                }
              }}
              placeholder="Search product, SKU, or scan barcode directly (Enter / F3)..."
              className="w-full bg-[#f5f1e8] dark:bg-[#25201b] border border-transparent focus:border-[#064e3b] dark:focus:border-[#6ee7b7] rounded-xl pl-9 pr-8 py-2 text-xs sm:text-sm text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-hidden transition font-medium"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 p-0.5 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* QR Code & Barcode Scanner Button to Sell (F3) */}
          <button
            onClick={() => setIsCameraScannerOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#064e3b] hover:bg-[#043b2c] text-white rounded-xl text-xs font-bold shadow-xs transition shrink-0 cursor-pointer"
            title="Scan Barcode or QR Code to Sell (F3)"
          >
            <QrCode className="w-4 h-4 text-[#6ee7b7]" />
            <span className="hidden sm:inline">Scan to Sell (F3)</span>
            <span className="sm:hidden">Scan</span>
          </button>

          {/* Held Orders Quick Badge */}
          {heldOrders.length > 0 && (
            <button
              onClick={() => setIsHeldOrdersModalOpen(true)}
              className="flex items-center gap-1 px-2.5 py-2 bg-amber-100 hover:bg-amber-200 dark:bg-amber-950 dark:hover:bg-amber-900 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-800 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer"
              title="Resume Held Carts (F5)"
            >
              <BookmarkCheck className="w-4 h-4 text-amber-600" />
              <span>{heldOrders.length} Held</span>
            </button>
          )}
        </div>

        {/* Category Filter Horizontal Chips */}
        <div className="px-3 py-2 bg-white/50 dark:bg-[#1c1815]/50 border-b border-[#e6dfd5] dark:border-[#362e26] flex gap-1.5 overflow-x-auto scrollbar-none">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-[#064e3b] text-white shadow-xs'
                  : 'bg-white dark:bg-[#25201b] text-stone-600 dark:text-stone-300 hover:bg-[#f5f1e8] dark:hover:bg-[#2c2621] border border-[#e6dfd5] dark:border-[#362e26]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Products Grid */}
        <div className="flex-1 overflow-y-auto p-3 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5 content-start">
          {filteredProducts.map((p) => {
            const isOutOfStock = p.currentStock <= 0 && p.category !== 'Print Services';
            const isLowStock = p.currentStock <= p.minStockThreshold && !isOutOfStock;
            const primaryCode = p.codes.find((c) => c.isPrimary)?.code || p.codes[0]?.code;

            return (
              <div
                key={p.id}
                onClick={() => handleAddToCart(p)}
                className={`relative group p-2.5 rounded-xl border transition flex flex-col justify-between select-none cursor-pointer text-left ${
                  isOutOfStock
                    ? 'bg-stone-100 dark:bg-stone-900/60 border-stone-200 dark:border-stone-800 opacity-60'
                    : 'bg-white dark:bg-[#1c1815] border-[#e6dfd5] dark:border-[#362e26] hover:border-[#064e3b] dark:hover:border-[#6ee7b7] hover:shadow-md'
                }`}
              >
                <div>
                  {/* Category & Stock Tag */}
                  <div className="flex items-center justify-between gap-1 mb-1 text-[10px]">
                    <span className="text-stone-400 truncate uppercase font-medium">
                      {p.category}
                    </span>
                    {isOutOfStock ? (
                      <span className="px-1.5 py-0.2 bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 rounded font-bold">
                        OUT
                      </span>
                    ) : isLowStock ? (
                      <span className="px-1.5 py-0.2 bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 rounded font-bold">
                        LOW ({p.currentStock})
                      </span>
                    ) : (
                      <span className="text-stone-500 font-mono">
                        {p.category === 'Print Services' ? 'Service' : `${p.currentStock} ${p.unit}`}
                      </span>
                    )}
                  </div>

                  {/* Product Name */}
                  <h4 className="font-bold text-xs line-clamp-2 text-stone-900 dark:text-stone-100 leading-snug">
                    {p.name}
                  </h4>
                </div>

                {/* SKU, Primary Code & Price Footer */}
                <div className="mt-2 pt-2 border-t border-[#f5f1e8] dark:border-[#25201b] flex items-end justify-between">
                  <div className="flex items-center gap-1 text-[10px] text-stone-400 font-mono truncate max-w-[110px]">
                    <span className="truncate">{p.sku}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setInspectCodeProduct(p);
                        setIsIndividualCodeOpen(true);
                      }}
                      className="p-0.5 hover:text-emerald-700 hover:bg-stone-100 dark:hover:bg-stone-800 rounded transition cursor-pointer"
                      title="Inspect Individual Barcode / QR Code"
                    >
                      <Barcode className="w-3.5 h-3.5 text-stone-400 hover:text-emerald-600" />
                    </button>
                  </div>
                  <div className="text-right">
                    <span className="text-xs sm:text-sm font-black font-mono-numbers text-[#064e3b] dark:text-[#6ee7b7]">
                      {p.sellingPrice.toFixed(2)}
                    </span>
                    <span className="text-[10px] text-stone-400 ml-0.5">
                      {settings.currency}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}

          {filteredProducts.length === 0 && (
            <div className="col-span-full py-16 text-center text-stone-400">
              <Layers className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm font-medium">No products match your search.</p>
              <p className="text-xs mt-1">Try another keyword or scan a barcode.</p>
            </div>
          )}
        </div>
      </div>

      {/* ================= RIGHT SIDE: HIGH-SPEED CART & CHECKOUT ================= */}
      <div className="w-full lg:w-96 xl:w-[420px] bg-white dark:bg-[#1c1815] flex flex-col h-full border-t lg:border-t-0 shrink-0">
        {/* Cart Header */}
        <div className="p-3 border-b border-[#e6dfd5] dark:border-[#362e26] flex items-center justify-between bg-[#fdfbf7] dark:bg-[#171412]">
          <div className="flex items-center gap-2">
            <h2 className="font-extrabold text-sm text-[#064e3b] dark:text-[#6ee7b7]">
              Current Cart ({cart.reduce((s, i) => s + i.quantity, 0)})
            </h2>
            <button
              onClick={() => setIsCameraScannerOpen(true)}
              className="px-2 py-1 bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-950 dark:hover:bg-emerald-900 text-[#064e3b] dark:text-[#6ee7b7] rounded-lg text-xs font-bold flex items-center gap-1 transition cursor-pointer"
              title="Open QR Code / Barcode Scanner to Sell"
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>Scan to Sell</span>
            </button>
          </div>

          <div className="flex items-center gap-1">
            {/* Customer Selector (F6) */}
            <button
              onClick={() => setIsCustomerModalOpen(true)}
              className={`px-2 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 border transition ${
                selectedCustomer
                  ? 'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300'
                  : 'bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-300 border-stone-200 dark:border-stone-800 hover:bg-stone-50'
              }`}
              title="Assign Customer or Store Credit (F6)"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span className="max-w-[100px] truncate">
                {selectedCustomer ? selectedCustomer.name.split(' ')[0] : 'Walk-in'}
              </span>
            </button>

            {/* Clear Cart */}
            {cart.length > 0 && (
              <button
                onClick={() => setCart([])}
                className="p-1 text-stone-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
                title="Clear Entire Cart"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Selected Customer Banner */}
        {selectedCustomer && (
          <div className="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/40 border-b border-emerald-200 dark:border-emerald-900/60 flex items-center justify-between text-xs text-emerald-900 dark:text-emerald-300">
            <div>
              <span className="font-bold">{selectedCustomer.name}</span>
              <span className="text-[10px] ml-1.5 opacity-80">
                (Bal: {selectedCustomer.currentBalance} / Limit: {selectedCustomer.creditLimit})
              </span>
            </div>
            <button
              onClick={() => setSelectedCustomer(null)}
              className="text-emerald-700 dark:text-emerald-400 hover:underline text-[10px]"
            >
              Remove
            </button>
          </div>
        )}

        {/* Cart Items List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {cart.map((item) => {
            const hasDiscount = item.discountValue && item.discountValue > 0;
            const itemPrice = item.sellingPrice;
            const discountedPrice = hasDiscount
              ? item.discountType === 'percent'
                ? itemPrice - (itemPrice * item.discountValue!) / 100
                : Math.max(0, itemPrice - item.discountValue!)
              : itemPrice;
            const lineTotal = discountedPrice * item.quantity;

            return (
              <div
                key={item.productId}
                className="p-2.5 rounded-xl border border-[#e6dfd5] dark:border-[#362e26] bg-[#fdfbf7] dark:bg-[#201b17] flex flex-col gap-1.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <h5 className="font-bold text-xs text-stone-900 dark:text-stone-100 line-clamp-1">
                      {item.productName}
                    </h5>
                    <div className="text-[10px] text-stone-400 font-mono">
                      {item.sku} • {item.sellingPrice.toFixed(2)} {settings.currency}/{item.unit}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-black text-xs sm:text-sm font-mono-numbers text-stone-900 dark:text-stone-100">
                      {lineTotal.toFixed(2)}
                    </div>
                    {hasDiscount && (
                      <span className="text-[10px] text-rose-500 font-mono line-through">
                        {(itemPrice * item.quantity).toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Bottom Row: Quantity Controls & Item Discount */}
                <div className="flex items-center justify-between pt-1 border-t border-stone-200/60 dark:border-stone-800">
                  {/* Quantity Stepper */}
                  <div className="flex items-center gap-1 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg p-0.5">
                    <button
                      onClick={() => updateItemQty(item.productId, -1)}
                      className="p-1 hover:bg-stone-100 dark:hover:bg-stone-800 rounded text-stone-600 dark:text-stone-300"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-7 text-center font-bold text-xs font-mono">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateItemQty(item.productId, 1)}
                      className="p-1 hover:bg-stone-100 dark:hover:bg-stone-800 rounded text-stone-600 dark:text-stone-300"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() =>
                        setEditingItemDiscount({
                          productId: item.productId,
                          type: item.discountType || 'percent',
                          val: item.discountValue || 0,
                        })
                      }
                      className="text-[10px] px-1.5 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 hover:bg-stone-200 flex items-center gap-0.5"
                    >
                      <Percent className="w-2.5 h-2.5" />
                      <span>{hasDiscount ? `${item.discountValue}${item.discountType === 'percent' ? '%' : 'ETB'}` : 'Discount'}</span>
                    </button>
                    <button
                      onClick={() => removeItem(item.productId)}
                      className="p-1 text-stone-400 hover:text-rose-600 rounded transition"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {cart.length === 0 && (
            <div className="h-48 flex flex-col items-center justify-center text-stone-400 p-4 text-center">
              <QrCode className="w-10 h-10 mb-2 text-[#064e3b] dark:text-[#6ee7b7] opacity-60" />
              <p className="text-xs font-bold text-stone-700 dark:text-stone-300">Your register cart is empty</p>
              <p className="text-[11px] mt-0.5 text-stone-500">Scan product barcodes / QR codes or click catalog items</p>
              <button
                onClick={() => setIsCameraScannerOpen(true)}
                className="mt-3.5 px-4 py-2 bg-[#064e3b] hover:bg-[#043b2c] text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow-sm transition cursor-pointer"
              >
                <QrCode className="w-4 h-4 text-[#6ee7b7]" />
                <span>Open Scanner to Sell (F3)</span>
              </button>
            </div>
          )}
        </div>

        {/* Cart Totals & Actions Footer */}
        <div className="p-3 bg-[#fdfbf7] dark:bg-[#171412] border-t border-[#e6dfd5] dark:border-[#362e26] space-y-2">
          {/* Subtotal & Discounts */}
          <div className="space-y-1 text-xs">
            <div className="flex justify-between text-stone-500 dark:text-stone-400">
              <span>Subtotal</span>
              <span className="font-mono-numbers">{cartSubtotal.toFixed(2)} {settings.currency}</span>
            </div>

            {/* Cart Discount row */}
            <div className="flex items-center justify-between text-rose-600 dark:text-rose-400">
              <button
                onClick={() => setIsDiscountModalOpen(true)}
                className="hover:underline flex items-center gap-1 text-[11px]"
              >
                <Tag className="w-3 h-3" />
                <span>
                  Cart Discount{' '}
                  {cartDiscountValue > 0 ? `(${cartDiscountValue}${cartDiscountType === 'percent' ? '%' : 'ETB'})` : ''}
                </span>
              </button>
              <span className="font-mono-numbers font-medium">
                -{cartDiscountAmount.toFixed(2)} {settings.currency}
              </span>
            </div>

            {settings.taxRatePercent > 0 && (
              <div className="flex justify-between text-stone-500 dark:text-stone-400">
                <span>Tax ({settings.taxRatePercent}%)</span>
                <span className="font-mono-numbers">{taxAmount.toFixed(2)} {settings.currency}</span>
              </div>
            )}

            <div className="pt-1.5 border-t border-[#e6dfd5] dark:border-[#362e26] flex items-baseline justify-between">
              <span className="font-extrabold text-sm text-stone-900 dark:text-stone-100">
                GRAND TOTAL
              </span>
              <div className="text-right">
                <span className="font-black text-xl sm:text-2xl font-mono-numbers text-[#064e3b] dark:text-[#6ee7b7]">
                  {grandTotal.toFixed(2)}
                </span>
                <span className="text-xs text-stone-500 ml-1">{settings.currency}</span>
              </div>
            </div>
          </div>

          {/* Action Buttons: Scan to Sell, Hold Order & Checkout */}
          <div className="grid grid-cols-1 gap-2 pt-1">
            {/* Primary High-Speed "Scan to Sell" Action Bar */}
            <button
              onClick={() => setIsCameraScannerOpen(true)}
              className="w-full py-2.5 px-3 bg-[#064e3b] hover:bg-[#043b2c] text-white font-extrabold text-xs sm:text-sm rounded-xl flex items-center justify-center gap-2 shadow-sm transition cursor-pointer border border-emerald-500/40"
              title="Open Camera Viewfinder to Scan Barcodes and QR Codes to Sell (F3)"
            >
              <QrCode className="w-4 h-4 text-[#6ee7b7]" />
              <span>SCAN BARCODE / QR TO SELL (F3)</span>
            </button>

            <div className="grid grid-cols-3 gap-2">
              {/* Hold Order Button (F4) */}
              <button
                onClick={() => {
                  if (cart.length > 0) setIsHoldInputOpen(true);
                }}
                disabled={cart.length === 0}
                className="py-2.5 px-2 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 disabled:opacity-40 text-stone-700 dark:text-stone-300 font-bold text-xs rounded-xl flex items-center justify-center gap-1 transition cursor-pointer"
                title="Park Cart (F4)"
              >
                <BookmarkPlus className="w-4 h-4" />
                <span>Hold (F4)</span>
              </button>

              {/* Pay / Checkout Button (F8 / F9) */}
              <button
                onClick={openCheckout}
                disabled={cart.length === 0}
                className="col-span-2 py-2.5 px-4 bg-[#064e3b] hover:bg-[#043b2c] disabled:opacity-40 text-white font-extrabold text-sm rounded-xl flex items-center justify-center gap-2 shadow-md transition cursor-pointer"
              >
                <CreditCard className="w-4 h-4" />
                <span>PAY &amp; CHECKOUT (F8)</span>
              </button>
            </div>

            {/* Direct 1-Click "Record Sale (No Print)" Button */}
            <button
              onClick={() => handleQuickRecordSale('cash')}
              disabled={cart.length === 0}
              className="w-full py-2 px-3 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900 border border-emerald-300 dark:border-emerald-800 disabled:opacity-40 text-emerald-900 dark:text-emerald-300 font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 transition cursor-pointer"
              title="Record sale in ledger immediately without printing any receipt"
            >
              <FileText className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
              <span>JUST RECORD SALE (NO PRINT)</span>
            </button>
          </div>
        </div>
      </div>

      {/* ================= MODAL: HOLD CART INPUT ================= */}
      {isHoldInputOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-5 shadow-2xl">
            <h3 className="font-bold text-sm mb-2 text-stone-900 dark:text-stone-100">
              Hold / Park Current Cart
            </h3>
            <p className="text-xs text-stone-500 mb-3">
              Give this cart a label or customer name to easily resume it later.
            </p>
            <input
              type="text"
              value={holdLabel}
              onChange={(e) => setHoldLabel(e.target.value)}
              placeholder="e.g. Architect with blue folder..."
              className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-2.5 text-xs text-stone-900 dark:text-stone-100 mb-4 focus:outline-hidden focus:border-emerald-600"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsHoldInputOpen(false)}
                className="px-3 py-1.5 text-xs text-stone-600 dark:text-stone-400"
              >
                Cancel
              </button>
              <button
                onClick={handleParkCart}
                className="px-4 py-1.5 bg-[#064e3b] text-white rounded-lg text-xs font-bold"
              >
                Park Cart
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: HELD ORDERS LIST ================= */}
      {isHeldOrdersModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100 dark:border-stone-800 mb-3">
              <h3 className="font-bold text-sm text-stone-900 dark:text-stone-100">
                Parked &amp; Held Carts ({heldOrders.length})
              </h3>
              <button
                onClick={() => setIsHeldOrdersModalOpen(false)}
                className="p-1 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 max-h-80 overflow-y-auto">
              {heldOrders.map((order) => {
                const total = order.items.reduce(
                  (sum, item) => sum + item.sellingPrice * item.quantity,
                  0
                );
                return (
                  <div
                    key={order.id}
                    className="p-3 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-800/40 flex items-center justify-between"
                  >
                    <div>
                      <h4 className="font-bold text-xs text-stone-900 dark:text-stone-100">
                        {order.label}
                      </h4>
                      <div className="text-[10px] text-stone-500 font-mono mt-0.5">
                        {order.items.length} items • {total.toFixed(2)} {settings.currency} • Held by {order.savedBy}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => {
                          storage.deleteHeldOrder(order.id);
                          onRefreshData();
                        }}
                        className="p-1.5 text-stone-400 hover:text-rose-600 rounded-lg transition"
                        title="Delete Held Cart"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleResumeCart(order)}
                        className="px-3 py-1.5 bg-[#064e3b] text-white text-xs font-bold rounded-lg hover:bg-[#043b2c] transition"
                      >
                        Resume Cart
                      </button>
                    </div>
                  </div>
                );
              })}

              {heldOrders.length === 0 && (
                <p className="text-center text-xs text-stone-400 py-6">
                  No parked carts at the moment.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: CUSTOMER SELECTOR ================= */}
      {isCustomerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100 dark:border-stone-800 mb-3">
              <h3 className="font-bold text-sm text-stone-900 dark:text-stone-100">
                Select Customer Account
              </h3>
              <button
                onClick={() => setIsCustomerModalOpen(false)}
                className="p-1 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 max-h-80 overflow-y-auto">
              <button
                onClick={() => {
                  setSelectedCustomer(null);
                  setIsCustomerModalOpen(false);
                }}
                className="w-full p-2.5 rounded-xl border border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800 text-left text-xs font-semibold"
              >
                Walk-in Customer (No Credit Account)
              </button>

              {storage.getCustomers().map((c) => (
                <div
                  key={c.id}
                  onClick={() => {
                    setSelectedCustomer(c);
                    setIsCustomerModalOpen(false);
                  }}
                  className={`p-3 rounded-xl border cursor-pointer transition text-left ${
                    selectedCustomer?.id === c.id
                      ? 'border-[#064e3b] bg-emerald-50 dark:bg-emerald-950/40'
                      : 'border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-bold text-xs text-stone-900 dark:text-stone-100">
                        {c.name}
                      </h4>
                      <p className="text-[11px] text-stone-500">{c.phone}</p>
                    </div>
                    <div className="text-right text-[11px] font-mono">
                      <div>
                        Owes: <span className="font-bold text-amber-600">{c.currentBalance} {settings.currency}</span>
                      </div>
                      <div className="text-stone-400">Limit: {c.creditLimit} {settings.currency}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: CART DISCOUNT ================= */}
      {isDiscountModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-5 shadow-2xl">
            <h3 className="font-bold text-sm mb-3 text-stone-900 dark:text-stone-100">
              Apply Cart Discount
            </h3>

            <div className="flex gap-2 mb-3">
              <button
                type="button"
                onClick={() => setCartDiscountType('percent')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition ${
                  cartDiscountType === 'percent'
                    ? 'bg-[#064e3b] text-white'
                    : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300'
                }`}
              >
                Percentage (%)
              </button>
              <button
                type="button"
                onClick={() => setCartDiscountType('fixed')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition ${
                  cartDiscountType === 'fixed'
                    ? 'bg-[#064e3b] text-white'
                    : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300'
                }`}
              >
                Fixed Amount ({settings.currency})
              </button>
            </div>

            <input
              type="number"
              min="0"
              value={cartDiscountValue || ''}
              onChange={(e) => setCartDiscountValue(Math.max(0, parseFloat(e.target.value) || 0))}
              placeholder="Enter discount value..."
              className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-2.5 text-xs text-stone-900 dark:text-stone-100 mb-4 focus:outline-hidden focus:border-emerald-600"
              autoFocus
            />

            <div className="flex justify-between items-center">
              <button
                onClick={() => {
                  setCartDiscountValue(0);
                  setIsDiscountModalOpen(false);
                }}
                className="text-xs text-rose-500 font-semibold"
              >
                Remove Discount
              </button>
              <button
                onClick={() => setIsDiscountModalOpen(false)}
                className="px-4 py-1.5 bg-[#064e3b] text-white rounded-lg text-xs font-bold"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: ITEM DISCOUNT ================= */}
      {editingItemDiscount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-5 shadow-2xl">
            <h3 className="font-bold text-sm mb-3 text-stone-900 dark:text-stone-100">
              Apply Item Discount
            </h3>

            <div className="flex gap-2 mb-3">
              <button
                type="button"
                onClick={() =>
                  setEditingItemDiscount((prev) => (prev ? {...prev, type: 'percent'} : null))
                }
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold ${
                  editingItemDiscount.type === 'percent'
                    ? 'bg-[#064e3b] text-white'
                    : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300'
                }`}
              >
                Percentage (%)
              </button>
              <button
                type="button"
                onClick={() =>
                  setEditingItemDiscount((prev) => (prev ? {...prev, type: 'fixed'} : null))
                }
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold ${
                  editingItemDiscount.type === 'fixed'
                    ? 'bg-[#064e3b] text-white'
                    : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300'
                }`}
              >
                Fixed ({settings.currency})
              </button>
            </div>

            <input
              type="number"
              min="0"
              value={editingItemDiscount.val || ''}
              onChange={(e) =>
                setEditingItemDiscount((prev) =>
                  prev ? {...prev, val: Math.max(0, parseFloat(e.target.value) || 0)} : null
                )
              }
              placeholder="Enter discount..."
              className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-2.5 text-xs text-stone-900 dark:text-stone-100 mb-4 focus:outline-hidden focus:border-emerald-600"
              autoFocus
            />

            <div className="flex justify-between items-center">
              <button
                onClick={() => {
                  setCart((prev) =>
                    prev.map((i) =>
                      i.productId === editingItemDiscount.productId
                        ? {...i, discountValue: 0}
                        : i
                    )
                  );
                  setEditingItemDiscount(null);
                }}
                className="text-xs text-rose-500 font-semibold"
              >
                Clear
              </button>
              <button
                onClick={() => {
                  setCart((prev) =>
                    prev.map((i) =>
                      i.productId === editingItemDiscount.productId
                        ? {
                            ...i,
                            discountType: editingItemDiscount.type,
                            discountValue: editingItemDiscount.val,
                          }
                        : i
                    )
                  );
                  setEditingItemDiscount(null);
                }}
                className="px-4 py-1.5 bg-[#064e3b] text-white rounded-lg text-xs font-bold"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: SPLIT PAYMENT & CHECKOUT ================= */}
      {isCheckoutOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl shadow-2xl p-5 text-stone-900 dark:text-stone-100 flex flex-col max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100 dark:border-stone-800 mb-3">
              <div>
                <h3 className="font-extrabold text-base text-[#064e3b] dark:text-[#6ee7b7]">
                  Checkout &amp; Payment
                </h3>
                <p className="text-xs text-stone-500">
                  Total Due:{' '}
                  <span className="font-black font-mono text-stone-900 dark:text-stone-100 text-sm">
                    {grandTotal.toFixed(2)} {settings.currency}
                  </span>
                </p>
              </div>
              <button
                onClick={() => setIsCheckoutOpen(false)}
                className="p-1 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Split Payment Methods Form */}
            <div className="space-y-3.5 my-2">
              {/* Cash Section */}
              <div className="p-3 rounded-xl bg-stone-50 dark:bg-stone-800/50 border border-stone-200 dark:border-stone-800">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold flex items-center gap-1.5">
                    <DollarSign className="w-4 h-4 text-emerald-600" />
                    Cash Payment
                  </label>
                  <div className="flex gap-1">
                    {[100, 200, 500, 1000].map((quickCash) => (
                      <button
                        key={quickCash}
                        type="button"
                        onClick={() => setCashAmount(quickCash)}
                        className="px-2 py-0.5 rounded bg-white dark:bg-stone-700 text-[10px] font-mono font-bold border border-stone-200 dark:border-stone-600 hover:bg-stone-100"
                      >
                        +{quickCash}
                      </button>
                    ))}
                  </div>
                </div>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={cashAmount || ''}
                  onChange={(e) => setCashAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                  placeholder="0.00"
                  className="w-full bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-lg p-2 text-sm font-mono font-bold text-stone-900 dark:text-stone-100 focus:outline-hidden focus:border-emerald-600"
                />
              </div>

              {/* Mobile Transfer Section (Telebirr / CBE Birr) */}
              <div className="p-3 rounded-xl bg-stone-50 dark:bg-stone-800/50 border border-stone-200 dark:border-stone-800">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold flex items-center gap-1.5">
                    <Smartphone className="w-4 h-4 text-blue-600" />
                    Mobile Transfer (Telebirr / CBE Birr / M-Pesa)
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileAmount(Math.max(0, grandTotal - cashAmount - cardAmount - creditAmount));
                    }}
                    className="text-[10px] text-blue-600 dark:text-blue-400 font-bold hover:underline"
                  >
                    Exact Remaining
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={mobileAmount || ''}
                    onChange={(e) => setMobileAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                    placeholder="Amount"
                    className="w-full bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-lg p-2 text-sm font-mono font-bold text-stone-900 dark:text-stone-100 focus:outline-hidden focus:border-emerald-600"
                  />
                  <input
                    type="text"
                    value={mobileRef}
                    onChange={(e) => setMobileRef(e.target.value)}
                    placeholder="Ref / Tx ID (Optional)"
                    className="w-full bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-lg p-2 text-xs text-stone-900 dark:text-stone-100 focus:outline-hidden focus:border-emerald-600 font-mono"
                  />
                </div>
              </div>

              {/* Card Section */}
              <div className="p-3 rounded-xl bg-stone-50 dark:bg-stone-800/50 border border-stone-200 dark:border-stone-800">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold flex items-center gap-1.5">
                    <CreditCard className="w-4 h-4 text-indigo-600" />
                    Bank Card / POS Terminal
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setCardAmount(Math.max(0, grandTotal - cashAmount - mobileAmount - creditAmount));
                    }}
                    className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold hover:underline"
                  >
                    Exact Remaining
                  </button>
                </div>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={cardAmount || ''}
                  onChange={(e) => setCardAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                  placeholder="0.00"
                  className="w-full bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-lg p-2 text-sm font-mono font-bold text-stone-900 dark:text-stone-100 focus:outline-hidden focus:border-emerald-600"
                />
              </div>

              {/* Store Credit Section */}
              <div className="p-3 rounded-xl bg-stone-50 dark:bg-stone-800/50 border border-stone-200 dark:border-stone-800">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold flex items-center gap-1.5">
                    <BookmarkCheck className="w-4 h-4 text-amber-600" />
                    Store Credit {selectedCustomer ? `(${selectedCustomer.name})` : '(Requires Customer)'}
                  </label>
                  {selectedCustomer && (
                    <button
                      type="button"
                      onClick={() => {
                        const maxCredit = Math.max(0, selectedCustomer.creditLimit - selectedCustomer.currentBalance);
                        const need = Math.max(0, grandTotal - cashAmount - cardAmount - mobileAmount);
                        setCreditAmount(Math.min(need, maxCredit));
                      }}
                      className="text-[10px] text-amber-600 dark:text-amber-400 font-bold hover:underline"
                    >
                      Use Credit
                    </button>
                  )}
                </div>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  disabled={!selectedCustomer}
                  value={creditAmount || ''}
                  onChange={(e) => setCreditAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                  placeholder={selectedCustomer ? '0.00' : 'Select a customer first'}
                  className="w-full bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 disabled:opacity-50 rounded-lg p-2 text-sm font-mono font-bold text-stone-900 dark:text-stone-100 focus:outline-hidden focus:border-emerald-600"
                />
              </div>
            </div>

            {/* Calculations Breakdown */}
            <div className="p-3 bg-stone-100 dark:bg-stone-800 rounded-xl space-y-1 text-xs font-medium">
              <div className="flex justify-between">
                <span>Total Paid:</span>
                <span className="font-mono-numbers font-bold">
                  {totalEnteredPayment.toFixed(2)} {settings.currency}
                </span>
              </div>
              {remainingAmount > 0 && (
                <div className="flex justify-between text-rose-600 font-bold">
                  <span>Still Due:</span>
                  <span className="font-mono-numbers">
                    {remainingAmount.toFixed(2)} {settings.currency}
                  </span>
                </div>
              )}
              {changeGiven > 0 && (
                <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-bold">
                  <span>Change to Customer:</span>
                  <span className="font-mono-numbers">
                    {changeGiven.toFixed(2)} {settings.currency}
                  </span>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="mt-4 pt-3 border-t border-stone-100 dark:border-stone-800 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setIsCheckoutOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-stone-600 dark:text-stone-300 hover:text-stone-900"
              >
                Back
              </button>

              <div className="flex items-center gap-2">
                {/* Explicit Just Record (No Receipt) option */}
                <button
                  type="button"
                  onClick={() => {
                    // Temporarily force record_only for this transaction
                    const origMode = settings.receiptMode;
                    settings.receiptMode = 'record_only';
                    handleCompleteCheckout();
                    settings.receiptMode = origMode;
                  }}
                  disabled={totalEnteredPayment < grandTotal - 0.01}
                  className="px-4 py-2.5 bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-950 dark:hover:bg-emerald-900 text-emerald-900 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-800 disabled:opacity-40 font-bold text-xs rounded-xl flex items-center gap-1.5 transition cursor-pointer"
                  title="Record sale in ledger without showing print receipt screen"
                >
                  <FileText className="w-4 h-4" />
                  <span>Record Only (No Receipt)</span>
                </button>

                {/* Complete Sale according to store settings */}
                <button
                  type="button"
                  onClick={handleCompleteCheckout}
                  disabled={totalEnteredPayment < grandTotal - 0.01}
                  className="px-5 py-2.5 bg-[#064e3b] hover:bg-[#043b2c] disabled:opacity-40 text-white font-extrabold text-xs sm:text-sm rounded-xl flex items-center gap-1.5 shadow-md transition cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>Complete Sale</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: SALE COMPLETED & THERMAL RECEIPT ================= */}
      {isCompletedModalOpen && lastCompletedSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl shadow-2xl p-5 text-stone-900 dark:text-stone-100 flex flex-col">
            <div className="text-center mb-3">
              <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-2">
                <Check className="w-6 h-6 stroke-[3]" />
              </div>
              <h3 className="font-black text-lg text-emerald-800 dark:text-emerald-300">
                Sale Completed!
              </h3>
              <p className="text-xs text-stone-500 font-mono">
                Receipt #{lastCompletedSale.receiptNumber}
              </p>
            </div>

            {/* Thermal Receipt Preview Area */}
            <div
              id="thermal-receipt-area"
              className="bg-white text-black p-3 rounded-lg border border-stone-200 shadow-inner font-mono text-[11px] leading-tight max-h-72 overflow-y-auto mb-4"
            >
              <div className="text-center pb-2 border-b border-dashed border-stone-400 mb-2">
                <div className="font-extrabold text-sm">{settings.storeName}</div>
                <div className="text-[10px]">{settings.tagline}</div>
                <div className="text-[9px] mt-0.5">{settings.address}</div>
                <div className="text-[9px]">{settings.phone}</div>
                {settings.taxNumber && <div className="text-[9px]">TIN: {settings.taxNumber}</div>}
              </div>

              <div className="text-[10px] mb-2">
                <div>Receipt: {lastCompletedSale.receiptNumber}</div>
                <div>Cashier: {lastCompletedSale.cashierName}</div>
                <div>Date: {new Date(lastCompletedSale.date).toLocaleString()}</div>
                {lastCompletedSale.customerName && <div>Customer: {lastCompletedSale.customerName}</div>}
              </div>

              <div className="border-b border-dashed border-stone-400 pb-1 mb-2">
                {lastCompletedSale.items.map((i) => (
                  <div key={i.productId} className="flex justify-between py-0.5">
                    <span className="truncate max-w-[140px]">{i.quantity}x {i.productName}</span>
                    <span className="font-bold">{(i.quantity * i.sellingPrice).toFixed(2)}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-0.5 text-right font-bold text-xs pb-2 border-b border-dashed border-stone-400">
                <div>TOTAL: {lastCompletedSale.grandTotal.toFixed(2)} {settings.currency}</div>
                {lastCompletedSale.changeGiven > 0 && (
                  <div className="text-[10px] text-stone-600">Change: {lastCompletedSale.changeGiven.toFixed(2)} {settings.currency}</div>
                )}
              </div>

              <div className="text-center pt-2">
                {/* Barcode/QR on receipt */}
                <BarcodeRenderer
                  code={lastCompletedSale.receiptNumber}
                  type="both"
                  format="CODE128"
                  height={25}
                  width={1.2}
                />
                <div className="text-[9px] mt-1 text-stone-500">{settings.receiptFooterMessage}</div>
              </div>
            </div>

            {/* Receipt Actions */}
            <div className="grid grid-cols-2 gap-2 mb-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="py-2 px-3 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition"
              >
                <Printer className="w-4 h-4" />
                <span>Thermal Print</span>
              </button>

              <button
                type="button"
                onClick={() => ExportService.generatePDFReceipt(lastCompletedSale, settings)}
                className="py-2 px-3 bg-[#064e3b] hover:bg-[#043b2c] text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition shadow-xs"
              >
                <FileDown className="w-4 h-4" />
                <span>Download PDF</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setIsCompletedModalOpen(false);
                setLastCompletedSale(null);
              }}
              className="w-full py-2 bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 text-xs font-bold rounded-xl transition"
            >
              Start Next Sale (ESC)
            </button>

            {/* Quick Tip for Record-Only Setting */}
            <div className="mt-2 text-center">
              <button
                type="button"
                onClick={() => {
                  const updated = {...settings, receiptMode: 'record_only' as const};
                  storage.saveSettings(updated);
                  onRefreshData();
                  setIsCompletedModalOpen(false);
                  setLastCompletedSale(null);
                }}
                className="text-[10px] text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 underline"
                title="Switch default setting so subsequent sales record quietly without this popup"
              >
                Always record without printing this receipt? Set as default
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MOBILE FLOATING SCANNER BUTTON ================= */}
      <button
        onClick={() => setIsCameraScannerOpen(true)}
        className="fixed bottom-20 right-4 z-40 lg:hidden p-3.5 bg-[#064e3b] hover:bg-[#043b2c] text-white rounded-full shadow-2xl border-2 border-[#6ee7b7] flex items-center justify-center cursor-pointer transition active:scale-95"
        title="Scan Barcode or QR Code to Sell"
      >
        <QrCode className="w-6 h-6 text-[#6ee7b7]" />
      </button>

      {/* ================= CAMERA SCANNER MODAL (F3) ================= */}
      <CameraScannerModal
        isOpen={isCameraScannerOpen}
        onClose={() => setIsCameraScannerOpen(false)}
        onScanSuccess={handleBarcodeScanned}
        title="QR Code & Barcode Scanner to Sell"
        subtitle="Aim camera at product barcode or QR code"
        cartItemCount={cart.reduce((s, i) => s + i.quantity, 0)}
        cartTotal={grandTotal}
        currency={settings.currency}
      />

      {/* ================= INDIVIDUAL BARCODE & QR CODE VIEW MODAL ================= */}
      <IndividualCodeViewModal
        isOpen={isIndividualCodeOpen}
        onClose={() => setIsIndividualCodeOpen(false)}
        product={inspectCodeProduct}
        settings={settings}
        onRefreshData={onRefreshData}
      />
    </div>
  );
};
