import React from 'react';
import {
  Minus,
  Plus,
  Trash2,
  Tag,
  User,
  MoreVertical,
  ShoppingBag,
  ArrowRight,
  FileText,
  BookmarkPlus,
  Percent,
} from 'lucide-react';
import { CartItem, Customer } from '../../types/pos';

interface CartOrderProps {
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
  isTabletOrDesktopView?: boolean;
}

export const CartOrder: React.FC<CartOrderProps> = ({
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
  isTabletOrDesktopView = false,
}) => {
  const totalItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white border-l border-[#e6dfd5] overflow-hidden">
      {/* 1. Cart Header Bar */}
      <div className="p-3 bg-[#fdfbf7] border-b border-[#e6dfd5] shrink-0 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-lg bg-emerald-100 text-[#064e3b] flex items-center justify-center font-bold text-xs"
            aria-hidden="true"
          >
            <ShoppingBag className="w-4 h-4" />
          </div>
          <div>
            <h2 className="font-extrabold text-xs sm:text-sm text-stone-900 leading-tight">
              Current Order
            </h2>
            <p className="text-[10px] text-stone-500 font-mono">
              {totalItemCount} {totalItemCount === 1 ? 'item' : 'items'} in cart
            </p>
          </div>
        </div>

        {/* Secondary Actions Trigger Button (Minimum 44x44px touch target) */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onOpenActionsMenu}
            aria-label="Open order actions menu (discount, customer, hold, notes)"
            className="min-h-[44px] min-w-[44px] px-2.5 py-1.5 rounded-xl bg-white hover:bg-stone-100 border border-stone-200 text-stone-700 text-xs font-bold flex items-center gap-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#064e3b] transition"
            title="Secondary Order Actions"
          >
            <MoreVertical className="w-4 h-4 text-stone-500" aria-hidden="true" />
            <span className="hidden sm:inline">Actions</span>
          </button>

          {cart.length > 0 && (
            <button
              type="button"
              onClick={onClearCart}
              aria-label="Clear all items in cart"
              className="min-h-[44px] min-w-[44px] p-2 rounded-xl text-stone-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition flex items-center justify-center"
              title="Clear cart"
            >
              <Trash2 className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* 2. Customer & Notes Badge Banner (if assigned) */}
      {(selectedCustomer || orderNotes || cartDiscount > 0) && (
        <div className="px-3 py-1.5 bg-emerald-50/70 border-b border-emerald-200 text-xs text-stone-700 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            {selectedCustomer && (
              <span className="inline-flex items-center gap-1 font-bold text-[#064e3b]">
                <User className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{selectedCustomer.name}</span>
              </span>
            )}

            {cartDiscount > 0 && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-rose-100 text-rose-800 font-mono font-bold text-[10px]">
                <Percent className="w-3 h-3" aria-hidden="true" />
                <span>-{cartDiscount.toFixed(2)} {currency}</span>
              </span>
            )}
          </div>

          {orderNotes && (
            <span className="text-[11px] text-stone-500 italic max-w-[160px] truncate">
              {orderNotes}
            </span>
          )}
        </div>
      )}

      {/* 3. Cart Item List with Stepper Buttons (Min 44x44px touch targets, >=8px gap) */}
      <div
        role="region"
        aria-label="Items in current order"
        className="flex-1 min-h-0 overflow-y-auto touch-scroll overscroll-contain p-3 space-y-2"
      >
        {cart.length === 0 ? (
          <div className="h-44 flex flex-col items-center justify-center text-center p-4 text-stone-400">
            <ShoppingBag className="w-10 h-10 mb-2 opacity-40 text-stone-500" aria-hidden="true" />
            <p className="text-xs font-bold text-stone-700">Your cart is empty</p>
            <p className="text-[11px] text-stone-400 mt-0.5">
              Tap items from the catalog or scan barcodes to begin sale.
            </p>
          </div>
        ) : (
          cart.map((item) => {
            const lineTotal = item.product.price * item.quantity;
            return (
              <div
                key={item.product.id}
                className="p-3 rounded-2xl border border-[#e6dfd5] bg-[#fdfbf7] flex flex-col gap-2"
              >
                {/* Item Info Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <h4 className="font-bold text-xs sm:text-sm text-stone-900 line-clamp-1">
                      {item.product.name}
                    </h4>
                    <p className="text-[10px] text-stone-400 font-mono">
                      {item.product.sku} • {item.product.price.toFixed(2)} {currency}/{item.product.unit}
                    </p>
                  </div>

                  <div className="text-right">
                    <div className="font-extrabold text-sm font-mono text-stone-900">
                      {lineTotal.toFixed(2)}
                    </div>
                    <div className="text-[10px] text-stone-400 font-medium">
                      {currency}
                    </div>
                  </div>
                </div>

                {/* Bottom Row: Stepper Controls (Min 44x44px with >=8px gap) & Remove */}
                <div className="flex items-center justify-between pt-1 border-t border-stone-200">
                  <div className="flex items-center gap-2">
                    {/* Stepper container with >=44px touch targets */}
                    <div className="flex items-center bg-white border border-stone-300 rounded-xl p-0.5 shadow-2xs">
                      <button
                        type="button"
                        onClick={() => onUpdateQuantity(item.product.id, -1)}
                        aria-label={`Decrease quantity of ${item.product.name}`}
                        className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-stone-100 active:bg-stone-200 text-stone-700 transition"
                      >
                        <Minus className="w-4 h-4 stroke-[2.5]" aria-hidden="true" />
                      </button>

                      <span
                        className="w-9 text-center font-black text-xs font-mono text-stone-900"
                        aria-label={`Quantity: ${item.quantity}`}
                      >
                        {item.quantity}
                      </span>

                      <button
                        type="button"
                        onClick={() => onUpdateQuantity(item.product.id, 1)}
                        aria-label={`Increase quantity of ${item.product.name}`}
                        className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-stone-100 active:bg-stone-200 text-stone-700 transition"
                      >
                        <Plus className="w-4 h-4 stroke-[2.5]" aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onRemoveItem(item.product.id)}
                    aria-label={`Remove ${item.product.name} from cart`}
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center text-stone-400 hover:text-rose-600 rounded-xl hover:bg-rose-50 transition"
                    title="Remove item"
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 4. Cart Financial Summary & Primary Charge Button */}
      <div className="p-3 bg-[#fdfbf7] border-t border-[#e6dfd5] shrink-0 space-y-2 mt-auto">
        <div className="space-y-1 text-xs">
          <div className="flex justify-between items-center text-stone-500">
            <span>Subtotal</span>
            <span className="font-mono">{subtotal.toFixed(2)} {currency}</span>
          </div>

          {cartDiscount > 0 && (
            <div className="flex justify-between items-center text-rose-600 font-semibold">
              <span>Order Discount</span>
              <span className="font-mono">-{cartDiscount.toFixed(2)} {currency}</span>
            </div>
          )}

          <div className="flex justify-between items-center text-stone-500 text-[11px]">
            <span>Tax (15% VAT)</span>
            <span className="font-mono">{taxAmount.toFixed(2)} {currency}</span>
          </div>

          <div className="pt-2 border-t border-[#e6dfd5] flex items-baseline justify-between">
            <span className="font-extrabold text-sm text-stone-900 uppercase tracking-tight">
              Total Due
            </span>
            <div className="text-right">
              <span className="font-black text-xl sm:text-2xl font-mono text-[#064e3b]">
                {grandTotal.toFixed(2)}
              </span>
              <span className="text-xs font-bold text-stone-500 ml-1">{currency}</span>
            </div>
          </div>
        </div>

        {/* Primary Action Button (Charge/Pay) on Desktop & Tablet:
            Min 44x44px touch target, full-width thumb reachable
        */}
        {isTabletOrDesktopView && (
          <button
            type="button"
            onClick={onProceedToPayment}
            disabled={cart.length === 0}
            aria-label={`Charge ${grandTotal.toFixed(2)} ${currency} (F8)`}
            className="w-full min-h-[48px] py-3 px-4 bg-[#064e3b] hover:bg-[#043b2c] active:scale-[0.99] disabled:opacity-40 text-white font-extrabold text-sm rounded-2xl shadow-sm flex items-center justify-center gap-2 cursor-pointer transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#064e3b]"
          >
            <span>Charge</span>
            <span className="font-mono font-bold">
              {grandTotal.toFixed(2)} {currency}
            </span>
            <ArrowRight className="w-4 h-4 ml-1" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
};
