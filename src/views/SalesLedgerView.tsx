import React, {useState, useMemo} from 'react';
import {
  Receipt,
  Search,
  Filter,
  Download,
  Printer,
  RotateCcw,
  FileDown,
  X,
  AlertCircle,
  Check,
} from 'lucide-react';
import {Sale, StoreSettings, Staff} from '../types';
import {storage} from '../services/storage';
import {ExportService} from '../services/export';
import {BarcodeRenderer} from '../components/common/BarcodeRenderer';
import {PinModal} from '../components/common/PinModal';

interface SalesLedgerViewProps {
  sales: Sale[];
  settings: StoreSettings;
  currentStaff: Staff;
  onRefreshData: () => void;
}

export const SalesLedgerView: React.FC<SalesLedgerViewProps> = ({
  sales,
  settings,
  currentStaff,
  onRefreshData,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>('All');

  // Selected Sale for Detailed Inspector
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);

  // Refund Modal State
  const [isRefundModalOpen, setIsRefundModalOpen] = useState(false);
  const [saleToRefund, setSaleToRefund] = useState<Sale | null>(null);
  const [refundReason, setRefundReason] = useState('Customer returned item');
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);

  // Filtered sales
  const filteredSales = useMemo(() => {
    return sales.filter((s) => {
      if (statusFilter !== 'All' && s.status !== statusFilter) return false;
      if (
        paymentFilter !== 'All' &&
        !s.payments.some((p) => p.method === paymentFilter)
      ) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return (
          s.receiptNumber.toLowerCase().includes(q) ||
          s.cashierName.toLowerCase().includes(q) ||
          (s.customerName && s.customerName.toLowerCase().includes(q)) ||
          s.items.some((i) => i.productName.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [sales, statusFilter, paymentFilter, searchQuery]);

  // Initiate Refund Flow
  const handleInitiateRefund = (sale: Sale) => {
    setSaleToRefund(sale);
    setIsRefundModalOpen(true);
  };

  const handleRefundAuthorized = (pinStaff: Staff) => {
    if (!saleToRefund) return;
    const res = storage.refundSale(saleToRefund.id, refundReason, pinStaff.pin);
    if (!res.success) {
      alert(res.error || 'Failed to refund sale.');
      return;
    }
    alert(`Sale #${saleToRefund.receiptNumber} successfully refunded and inventory restored.`);
    setIsRefundModalOpen(false);
    setSaleToRefund(null);
    onRefreshData();
  };

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-3.5rem)] overflow-hidden bg-[#fdfbf7] dark:bg-[#12100e]">
      {/* Header & Filter Controls */}
      <div className="p-3 bg-white dark:bg-[#1c1815] border-b border-[#e6dfd5] dark:border-[#362e26] flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by receipt #, cashier, customer, or product..."
              className="w-full bg-[#f5f1e8] dark:bg-[#25201b] border border-transparent focus:border-[#064e3b] dark:focus:border-[#6ee7b7] rounded-xl pl-9 pr-4 py-2 text-xs text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-hidden"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Payment Method Filter */}
          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
            className="bg-[#f5f1e8] dark:bg-[#25201b] border border-stone-200 dark:border-stone-700 rounded-xl px-2.5 py-2 text-xs font-semibold text-stone-900 dark:text-stone-100"
          >
            <option value="All">All Payment Types</option>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="mobile_transfer">Mobile Transfer</option>
            <option value="credit">Store Credit</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-[#f5f1e8] dark:bg-[#25201b] border border-stone-200 dark:border-stone-700 rounded-xl px-2.5 py-2 text-xs font-semibold text-stone-900 dark:text-stone-100"
          >
            <option value="All">All Statuses</option>
            <option value="COMPLETED">Completed</option>
            <option value="REFUNDED">Refunded</option>
          </select>

          {/* Export to CSV */}
          <button
            onClick={() => ExportService.exportSalesToCSV(filteredSales)}
            className="p-2 border border-stone-200 dark:border-stone-800 rounded-xl text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition text-xs font-bold flex items-center gap-1"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export CSV</span>
          </button>
        </div>
      </div>

      {/* Main Content: Sales Table */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="bg-white dark:bg-[#1c1815] border border-[#e6dfd5] dark:border-[#362e26] rounded-2xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#f5f1e8] dark:bg-[#25201b] border-b border-[#e6dfd5] dark:border-[#362e26] text-stone-700 dark:text-stone-300 font-bold uppercase tracking-wider">
                  <th className="p-3">Receipt #</th>
                  <th className="p-3">Date &amp; Time</th>
                  <th className="p-3">Cashier</th>
                  <th className="p-3">Customer</th>
                  <th className="p-3">Payment Split</th>
                  <th className="p-3 text-right">Grand Total</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e6dfd5] dark:divide-[#2d251f]">
                {filteredSales.map((s) => (
                  <tr
                    key={s.id}
                    className="hover:bg-[#fdfbf7] dark:hover:bg-[#201b17] transition"
                  >
                    <td className="p-3 font-mono font-bold text-stone-900 dark:text-stone-100">
                      {s.receiptNumber}
                    </td>
                    <td className="p-3 text-stone-500">
                      {new Date(s.date).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="p-3 text-stone-700 dark:text-stone-300">
                      {s.cashierName}
                    </td>
                    <td className="p-3 text-stone-700 dark:text-stone-300">
                      {s.customerName || 'Walk-in Customer'}
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        {s.payments.map((p, i) => (
                          <span
                            key={i}
                            className="text-[10px] px-1.5 py-0.2 rounded font-mono bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300"
                          >
                            {p.method.replace('_', ' ')}: {p.amount.toFixed(2)}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="p-3 text-right font-mono font-black text-stone-900 dark:text-stone-100">
                      {s.grandTotal.toFixed(2)} {settings.currency}
                    </td>
                    <td className="p-3 text-center">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                          s.status === 'COMPLETED'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                        }`}
                      >
                        {s.status}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setSelectedSale(s)}
                          className="px-2 py-1 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 text-stone-800 dark:text-stone-200 rounded-lg text-xs font-semibold transition"
                        >
                          Inspect
                        </button>

                        <button
                          onClick={() => ExportService.generatePDFReceipt(s, settings)}
                          className="p-1 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300 rounded-lg transition"
                          title="Download Receipt PDF"
                        >
                          <FileDown className="w-3.5 h-3.5" />
                        </button>

                        {s.status === 'COMPLETED' && (
                          <button
                            onClick={() => handleInitiateRefund(s)}
                            className="p-1 hover:bg-rose-100 dark:hover:bg-rose-950 text-rose-600 rounded-lg transition"
                            title="Refund Sale"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}

                {filteredSales.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-12 text-center text-stone-400">
                      No sales transactions match the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ================= MODAL: TRANSACTION INSPECTOR ================= */}
      {selectedSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-5 shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100 dark:border-stone-800 mb-3">
              <div>
                <h3 className="font-bold text-base font-mono">
                  Receipt #{selectedSale.receiptNumber}
                </h3>
                <p className="text-xs text-stone-500">
                  {new Date(selectedSale.date).toLocaleString()} • Cashier: {selectedSale.cashierName}
                </p>
              </div>
              <button
                onClick={() => setSelectedSale(null)}
                className="p-1 text-stone-400 hover:text-stone-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Line Items Table */}
            <div className="border border-stone-200 dark:border-stone-800 rounded-xl overflow-hidden mb-3">
              <table className="w-full text-left text-xs">
                <thead className="bg-stone-50 dark:bg-stone-800 font-bold">
                  <tr>
                    <th className="p-2">Item</th>
                    <th className="p-2 text-center">Qty</th>
                    <th className="p-2 text-right">Price</th>
                    <th className="p-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                  {selectedSale.items.map((item, idx) => (
                    <tr key={idx}>
                      <td className="p-2">
                        <div className="font-bold">{item.productName}</div>
                        <div className="text-[10px] text-stone-400 font-mono">{item.sku}</div>
                      </td>
                      <td className="p-2 text-center font-mono">
                        {item.quantity} {item.unit}
                      </td>
                      <td className="p-2 text-right font-mono">
                        {item.sellingPrice.toFixed(2)}
                      </td>
                      <td className="p-2 text-right font-mono font-bold">
                        {(item.quantity * item.sellingPrice).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals Summary */}
            <div className="p-3 bg-stone-50 dark:bg-stone-800/60 rounded-xl space-y-1 text-xs mb-4">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span className="font-mono">{selectedSale.subtotal.toFixed(2)} {settings.currency}</span>
              </div>
              {selectedSale.totalDiscount > 0 && (
                <div className="flex justify-between text-rose-600">
                  <span>Discount:</span>
                  <span className="font-mono">-{selectedSale.totalDiscount.toFixed(2)} {settings.currency}</span>
                </div>
              )}
              {selectedSale.taxAmount > 0 && (
                <div className="flex justify-between">
                  <span>Tax ({selectedSale.taxRate}%):</span>
                  <span className="font-mono">{selectedSale.taxAmount.toFixed(2)} {settings.currency}</span>
                </div>
              )}
              <div className="flex justify-between font-black text-sm pt-1 border-t border-stone-200 dark:border-stone-700">
                <span>Grand Total:</span>
                <span className="font-mono">{selectedSale.grandTotal.toFixed(2)} {settings.currency}</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => ExportService.generatePDFReceipt(selectedSale, settings)}
                className="px-4 py-2 bg-[#064e3b] text-white rounded-xl text-xs font-bold flex items-center gap-1.5"
              >
                <FileDown className="w-3.5 h-3.5" />
                <span>Download PDF Receipt</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: REFUND CONFIRMATION ================= */}
      {isRefundModalOpen && saleToRefund && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-5 shadow-2xl">
            <h3 className="font-bold text-sm text-rose-600 mb-1">
              Refund Sale #{saleToRefund.receiptNumber}
            </h3>
            <p className="text-xs text-stone-500 mb-3">
              Total to refund: {saleToRefund.grandTotal.toFixed(2)} {settings.currency}. This will return items to stock.
            </p>

            <label className="block text-xs font-semibold mb-1">Refund Reason *</label>
            <input
              type="text"
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-2 text-xs mb-4"
              autoFocus
            />

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsRefundModalOpen(false)}
                className="px-3 py-1.5 text-xs text-stone-500"
              >
                Cancel
              </button>
              <button
                onClick={() => setIsPinModalOpen(true)}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold"
              >
                Authorize &amp; Refund
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PIN Verification for Refund Authorization */}
      <PinModal
        isOpen={isPinModalOpen}
        onClose={() => setIsPinModalOpen(false)}
        onSuccess={handleRefundAuthorized}
        title="Manager Authorization"
        description="Authorize refund and stock return with Manager PIN"
        requiredRole="manager"
      />
    </div>
  );
};
