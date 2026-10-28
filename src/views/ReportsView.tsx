import React, {useState, useMemo} from 'react';
import {
  BarChart3,
  Calendar,
  Download,
  FileDown,
  TrendingUp,
  DollarSign,
  Package,
  Users,
  Award,
} from 'lucide-react';
import {Sale, Product, StoreSettings, Staff, StoreExpense} from '../types';
import {storage} from '../services/storage';
import {ExportService} from '../services/export';
import {jsPDF} from 'jspdf';
import autoTable from 'jspdf-autotable';

interface ReportsViewProps {
  sales: Sale[];
  products: Product[];
  settings: StoreSettings;
  currentStaff: Staff;
}

export const ReportsView: React.FC<ReportsViewProps> = ({
  sales,
  products,
  settings,
  currentStaff,
}) => {
  const [timeRange, setTimeRange] = useState<'today' | 'week' | 'month' | 'all'>('week');
  const expenses = storage.getExpenses();
  const customers = storage.getCustomers();

  // Filter sales by timeRange
  const filteredSales = useMemo(() => {
    const now = new Date();
    return sales.filter((s) => {
      if (s.status !== 'COMPLETED') return false;
      const saleDate = new Date(s.date);
      if (timeRange === 'today') {
        return saleDate.toDateString() === now.toDateString();
      }
      if (timeRange === 'week') {
        const weekAgo = new Date(now.getTime() - 7 * 86400000);
        return saleDate >= weekAgo;
      }
      if (timeRange === 'month') {
        const monthAgo = new Date(now.getTime() - 30 * 86400000);
        return saleDate >= monthAgo;
      }
      return true;
    });
  }, [sales, timeRange]);

  // Aggregate Product Performance
  const productPerformance = useMemo(() => {
    const map = new Map<string, {name: string; sku: string; qty: number; revenue: number}>();
    filteredSales.forEach((s) => {
      s.items.forEach((item) => {
        const existing = map.get(item.productId) || {
          name: item.productName,
          sku: item.sku,
          qty: 0,
          revenue: 0,
        };
        existing.qty += item.quantity;
        existing.revenue += item.quantity * item.sellingPrice;
        map.set(item.productId, existing);
      });
    });
    return Array.from(map.values()).sort((a, b) => b.qty - a.qty);
  }, [filteredSales]);

  // Aggregate Staff Performance
  const staffPerformance = useMemo(() => {
    const map = new Map<string, {name: string; count: number; total: number}>();
    filteredSales.forEach((s) => {
      const existing = map.get(s.cashierId) || {name: s.cashierName, count: 0, total: 0};
      existing.count += 1;
      existing.total += s.grandTotal;
      map.set(s.cashierId, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [filteredSales]);

  // Financial Aggregations
  const totalRevenue = filteredSales.reduce((sum, s) => sum + s.grandTotal, 0);
  const totalDiscounts = filteredSales.reduce((sum, s) => sum + s.totalDiscount, 0);
  const totalTax = filteredSales.reduce((sum, s) => sum + s.taxAmount, 0);

  let totalCOGS = 0;
  filteredSales.forEach((s) => {
    s.items.forEach((item) => {
      totalCOGS += item.costPrice * item.quantity;
    });
  });

  const grossProfit = Math.max(0, totalRevenue - totalCOGS);
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const estimatedNetProfit = grossProfit - totalExpenses;
  const outstandingCredit = customers.reduce((sum, c) => sum + c.currentBalance, 0);

  // Generate Executive PDF Report
  const handleDownloadPDFReport = () => {
    const doc = new jsPDF();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(6, 78, 59);
    doc.text(settings.storeName, 14, 15);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(`Executive Sales & Financial Report (${timeRange.toUpperCase()})`, 14, 21);
    doc.text(`Generated on ${new Date().toLocaleString()} by ${currentStaff.name}`, 14, 26);

    autoTable(doc, {
      startY: 32,
      head: [['Financial Metric', 'Value (ETB)']],
      body: [
        ['Total Gross Revenue', totalRevenue.toFixed(2)],
        ['Cost of Goods Sold (COGS)', totalCOGS.toFixed(2)],
        ['Estimated Gross Profit', grossProfit.toFixed(2)],
        ['Operating Store Expenses', totalExpenses.toFixed(2)],
        ['Estimated Net Profit', estimatedNetProfit.toFixed(2)],
        ['Discounts Given to Customers', totalDiscounts.toFixed(2)],
        ['Total Sales Transactions', String(filteredSales.length)],
        ['Outstanding Customer Store Credit', outstandingCredit.toFixed(2)],
      ],
      theme: 'grid',
      headStyles: {fillColor: [6, 78, 59]},
    });

    const nextY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(6, 78, 59);
    doc.text('Top 10 Best-Selling Products', 14, nextY);

    const topProductRows = productPerformance.slice(0, 10).map((p) => [
      p.name,
      p.sku,
      String(p.qty),
      p.revenue.toFixed(2),
    ]);

    autoTable(doc, {
      startY: nextY + 4,
      head: [['Product Name', 'SKU', 'Units Sold', 'Revenue (ETB)']],
      body: topProductRows,
      theme: 'striped',
      headStyles: {fillColor: [6, 78, 59]},
    });

    doc.save(`Sappy_Stationary_Report_${timeRange}_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto touch-scroll overscroll-contain p-4 sm:p-6 pb-24 md:pb-6 bg-[#fdfbf7] dark:bg-[#12100e] space-y-6">
      {/* Top Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-white dark:bg-[#1c1815] border border-[#e6dfd5] dark:border-[#362e26] rounded-2xl shadow-xs">
        <div>
          <h2 className="font-extrabold text-base text-stone-900 dark:text-stone-100 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[#064e3b] dark:text-[#6ee7b7]" />
            Business Reports &amp; Financial Analytics
          </h2>
          <p className="text-xs text-stone-500">
            Real-time analytics across sales volume, inventory margins, and staff performance
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Time Range Pills */}
          <div className="flex bg-stone-100 dark:bg-stone-800 p-0.5 rounded-xl text-xs font-semibold">
            {(['today', 'week', 'month', 'all'] as const).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-3 py-1.5 min-h-[44px] sm:min-h-0 flex items-center justify-center rounded-lg transition capitalize touch-manipulation cursor-pointer ${
                  timeRange === range
                    ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 shadow-xs font-bold'
                    : 'text-stone-500'
                }`}
              >
                {range}
              </button>
            ))}
          </div>

          <button
            onClick={handleDownloadPDFReport}
            className="px-3.5 py-2 min-h-[44px] sm:min-h-0 bg-[#064e3b] hover:bg-[#043b2c] text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm touch-manipulation cursor-pointer"
          >
            <FileDown className="w-4 h-4" />
            <span>Export PDF Report</span>
          </button>
        </div>
      </div>

      {/* Financial Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 bg-white dark:bg-[#1c1815] border border-[#e6dfd5] dark:border-[#362e26] rounded-2xl">
          <span className="text-xs text-stone-500 uppercase font-bold block mb-1">Total Sales Revenue</span>
          <div className="text-xl sm:text-2xl font-black font-mono-numbers tabular-nums whitespace-nowrap text-stone-900 dark:text-stone-100">
            {totalRevenue.toFixed(2)}
            <span className="text-xs text-stone-400 font-normal ml-1">{settings.currency}</span>
          </div>
          <span className="text-[11px] text-stone-400 mt-1 block">
            {filteredSales.length} transaction(s)
          </span>
        </div>

        <div className="p-4 bg-white dark:bg-[#1c1815] border border-[#e6dfd5] dark:border-[#362e26] rounded-2xl">
          <span className="text-xs text-stone-500 uppercase font-bold block mb-1">Cost of Goods (COGS)</span>
          <div className="text-xl sm:text-2xl font-black font-mono-numbers tabular-nums whitespace-nowrap text-stone-600 dark:text-stone-300">
            {totalCOGS.toFixed(2)}
            <span className="text-xs text-stone-400 font-normal ml-1">{settings.currency}</span>
          </div>
          <span className="text-[11px] text-stone-400 mt-1 block">Cost base of sold stock</span>
        </div>

        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 rounded-2xl">
          <span className="text-xs text-emerald-800 dark:text-emerald-300 uppercase font-bold block mb-1">
            Estimated Gross Profit
          </span>
          <div className="text-xl sm:text-2xl font-black font-mono-numbers tabular-nums whitespace-nowrap text-emerald-800 dark:text-emerald-300">
            {grossProfit.toFixed(2)}
            <span className="text-xs font-normal ml-1">{settings.currency}</span>
          </div>
          <span className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-1 block">
            Margin: {totalRevenue > 0 ? ((grossProfit / totalRevenue) * 100).toFixed(1) : 0}%
          </span>
        </div>

        <div className="p-4 bg-white dark:bg-[#1c1815] border border-[#e6dfd5] dark:border-[#362e26] rounded-2xl">
          <span className="text-xs text-stone-500 uppercase font-bold block mb-1">Outstanding Store Credit</span>
          <div className="text-xl sm:text-2xl font-black font-mono-numbers tabular-nums whitespace-nowrap text-amber-600 dark:text-amber-400">
            {outstandingCredit.toFixed(2)}
            <span className="text-xs text-stone-400 font-normal ml-1">{settings.currency}</span>
          </div>
          <span className="text-[11px] text-stone-400 mt-1 block">Customer credit balance</span>
        </div>
      </div>

      {/* Two Column Layout: Top Products & Cashier Ranking */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Best-Selling Products */}
        <div className="p-4 bg-white dark:bg-[#1c1815] border border-[#e6dfd5] dark:border-[#362e26] rounded-2xl shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-sm text-stone-900 dark:text-stone-100 flex items-center gap-2">
              <Award className="w-4 h-4 text-emerald-600" />
              <span>Top-Selling Stationery &amp; Printing Items</span>
            </h3>
          </div>

          <div className="divide-y divide-stone-100 dark:divide-stone-800 text-xs">
            {productPerformance.slice(0, 7).map((p, idx) => (
              <div key={idx} className="py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 flex items-center justify-center font-bold text-[10px]">
                    {idx + 1}
                  </span>
                  <div>
                    <div className="font-bold">{p.name}</div>
                    <div className="text-[10px] text-stone-400 font-mono">{p.sku}</div>
                  </div>
                </div>
                <div className="text-right font-mono">
                  <div className="font-bold">{p.qty} sold</div>
                  <div className="text-[10px] text-emerald-600">{p.revenue.toFixed(2)} {settings.currency}</div>
                </div>
              </div>
            ))}

            {productPerformance.length === 0 && (
              <p className="text-xs text-stone-400 py-6 text-center">
                No items sold during this period.
              </p>
            )}
          </div>
        </div>

        {/* Staff Sales Performance */}
        <div className="p-4 bg-white dark:bg-[#1c1815] border border-[#e6dfd5] dark:border-[#362e26] rounded-2xl shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-sm text-stone-900 dark:text-stone-100 flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-600" />
              <span>Cashier Sales Performance</span>
            </h3>
          </div>

          <div className="divide-y divide-stone-100 dark:divide-stone-800 text-xs">
            {staffPerformance.map((st, idx) => (
              <div key={idx} className="py-2.5 flex items-center justify-between">
                <div>
                  <div className="font-bold">{st.name}</div>
                  <div className="text-[10px] text-stone-400">{st.count} completed sale(s)</div>
                </div>
                <div className="text-right font-mono">
                  <div className="font-black text-stone-900 dark:text-stone-100">
                    {st.total.toFixed(2)} {settings.currency}
                  </div>
                </div>
              </div>
            ))}

            {staffPerformance.length === 0 && (
              <p className="text-xs text-stone-400 py-6 text-center">
                No cashier sales recorded during this period.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
