import React, { useState } from 'react';
import {
  Banknote,
  CreditCard,
  Split,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  RotateCcw,
  ShieldCheck,
  Receipt,
  X,
  Plus,
} from 'lucide-react';
import { PaymentMethod, SplitPayment } from '../../types/pos';
import { NumericKeypad } from './NumericKeypad';

interface PaymentPanelProps {
  grandTotal: number;
  currency: string;
  onCompleteSale: (payments: SplitPayment[], changeAmount: number) => void;
  onClose?: () => void;
  isSlideOverModal?: boolean;
}

export const PaymentPanel: React.FC<PaymentPanelProps> = ({
  grandTotal,
  currency,
  onCompleteSale,
  onClose,
  isSlideOverModal = false,
}) => {
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('cash');

  // Cash Tendered string input
  const [cashTenderedStr, setCashTenderedStr] = useState<string>(() =>
    grandTotal > 0 ? Math.ceil(grandTotal).toString() : '0'
  );

  // Card reference / auth code simulation
  const [cardAuthRef, setCardAuthRef] = useState<string>('AUTH-88219');

  // Split Payment Tracking
  const [splitCashAmount, setSplitCashAmount] = useState<number>(() =>
    Math.round(grandTotal / 2)
  );
  const [splitCardAmount, setSplitCardAmount] = useState<number>(() =>
    Math.max(0, grandTotal - Math.round(grandTotal / 2))
  );

  // Calculations
  const cashTendered = parseFloat(cashTenderedStr) || 0;
  const changeDue = Math.max(0, cashTendered - grandTotal);
  const remainingCashNeeded = Math.max(0, grandTotal - cashTendered);

  // Split calculation
  const totalSplitPaid = splitCashAmount + splitCardAmount;
  const splitRemaining = Math.max(0, grandTotal - totalSplitPaid);
  const splitChange = Math.max(0, totalSplitPaid - grandTotal);

  // Keypad Handlers for Cash Mode
  const handleKeypadPress = (char: string) => {
    if (cashTenderedStr === '0' && char !== '.') {
      setCashTenderedStr(char);
    } else {
      // Disallow double decimal
      if (char === '.' && cashTenderedStr.includes('.')) return;
      setCashTenderedStr((prev) => prev + char);
    }
  };

  const handleClearKeypad = () => {
    setCashTenderedStr('0');
  };

  const handleBackspaceKeypad = () => {
    setCashTenderedStr((prev) => (prev.length <= 1 ? '0' : prev.slice(0, -1)));
  };

  const handleAddDenomination = (amount: number) => {
    const current = parseFloat(cashTenderedStr) || 0;
    setCashTenderedStr((current + amount).toString());
  };

  const handleExactCash = () => {
    setCashTenderedStr(Math.ceil(grandTotal).toString());
  };

  // Submission
  const handleSubmitPayment = () => {
    if (selectedMethod === 'cash') {
      if (cashTendered < grandTotal) return;
      onCompleteSale(
        [
          {
            method: 'cash',
            amount: grandTotal,
          },
        ],
        changeDue
      );
    } else if (selectedMethod === 'card') {
      onCompleteSale(
        [
          {
            method: 'card',
            amount: grandTotal,
            reference: cardAuthRef,
          },
        ],
        0
      );
    } else if (selectedMethod === 'split') {
      if (totalSplitPaid < grandTotal) return;
      onCompleteSale(
        [
          {
            method: 'cash',
            amount: splitCashAmount,
          },
          {
            method: 'card',
            amount: splitCardAmount,
            reference: cardAuthRef,
          },
        ],
        splitChange
      );
    }
  };

  const isPaymentValid =
    selectedMethod === 'cash'
      ? cashTendered >= grandTotal
      : selectedMethod === 'card'
      ? grandTotal > 0
      : totalSplitPaid >= grandTotal;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white border-l border-[#e6dfd5] overflow-hidden">
      {/* 1. Payment Header with Total Due */}
      <div className="p-3 bg-[#fdfbf7] border-b border-[#e6dfd5] shrink-0 flex items-center justify-between gap-2">
        <div>
          <h2 className="font-extrabold text-sm sm:text-base text-stone-900 leading-tight">
            Checkout &amp; Tender
          </h2>
          <p className="text-xs text-stone-500">Select payment method below</p>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close payment panel"
            className="min-h-[44px] min-w-[44px] p-2 rounded-xl text-stone-500 hover:text-stone-900 hover:bg-stone-200 flex items-center justify-center transition"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* 2. Grand Total Callout Banner */}
      <div className="p-3 bg-emerald-50 border-b border-emerald-200 shrink-0 flex items-center justify-between">
        <div>
          <span className="text-xs font-bold text-emerald-950 uppercase tracking-wider block">
            Amount Due
          </span>
          <span className="text-[10px] text-emerald-800">Tax inclusive (15% VAT)</span>
        </div>
        <div className="text-right">
          <span className="text-2xl sm:text-3xl font-black font-mono text-[#064e3b]">
            {grandTotal.toFixed(2)}
          </span>
          <span className="text-xs font-bold text-[#064e3b] ml-1">{currency}</span>
        </div>
      </div>

      {/* 3. Method Selection Tabs (Min 44x44px touch targets) */}
      <div className="p-3 border-b border-[#e6dfd5] shrink-0">
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setSelectedMethod('cash')}
            aria-pressed={selectedMethod === 'cash'}
            className={`min-h-[48px] py-2 px-3 rounded-2xl border text-xs font-bold flex flex-col items-center justify-center gap-1 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#064e3b] ${
              selectedMethod === 'cash'
                ? 'bg-[#064e3b] text-white border-[#064e3b] shadow-xs'
                : 'bg-white hover:bg-stone-50 text-stone-700 border-stone-200'
            }`}
          >
            <Banknote className="w-4 h-4" aria-hidden="true" />
            <span>Cash</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedMethod('card')}
            aria-pressed={selectedMethod === 'card'}
            className={`min-h-[48px] py-2 px-3 rounded-2xl border text-xs font-bold flex flex-col items-center justify-center gap-1 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#064e3b] ${
              selectedMethod === 'card'
                ? 'bg-[#064e3b] text-white border-[#064e3b] shadow-xs'
                : 'bg-white hover:bg-stone-50 text-stone-700 border-stone-200'
            }`}
          >
            <CreditCard className="w-4 h-4" aria-hidden="true" />
            <span>Card / POS</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedMethod('split')}
            aria-pressed={selectedMethod === 'split'}
            className={`min-h-[48px] py-2 px-3 rounded-2xl border text-xs font-bold flex flex-col items-center justify-center gap-1 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#064e3b] ${
              selectedMethod === 'split'
                ? 'bg-[#064e3b] text-white border-[#064e3b] shadow-xs'
                : 'bg-white hover:bg-stone-50 text-stone-700 border-stone-200'
            }`}
          >
            <Split className="w-4 h-4" aria-hidden="true" />
            <span>Split Pay</span>
          </button>
        </div>
      </div>

      {/* 4. Active Method Interaction Zone */}
      <div className="flex-1 min-h-0 overflow-y-auto touch-scroll overscroll-contain p-3 space-y-3">
        {/* === SCENARIO A: CASH PAYMENT WITH CHANGE CALCULATION === */}
        {selectedMethod === 'cash' && (
          <div className="space-y-3">
            {/* Tendered and Live Change Display */}
            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 rounded-2xl bg-[#fdfbf7] border border-stone-200">
                <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wide block">
                  Cash Tendered
                </span>
                <div className="text-xl font-black font-mono text-stone-900 mt-0.5">
                  {cashTendered.toFixed(2)}
                </div>
              </div>

              {/* Change Calculation (Icon + Text: Never color alone) */}
              <div
                className={`p-3 rounded-2xl border ${
                  cashTendered >= grandTotal
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                    : 'bg-amber-50 border-amber-300 text-amber-950'
                }`}
              >
                <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide">
                  {cashTendered >= grandTotal ? (
                    <>
                      <CheckCircle2 className="w-3 h-3 text-emerald-700" aria-hidden="true" />
                      <span className="text-emerald-800">Change Due</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-3 h-3 text-amber-700" aria-hidden="true" />
                      <span className="text-amber-800">Shortage Due</span>
                    </>
                  )}
                </div>
                <div
                  className={`text-xl font-black font-mono mt-0.5 ${
                    cashTendered >= grandTotal ? 'text-[#064e3b]' : 'text-amber-800'
                  }`}
                >
                  {cashTendered >= grandTotal
                    ? changeDue.toFixed(2)
                    : remainingCashNeeded.toFixed(2)}
                </div>
              </div>
            </div>

            {/* Large Numeric Touch Keypad for Cash Tendered */}
            <NumericKeypad
              onKeyPress={handleKeypadPress}
              onClear={handleClearKeypad}
              onBackspace={handleBackspaceKeypad}
              onAddAmount={handleAddDenomination}
              onExact={handleExactCash}
              totalDue={grandTotal}
              currency={currency}
            />
          </div>
        )}

        {/* === SCENARIO B: CARD / DIGITAL PAYMENT === */}
        {selectedMethod === 'card' && (
          <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-[#064e3b] flex items-center justify-center">
                <CreditCard className="w-6 h-6" aria-hidden="true" />
              </div>
              <div>
                <h4 className="font-extrabold text-sm text-stone-900">
                  Card / Telebirr / CBE Terminal
                </h4>
                <p className="text-xs text-stone-500">Swipe or tap POS terminal</p>
              </div>
            </div>

            <div className="p-3 bg-white rounded-xl border border-stone-200 space-y-1">
              <label htmlFor="card-ref-input" className="text-xs font-bold text-stone-700">
                Transaction / Authorization Reference:
              </label>
              <input
                id="card-ref-input"
                type="text"
                value={cardAuthRef}
                onChange={(e) => setCardAuthRef(e.target.value)}
                placeholder="e.g. AUTH-99214"
                className="w-full min-h-[44px] bg-stone-50 border border-stone-300 rounded-xl px-3 py-2 text-sm font-mono font-bold text-stone-900 focus:outline-hidden focus:ring-2 focus:ring-[#064e3b]"
              />
            </div>

            <div className="flex items-center gap-2 text-xs text-emerald-800 font-semibold p-2 bg-emerald-50 rounded-xl border border-emerald-200">
              <ShieldCheck className="w-4 h-4 text-emerald-700" aria-hidden="true" />
              <span>Direct Bank Terminal Connected &amp; Ready</span>
            </div>
          </div>
        )}

        {/* === SCENARIO C: SPLIT PAYMENT (CASH + CARD) === */}
        {selectedMethod === 'split' && (
          <div className="space-y-3">
            <div className="p-3 rounded-2xl bg-[#fdfbf7] border border-stone-200 space-y-3">
              <h4 className="font-extrabold text-xs text-stone-800 uppercase tracking-wider">
                Split Distribution
              </h4>

              {/* Cash Portion */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-stone-700 flex justify-between">
                  <span>1. Cash Amount ({currency})</span>
                  <span className="font-mono text-emerald-800">{splitCashAmount.toFixed(2)}</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="0"
                    max={grandTotal}
                    step="10"
                    value={splitCashAmount}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      setSplitCashAmount(val);
                      setSplitCardAmount(Math.max(0, grandTotal - val));
                    }}
                    className="flex-1 accent-[#064e3b] h-2 bg-stone-200 rounded-lg cursor-pointer"
                  />
                  <input
                    type="number"
                    value={splitCashAmount}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      setSplitCashAmount(val);
                      setSplitCardAmount(Math.max(0, grandTotal - val));
                    }}
                    className="w-24 min-h-[44px] p-2 bg-white border border-stone-300 rounded-xl font-mono text-sm font-bold text-right"
                  />
                </div>
              </div>

              {/* Card Portion */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-stone-700 flex justify-between">
                  <span>2. Card / Digital Amount ({currency})</span>
                  <span className="font-mono text-emerald-800">{splitCardAmount.toFixed(2)}</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="0"
                    max={grandTotal}
                    step="10"
                    value={splitCardAmount}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      setSplitCardAmount(val);
                      setSplitCashAmount(Math.max(0, grandTotal - val));
                    }}
                    className="flex-1 accent-[#064e3b] h-2 bg-stone-200 rounded-lg cursor-pointer"
                  />
                  <input
                    type="number"
                    value={splitCardAmount}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      setSplitCardAmount(val);
                      setSplitCashAmount(Math.max(0, grandTotal - val));
                    }}
                    className="w-24 min-h-[44px] p-2 bg-white border border-stone-300 rounded-xl font-mono text-sm font-bold text-right"
                  />
                </div>
              </div>

              {/* Split Summary */}
              <div className="pt-2 border-t border-stone-200 flex justify-between text-xs">
                <span className="text-stone-500">Total Tendered:</span>
                <span className="font-mono font-bold text-stone-900">
                  {totalSplitPaid.toFixed(2)} / {grandTotal.toFixed(2)} {currency}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 5. Primary Action Button: Complete Payment (Always reachable with one thumb, full-width on mobile) */}
      <div className="p-3 bg-[#fdfbf7] border-t border-[#e6dfd5] shrink-0 safe-area-bottom mt-auto">
        <button
          type="button"
          onClick={handleSubmitPayment}
          disabled={!isPaymentValid}
          aria-label={`Complete sale and generate receipt. Total: ${grandTotal.toFixed(2)} ${currency}`}
          className="w-full min-h-[48px] py-3.5 px-4 bg-[#064e3b] hover:bg-[#043b2c] active:scale-[0.99] disabled:opacity-40 text-white font-extrabold text-sm sm:text-base rounded-2xl shadow-md flex items-center justify-center gap-2 cursor-pointer transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#064e3b]"
        >
          <Receipt className="w-5 h-5" aria-hidden="true" />
          <span>Complete Sale &amp; Print Receipt</span>
          <ArrowRight className="w-4 h-4 ml-1" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};
