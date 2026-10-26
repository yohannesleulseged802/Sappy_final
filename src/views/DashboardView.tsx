import React, {useMemo} from 'react';
import {
  TrendingUp,
  ShoppingCart,
  Package,
  AlertTriangle,
  CreditCard,
  DollarSign,
  Smartphone,
  BookmarkCheck,
  ArrowUpRight,
  ShieldAlert,
  Users,
  QrCode,
  Sparkles,
  Calendar,
  ArrowRight,
} from 'lucide-react';
import {Product, Sale, StoreSettings, Staff, StoreExpense} from '../types';
import {storage} from '../services/storage';

interface DashboardViewProps {
  products: Product[];
  sales: Sale[];
  settings: StoreSettings;
  currentStaff: Staff;
  onNavigate: (section: any) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  products,
  sales,
  settings,
  currentStaff,
  onNavigate,
}) => {
  const expenses = storage.getExpenses();
  const customers = storage.getCustomers();
  const heldOrders = storage.getHeldOrders();
  const syncQueue = storage.getSyncQueue();

  // Metrics Calculations
  const metrics = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    // Sales time windows
    const todaySales = sales.filter((s) => s.date.startsWith(todayStr) && s.status === 'COMPLETED');
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    const weeklySales = sales.filter((s) => new Date(s.date) >= weekAgo && s.status === 'COMPLETED');
    const monthAgo = new Date(now.getTime() - 30 * 86400000);
    const monthlySales = sales.filter((s) => new Date(s.date) >= monthAgo && s.status === 'COMPLETED');

    const todayTotal = todaySales.reduce((sum, s) => sum + s.grandTotal, 0);
    const weeklyTotal = weeklySales.reduce((sum, s) => sum + s.grandTotal, 0);
    const monthlyTotal = monthlySales.reduce((sum, s) => sum + s.grandTotal, 0);

    const avgTicket = todaySales.length > 0 ? todayTotal / todaySales.length : 0;

    // Inventory metrics
    const totalProducts = products.length;
    const totalStock = products.reduce((sum, p) => sum + (p.category === 'Print Services' ? 0 : p.currentStock), 0);
    const lowStock = products.filter((p) => p.currentStock > 0 && p.currentStock <= p.minStockThreshold);
    const outOfStock = products.filter((p) => p.currentStock <= 0 && p.category !== 'Print Services');

    // Payment breakdown
    let cashSalesTotal = 0;
    let cardSalesTotal = 0;
    let mobileSalesTotal = 0;
    let creditSalesTotal = 0;

    todaySales.forEach((s) => {
      s.payments.forEach((p) => {
        if (p.method === 'cash') cashSalesTotal += p.amount;
        else if (p.method === 'card') cardSalesTotal += p.amount;
        else if (p.method === 'mobile_transfer') mobileSalesTotal += p.amount;
        else if (p.method === 'credit') creditSalesTotal += p.amount;
      });
    });

    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

    // Estimated Gross Profit
    let todayCogs = 0;
    todaySales.forEach((s) => {
      s.items.forEach((item) => {
        todayCogs += item.costPrice * item.quantity;
      });
    });
    const estimatedGrossProfit = Math.max(0, todayTotal - todayCogs);

    // Pending store credit across all customer accounts
    const totalPendingCredit = customers.reduce((sum, c) => sum + (c.currentBalance || 0), 0);
    const customersWithCreditCount = customers.filter((c) => (c.currentBalance || 0) > 0).length;

    const todayFormatted = now.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });

    return {
      todayTotal,
      weeklyTotal,
      monthlyTotal,
      todayTxCount: todaySales.length,
      avgTicket,
      totalProducts,
      totalStock,
      lowStockCount: lowStock.length,
      outOfStockCount: outOfStock.length,
      cashSalesTotal,
      cardSalesTotal,
      mobileSalesTotal,
      creditSalesTotal,
      totalExpenses,
      estimatedGrossProfit,
      totalPendingCredit,
      customersWithCreditCount,
      todayFormatted,
    };
  }, [sales, products, expenses, customers]);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto touch-scroll overscroll-contain p-4 sm:p-6 pb-24 md:pb-6 bg-[#fdfbf7] dark:bg-[#12100e] space-y-6">
      {/* Top Banner: Quick Operations & Records Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-gradient-to-r from-[#064e3b] to-[#043b2c] text-white shadow-md">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase font-extrabold tracking-wider text-[#6ee7b7]">
              Sappy Stationary Operations
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500 text-white">
              INTERNAL RECORDS READY
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black mt-1">
            Welcome, {currentStaff.name.split(' ')[0]}
          </h2>
          <p className="text-xs text-stone-200 opacity-90 mt-0.5">
            Internal records system is operating in offline-first mode. All local transactions are safeguarded.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onNavigate('pos')}
            className="px-4 py-2 bg-[#6ee7b7] text-[#064e3b] hover:bg-emerald-300 font-extrabold text-xs rounded-xl shadow-sm transition flex items-center gap-1.5 cursor-pointer"
          >
            <ShoppingCart className="w-4 h-4" />
            <span>Record Sales</span>
          </button>

          <button
            onClick={() => onNavigate('barcode_studio')}
            className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl transition flex items-center gap-1"
          >
            <QrCode className="w-4 h-4" />
            <span className="hidden sm:inline">Label Studio</span>
          </button>
        </div>
      </div>

      {/* ================= DAILY HIGHLIGHTS SPOTLIGHT CARD ================= */}
      <div className="rounded-2xl bg-white dark:bg-[#1c1815] border border-[#e6dfd5] dark:border-[#362e26] shadow-sm overflow-hidden">
        {/* Card Header Strip */}
        <div className="p-3.5 sm:p-4 bg-[#fdfbf7] dark:bg-[#171412] border-b border-[#e6dfd5] dark:border-[#362e26] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-900/60 flex items-center justify-center text-[#064e3b] dark:text-[#6ee7b7] shadow-2xs">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-sm sm:text-base text-stone-900 dark:text-stone-100 tracking-tight">
                  Daily Highlights
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 dark:bg-emerald-950 text-[#064e3b] dark:text-[#6ee7b7] border border-emerald-200 dark:border-emerald-800">
                  Quick Overview
                </span>
              </div>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                Key daily overview of revenue, store credit, and inventory reorder status
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#f5f1e8] dark:bg-[#25201b] border border-[#e6dfd5] dark:border-[#362e26] text-xs font-bold text-stone-600 dark:text-stone-300 font-mono">
              <Calendar className="w-3.5 h-3.5 text-[#064e3b] dark:text-[#6ee7b7]" />
              <span>{metrics.todayFormatted}</span>
            </span>
          </div>
        </div>

        {/* 3 Metric Spotlight Columns */}
        <div className="p-3.5 sm:p-5 grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 bg-gradient-to-b from-transparent to-[#fbf9f4]/40 dark:to-[#171412]/20">
          {/* Highlight 1: Total Sales */}
          <div
            onClick={() => onNavigate('sales')}
            className="group relative p-4 rounded-xl bg-white dark:bg-[#1c1815] border border-emerald-100 dark:border-emerald-950/70 hover:border-emerald-400 dark:hover:border-emerald-700/80 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Total Sales
                </span>
                <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-200 dark:border-emerald-800 text-[#064e3b] dark:text-[#6ee7b7] flex items-center justify-center transition group-hover:scale-105">
                  <TrendingUp className="w-4 h-4" />
                </div>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl sm:text-3xl font-black font-mono-numbers text-[#064e3b] dark:text-[#6ee7b7]">
                  {metrics.todayTotal.toFixed(2)}
                </span>
                <span className="text-xs font-bold text-stone-400">{settings.currency}</span>
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-stone-100 dark:border-stone-800/80 flex items-center justify-between text-xs text-stone-500 dark:text-stone-400">
              <span className="font-medium">
                {metrics.todayTxCount} sale{metrics.todayTxCount === 1 ? '' : 's'} recorded today
              </span>
              <span className="text-[#064e3b] dark:text-[#6ee7b7] font-bold flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform">
                <span>Ledger</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </div>
          </div>

          {/* Highlight 2: Pending Store Credit */}
          <div
            onClick={() => onNavigate('credit')}
            className="group relative p-4 rounded-xl bg-white dark:bg-[#1c1815] border border-amber-100 dark:border-amber-950/70 hover:border-amber-400 dark:hover:border-amber-700/80 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Pending Credit
                </span>
                <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950/80 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 flex items-center justify-center transition group-hover:scale-105">
                  <CreditCard className="w-4 h-4" />
                </div>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl sm:text-3xl font-black font-mono-numbers text-amber-600 dark:text-amber-400">
                  {metrics.totalPendingCredit.toFixed(2)}
                </span>
                <span className="text-xs font-bold text-stone-400">{settings.currency}</span>
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-stone-100 dark:border-stone-800/80 flex items-center justify-between text-xs text-stone-500 dark:text-stone-400">
              <span className="font-medium">
                {metrics.customersWithCreditCount} customer account{metrics.customersWithCreditCount === 1 ? '' : 's'} with balance
              </span>
              <span className="text-amber-700 dark:text-amber-400 font-bold flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform">
                <span>Accounts</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </div>
          </div>

          {/* Highlight 3: Low-Stock Count */}
          <div
            onClick={() => onNavigate('inventory')}
            className="group relative p-4 rounded-xl bg-white dark:bg-[#1c1815] border border-rose-100 dark:border-rose-950/70 hover:border-rose-400 dark:hover:border-rose-700/80 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  Low-Stock Count
                </span>
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition group-hover:scale-105 border ${
                  metrics.lowStockCount > 0
                    ? 'bg-rose-50 dark:bg-rose-950/80 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400'
                    : 'bg-emerald-50 dark:bg-emerald-950/80 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
                }`}>
                  <AlertTriangle className="w-4 h-4" />
                </div>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className={`text-2xl sm:text-3xl font-black font-mono-numbers ${metrics.lowStockCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                  {metrics.lowStockCount}
                </span>
                <span className="text-xs font-bold text-stone-400">items</span>
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-stone-100 dark:border-stone-800/80 flex items-center justify-between text-xs text-stone-500 dark:text-stone-400">
              <span className="font-medium">
                {metrics.outOfStockCount > 0
                  ? `${metrics.outOfStockCount} out of stock`
                  : metrics.lowStockCount > 0
                  ? 'Items require restock'
                  : 'All items stocked'}
              </span>
              <span className="text-rose-700 dark:text-rose-400 font-bold flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform">
                <span>Inventory</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* --- Section 1: Sales Metrics Cards --- */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-3">
          Sales Performance
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* Today's Sales */}
          <div className="p-4 rounded-2xl bg-white dark:bg-[#1c1815] border border-[#e6dfd5] dark:border-[#362e26] shadow-xs">
            <div className="flex items-center justify-between text-stone-500 dark:text-stone-400 text-xs mb-1">
              <span>Today's Sales</span>
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-xl sm:text-2xl font-black font-mono-numbers text-stone-900 dark:text-stone-100">
              {metrics.todayTotal.toFixed(2)}
              <span className="text-xs font-normal text-stone-400 ml-1">{settings.currency}</span>
            </div>
            <div className="text-[11px] text-stone-400 mt-1 font-mono">
              {metrics.todayTxCount} transaction(s)
            </div>
          </div>

          {/* Weekly Sales */}
          <div className="p-4 rounded-2xl bg-white dark:bg-[#1c1815] border border-[#e6dfd5] dark:border-[#362e26] shadow-xs">
            <div className="flex items-center justify-between text-stone-500 dark:text-stone-400 text-xs mb-1">
              <span>Past 7 Days</span>
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-xl sm:text-2xl font-black font-mono-numbers text-stone-900 dark:text-stone-100">
              {metrics.weeklyTotal.toFixed(2)}
              <span className="text-xs font-normal text-stone-400 ml-1">{settings.currency}</span>
            </div>
            <div className="text-[11px] text-stone-400 mt-1">Rolling week</div>
          </div>

          {/* Monthly Sales */}
          <div className="p-4 rounded-2xl bg-white dark:bg-[#1c1815] border border-[#e6dfd5] dark:border-[#362e26] shadow-xs">
            <div className="flex items-center justify-between text-stone-500 dark:text-stone-400 text-xs mb-1">
              <span>Past 30 Days</span>
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-xl sm:text-2xl font-black font-mono-numbers text-stone-900 dark:text-stone-100">
              {metrics.monthlyTotal.toFixed(2)}
              <span className="text-xs font-normal text-stone-400 ml-1">{settings.currency}</span>
            </div>
            <div className="text-[11px] text-stone-400 mt-1">Monthly total</div>
          </div>

          {/* Average Ticket Value */}
          <div className="p-4 rounded-2xl bg-white dark:bg-[#1c1815] border border-[#e6dfd5] dark:border-[#362e26] shadow-xs">
            <div className="flex items-center justify-between text-stone-500 dark:text-stone-400 text-xs mb-1">
              <span>Average Ticket</span>
              <ShoppingCart className="w-4 h-4 text-blue-600" />
            </div>
            <div className="text-xl sm:text-2xl font-black font-mono-numbers text-stone-900 dark:text-stone-100">
              {metrics.avgTicket.toFixed(2)}
              <span className="text-xs font-normal text-stone-400 ml-1">{settings.currency}</span>
            </div>
            <div className="text-[11px] text-stone-400 mt-1">Per transaction avg</div>
          </div>
        </div>
      </div>

      {/* --- Section 2: Inventory Alerts & Operations --- */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-3">
          Inventory Status &amp; Alerts
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div
            onClick={() => onNavigate('inventory')}
            className="p-4 rounded-2xl bg-white dark:bg-[#1c1815] border border-[#e6dfd5] dark:border-[#362e26] shadow-xs cursor-pointer hover:border-[#064e3b] transition"
          >
            <div className="flex items-center justify-between text-stone-500 text-xs mb-1">
              <span>Total Catalog</span>
              <Package className="w-4 h-4 text-stone-400" />
            </div>
            <div className="text-xl sm:text-2xl font-black font-mono-numbers text-stone-900 dark:text-stone-100">
              {metrics.totalProducts}
            </div>
            <div className="text-[11px] text-stone-400 mt-1">
              {metrics.totalStock} units on shelf
            </div>
          </div>

          <div
            onClick={() => onNavigate('inventory')}
            className="p-4 rounded-2xl bg-white dark:bg-[#1c1815] border border-[#e6dfd5] dark:border-[#362e26] shadow-xs cursor-pointer hover:border-amber-500 transition"
          >
            <div className="flex items-center justify-between text-amber-700 dark:text-amber-400 text-xs mb-1 font-bold">
              <span>Low-Stock Alerts</span>
              <AlertTriangle className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-xl sm:text-2xl font-black font-mono-numbers text-amber-600 dark:text-amber-400">
              {metrics.lowStockCount}
            </div>
            <div className="text-[11px] text-stone-400 mt-1">Needs reordering</div>
          </div>

          <div
            onClick={() => onNavigate('inventory')}
            className="p-4 rounded-2xl bg-white dark:bg-[#1c1815] border border-[#e6dfd5] dark:border-[#362e26] shadow-xs cursor-pointer hover:border-rose-500 transition"
          >
            <div className="flex items-center justify-between text-rose-700 dark:text-rose-400 text-xs mb-1 font-bold">
              <span>Out of Stock</span>
              <ShieldAlert className="w-4 h-4 text-rose-500" />
            </div>
            <div className="text-xl sm:text-2xl font-black font-mono-numbers text-rose-600 dark:text-rose-400">
              {metrics.outOfStockCount}
            </div>
            <div className="text-[11px] text-stone-400 mt-1">Zero quantity items</div>
          </div>

          <div
            onClick={() => onNavigate('pos')}
            className="p-4 rounded-2xl bg-white dark:bg-[#1c1815] border border-[#e6dfd5] dark:border-[#362e26] shadow-xs cursor-pointer hover:border-blue-500 transition"
          >
            <div className="flex items-center justify-between text-blue-700 dark:text-blue-400 text-xs mb-1 font-bold">
              <span>Parked Carts</span>
              <BookmarkCheck className="w-4 h-4 text-blue-500" />
            </div>
            <div className="text-xl sm:text-2xl font-black font-mono-numbers text-blue-600 dark:text-blue-400">
              {heldOrders.length}
            </div>
            <div className="text-[11px] text-stone-400 mt-1">Awaiting checkout</div>
          </div>
        </div>
      </div>

      {/* --- Section 3: Payment Breakdown & Financial Estimation --- */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-3">
          Today's Tender &amp; Profitability
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="p-3 rounded-xl bg-white dark:bg-[#1c1815] border border-[#e6dfd5] dark:border-[#362e26]">
            <div className="text-[10px] text-stone-400 font-bold uppercase">Cash Sales</div>
            <div className="text-base font-black font-mono-numbers text-emerald-700 dark:text-emerald-400 mt-1">
              {metrics.cashSalesTotal.toFixed(2)}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-white dark:bg-[#1c1815] border border-[#e6dfd5] dark:border-[#362e26]">
            <div className="text-[10px] text-stone-400 font-bold uppercase">Mobile (Telebirr/CBE)</div>
            <div className="text-base font-black font-mono-numbers text-blue-600 dark:text-blue-400 mt-1">
              {metrics.mobileSalesTotal.toFixed(2)}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-white dark:bg-[#1c1815] border border-[#e6dfd5] dark:border-[#362e26]">
            <div className="text-[10px] text-stone-400 font-bold uppercase">Card Sales</div>
            <div className="text-base font-black font-mono-numbers text-indigo-600 dark:text-indigo-400 mt-1">
              {metrics.cardSalesTotal.toFixed(2)}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-white dark:bg-[#1c1815] border border-[#e6dfd5] dark:border-[#362e26]">
            <div className="text-[10px] text-stone-400 font-bold uppercase">Store Credit</div>
            <div className="text-base font-black font-mono-numbers text-amber-600 dark:text-amber-400 mt-1">
              {metrics.creditSalesTotal.toFixed(2)}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-white dark:bg-[#1c1815] border border-[#e6dfd5] dark:border-[#362e26]">
            <div className="text-[10px] text-stone-400 font-bold uppercase">Recorded Expenses</div>
            <div className="text-base font-black font-mono-numbers text-rose-600 dark:text-rose-400 mt-1">
              {metrics.totalExpenses.toFixed(2)}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900">
            <div className="text-[10px] text-emerald-800 dark:text-emerald-300 font-bold uppercase">
              Gross Profit Est.
            </div>
            <div className="text-base font-black font-mono-numbers text-emerald-800 dark:text-emerald-300 mt-1">
              {metrics.estimatedGrossProfit.toFixed(2)}
            </div>
          </div>
        </div>
      </div>

      {/* --- Section 4: Recent Sales Stream --- */}
      <div className="p-4 rounded-2xl bg-white dark:bg-[#1c1815] border border-[#e6dfd5] dark:border-[#362e26] shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-extrabold text-sm text-stone-900 dark:text-stone-100">
            Recent Store Transactions
          </h3>
          <button
            onClick={() => onNavigate('sales')}
            className="text-xs font-bold text-[#064e3b] dark:text-[#6ee7b7] hover:underline"
          >
            View All Sales Ledger &rarr;
          </button>
        </div>

        <div className="divide-y divide-stone-100 dark:divide-stone-800 text-xs">
          {sales.slice(0, 5).map((sale) => (
            <div key={sale.id} className="py-2.5 flex items-center justify-between">
              <div>
                <div className="font-bold font-mono text-stone-900 dark:text-stone-100">
                  {sale.receiptNumber}
                </div>
                <div className="text-[11px] text-stone-400">
                  {new Date(sale.date).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})} •{' '}
                  {sale.items.length} item(s) • Cashier: {sale.cashierName}
                </div>
              </div>
              <div className="text-right">
                <div className="font-black font-mono-numbers text-stone-900 dark:text-stone-100">
                  {sale.grandTotal.toFixed(2)} {settings.currency}
                </div>
                <span
                  className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                    sale.status === 'COMPLETED'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                  }`}
                >
                  {sale.status}
                </span>
              </div>
            </div>
          ))}

          {sales.length === 0 && (
            <p className="text-xs text-stone-400 py-6 text-center">
              No transactions recorded yet today.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
