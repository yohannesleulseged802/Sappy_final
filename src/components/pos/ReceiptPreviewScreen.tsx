import React, { useRef } from 'react';
import {
  Printer,
  CheckCircle2,
  ArrowRight,
  Share2,
  Mail,
  RotateCcw,
  Barcode,
  QrCode,
  Download,
} from 'lucide-react';
import { Receipt, StoreInfo, ScreenView } from '../../types/pos';
import { Header } from './Header';
import { Footer } from './Footer';

interface ReceiptPreviewScreenProps {
  receipt: Receipt;
  onNewSale: () => void;
  onNavigate: (screen: ScreenView) => void;
  heldOrdersCount: number;
  onOpenScanner: () => void;
  onOpenShortcuts: () => void;
  storeInfo: StoreInfo;
}

export const ReceiptPreviewScreen: React.FC<ReceiptPreviewScreenProps> = ({
  receipt,
  onNewSale,
  onNavigate,
  heldOrdersCount,
  onOpenScanner,
  onOpenShortcuts,
  storeInfo,
}) => {
  const receiptAreaRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    window.print();
  };

  const totalQuantity = receipt.items.reduce((s, i) => s + i.quantity, 0);

  return (
    <div className="flex-1 flex flex-col min-h-0 h-full overflow-hidden bg-[#f5f1e8]">
      {/* 1. Header on every screen */}
      <Header
        currentScreen="receipt"
        onNavigate={onNavigate}
        heldOrdersCount={heldOrdersCount}
        onOpenScanner={onOpenScanner}
        onOpenShortcuts={onOpenShortcuts}
        onResetSale={onNewSale}
        storeInfo={storeInfo}
        cartCount={0}
      />

      {/* 2. Main Content Area */}
      <main className="flex-1 min-h-0 overflow-y-auto touch-scroll overscroll-contain p-4 sm:p-6 flex flex-col items-center justify-start pb-24 md:pb-6">
        <div className="w-full max-w-md space-y-4">
          {/* Top Success Banner with Icon + Text */}
          <div className="p-4 rounded-3xl bg-emerald-50 border border-emerald-300 text-emerald-950 flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[#064e3b] text-white flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-6 h-6 text-emerald-200" aria-hidden="true" />
              </div>
              <div>
                <h2 className="font-extrabold text-sm sm:text-base text-[#064e3b]">
                  Transaction Successful!
                </h2>
                <p className="text-xs text-emerald-800">
                  Payment recorded • Change: {receipt.change.toFixed(2)} {receipt.currency}
                </p>
              </div>
            </div>

            <span className="font-mono text-xs font-bold bg-emerald-200 text-emerald-900 px-2 py-0.5 rounded-md">
              #{receipt.receiptNumber}
            </span>
          </div>

          {/* Action Strip: Print & Start New Transaction (Min 44x44px targets) */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handlePrint}
              aria-label="Print official thermal receipt"
              className="min-h-[48px] py-3 px-4 rounded-2xl bg-white hover:bg-stone-50 border border-stone-300 text-stone-900 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs transition active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#064e3b]"
            >
              <Printer className="w-4 h-4 text-[#064e3b]" aria-hidden="true" />
              <span>Print Receipt</span>
            </button>

            <button
              type="button"
              onClick={onNewSale}
              aria-label="Start new transaction (F8)"
              className="min-h-[48px] py-3 px-4 rounded-2xl bg-[#064e3b] hover:bg-[#043b2c] text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md transition active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#064e3b]"
            >
              <span>New Sale</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          {/* Thermal Paper Receipt Visual Container (Target for 80mm Print) */}
          <div
            id="thermal-receipt-area"
            ref={receiptAreaRef}
            className="w-full bg-white rounded-3xl border border-[#e6dfd5] p-6 shadow-xl text-stone-900 font-mono text-xs space-y-4"
          >
            {/* Store Header */}
            <div className="text-center space-y-1 pb-3 border-b border-dashed border-stone-300">
              <h3 className="text-base font-black uppercase font-sans tracking-tight">
                {receipt.storeName}
              </h3>
              <p className="text-[11px] text-stone-600">{receipt.storeAddress}</p>
              <p className="text-[11px] text-stone-600">Tel: {receipt.storePhone}</p>
              <p className="text-[11px] text-stone-500 font-bold">{receipt.storeTaxNumber}</p>
            </div>

            {/* Receipt Meta */}
            <div className="text-[11px] space-y-0.5 pb-3 border-b border-dashed border-stone-300">
              <div className="flex justify-between">
                <span className="text-stone-500">Receipt No:</span>
                <span className="font-bold">#{receipt.receiptNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Date &amp; Time:</span>
                <span>{receipt.date}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Cashier:</span>
                <span>{receipt.cashierName}</span>
              </div>
              {receipt.customer && (
                <div className="flex justify-between">
                  <span className="text-stone-500">Customer:</span>
                  <span className="font-bold">{receipt.customer.name}</span>
                </div>
              )}
            </div>

            {/* Itemized Table */}
            <div className="space-y-2 pb-3 border-b border-dashed border-stone-300 text-xs">
              <div className="flex justify-between text-[11px] font-bold text-stone-600 uppercase">
                <span>Description / Qty</span>
                <span>Amount</span>
              </div>

              {receipt.items.map((item) => (
                <div key={item.product.id} className="space-y-0.5">
                  <div className="flex justify-between">
                    <span className="font-bold line-clamp-1 flex-1 pr-2">
                      {item.product.name}
                    </span>
                    <span className="font-bold shrink-0">
                      {(item.product.price * item.quantity).toFixed(2)}
                    </span>
                  </div>
                  <div className="text-[10px] text-stone-500">
                    {item.quantity} × {item.product.price.toFixed(2)} {receipt.currency}/{item.product.unit}
                  </div>
                </div>
              ))}
            </div>

            {/* Financial Summary */}
            <div className="text-[11px] space-y-1 pb-3 border-b border-dashed border-stone-300">
              <div className="flex justify-between">
                <span>Total Items Sold:</span>
                <span>{totalQuantity}</span>
              </div>
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span>{receipt.subtotal.toFixed(2)} {receipt.currency}</span>
              </div>
              {receipt.discount > 0 && (
                <div className="flex justify-between text-rose-600 font-bold">
                  <span>Order Discount:</span>
                  <span>-{receipt.discount.toFixed(2)} {receipt.currency}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>VAT (15% Included):</span>
                <span>{receipt.tax.toFixed(2)} {receipt.currency}</span>
              </div>

              <div className="pt-2 border-t border-stone-300 flex justify-between text-sm sm:text-base font-black">
                <span>TOTAL:</span>
                <span>{receipt.total.toFixed(2)} {receipt.currency}</span>
              </div>
            </div>

            {/* Payment & Change Breakdown */}
            <div className="text-[11px] space-y-1 pb-3 border-b border-dashed border-stone-300">
              {receipt.payments.map((p, idx) => (
                <div key={idx} className="flex justify-between">
                  <span className="capitalize">{p.method} Tendered:</span>
                  <span className="font-bold">
                    {p.amount.toFixed(2)} {receipt.currency}
                    {p.reference ? ` (${p.reference})` : ''}
                  </span>
                </div>
              ))}

              <div className="flex justify-between font-bold text-emerald-800 pt-1">
                <span>Change Returned:</span>
                <span>{receipt.change.toFixed(2)} {receipt.currency}</span>
              </div>
            </div>

            {/* Barcode & Footer QR Code Simulation */}
            <div className="pt-2 text-center space-y-2">
              <div className="flex justify-center py-1">
                {/* SVG Mock 1D Barcode with crisp lines */}
                <div className="h-10 w-48 bg-stone-900 rounded-xs flex items-center justify-around px-2">
                  {[4, 2, 6, 2, 8, 3, 2, 5, 2, 7, 3, 2, 6, 4, 2, 5, 2, 8, 3].map((w, i) => (
                    <div
                      key={i}
                      className="h-8 bg-white"
                      style={{ width: `${w}px` }}
                    />
                  ))}
                </div>
              </div>
              <p className="text-[10px] tracking-widest text-stone-500 font-mono">
                *{receipt.receiptNumber}*
              </p>
              <p className="text-[10px] text-stone-500 font-sans mt-1">
                Thank you for your business! Items can be exchanged within 7 days with this receipt.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* 3. Footer on every screen */}
      <Footer storeInfo={storeInfo} />
    </div>
  );
};
