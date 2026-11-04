import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  Printer,
  FileDown,
  Calendar,
  DollarSign,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  AlertTriangle,
  Receipt,
  CreditCard,
  Smartphone,
  Wallet,
  Clock,
  User,
  ShieldCheck,
  RefreshCw,
  Layers,
  FileText,
  Calculator,
} from 'lucide-react';
import { StoreSettings, Staff, EndOfDayReport, StoreExpense, CreditTransaction, Shift } from '../../types';
import { storage } from '../../services/storage';
import { sound } from '../../services/sound';
import { ExportService } from '../../services/export';
import { toast } from '../../services/toast';

interface EndOfDayReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: StoreSettings;
  currentStaff: Staff;
  onRefreshData?: () => void;
}

export const EndOfDayReportModal: React.FC<EndOfDayReportModalProps> = ({
  isOpen,
  onClose,
  settings,
  currentStaff,
  onRefreshData,
}) => {
  const currency = settings.currency || 'ETB';
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [selectedShiftId, setSelectedShiftId] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'reconciliation' | 'tenders' | 'expenses' | 'credit'>('reconciliation');

  // Actual cash counting mode: 'direct' vs 'denominations'
  const [countMode, setCountMode] = useState<'direct' | 'denominations'>('direct');
  const [directActualCash, setDirectActualCash] = useState<string>('');

  // Currency Denominations (Birr / Local Currency)
  const [denom200, setDenom200] = useState<number>(0);
  const [denom100, setDenom100] = useState<number>(0);
  const [denom50, setDenom50] = useState<number>(0);
  const [denom10, setDenom10] = useState<number>(0);
  const [denom5, setDenom5] = useState<number>(0);
  const [denomCoins, setDenomCoins] = useState<number>(0);

  // Variance & Settle
  const [varianceReason, setVarianceReason] = useState<string>('');
  const [settleNotes, setSettleNotes] = useState<string>('');
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [isSettling, setIsSettling] = useState(false);

  // Report state
  const [report, setReport] = useState<EndOfDayReport>(() =>
    storage.getEndOfDayReport(todayStr, undefined)
  );

  const shifts = storage.getShifts();
  const dayShifts = useMemo(() => {
    return shifts.filter((s) => s.openedAt.slice(0, 10) === selectedDate);
  }, [shifts, selectedDate]);

  // Recalculate report whenever date or shift changes
  const refreshReport = () => {
    const shiftArg = selectedShiftId === 'all' ? undefined : selectedShiftId;
    const rep = storage.getEndOfDayReport(selectedDate, shiftArg);
    setReport(rep);

    // If shift has recorded actual cash, populate inputs
    if (rep.actualCash !== undefined && rep.actualCash > 0) {
      setDirectActualCash(rep.actualCash.toString());
      if (rep.varianceReason) setVarianceReason(rep.varianceReason);
    }
  };

  useEffect(() => {
    if (isOpen) {
      refreshReport();
    }
  }, [isOpen, selectedDate, selectedShiftId]);

  // Sum of denominations
  const denomTotal = useMemo(() => {
    return (
      (denom200 || 0) * 200 +
      (denom100 || 0) * 100 +
      (denom50 || 0) * 50 +
      (denom10 || 0) * 10 +
      (denom5 || 0) * 5 +
      (denomCoins || 0)
    );
  }, [denom200, denom100, denom50, denom10, denom5, denomCoins]);

  // Effective actual cash counted
  const effectiveActualCash = useMemo(() => {
    if (countMode === 'denominations') {
      return denomTotal;
    }
    const val = parseFloat(directActualCash);
    return isNaN(val) ? 0 : val;
  }, [countMode, directActualCash, denomTotal]);

  const hasEnteredActual = countMode === 'denominations' ? denomTotal > 0 : directActualCash.trim() !== '';
  const calculatedVariance = effectiveActualCash - report.expectedCash;

  if (!isOpen) return null;

  // Handle Close & Stamp Shift / Day
  const handleConfirmReconciliation = async () => {
    if (!hasEnteredActual) {
      toast.warning('Please enter the actual cash amount counted in the cash drawer.');
      return;
    }

    if (Math.abs(calculatedVariance) > 0.01 && !varianceReason.trim()) {
      toast.warning('Please provide an explanation note for the drawer variance.');
      return;
    }

    setIsSettling(true);
    try {
      storage.saveEndOfDayReconciliation(
        selectedDate,
        effectiveActualCash,
        varianceReason.trim() || undefined,
        settleNotes.trim() || undefined
      );

      sound.playCheckoutSuccess();
      toast.success(
        `Shift & cash drawer successfully reconciled! Variance: ${calculatedVariance >= 0 ? '+' : ''}${calculatedVariance.toFixed(2)} ${currency}`
      );
      refreshReport();
      if (onRefreshData) onRefreshData();
    } catch (err: any) {
      sound.playError();
      toast.error(err?.message || 'Failed to save reconciliation.');
    } finally {
      setIsSettling(false);
    }
  };

  // Export PDF
  const handleExportPDF = async () => {
    setIsExportingPDF(true);
    try {
      const finalReport: EndOfDayReport = {
        ...report,
        actualCash: hasEnteredActual ? effectiveActualCash : report.actualCash,
        variance: hasEnteredActual ? calculatedVariance : report.variance,
        varianceReason: varianceReason.trim() || report.varianceReason,
      };
      await ExportService.generateEndOfDayReportPDF(finalReport, settings);
      sound.playCheckoutSuccess();
      toast.success('End of Day PDF Report exported successfully!');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to generate PDF.');
    } finally {
      setIsExportingPDF(false);
    }
  };

  // Thermal Slip Print
  const handlePrintZReport = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/75 backdrop-blur-xs overflow-y-auto">
      <div className="w-full max-w-5xl bg-white dark:bg-[#181512] border border-[#e6dfd5] dark:border-[#382f27] rounded-3xl shadow-2xl flex flex-col max-h-[94vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-[#26201b] dark:text-[#f5f1e8]">
        {/* ================= MODAL HEADER ================= */}
        <div className="p-4 sm:px-6 bg-gradient-to-r from-emerald-900 to-[#064e3b] text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center shrink-0 border border-white/20">
              <Calculator className="w-6 h-6 text-emerald-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black tracking-tight">
                  End of Day Report &amp; Cash Drawer Reconciliation
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-400/20 text-emerald-200 border border-emerald-400/30">
                  Z-Report
                </span>
              </div>
              <p className="text-xs text-emerald-100/80">
                Aggregates daily sales, expenses, and credit transactions to balance the cash drawer.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={refreshReport}
              className="p-2 text-emerald-200 hover:text-white hover:bg-white/10 rounded-xl transition cursor-pointer"
              title="Refresh Figures"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-emerald-200 hover:text-white hover:bg-white/10 rounded-xl transition cursor-pointer"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ================= CONTROLS & DATE SELECTOR ================= */}
        <div className="p-3 sm:px-6 bg-stone-50 dark:bg-[#1f1b17] border-b border-[#e6dfd5] dark:border-[#382f27] flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 bg-white dark:bg-[#2a241f] border border-[#e6dfd5] dark:border-[#382f27] rounded-xl px-3 py-1.5 shadow-2xs">
              <Calendar className="w-4 h-4 text-[#064e3b] dark:text-emerald-400" />
              <label htmlFor="eod-date-input" className="font-semibold text-stone-500">Date:</label>
              <input
                id="eod-date-input"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent font-bold text-stone-900 dark:text-stone-100 focus:outline-hidden cursor-pointer"
              />
            </div>

            {dayShifts.length > 0 && (
              <div className="flex items-center gap-1.5 bg-white dark:bg-[#2a241f] border border-[#e6dfd5] dark:border-[#382f27] rounded-xl px-3 py-1.5 shadow-2xs">
                <Clock className="w-4 h-4 text-[#064e3b] dark:text-emerald-400" />
                <label htmlFor="eod-shift-select" className="font-semibold text-stone-500">Shift:</label>
                <select
                  id="eod-shift-select"
                  value={selectedShiftId}
                  onChange={(e) => setSelectedShiftId(e.target.value)}
                  className="bg-transparent font-bold text-stone-900 dark:text-stone-100 focus:outline-hidden cursor-pointer"
                >
                  <option value="all">Full Day Aggregate (All Shifts)</option>
                  {dayShifts.map((s) => (
                    <option key={s.id} value={s.id}>
                      Shift #{s.shiftNumber} ({s.cashierName}) — {s.status}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1 bg-stone-200/60 dark:bg-stone-800/60 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab('reconciliation')}
              className={`px-3 py-1 rounded-lg font-bold text-xs transition cursor-pointer ${
                activeTab === 'reconciliation'
                  ? 'bg-white dark:bg-[#2a241f] text-[#064e3b] dark:text-emerald-400 shadow-xs'
                  : 'text-stone-600 dark:text-stone-400 hover:text-stone-900'
              }`}
            >
              Cash Drawer Audit
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('tenders')}
              className={`px-3 py-1 rounded-lg font-bold text-xs transition cursor-pointer ${
                activeTab === 'tenders'
                  ? 'bg-white dark:bg-[#2a241f] text-[#064e3b] dark:text-emerald-400 shadow-xs'
                  : 'text-stone-600 dark:text-stone-400 hover:text-stone-900'
              }`}
            >
              Tenders Breakdown
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('expenses')}
              className={`px-3 py-1 rounded-lg font-bold text-xs transition cursor-pointer ${
                activeTab === 'expenses'
                  ? 'bg-white dark:bg-[#2a241f] text-[#064e3b] dark:text-emerald-400 shadow-xs'
                  : 'text-stone-600 dark:text-stone-400 hover:text-stone-900'
              }`}
            >
              Expenses ({report.expenses.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('credit')}
              className={`px-3 py-1 rounded-lg font-bold text-xs transition cursor-pointer ${
                activeTab === 'credit'
                  ? 'bg-white dark:bg-[#2a241f] text-[#064e3b] dark:text-emerald-400 shadow-xs'
                  : 'text-stone-600 dark:text-stone-400 hover:text-stone-900'
              }`}
            >
              Credit ({report.creditTransactions.length})
            </button>
          </div>
        </div>

        {/* ================= 4 KPI SUMMARY CARDS ================= */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 sm:px-6 bg-white dark:bg-[#181512] border-b border-[#e6dfd5] dark:border-[#382f27] shrink-0">
          {/* 1. Gross Sales */}
          <div className="p-3 bg-stone-50 dark:bg-[#201c18] border border-[#e6dfd5] dark:border-[#382f27] rounded-2xl flex flex-col justify-between">
            <div className="flex items-center justify-between text-stone-500 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Gross Sales</span>
              <Receipt className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-lg font-black text-stone-900 dark:text-white">
              {report.grandTotalSales.toFixed(2)}{' '}
              <span className="text-xs font-semibold text-stone-500">{currency}</span>
            </div>
            <div className="text-[10px] text-stone-500 font-medium mt-1">
              {report.completedSalesCount} orders • {report.itemsSoldCount} items sold
            </div>
          </div>

          {/* 2. Cash Inflows */}
          <div className="p-3 bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 rounded-2xl flex flex-col justify-between">
            <div className="flex items-center justify-between text-emerald-800 dark:text-emerald-300 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Cash Inflows</span>
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-lg font-black text-emerald-950 dark:text-emerald-100">
              +{(report.cashSales + report.creditRepaymentsCash).toFixed(2)}{' '}
              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">{currency}</span>
            </div>
            <div className="text-[10px] text-emerald-700 dark:text-emerald-300 font-medium mt-1">
              Sales: {report.cashSales.toFixed(0)} | Debt Coll: {report.creditRepaymentsCash.toFixed(0)}
            </div>
          </div>

          {/* 3. Cash Outflows */}
          <div className="p-3 bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/40 rounded-2xl flex flex-col justify-between">
            <div className="flex items-center justify-between text-rose-800 dark:text-rose-300 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Cash Outflows</span>
              <TrendingDown className="w-4 h-4 text-rose-600" />
            </div>
            <div className="text-lg font-black text-rose-950 dark:text-rose-100">
              -{(report.cashDrawerExpenses + report.refundsCash + report.cashDrops).toFixed(2)}{' '}
              <span className="text-xs font-semibold text-rose-700 dark:text-rose-300">{currency}</span>
            </div>
            <div className="text-[10px] text-rose-700 dark:text-rose-300 font-medium mt-1">
              Expenses: {report.cashDrawerExpenses.toFixed(0)} | Returns: {report.refundsCash.toFixed(0)}
            </div>
          </div>

          {/* 4. Expected Drawer Cash */}
          <div className="p-3 bg-gradient-to-br from-emerald-800 to-[#064e3b] text-white rounded-2xl shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between text-emerald-200 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Expected in Drawer</span>
              <Wallet className="w-4 h-4 text-emerald-300" />
            </div>
            <div className="text-lg font-black text-white">
              {report.expectedCash.toFixed(2)}{' '}
              <span className="text-xs font-semibold text-emerald-200">{currency}</span>
            </div>
            <div className="text-[10px] text-emerald-200/90 font-medium mt-1">
              Float: {report.openingFloat.toFixed(0)} + Net Cash
            </div>
          </div>
        </div>

        {/* ================= MAIN CONTENT BODY ================= */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-6">
          {activeTab === 'reconciliation' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* LEFT COLUMN: System Expected Cash Math (7 Cols) */}
              <div className="lg:col-span-7 bg-white dark:bg-[#1f1b17] border border-[#e6dfd5] dark:border-[#382f27] rounded-3xl p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-[#e6dfd5] dark:border-[#382f27] pb-3">
                  <h4 className="font-black text-sm text-stone-900 dark:text-stone-100 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-[#064e3b] dark:text-emerald-400" />
                    <span>System Cash Drawer Calculation Ledger</span>
                  </h4>
                  <span className="text-[11px] text-stone-500 font-mono">
                    Shift {report.shiftNumber ? `#${report.shiftNumber}` : 'General'}
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  {/* Opening Float */}
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-stone-50 dark:bg-[#26201b]">
                    <span className="font-semibold text-stone-600 dark:text-stone-300">
                      1. Starting Drawer Float (Opening Cash)
                    </span>
                    <span className="font-mono font-bold text-stone-900 dark:text-stone-100">
                      {report.openingFloat.toFixed(2)} {currency}
                    </span>
                  </div>

                  {/* Cash Sales */}
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-900 dark:text-emerald-200">
                    <span className="font-semibold flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                      <span>(+) Cash Collected from Completed Sales</span>
                    </span>
                    <span className="font-mono font-bold">
                      +{report.cashSales.toFixed(2)} {currency}
                    </span>
                  </div>

                  {/* Credit Debt Repayments in Cash */}
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-900 dark:text-emerald-200">
                    <span className="font-semibold flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                      <span>(+) Customer Debt Repayments Collected in Cash</span>
                    </span>
                    <span className="font-mono font-bold">
                      +{report.creditRepaymentsCash.toFixed(2)} {currency}
                    </span>
                  </div>

                  {/* Float Additions */}
                  {report.cashAdditions > 0 && (
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-900 dark:text-emerald-200">
                      <span className="font-semibold">
                        (+) Float Additions during Shift
                      </span>
                      <span className="font-mono font-bold">
                        +{report.cashAdditions.toFixed(2)} {currency}
                      </span>
                    </div>
                  )}

                  {/* Cash Drawer Expense Payouts */}
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 text-rose-900 dark:text-rose-200">
                    <span className="font-semibold flex items-center gap-1.5">
                      <TrendingDown className="w-3.5 h-3.5 text-rose-600" />
                      <span>(-) Cash Drawer Expense Payouts (Petty Cash)</span>
                    </span>
                    <span className="font-mono font-bold">
                      -{report.cashDrawerExpenses.toFixed(2)} {currency}
                    </span>
                  </div>

                  {/* Cash Refunds Issued */}
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 text-rose-900 dark:text-rose-200">
                    <span className="font-semibold flex items-center gap-1.5">
                      <TrendingDown className="w-3.5 h-3.5 text-rose-600" />
                      <span>(-) Customer Cash Refunds Given</span>
                    </span>
                    <span className="font-mono font-bold">
                      -{report.refundsCash.toFixed(2)} {currency}
                    </span>
                  </div>

                  {/* Cash Drops to Safe */}
                  {report.cashDrops > 0 && (
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 text-rose-900 dark:text-rose-200">
                      <span className="font-semibold">
                        (-) Cash Drops Deposited to Safe
                      </span>
                      <span className="font-mono font-bold">
                        -{report.cashDrops.toFixed(2)} {currency}
                      </span>
                    </div>
                  )}

                  {/* Total Expected Divider */}
                  <div className="p-3.5 rounded-2xl bg-[#064e3b] text-white flex items-center justify-between shadow-sm mt-3">
                    <div>
                      <div className="text-[11px] uppercase font-bold text-emerald-200">
                        System Expected Total Cash
                      </div>
                      <div className="text-[10px] text-emerald-100/80">
                        Should match physical count in till
                      </div>
                    </div>
                    <div className="text-xl font-black font-mono">
                      {report.expectedCash.toFixed(2)} {currency}
                    </div>
                  </div>
                </div>
              </div>

              {/* RIGHT COLUMN: Physical Cash Count & Variance (5 Cols) */}
              <div className="lg:col-span-5 bg-white dark:bg-[#1f1b17] border border-[#e6dfd5] dark:border-[#382f27] rounded-3xl p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-[#e6dfd5] dark:border-[#382f27] pb-3">
                  <h4 className="font-black text-sm text-stone-900 dark:text-stone-100 flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-[#064e3b] dark:text-emerald-400" />
                    <span>Physical Cash Till Count</span>
                  </h4>

                  {/* Count Mode Toggle */}
                  <div className="flex items-center gap-1 bg-stone-100 dark:bg-stone-800 p-0.5 rounded-lg text-[10px]">
                    <button
                      type="button"
                      onClick={() => setCountMode('direct')}
                      className={`px-2 py-1 rounded font-bold cursor-pointer ${
                        countMode === 'direct'
                          ? 'bg-white dark:bg-[#2a241f] text-stone-900 dark:text-white shadow-2xs'
                          : 'text-stone-500'
                      }`}
                    >
                      Total
                    </button>
                    <button
                      type="button"
                      onClick={() => setCountMode('denominations')}
                      className={`px-2 py-1 rounded font-bold cursor-pointer ${
                        countMode === 'denominations'
                          ? 'bg-white dark:bg-[#2a241f] text-stone-900 dark:text-white shadow-2xs'
                          : 'text-stone-500'
                      }`}
                    >
                      Denominations
                    </button>
                  </div>
                </div>

                {/* Direct Total Input */}
                {countMode === 'direct' ? (
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-stone-700 dark:text-stone-300">
                      Enter Total Counted Cash in Till:
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={directActualCash}
                        onChange={(e) => setDirectActualCash(e.target.value)}
                        className="w-full text-2xl font-black font-mono p-3 bg-stone-50 dark:bg-[#2a241f] border-2 border-stone-200 dark:border-stone-700 rounded-2xl focus:border-[#064e3b] focus:outline-hidden pr-16"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-stone-400">
                        {currency}
                      </span>
                    </div>
                  </div>
                ) : (
                  /* Currency Denomination Calculator */
                  <div className="space-y-2">
                    <span className="text-[11px] font-bold text-stone-500 block mb-1">
                      Banknote &amp; Coin Counts:
                    </span>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="flex items-center gap-2 p-1.5 bg-stone-50 dark:bg-[#26201b] rounded-xl border border-stone-200/60 dark:border-stone-800">
                        <span className="font-bold text-stone-700 dark:text-stone-300 w-12 text-center">200 Br</span>
                        <input
                          type="number"
                          min="0"
                          value={denom200 || ''}
                          onChange={(e) => setDenom200(parseInt(e.target.value) || 0)}
                          placeholder="0"
                          className="w-full bg-white dark:bg-[#1a1714] border border-stone-200 dark:border-stone-700 rounded-lg p-1 text-center font-bold font-mono"
                        />
                      </div>

                      <div className="flex items-center gap-2 p-1.5 bg-stone-50 dark:bg-[#26201b] rounded-xl border border-stone-200/60 dark:border-stone-800">
                        <span className="font-bold text-stone-700 dark:text-stone-300 w-12 text-center">100 Br</span>
                        <input
                          type="number"
                          min="0"
                          value={denom100 || ''}
                          onChange={(e) => setDenom100(parseInt(e.target.value) || 0)}
                          placeholder="0"
                          className="w-full bg-white dark:bg-[#1a1714] border border-stone-200 dark:border-stone-700 rounded-lg p-1 text-center font-bold font-mono"
                        />
                      </div>

                      <div className="flex items-center gap-2 p-1.5 bg-stone-50 dark:bg-[#26201b] rounded-xl border border-stone-200/60 dark:border-stone-800">
                        <span className="font-bold text-stone-700 dark:text-stone-300 w-12 text-center">50 Br</span>
                        <input
                          type="number"
                          min="0"
                          value={denom50 || ''}
                          onChange={(e) => setDenom50(parseInt(e.target.value) || 0)}
                          placeholder="0"
                          className="w-full bg-white dark:bg-[#1a1714] border border-stone-200 dark:border-stone-700 rounded-lg p-1 text-center font-bold font-mono"
                        />
                      </div>

                      <div className="flex items-center gap-2 p-1.5 bg-stone-50 dark:bg-[#26201b] rounded-xl border border-stone-200/60 dark:border-stone-800">
                        <span className="font-bold text-stone-700 dark:text-stone-300 w-12 text-center">10 Br</span>
                        <input
                          type="number"
                          min="0"
                          value={denom10 || ''}
                          onChange={(e) => setDenom10(parseInt(e.target.value) || 0)}
                          placeholder="0"
                          className="w-full bg-white dark:bg-[#1a1714] border border-stone-200 dark:border-stone-700 rounded-lg p-1 text-center font-bold font-mono"
                        />
                      </div>

                      <div className="flex items-center gap-2 p-1.5 bg-stone-50 dark:bg-[#26201b] rounded-xl border border-stone-200/60 dark:border-stone-800">
                        <span className="font-bold text-stone-700 dark:text-stone-300 w-12 text-center">5 Br</span>
                        <input
                          type="number"
                          min="0"
                          value={denom5 || ''}
                          onChange={(e) => setDenom5(parseInt(e.target.value) || 0)}
                          placeholder="0"
                          className="w-full bg-white dark:bg-[#1a1714] border border-stone-200 dark:border-stone-700 rounded-lg p-1 text-center font-bold font-mono"
                        />
                      </div>

                      <div className="flex items-center gap-2 p-1.5 bg-stone-50 dark:bg-[#26201b] rounded-xl border border-stone-200/60 dark:border-stone-800">
                        <span className="font-bold text-stone-700 dark:text-stone-300 w-12 text-center">Coins</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={denomCoins || ''}
                          onChange={(e) => setDenomCoins(parseFloat(e.target.value) || 0)}
                          placeholder="0.00"
                          className="w-full bg-white dark:bg-[#1a1714] border border-stone-200 dark:border-stone-700 rounded-lg p-1 text-center font-bold font-mono"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-2.5 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl border border-emerald-200 dark:border-emerald-800">
                      <span className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                        Calculated Denomination Total:
                      </span>
                      <span className="text-sm font-black font-mono text-emerald-950 dark:text-white">
                        {denomTotal.toFixed(2)} {currency}
                      </span>
                    </div>
                  </div>
                )}

                {/* REAL-TIME VARIANCE CARD */}
                <div
                  className={`p-4 rounded-2xl border transition-all ${
                    !hasEnteredActual
                      ? 'bg-stone-50 dark:bg-[#26201b] border-stone-200 dark:border-stone-800 text-stone-500'
                      : Math.abs(calculatedVariance) < 0.01
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700 text-emerald-950 dark:text-emerald-200'
                      : calculatedVariance > 0
                      ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-700 text-blue-950 dark:text-blue-200'
                      : 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-700 text-rose-950 dark:text-rose-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {!hasEnteredActual ? (
                        <Clock className="w-5 h-5 text-stone-400" />
                      ) : Math.abs(calculatedVariance) < 0.01 ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      ) : calculatedVariance > 0 ? (
                        <TrendingUp className="w-5 h-5 text-blue-600" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-rose-600" />
                      )}
                      <div>
                        <div className="text-xs font-black uppercase tracking-wider">
                          {!hasEnteredActual
                            ? 'Awaiting Physical Cash Count'
                            : Math.abs(calculatedVariance) < 0.01
                            ? 'Drawer Balanced (Exact Match)'
                            : calculatedVariance > 0
                            ? 'Cash Drawer Overage'
                            : 'Cash Drawer Shortage'}
                        </div>
                        <div className="text-[11px] opacity-80">
                          Actual ({effectiveActualCash.toFixed(2)}) - Expected ({report.expectedCash.toFixed(2)})
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-xl font-black font-mono">
                        {hasEnteredActual ? `${calculatedVariance >= 0 ? '+' : ''}${calculatedVariance.toFixed(2)}` : '0.00'}{' '}
                        <span className="text-xs">{currency}</span>
                      </div>
                    </div>
                  </div>

                  {/* Variance Reason Input if not balanced */}
                  {hasEnteredActual && Math.abs(calculatedVariance) >= 0.01 && (
                    <div className="mt-3 pt-3 border-t border-current/20 space-y-1.5 animate-in fade-in">
                      <label className="block text-[11px] font-bold">
                        Variance Explanation / Justification Note: *
                      </label>
                      <input
                        type="text"
                        required
                        value={varianceReason}
                        onChange={(e) => setVarianceReason(e.target.value)}
                        placeholder="e.g. Unrecorded customer change coin shortage or petty purchase"
                        className="w-full bg-white dark:bg-[#1a1714] border border-current/30 rounded-xl p-2 text-xs focus:outline-hidden"
                      />
                    </div>
                  )}
                </div>

                {/* Settle Action Button */}
                <button
                  type="button"
                  disabled={!hasEnteredActual || isSettling}
                  onClick={handleConfirmReconciliation}
                  className="w-full py-3 bg-[#064e3b] hover:bg-[#043b2c] disabled:opacity-50 text-white rounded-2xl font-black text-xs transition shadow-md flex items-center justify-center gap-2 cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4 text-emerald-300" />
                  <span>
                    {isSettling ? 'Recording Reconciliation...' : 'Confirm & Save Shift Reconciliation'}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: TENDERS BREAKDOWN */}
          {activeTab === 'tenders' && (
            <div className="bg-white dark:bg-[#1f1b17] border border-[#e6dfd5] dark:border-[#382f27] rounded-3xl p-5 shadow-xs space-y-4">
              <h4 className="font-black text-sm text-stone-900 dark:text-stone-100 flex items-center gap-2 border-b border-[#e6dfd5] dark:border-[#382f27] pb-3">
                <Receipt className="w-4 h-4 text-[#064e3b] dark:text-emerald-400" />
                <span>Sales Revenue by Payment Tender</span>
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-stone-50 dark:bg-[#26201b] rounded-2xl border border-stone-200/60 dark:border-stone-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-stone-700 dark:text-stone-300 flex items-center gap-2">
                      <Wallet className="w-4 h-4 text-emerald-600" /> Cash Tender
                    </span>
                    <span className="font-mono font-bold text-sm">
                      {report.cashSales.toFixed(2)} {currency}
                    </span>
                  </div>
                  <div className="w-full bg-stone-200 dark:bg-stone-800 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-emerald-600 h-full rounded-full"
                      style={{ width: `${(report.cashSales / (report.grandTotalSales || 1)) * 100}%` }}
                    />
                  </div>
                  <div className="text-[11px] text-stone-500 flex justify-between">
                    <span>Physical Cash Till</span>
                    <span>{((report.cashSales / (report.grandTotalSales || 1)) * 100).toFixed(1)}% of total</span>
                  </div>
                </div>

                <div className="p-4 bg-stone-50 dark:bg-[#26201b] rounded-2xl border border-stone-200/60 dark:border-stone-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-stone-700 dark:text-stone-300 flex items-center gap-2">
                      <Smartphone className="w-4 h-4 text-blue-600" /> Mobile Transfer (Telebirr / CBE / M-Pesa)
                    </span>
                    <span className="font-mono font-bold text-sm">
                      {report.mobileSales.toFixed(2)} {currency}
                    </span>
                  </div>
                  <div className="w-full bg-stone-200 dark:bg-stone-800 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-blue-600 h-full rounded-full"
                      style={{ width: `${(report.mobileSales / (report.grandTotalSales || 1)) * 100}%` }}
                    />
                  </div>
                  <div className="text-[11px] text-stone-500 flex justify-between">
                    <span>Direct Bank &amp; Wallet</span>
                    <span>{((report.mobileSales / (report.grandTotalSales || 1)) * 100).toFixed(1)}% of total</span>
                  </div>
                </div>

                <div className="p-4 bg-stone-50 dark:bg-[#26201b] rounded-2xl border border-stone-200/60 dark:border-stone-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-stone-700 dark:text-stone-300 flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-purple-600" /> POS Card Payment
                    </span>
                    <span className="font-mono font-bold text-sm">
                      {report.cardSales.toFixed(2)} {currency}
                    </span>
                  </div>
                  <div className="w-full bg-stone-200 dark:bg-stone-800 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-purple-600 h-full rounded-full"
                      style={{ width: `${(report.cardSales / (report.grandTotalSales || 1)) * 100}%` }}
                    />
                  </div>
                  <div className="text-[11px] text-stone-500 flex justify-between">
                    <span>Debit / Credit Terminal</span>
                    <span>{((report.cardSales / (report.grandTotalSales || 1)) * 100).toFixed(1)}% of total</span>
                  </div>
                </div>

                <div className="p-4 bg-stone-50 dark:bg-[#26201b] rounded-2xl border border-stone-200/60 dark:border-stone-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-stone-700 dark:text-stone-300 flex items-center gap-2">
                      <User className="w-4 h-4 text-amber-600" /> Customer Store Credit Tab
                    </span>
                    <span className="font-mono font-bold text-sm">
                      {report.creditSales.toFixed(2)} {currency}
                    </span>
                  </div>
                  <div className="w-full bg-stone-200 dark:bg-stone-800 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-amber-600 h-full rounded-full"
                      style={{ width: `${(report.creditSales / (report.grandTotalSales || 1)) * 100}%` }}
                    />
                  </div>
                  <div className="text-[11px] text-stone-500 flex justify-between">
                    <span>Receivables / Unpaid Debt</span>
                    <span>{((report.creditSales / (report.grandTotalSales || 1)) * 100).toFixed(1)}% of total</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: EXPENSES LIST */}
          {activeTab === 'expenses' && (
            <div className="bg-white dark:bg-[#1f1b17] border border-[#e6dfd5] dark:border-[#382f27] rounded-3xl p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-[#e6dfd5] dark:border-[#382f27] pb-3">
                <h4 className="font-black text-sm text-stone-900 dark:text-stone-100 flex items-center gap-2">
                  <TrendingDown className="w-4 h-4 text-rose-600" />
                  <span>Itemized Store Expenses &amp; Drawer Payouts</span>
                </h4>
                <div className="text-xs font-bold text-rose-700 dark:text-rose-300">
                  Total: {report.totalExpenses.toFixed(2)} {currency} (Drawer: {report.cashDrawerExpenses.toFixed(2)} {currency})
                </div>
              </div>

              {report.expenses.length === 0 ? (
                <div className="p-8 text-center text-xs text-stone-400">
                  No store expenses logged for {selectedDate}.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="border-b border-stone-200 dark:border-stone-800 text-stone-500 text-[10px] uppercase font-bold">
                        <th className="py-2 px-3">Time</th>
                        <th className="py-2 px-3">Category</th>
                        <th className="py-2 px-3">Description</th>
                        <th className="py-2 px-3">Source</th>
                        <th className="py-2 px-3">Staff</th>
                        <th className="py-2 px-3 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100 dark:divide-stone-800 font-medium">
                      {report.expenses.map((e) => (
                        <tr key={e.id}>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-stone-500">
                            {new Date(e.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="py-2.5 px-3 font-bold text-stone-800 dark:text-stone-200">
                            {e.category}
                          </td>
                          <td className="py-2.5 px-3 text-stone-600 dark:text-stone-400">
                            {e.description}
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                e.paidWith === 'cash_drawer'
                                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                                  : 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300'
                              }`}
                            >
                              {e.paidWith.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-stone-500">
                            {e.paidBy}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-600">
                            -{e.amount.toFixed(2)} {currency}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: CREDIT & DEBT REPAYMENTS */}
          {activeTab === 'credit' && (
            <div className="bg-white dark:bg-[#1f1b17] border border-[#e6dfd5] dark:border-[#382f27] rounded-3xl p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-[#e6dfd5] dark:border-[#382f27] pb-3">
                <h4 className="font-black text-sm text-stone-900 dark:text-stone-100 flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-amber-600" />
                  <span>Customer Store Credit &amp; Debt Settlements</span>
                </h4>
                <div className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                  Repayments In Till: +{report.creditRepaymentsCash.toFixed(2)} {currency}
                </div>
              </div>

              {report.creditTransactions.length === 0 ? (
                <div className="p-8 text-center text-xs text-stone-400">
                  No credit charges or debt settlement transactions on {selectedDate}.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="border-b border-stone-200 dark:border-stone-800 text-stone-500 text-[10px] uppercase font-bold">
                        <th className="py-2 px-3">Time</th>
                        <th className="py-2 px-3">Type</th>
                        <th className="py-2 px-3">Amount</th>
                        <th className="py-2 px-3">Payment Tender</th>
                        <th className="py-2 px-3">Staff Operator</th>
                        <th className="py-2 px-3">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100 dark:divide-stone-800 font-medium">
                      {report.creditTransactions.map((tx) => (
                        <tr key={tx.id}>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-stone-500">
                            {new Date(tx.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                tx.type === 'PAYMENT'
                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                  : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                              }`}
                            >
                              {tx.type}
                            </span>
                          </td>
                          <td className={`py-2.5 px-3 font-mono font-bold ${tx.type === 'PAYMENT' ? 'text-emerald-600' : 'text-amber-600'}`}>
                            {tx.type === 'PAYMENT' ? '+' : '-'}{tx.amount.toFixed(2)} {currency}
                          </td>
                          <td className="py-2.5 px-3 uppercase text-[10px] font-bold text-stone-500">
                            {tx.paymentMethod || 'Credit Tab'}
                          </td>
                          <td className="py-2.5 px-3 text-stone-500">
                            {tx.staffName}
                          </td>
                          <td className="py-2.5 px-3 text-stone-500 truncate max-w-[200px]">
                            {tx.notes || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ================= MODAL FOOTER ACTIONS ================= */}
        <div className="p-3 sm:px-6 bg-stone-50 dark:bg-[#1a1714] border-t border-[#e6dfd5] dark:border-[#382f27] flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-stone-500 font-mono">
            Report Timestamp: {new Date(report.generatedAt).toLocaleTimeString()} • Verified by {currentStaff.name}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrintZReport}
              className="px-3.5 py-2 rounded-xl border border-stone-300 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-stone-500" />
              <span>Print Z-Slip</span>
            </button>

            <button
              type="button"
              disabled={isExportingPDF}
              onClick={handleExportPDF}
              className="px-4 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 dark:bg-stone-100 dark:hover:bg-white text-white dark:text-stone-900 text-xs font-black transition flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
            >
              <FileDown className="w-3.5 h-3.5 text-emerald-400 dark:text-emerald-600" />
              <span>{isExportingPDF ? 'Exporting PDF...' : 'Export A4 Audit PDF'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 text-xs font-bold transition cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
