import React, { useState } from 'react';
import {
  X,
  UserPlus,
  Percent,
  BookmarkPlus,
  FileText,
  Trash2,
  Check,
  User,
  ShoppingBag,
} from 'lucide-react';
import { Customer } from '../../types/pos';
import { MOCK_CUSTOMERS } from '../../data/mockData';

interface ActionsBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCustomer: Customer | null;
  onSelectCustomer: (customer: Customer | null) => void;
  cartDiscount: number;
  onApplyDiscount: (discount: number) => void;
  orderNotes: string;
  onUpdateNotes: (notes: string) => void;
  onHoldOrder: () => void;
  onClearCart: () => void;
  cartItemCount: number;
  currency: string;
}

export const ActionsBottomSheet: React.FC<ActionsBottomSheetProps> = ({
  isOpen,
  onClose,
  selectedCustomer,
  onSelectCustomer,
  cartDiscount,
  onApplyDiscount,
  orderNotes,
  onUpdateNotes,
  onHoldOrder,
  onClearCart,
  cartItemCount,
  currency,
}) => {
  const [activeTab, setActiveTab] = useState<'main' | 'customer' | 'discount' | 'notes'>('main');
  const [discountInput, setDiscountInput] = useState<string>(cartDiscount ? cartDiscount.toString() : '');
  const [tempNotes, setTempNotes] = useState<string>(orderNotes);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Order Secondary Actions Menu"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
    >
      {/* Backdrop tap to close */}
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />

      {/* Slide-up Bottom Sheet Container */}
      <div className="relative w-full max-w-lg bg-white rounded-t-3xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden safe-area-bottom animate-in slide-in-from-bottom duration-200 z-10 border-t border-[#e6dfd5]">
        {/* Grab Handle */}
        <div className="pt-3 pb-1 flex justify-center">
          <div className="w-12 h-1.5 rounded-full bg-stone-300" aria-hidden="true" />
        </div>

        {/* Sheet Header */}
        <div className="px-4 py-2 border-b border-[#e6dfd5] flex items-center justify-between">
          <div className="flex items-center gap-2">
            {activeTab !== 'main' && (
              <button
                type="button"
                onClick={() => setActiveTab('main')}
                className="text-xs font-bold text-[#064e3b] hover:underline mr-1"
              >
                ← Back
              </button>
            )}
            <h3 className="font-extrabold text-sm sm:text-base text-stone-900">
              {activeTab === 'main' && 'Order Secondary Actions'}
              {activeTab === 'customer' && 'Assign Customer'}
              {activeTab === 'discount' && 'Apply Order Discount'}
              {activeTab === 'notes' && 'Order Reference Notes'}
            </h3>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close actions menu"
            className="min-h-[44px] min-w-[44px] p-2 text-stone-400 hover:text-stone-900 rounded-xl flex items-center justify-center transition"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Sheet Content Body */}
        <div className="p-4 overflow-y-auto touch-scroll overscroll-contain space-y-3">
          {/* --- VIEW 1: MAIN ACTIONS LIST --- */}
          {activeTab === 'main' && (
            <div className="space-y-2">
              {/* Customer Assignment Button */}
              <button
                type="button"
                onClick={() => setActiveTab('customer')}
                className="w-full min-h-[48px] p-3 rounded-2xl bg-stone-50 hover:bg-stone-100 border border-stone-200 flex items-center justify-between text-left transition active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#064e3b]"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 text-[#064e3b] flex items-center justify-center">
                    <UserPlus className="w-5 h-5" aria-hidden="true" />
                  </div>
                  <div>
                    <h4 className="font-bold text-xs sm:text-sm text-stone-900">
                      Customer / Client
                    </h4>
                    <p className="text-[11px] text-stone-500">
                      {selectedCustomer ? selectedCustomer.name : 'Walk-in Customer (Default)'}
                    </p>
                  </div>
                </div>
                <span className="text-xs text-stone-400">Change ›</span>
              </button>

              {/* Order Discount Button */}
              <button
                type="button"
                onClick={() => setActiveTab('discount')}
                className="w-full min-h-[48px] p-3 rounded-2xl bg-stone-50 hover:bg-stone-100 border border-stone-200 flex items-center justify-between text-left transition active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#064e3b]"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center">
                    <Percent className="w-5 h-5" aria-hidden="true" />
                  </div>
                  <div>
                    <h4 className="font-bold text-xs sm:text-sm text-stone-900">
                      Order Discount
                    </h4>
                    <p className="text-[11px] text-stone-500">
                      {cartDiscount > 0 ? `-${cartDiscount.toFixed(2)} ${currency} applied` : 'No discount applied'}
                    </p>
                  </div>
                </div>
                <span className="text-xs text-stone-400">Edit ›</span>
              </button>

              {/* Order Notes Button */}
              <button
                type="button"
                onClick={() => setActiveTab('notes')}
                className="w-full min-h-[48px] p-3 rounded-2xl bg-stone-50 hover:bg-stone-100 border border-stone-200 flex items-center justify-between text-left transition active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#064e3b]"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
                    <FileText className="w-5 h-5" aria-hidden="true" />
                  </div>
                  <div>
                    <h4 className="font-bold text-xs sm:text-sm text-stone-900">
                      Order Reference Notes
                    </h4>
                    <p className="text-[11px] text-stone-500 truncate max-w-[220px]">
                      {orderNotes ? orderNotes : 'Add special print instructions or PO #'}
                    </p>
                  </div>
                </div>
                <span className="text-xs text-stone-400">Edit ›</span>
              </button>

              {/* Hold Order Button (Park order to resume later) */}
              <button
                type="button"
                onClick={() => {
                  onHoldOrder();
                  onClose();
                }}
                disabled={cartItemCount === 0}
                className="w-full min-h-[48px] p-3 rounded-2xl bg-amber-50 hover:bg-amber-100 border border-amber-300 disabled:opacity-40 flex items-center justify-between text-left transition active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-200 text-amber-900 flex items-center justify-center">
                    <BookmarkPlus className="w-5 h-5" aria-hidden="true" />
                  </div>
                  <div>
                    <h4 className="font-bold text-xs sm:text-sm text-amber-950">
                      Park / Hold Order
                    </h4>
                    <p className="text-[11px] text-amber-800">
                      Save current cart into Held Orders list and start new sale
                    </p>
                  </div>
                </div>
                <span className="text-xs font-bold text-amber-900">Hold</span>
              </button>

              {/* Clear Entire Cart */}
              <button
                type="button"
                onClick={() => {
                  onClearCart();
                  onClose();
                }}
                disabled={cartItemCount === 0}
                className="w-full min-h-[48px] p-3 rounded-2xl bg-rose-50 hover:bg-rose-100 border border-rose-200 disabled:opacity-40 flex items-center justify-between text-left transition active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-200 text-rose-800 flex items-center justify-center">
                    <Trash2 className="w-5 h-5" aria-hidden="true" />
                  </div>
                  <div>
                    <h4 className="font-bold text-xs sm:text-sm text-rose-950">
                      Clear Entire Cart
                    </h4>
                    <p className="text-[11px] text-rose-700">
                      Remove all {cartItemCount} item(s) from current order
                    </p>
                  </div>
                </div>
                <span className="text-xs font-bold text-rose-800">Clear</span>
              </button>
            </div>
          )}

          {/* --- VIEW 2: CUSTOMER SELECTION --- */}
          {activeTab === 'customer' && (
            <div className="space-y-2">
              <div className="space-y-1.5">
                {MOCK_CUSTOMERS.map((cust) => {
                  const isSelected = selectedCustomer?.id === cust.id;
                  return (
                    <button
                      key={cust.id}
                      type="button"
                      onClick={() => {
                        onSelectCustomer(cust);
                        setActiveTab('main');
                      }}
                      className={`w-full min-h-[48px] p-3 rounded-2xl border text-left flex items-center justify-between transition ${
                        isSelected
                          ? 'bg-emerald-50 border-[#064e3b] text-[#064e3b]'
                          : 'bg-white hover:bg-stone-50 border-stone-200 text-stone-900'
                      }`}
                    >
                      <div>
                        <h4 className="font-bold text-xs sm:text-sm">{cust.name}</h4>
                        <p className="text-[11px] text-stone-500">{cust.phone}</p>
                        {cust.notes && (
                          <span className="text-[10px] text-stone-400 italic block">
                            {cust.notes}
                          </span>
                        )}
                      </div>
                      {isSelected && <Check className="w-5 h-5 text-[#064e3b]" aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>

              {selectedCustomer && (
                <button
                  type="button"
                  onClick={() => {
                    onSelectCustomer(null);
                    setActiveTab('main');
                  }}
                  className="w-full min-h-[44px] py-2 text-xs font-bold text-stone-500 hover:text-rose-600 underline text-center"
                >
                  Reset to Walk-in Customer
                </button>
              )}
            </div>
          )}

          {/* --- VIEW 3: ORDER DISCOUNT --- */}
          {activeTab === 'discount' && (
            <div className="space-y-4">
              <div>
                <label htmlFor="discount-input" className="block text-xs font-bold text-stone-700 mb-1">
                  Fixed Discount Amount ({currency}):
                </label>
                <input
                  id="discount-input"
                  type="number"
                  min="0"
                  step="5"
                  value={discountInput}
                  onChange={(e) => setDiscountInput(e.target.value)}
                  placeholder="e.g. 50"
                  className="w-full min-h-[44px] bg-stone-50 border border-stone-300 rounded-xl p-3 text-base font-mono font-bold focus:ring-2 focus:ring-[#064e3b]"
                />
              </div>

              {/* Preset quick discount buttons */}
              <div className="grid grid-cols-4 gap-2">
                {[20, 50, 100, 200].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setDiscountInput(amt.toString())}
                    className="min-h-[44px] py-2 px-1 rounded-xl bg-stone-100 hover:bg-stone-200 text-xs font-bold text-stone-800 transition"
                  >
                    -{amt}
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onApplyDiscount(0);
                    setDiscountInput('');
                    setActiveTab('main');
                  }}
                  className="flex-1 min-h-[48px] py-2.5 rounded-xl border border-stone-200 text-stone-600 text-xs font-bold"
                >
                  Remove Discount
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const parsed = parseFloat(discountInput) || 0;
                    onApplyDiscount(parsed);
                    setActiveTab('main');
                  }}
                  className="flex-1 min-h-[48px] py-2.5 rounded-xl bg-[#064e3b] text-white text-xs font-bold shadow-sm"
                >
                  Save Discount
                </button>
              </div>
            </div>
          )}

          {/* --- VIEW 4: ORDER NOTES --- */}
          {activeTab === 'notes' && (
            <div className="space-y-4">
              <div>
                <label htmlFor="order-notes-input" className="block text-xs font-bold text-stone-700 mb-1">
                  Customer PO / Print Specifications / Delivery Reference:
                </label>
                <textarea
                  id="order-notes-input"
                  rows={3}
                  value={tempNotes}
                  onChange={(e) => setTempNotes(e.target.value)}
                  placeholder="e.g. Deliver to Mega Building 2nd floor after 3 PM"
                  className="w-full bg-stone-50 border border-stone-300 rounded-xl p-3 text-xs text-stone-900 focus:ring-2 focus:ring-[#064e3b]"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setTempNotes('');
                    onUpdateNotes('');
                    setActiveTab('main');
                  }}
                  className="flex-1 min-h-[48px] py-2.5 rounded-xl border border-stone-200 text-stone-600 text-xs font-bold"
                >
                  Clear Notes
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onUpdateNotes(tempNotes.trim());
                    setActiveTab('main');
                  }}
                  className="flex-1 min-h-[48px] py-2.5 rounded-xl bg-[#064e3b] text-white text-xs font-bold shadow-sm"
                >
                  Save Notes
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
