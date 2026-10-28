import React, { useState } from 'react';
import {
  ShoppingBag,
  ChevronUp,
  ChevronDown,
  ArrowRight,
  MoreVertical,
  Minus,
  Plus,
  Trash2,
  Tag,
  User,
  Percent,
} from 'lucide-react';
import { CartItem, Customer } from '../../types/pos';

interface MobileCartBottomSheetProps {
  cart: CartItem[];
  onUpdateQuantity: (productId: string, delta: number) => void;
  onRemoveItem: (productId: string) => void;
  onClearCart: () => void;
  selectedCustomer: Customer | null;
  onOpenActionsMenu: () => void;
  onProceedToPayment: () => void;
  cartDiscount: number;
  subtotal: number;
  taxAmount: number;
  grandTotal: number;
  currency: string;
  orderNotes?: string;
}

export const MobileCartBottomSheet: React.FC<MobileCartBottomSheetProps> = ({
  cart,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
  selectedCustomer,
  onOpenActionsMenu,
  onProceedToPayment,
  cartDiscount,
  subtotal,
  taxAmount,
  grandTotal,
  currency,
  orderNotes,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const totalItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <>
      {/* Dimmed backdrop when bottom sheet is expanded */}
      {isExpanded && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs md:hidden animate-in fade-in"
          onClick={() => setIsExpanded(false)}
          aria-hidden="true"
        />
      )}

      {/* Slide-up Container / Sticky Bottom Bar */}
      <div
        role="region"
        aria-label="Mobile Shopping Cart"
        className={`fixed left-0 right-0 bottom-0 z-40 md:hidden bg-white border-t border-[#e6dfd5] shadow-2xl safe-area-bottom transition-all duration-300 flex flex-col ${
          isExpanded ? 'max-h-[85vh] rounded-t-3xl' : 'max-h-[82px]'
        }`}
      >
        {/* Grab Handle & Expand Toggle Button */}
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          aria-label={
            isExpanded
              ? 'Collapse cart items bottom sheet'
              : `Expand cart details with ${totalItemCount} items. Total: ${grandTotal.toFixed(2)} ${currency}`
          }
          className="w-full pt-2 pb-1 flex items-center justify-center shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#064e3b]"
        >
          <div className="w-12 h-1 rounded-full bg-stone-300" aria-hidden="true" />
        </button>

        {/* --- EXPANDED VIEW: Itemized Cart Details --- */}
        {isExpanded && (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {/* Header with Title and Secondary Actions Trigger */}
            <div className="px-4 py-2 border-b border-[#e6dfd5] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-[#064e3b] flex items-center justify-center font-bold text-xs">
                  <ShoppingBag className="w-4 h-4" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-stone-900 leading-tight">
                    Order Details ({totalItemCount})
                  </h3>
                  {selectedCustomer && (
                    <p className="text-[10px] text-stone-500">
                      Customer: <span className="font-bold text-[#064e3b]">{selectedCustomer.name}</span>
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={onOpenActionsMenu}
                  aria-label="Open secondary actions (customer, discount, notes, hold order)"
                  className="min-h-[44px] min-w-[44px] px-2.5 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold flex items-center gap-1"
                >
                  <MoreVertical className="w-4 h-4" aria-hidden="true" />
                  <span>Actions</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsExpanded(false)}
                  aria-label="Collapse cart sheet"
                  className="min-h-[44px] min-w-[44px] p-2 text-stone-400 hover:text-stone-700 flex items-center justify-center"
                >
                  <ChevronDown className="w-5 h-5" aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* Scrollable Items List */}
            <div className="flex-1 min-h-0 overflow-y-auto touch-scroll overscroll-contain p-3 space-y-2">
              {cart.length === 0 ? (
                <div className="py-8 text-center text-stone-400">
                  <p className="text-xs font-bold text-stone-600">Cart is empty</p>
                  <p className="text-[11px] mt-0.5">Select items to begin order.</p>
                </div>
              ) : (
                cart.map((item) => (
                  <div
                    key={item.product.id}
                    className="p-3 rounded-2xl border border-stone-200 bg-[#fdfbf7] flex items-center justify-between gap-2"
                  >
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-xs text-stone-900 truncate">
                        {item.product.name}
                      </h4>
                      <div className="text-[10px] text-stone-500 font-mono">
                        {item.product.price.toFixed(2)} {currency} × {item.quantity} ={' '}
                        <strong className="text-stone-800 font-bold">
                          {(item.product.price * item.quantity).toFixed(2)} {currency}
                        </strong>
                      </div>
                    </div>

                    {/* Stepper (Min 44x44px touch targets) */}
                    <div className="flex items-center gap-1 shrink-0 bg-white border border-stone-300 rounded-xl p-0.5 shadow-2xs">
                      <button
                        type="button"
                        onClick={() => onUpdateQuantity(item.product.id, -1)}
                        aria-label={`Decrease quantity of ${item.product.name}`}
                        className="min-h-[44px] min-w-[44px] flex items-center justify-center text-stone-700 active:bg-stone-100 rounded-lg"
                      >
                        <Minus className="w-4 h-4 stroke-[2.5]" aria-hidden="true" />
                      </button>
                      <span className="w-7 text-center font-mono font-bold text-xs text-stone-900">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => onUpdateQuantity(item.product.id, 1)}
                        aria-label={`Increase quantity of ${item.product.name}`}
                        className="min-h-[44px] min-w-[44px] flex items-center justify-center text-stone-700 active:bg-stone-100 rounded-lg"
                      >
                        <Plus className="w-4 h-4 stroke-[2.5]" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Financial Breakdown (Subtotal, Discount, Tax) */}
            <div className="px-4 py-2 border-t border-stone-200 text-xs space-y-1 bg-[#fdfbf7]">
              <div className="flex justify-between text-stone-500">
                <span>Subtotal</span>
                <span className="font-mono">{subtotal.toFixed(2)} {currency}</span>
              </div>
              {cartDiscount > 0 && (
                <div className="flex justify-between text-rose-600 font-semibold">
                  <span>Order Discount</span>
                  <span className="font-mono">-{cartDiscount.toFixed(2)} {currency}</span>
                </div>
              )}
              <div className="flex justify-between text-stone-500 text-[11px]">
                <span>Tax (15% VAT)</span>
                <span className="font-mono">{taxAmount.toFixed(2)} {currency}</span>
              </div>
            </div>
          </div>
        )}

        {/* --- STICKY FOOTER ON MOBILE: Item Count + Total + Full-Width Thumb "Charge" Button --- */}
        <div className="px-3 pb-2 pt-1 bg-white flex items-center gap-2 shrink-0">
          {/* Left: Collapsed Cart Summary Pill (Tap to expand) */}
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            aria-label={`Toggle cart overview: ${totalItemCount} items, total ${grandTotal.toFixed(2)} ${currency}`}
            className="min-h-[48px] px-3 py-1.5 rounded-2xl bg-stone-100 hover:bg-stone-200 text-stone-900 flex items-center gap-2 shrink-0 transition"
          >
            <div className="relative">
              <ShoppingBag className="w-5 h-5 text-stone-700" aria-hidden="true" />
              {totalItemCount > 0 && (
                <span className="absolute -top-1.5 -right-2 px-1.5 py-0.2 rounded-full bg-[#064e3b] text-white text-[10px] font-black min-w-[16px] text-center">
                  {totalItemCount}
                </span>
              )}
            </div>
            <div className="text-left hidden xs:block">
              <div className="text-[10px] text-stone-500 font-bold uppercase leading-none">
                Total
              </div>
              <div className="text-xs font-black font-mono tabular-kpi whitespace-nowrap text-stone-900 leading-tight">
                {grandTotal.toFixed(2)}
              </div>
            </div>
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-stone-500" aria-hidden="true" />
            ) : (
              <ChevronUp className="w-4 h-4 text-stone-500" aria-hidden="true" />
            )}
          </button>

          {/* Right: Primary Action (Charge/Pay) reachable with one thumb, full-width on mobile */}
          <button
            type="button"
            onClick={() => {
              setIsExpanded(false);
              onProceedToPayment();
            }}
            disabled={cart.length === 0}
            aria-label={`Charge ${grandTotal.toFixed(2)} ${currency}`}
            className="flex-1 min-h-[48px] py-3 px-4 bg-[#064e3b] hover:bg-[#043b2c] active:scale-[0.99] disabled:opacity-40 text-white font-extrabold text-sm sm:text-base rounded-2xl shadow-md flex items-center justify-center gap-2 cursor-pointer transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#064e3b]"
          >
            <span>Charge</span>
            <span className="font-mono font-black tabular-kpi whitespace-nowrap">
              {grandTotal.toFixed(2)} {currency}
            </span>
            <ArrowRight className="w-4 h-4 ml-0.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </>
  );
};
