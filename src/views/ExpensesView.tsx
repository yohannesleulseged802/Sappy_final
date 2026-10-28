import React, {useState} from 'react';
import {DollarSign, Plus, Search, Filter, Calendar, X, Download} from 'lucide-react';
import {StoreExpense, StoreSettings, Staff} from '../types';
import {storage} from '../services/storage';
import {ExportService} from '../services/export';

interface ExpensesViewProps {
  settings: StoreSettings;
  currentStaff: Staff;
  onRefreshData: () => void;
}

export const ExpensesView: React.FC<ExpensesViewProps> = ({
  settings,
  currentStaff,
  onRefreshData,
}) => {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Form State
  const [expCategory, setExpCategory] = useState<StoreExpense['category']>('Paper Stock');
  const [expDescription, setExpDescription] = useState('');
  const [expAmount, setExpAmount] = useState<number>(0);
  const [expPaidWith, setExpPaidWith] = useState<StoreExpense['paidWith']>('cash_drawer');
  const [expReceiptRef, setExpReceiptRef] = useState('');

  const expenses = storage.getExpenses();

  const filteredExpenses = expenses.filter((e) => {
    if (categoryFilter !== 'All' && e.category !== categoryFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      return (
        e.description.toLowerCase().includes(q) ||
        e.paidBy.toLowerCase().includes(q) ||
        (e.receiptRef && e.receiptRef.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const totalExpenseSum = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);

  const handleSaveExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (expAmount <= 0 || !expDescription.trim()) {
      alert('Description and amount are required.');
      return;
    }

    storage.addExpense({
      category: expCategory,
      description: expDescription.trim(),
      amount: expAmount,
      paidWith: expPaidWith,
      paidBy: currentStaff.name,
      receiptRef: expReceiptRef.trim() || undefined,
    });

    setIsAddModalOpen(false);
    setExpDescription('');
    setExpAmount(0);
    setExpReceiptRef('');
    onRefreshData();
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col h-full max-h-full overflow-hidden bg-[#fdfbf7] dark:bg-[#12100e]">
      {/* Top Filter Bar */}
      <div className="p-3 bg-white dark:bg-[#1c1815] border-b border-[#e6dfd5] dark:border-[#362e26] flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search expenses by description..."
              className="w-full bg-[#f5f1e8] dark:bg-[#25201b] border border-transparent focus:border-[#064e3b] rounded-xl pl-9 pr-4 py-2 text-xs text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-hidden"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-[#f5f1e8] dark:bg-[#25201b] border border-stone-200 dark:border-stone-700 rounded-xl px-2.5 py-2 text-xs font-semibold"
          >
            <option value="All">All Categories</option>
            <option value="Paper Stock">Paper Stock</option>
            <option value="Printing Ink & Toner">Printing Ink &amp; Toner</option>
            <option value="Supplies">Supplies</option>
            <option value="Maintenance">Maintenance</option>
            <option value="Petty Cash">Petty Cash</option>
            <option value="Utilities">Utilities</option>
            <option value="Other">Other</option>
          </select>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-3.5 py-2 bg-[#064e3b] hover:bg-[#043b2c] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            <span>Record Expense</span>
          </button>
        </div>
      </div>

      {/* Summary Banner */}
      <div className="p-3 bg-white/70 dark:bg-[#1c1815]/70 border-b border-[#e6dfd5] dark:border-[#362e26] flex items-center justify-between text-xs">
        <span className="text-stone-500">
          Showing {filteredExpenses.length} expense record(s)
        </span>
        <div className="font-bold flex items-center gap-1">
          <span>Total Expenses: </span>
          <span className="font-mono text-rose-600 font-black tabular-nums whitespace-nowrap">
            {totalExpenseSum.toFixed(2)} {settings.currency}
          </span>
        </div>
      </div>

      {/* Expenses Table */}
      <div className="flex-1 min-h-0 overflow-y-auto touch-scroll overscroll-contain p-3 pb-24 md:pb-3">
        <div className="bg-white dark:bg-[#1c1815] border border-[#e6dfd5] dark:border-[#362e26] rounded-2xl shadow-xs overflow-hidden">
          {/* Mobile View: Stacked Cards (< 640px) */}
          <div className="block sm:hidden divide-y divide-[#e6dfd5] dark:divide-[#2d251f]">
            {filteredExpenses.map((exp) => (
              <div key={`exp-card-${exp.id}`} className="p-3.5 space-y-2 bg-white dark:bg-[#1c1815]">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-extrabold text-sm text-stone-900 dark:text-stone-100">
                      {exp.description}
                    </div>
                    <div className="text-[11px] text-stone-400 font-mono mt-0.5">
                      {new Date(exp.date).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })} • Logged by: {exp.paidBy}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-base font-black font-mono-numbers tabular-nums whitespace-nowrap text-rose-600 dark:text-rose-400">
                      -{exp.amount.toFixed(2)} {settings.currency}
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 inline-block mt-0.5">
                      {exp.category}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-stone-500 pt-1 border-t border-stone-100 dark:border-stone-800/80">
                  <span className="font-mono text-[11px] uppercase">
                    Paid via: {exp.paidWith.replace('_', ' ')}
                  </span>
                  {exp.receiptRef && (
                    <span className="font-mono text-[10px] text-stone-400">
                      Ref: {exp.receiptRef}
                    </span>
                  )}
                </div>
              </div>
            ))}

            {filteredExpenses.length === 0 && (
              <div className="p-10 text-center text-stone-400 text-xs">
                No expense records found.
              </div>
            )}
          </div>

          {/* Desktop & Tablet View: Full Table (>= 640px) */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#f5f1e8] dark:bg-[#25201b] border-b border-[#e6dfd5] dark:border-[#362e26] text-stone-700 dark:text-stone-300 font-bold uppercase tracking-wider">
                  <th className="p-3">Date</th>
                  <th className="p-3">Category</th>
                  <th className="p-3">Description</th>
                  <th className="p-3">Payment Source</th>
                  <th className="p-3">Logged By</th>
                  <th className="p-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e6dfd5] dark:divide-[#2d251f]">
                {filteredExpenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-[#fdfbf7] dark:hover:bg-[#201b17]">
                    <td className="p-3 font-mono text-stone-500">
                      {new Date(exp.date).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300">
                        {exp.category}
                      </span>
                    </td>
                    <td className="p-3 font-semibold text-stone-900 dark:text-stone-100">
                      {exp.description}
                      {exp.receiptRef && (
                        <span className="block text-[10px] font-mono text-stone-400">
                          Ref: {exp.receiptRef}
                        </span>
                      )}
                    </td>
                    <td className="p-3 font-mono text-[11px] text-stone-600 dark:text-stone-400 uppercase">
                      {exp.paidWith.replace('_', ' ')}
                    </td>
                    <td className="p-3 text-stone-500">{exp.paidBy}</td>
                    <td className="p-3 text-right font-mono font-black text-rose-600">
                      -{exp.amount.toFixed(2)} {settings.currency}
                    </td>
                  </tr>
                ))}

                {filteredExpenses.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-12 text-center text-stone-400">
                      No expense records found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ================= MODAL: RECORD EXPENSE ================= */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-5 shadow-2xl">
            <h3 className="font-bold text-sm mb-3 text-stone-900 dark:text-stone-100">
              Record Store Expense
            </h3>

            <form onSubmit={handleSaveExpense} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Category</label>
                <select
                  value={expCategory}
                  onChange={(e) => setExpCategory(e.target.value as any)}
                  className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-2 text-xs"
                >
                  <option value="Paper Stock">Paper Stock (Bulk Reams/Rolls)</option>
                  <option value="Printing Ink & Toner">Printing Ink &amp; Toner Cartridges</option>
                  <option value="Supplies">Binding, Laminating &amp; Desk Supplies</option>
                  <option value="Maintenance">Printer / Cutter Maintenance</option>
                  <option value="Petty Cash">Petty Cash &amp; Refreshments</option>
                  <option value="Utilities">Shop Utilities / Power / Internet</option>
                  <option value="Other">Other Expenses</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Description *</label>
                <input
                  type="text"
                  required
                  value={expDescription}
                  onChange={(e) => setExpDescription(e.target.value)}
                  placeholder="e.g. Purchased 2 bottles Epson 003 Black Ink"
                  className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-2 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Amount ({settings.currency}) *</label>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  required
                  value={expAmount || ''}
                  onChange={(e) => setExpAmount(parseFloat(e.target.value) || 0)}
                  className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-2 text-xs font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Payment Method</label>
                <select
                  value={expPaidWith}
                  onChange={(e) => setExpPaidWith(e.target.value as any)}
                  className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-2 text-xs font-semibold"
                >
                  <option value="cash_drawer">
                    Cash Register Drawer
                  </option>
                  <option value="petty_cash">Separate Petty Cash Fund</option>
                  <option value="bank_transfer">Store Bank / Mobile Transfer</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Receipt / Invoice Ref</label>
                <input
                  type="text"
                  value={expReceiptRef}
                  onChange={(e) => setExpReceiptRef(e.target.value)}
                  placeholder="Optional voucher #..."
                  className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-2 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-stone-500"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#064e3b] text-white rounded-lg text-xs font-bold"
                >
                  Save Expense
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
