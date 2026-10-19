import React, {useState, useMemo} from 'react';
import {
  CreditCard,
  Search,
  Plus,
  DollarSign,
  FileDown,
  Printer,
  History,
  X,
  Check,
  AlertCircle,
  Smartphone,
} from 'lucide-react';
import {Customer, StoreSettings, Staff, CreditTransaction} from '../types';
import {storage} from '../services/storage';
import {ExportService} from '../services/export';

interface CreditAccountsViewProps {
  settings: StoreSettings;
  currentStaff: Staff;
  onRefreshData: () => void;
}

export const CreditAccountsView: React.FC<CreditAccountsViewProps> = ({
  settings,
  currentStaff,
  onRefreshData,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  // Modals
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [isEditingCustomer, setIsEditingCustomer] = useState<Customer | null>(null);

  // Payment Form State
  const [repayAmount, setRepayAmount] = useState<number>(0);
  const [repayMethod, setRepayMethod] = useState<'cash' | 'mobile_transfer' | 'card'>('cash');
  const [repayNotes, setRepayNotes] = useState('Credit balance payment');

  // Customer Form State
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [custEmail, setCustEmail] = useState('');
  const [custCompany, setCustCompany] = useState('');
  const [custCreditLimit, setCustCreditLimit] = useState<number>(10000);
  const [custNotes, setCustNotes] = useState('');

  const customers = storage.getCustomers();
  const transactions = storage.getCreditTransactions(selectedCustomer?.id);

  const filteredCustomers = useMemo(() => {
    if (!searchQuery.trim()) return customers;
    const q = searchQuery.toLowerCase().trim();
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        (c.company && c.company.toLowerCase().includes(q))
    );
  }, [customers, searchQuery]);

  // Total Outstanding Credit in Store
  const totalOutstandingCredit = useMemo(() => {
    return customers.reduce((sum, c) => sum + c.currentBalance, 0);
  }, [customers]);

  const handleOpenAddCustomer = () => {
    setIsEditingCustomer(null);
    setCustName('');
    setCustPhone('');
    setCustEmail('');
    setCustCompany('');
    setCustCreditLimit(15000);
    setCustNotes('');
    setIsCustomerModalOpen(true);
  };

  const handleSaveCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!custName.trim() || !custPhone.trim()) {
      alert('Customer Name and Phone Number are required.');
      return;
    }

    const isNew = !isEditingCustomer;
    const customer: Customer = {
      id: isEditingCustomer ? isEditingCustomer.id : `cust-${Date.now()}`,
      name: custName.trim(),
      phone: custPhone.trim(),
      email: custEmail.trim() || undefined,
      company: custCompany.trim() || undefined,
      creditLimit: custCreditLimit,
      currentBalance: isEditingCustomer ? isEditingCustomer.currentBalance : 0,
      notes: custNotes,
      createdDate: isEditingCustomer ? isEditingCustomer.createdDate : new Date().toISOString(),
    };

    storage.saveCustomer(customer, isNew);
    setIsCustomerModalOpen(false);
    onRefreshData();
  };

  const handleRepaySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer || repayAmount <= 0) return;

    storage.addCreditTransaction(
      selectedCustomer.id,
      'PAYMENT',
      repayAmount,
      repayNotes,
      undefined,
      repayMethod
    );

    // Refresh selected customer state
    const refreshed = storage.getCustomers().find((c) => c.id === selectedCustomer.id);
    setSelectedCustomer(refreshed || null);
    setIsPaymentModalOpen(false);
    setRepayAmount(0);
    onRefreshData();
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row h-[calc(100vh-3.5rem)] overflow-hidden bg-[#fdfbf7] dark:bg-[#12100e]">
      {/* ================= LEFT COLUMN: CUSTOMER DIRECTORY ================= */}
      <div className="w-full md:w-80 lg:w-96 bg-white dark:bg-[#1c1815] border-r border-[#e6dfd5] dark:border-[#362e26] flex flex-col h-full shrink-0">
        <div className="p-3 border-b border-[#e6dfd5] dark:border-[#362e26] space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-extrabold text-sm text-[#064e3b] dark:text-[#6ee7b7] flex items-center gap-1.5">
              <CreditCard className="w-4 h-4" />
              <span>Customer Credit Ledger</span>
            </h2>
            <button
              onClick={handleOpenAddCustomer}
              className="p-1.5 bg-[#064e3b] text-white rounded-lg text-xs font-bold hover:bg-[#043b2c] transition"
              title="Add Customer Account"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Outstanding Balance Banner */}
          <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-xs">
            <span className="text-amber-800 dark:text-amber-300 font-medium">Total Store Credit Owed:</span>
            <div className="text-base font-black font-mono-numbers text-amber-700 dark:text-amber-400 mt-0.5">
              {totalOutstandingCredit.toFixed(2)} {settings.currency}
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search customer by name or phone..."
              className="w-full bg-[#f5f1e8] dark:bg-[#25201b] border border-transparent focus:border-[#064e3b] rounded-lg pl-8 pr-3 py-1.5 text-xs text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-hidden"
            />
          </div>
        </div>

        {/* Customers List */}
        <div className="flex-1 overflow-y-auto divide-y divide-stone-100 dark:divide-stone-800/60">
          {filteredCustomers.map((c) => {
            const isSelected = selectedCustomer?.id === c.id;
            return (
              <div
                key={c.id}
                onClick={() => setSelectedCustomer(c)}
                className={`p-3 cursor-pointer transition text-left ${
                  isSelected
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-l-4 border-l-[#064e3b]'
                    : 'hover:bg-stone-50 dark:hover:bg-stone-800/50'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-bold text-xs text-stone-900 dark:text-stone-100">
                      {c.name}
                    </h4>
                    <p className="text-[11px] text-stone-500">{c.phone}</p>
                    {c.company && (
                      <span className="text-[10px] text-stone-400 italic block">{c.company}</span>
                    )}
                  </div>
                  <div className="text-right font-mono">
                    <span
                      className={`text-xs font-bold ${
                        c.currentBalance > 0
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-stone-400'
                      }`}
                    >
                      {c.currentBalance.toFixed(2)} {settings.currency}
                    </span>
                    <span className="block text-[10px] text-stone-400">
                      Limit: {c.creditLimit}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}

          {filteredCustomers.length === 0 && (
            <div className="p-8 text-center text-xs text-stone-400">
              No customer credit accounts found.
            </div>
          )}
        </div>
      </div>

      {/* ================= RIGHT COLUMN: CUSTOMER LEDGER STATEMENT ================= */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-white dark:bg-[#1c1815]">
        {selectedCustomer ? (
          <>
            {/* Header with Customer Info & Actions */}
            <div className="p-4 border-b border-[#e6dfd5] dark:border-[#362e26] flex flex-wrap items-center justify-between gap-3 bg-[#fdfbf7] dark:bg-[#171412]">
              <div>
                <h3 className="font-extrabold text-base text-stone-900 dark:text-stone-100">
                  {selectedCustomer.name}
                </h3>
                <p className="text-xs text-stone-500 font-mono">
                  {selectedCustomer.phone} {selectedCustomer.email ? `• ${selectedCustomer.email}` : ''}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() =>
                    ExportService.generateCustomerStatementPDF(
                      selectedCustomer,
                      transactions,
                      settings
                    )
                  }
                  className="px-3 py-1.5 border border-stone-200 dark:border-stone-700 rounded-xl text-xs font-bold hover:bg-stone-100 dark:hover:bg-stone-800 transition flex items-center gap-1.5"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  <span>Download Statement PDF</span>
                </button>

                <button
                  onClick={() => {
                    setRepayAmount(selectedCustomer.currentBalance);
                    setIsPaymentModalOpen(true);
                  }}
                  disabled={selectedCustomer.currentBalance <= 0}
                  className="px-4 py-1.5 bg-[#064e3b] hover:bg-[#043b2c] disabled:opacity-40 text-white rounded-xl text-xs font-extrabold shadow-sm transition flex items-center gap-1.5 cursor-pointer"
                >
                  <DollarSign className="w-3.5 h-3.5" />
                  <span>Record Repayment</span>
                </button>
              </div>
            </div>

            {/* Account Summary Cards */}
            <div className="p-4 grid grid-cols-3 gap-3 border-b border-[#e6dfd5] dark:border-[#362e26] bg-stone-50/50 dark:bg-stone-900/20">
              <div className="p-3 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl">
                <div className="text-[10px] text-stone-400 uppercase font-bold">Current Balance Owed</div>
                <div className="text-lg font-black font-mono-numbers text-amber-600 dark:text-amber-400 mt-1">
                  {selectedCustomer.currentBalance.toFixed(2)} {settings.currency}
                </div>
              </div>

              <div className="p-3 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl">
                <div className="text-[10px] text-stone-400 uppercase font-bold">Approved Credit Limit</div>
                <div className="text-lg font-black font-mono-numbers text-stone-800 dark:text-stone-200 mt-1">
                  {selectedCustomer.creditLimit.toFixed(2)} {settings.currency}
                </div>
              </div>

              <div className="p-3 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl">
                <div className="text-[10px] text-stone-400 uppercase font-bold">Remaining Available Credit</div>
                <div className="text-lg font-black font-mono-numbers text-emerald-700 dark:text-emerald-400 mt-1">
                  {Math.max(0, selectedCustomer.creditLimit - selectedCustomer.currentBalance).toFixed(2)}{' '}
                  {settings.currency}
                </div>
              </div>
            </div>

            {/* Transactions History Table */}
            <div className="flex-1 overflow-y-auto p-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-2">
                Transaction &amp; Payment Ledger
              </h4>
              <div className="border border-stone-200 dark:border-stone-800 rounded-xl overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead className="bg-stone-50 dark:bg-stone-800 font-bold uppercase text-[10px] text-stone-600 dark:text-stone-300">
                    <tr>
                      <th className="p-2.5">Date &amp; Time</th>
                      <th className="p-2.5">Type</th>
                      <th className="p-2.5">Description</th>
                      <th className="p-2.5 text-right">Amount</th>
                      <th className="p-2.5 text-right">Balance After</th>
                      <th className="p-2.5">Staff</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                    {transactions.map((t) => (
                      <tr key={t.id} className="hover:bg-stone-50/50">
                        <td className="p-2.5 text-stone-500 font-mono">
                          {new Date(t.date).toLocaleString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="p-2.5">
                          <span
                            className={`px-1.5 py-0.5 rounded font-bold text-[10px] ${
                              t.type === 'CHARGE'
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            }`}
                          >
                            {t.type}
                          </span>
                        </td>
                        <td className="p-2.5 font-medium">{t.notes || '—'}</td>
                        <td
                          className={`p-2.5 text-right font-mono font-bold ${
                            t.type === 'CHARGE' ? 'text-amber-600' : 'text-emerald-600'
                          }`}
                        >
                          {t.type === 'CHARGE' ? '+' : '-'}
                          {t.amount.toFixed(2)}
                        </td>
                        <td className="p-2.5 text-right font-mono font-bold">
                          {t.balanceAfter.toFixed(2)}
                        </td>
                        <td className="p-2.5 text-stone-500">{t.staffName}</td>
                      </tr>
                    ))}

                    {transactions.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-stone-400">
                          No credit transactions recorded yet for this customer.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-stone-400">
            <CreditCard className="w-12 h-12 mb-2 opacity-30" />
            <p className="text-sm font-semibold">Select a customer account</p>
            <p className="text-xs text-stone-400 mt-1">
              View outstanding balances, repayment history, and statements
            </p>
          </div>
        )}
      </div>

      {/* ================= MODAL: RECORD PAYMENT ================= */}
      {isPaymentModalOpen && selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-5 shadow-2xl">
            <h3 className="font-bold text-sm mb-1 text-stone-900 dark:text-stone-100">
              Record Customer Repayment
            </h3>
            <p className="text-xs text-stone-500 mb-3">
              Customer: {selectedCustomer.name} (Balance: {selectedCustomer.currentBalance} {settings.currency})
            </p>

            <form onSubmit={handleRepaySubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Repayment Amount ({settings.currency}) *</label>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  max={selectedCustomer.currentBalance}
                  required
                  value={repayAmount || ''}
                  onChange={(e) => setRepayAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-2 text-xs font-mono font-bold"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Payment Method</label>
                <select
                  value={repayMethod}
                  onChange={(e) => setRepayMethod(e.target.value as any)}
                  className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-2 text-xs font-semibold"
                >
                  <option value="cash">Cash into Register Drawer</option>
                  <option value="mobile_transfer">Mobile Transfer (Telebirr / CBE)</option>
                  <option value="card">Bank Card / Transfer</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Notes / Reference</label>
                <input
                  type="text"
                  value={repayNotes}
                  onChange={(e) => setRepayNotes(e.target.value)}
                  placeholder="Receipt # or bank reference..."
                  className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-2 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-stone-500"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#064e3b] text-white rounded-lg text-xs font-bold"
                >
                  Post Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: ADD / EDIT CUSTOMER ================= */}
      {isCustomerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-5 shadow-2xl">
            <h3 className="font-bold text-sm mb-3 text-stone-900 dark:text-stone-100">
              New Customer Account
            </h3>

            <form onSubmit={handleSaveCustomer} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={custName}
                  onChange={(e) => setCustName(e.target.value)}
                  placeholder="e.g. Addis Architectural Studio"
                  className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-2 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Phone Number *</label>
                <input
                  type="text"
                  required
                  value={custPhone}
                  onChange={(e) => setCustPhone(e.target.value)}
                  placeholder="+251 911 234 567"
                  className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-2 text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Company / Organization</label>
                <input
                  type="text"
                  value={custCompany}
                  onChange={(e) => setCustCompany(e.target.value)}
                  placeholder="Optional company name"
                  className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-2 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Credit Limit ({settings.currency})</label>
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={custCreditLimit}
                  onChange={(e) => setCustCreditLimit(parseFloat(e.target.value) || 0)}
                  className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-2 text-xs font-mono font-bold"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCustomerModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-stone-500"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#064e3b] text-white rounded-lg text-xs font-bold"
                >
                  Create Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
