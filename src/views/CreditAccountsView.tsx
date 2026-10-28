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
  BadgeCheck,
  FileCheck,
  CheckCircle2,
  ArrowLeft,
} from 'lucide-react';
import {Customer, StoreSettings, Staff, CreditTransaction} from '../types';
import {storage} from '../services/storage';
import {sound} from '../services/sound';
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

  // Manual Charge Modal State (Requirement: fully manual credit accounts)
  const [isManualChargeModalOpen, setIsManualChargeModalOpen] = useState(false);
  const [manualChargeAmount, setManualChargeAmount] = useState<number>(0);
  const [manualChargeNotes, setManualChargeNotes] = useState('Manual credit purchase / invoice charge');

  // Official "Stamp as Paid" Modal State (Requirement: Stamped Paid fully manual)
  const [isStampPaidModalOpen, setIsStampPaidModalOpen] = useState(false);
  const [stampSettledAmount, setStampSettledAmount] = useState<number>(0);
  const [stampPaymentMethod, setStampPaymentMethod] = useState<'cash' | 'mobile_transfer' | 'card'>('cash');
  const [stampNotes, setStampNotes] = useState('OFFICIALLY STAMPED PAID (Full Settlement)');
  const [stampStaff, setStampStaff] = useState<string>(currentStaff.name);

  // Customer Form State
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [custEmail, setCustEmail] = useState('');
  const [custCompany, setCustCompany] = useState('');
  const [custCreditLimit, setCustCreditLimit] = useState<number>(10000);
  const [custInitialBalance, setCustInitialBalance] = useState<number>(0);
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
    setCustInitialBalance(0);
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
    const initialDebt = isNew ? Math.max(0, custInitialBalance) : (isEditingCustomer ? isEditingCustomer.currentBalance : 0);

    const customer: Customer = {
      id: isEditingCustomer ? isEditingCustomer.id : `cust-${Date.now()}`,
      name: custName.trim(),
      phone: custPhone.trim(),
      email: custEmail.trim() || undefined,
      company: custCompany.trim() || undefined,
      creditLimit: custCreditLimit,
      currentBalance: initialDebt,
      notes: custNotes,
      createdDate: isEditingCustomer ? isEditingCustomer.createdDate : new Date().toISOString(),
    };

    storage.saveCustomer(customer, isNew);

    if (isNew && initialDebt > 0) {
      storage.addCreditTransaction(
        customer.id,
        'CHARGE',
        initialDebt,
        'Opening manual credit balance / ledger debt'
      );
    }

    setIsCustomerModalOpen(false);
    onRefreshData();
    setSelectedCustomer(customer);
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
    sound.playCheckoutSuccess();
    onRefreshData();
  };

  const handleManualChargeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer || manualChargeAmount <= 0) return;

    storage.addCreditTransaction(
      selectedCustomer.id,
      'CHARGE',
      manualChargeAmount,
      manualChargeNotes || 'Manual ledger debt charge'
    );

    const refreshed = storage.getCustomers().find((c) => c.id === selectedCustomer.id);
    setSelectedCustomer(refreshed || null);
    setIsManualChargeModalOpen(false);
    setManualChargeAmount(0);
    sound.playScanSuccess();
    onRefreshData();
  };

  const handleOpenStampPaidModal = () => {
    if (!selectedCustomer) return;
    setStampSettledAmount(selectedCustomer.currentBalance);
    setStampStaff(currentStaff.name);
    setStampNotes(`OFFICIALLY STAMPED PAID (Full Settlement of ${selectedCustomer.currentBalance.toFixed(2)} ${settings.currency})`);
    setIsStampPaidModalOpen(true);
  };

  const handleConfirmStampPaid = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;

    const res = storage.stampCreditAccountPaid(
      selectedCustomer.id,
      stampStaff || currentStaff.name,
      stampNotes,
      stampPaymentMethod,
      stampSettledAmount
    );

    if (res.success) {
      sound.playCheckoutSuccess();
      const refreshed = storage.getCustomers().find((c) => c.id === selectedCustomer.id);
      setSelectedCustomer(refreshed || null);
      setIsStampPaidModalOpen(false);
      onRefreshData();
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col md:flex-row h-full max-h-full overflow-hidden bg-[#fdfbf7] dark:bg-[#12100e]">
      {/* ================= LEFT COLUMN: CUSTOMER DIRECTORY ================= */}
      <div className={`w-full md:w-80 lg:w-96 bg-white dark:bg-[#1c1815] border-r border-[#e6dfd5] dark:border-[#362e26] flex-1 min-h-0 md:flex-none flex flex-col md:h-full md:shrink-0 overflow-hidden ${selectedCustomer ? 'hidden md:flex' : 'flex'}`}>
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
        <div className="flex-1 min-h-0 overflow-y-auto touch-scroll overscroll-contain pb-24 md:pb-3 divide-y divide-stone-100 dark:divide-stone-800/60">
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
                    {(c.isStampedPaid || (c.currentBalance === 0 && c.lastPaidDate)) && (
                      <span className="inline-flex items-center gap-0.5 text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded-sm bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-300 dark:border-rose-800 mt-1">
                        <BadgeCheck className="w-2.5 h-2.5 text-rose-600" />
                        <span>STAMPED PAID</span>
                      </span>
                    )}
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
      <div className={`flex-1 min-h-0 flex flex-col h-full overflow-hidden bg-white dark:bg-[#1c1815] ${selectedCustomer ? 'flex' : 'hidden md:flex'}`}>
        {selectedCustomer ? (
          <>
            {/* Header with Customer Info & Actions */}
            <div className="p-3 sm:p-4 border-b border-[#e6dfd5] dark:border-[#362e26] flex flex-wrap items-center justify-between gap-3 bg-[#fdfbf7] dark:bg-[#171412]">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedCustomer(null)}
                  className="md:hidden px-2 py-1 rounded-lg text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-800 flex items-center gap-1 text-xs font-bold transition cursor-pointer border border-stone-200 dark:border-stone-700"
                  title="Back to Customer List"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>List</span>
                </button>
                <div>
                  <h3 className="font-extrabold text-base text-stone-900 dark:text-stone-100">
                    {selectedCustomer.name}
                  </h3>
                  <p className="text-xs text-stone-500 font-mono">
                    {selectedCustomer.phone} {selectedCustomer.email ? `• ${selectedCustomer.email}` : ''}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() =>
                    ExportService.generateCustomerStatementPDF(
                      selectedCustomer,
                      transactions,
                      settings
                    )
                  }
                  className="px-3 py-1.5 border border-stone-200 dark:border-stone-700 rounded-xl text-xs font-bold hover:bg-stone-100 dark:hover:bg-stone-800 transition flex items-center gap-1.5 cursor-pointer"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  <span>Statement PDF</span>
                </button>

                {/* Manual Charge Action (Fully manual debt creation) */}
                <button
                  onClick={() => {
                    setManualChargeAmount(0);
                    setIsManualChargeModalOpen(true);
                  }}
                  className="px-3 py-1.5 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 rounded-xl text-xs font-extrabold transition flex items-center gap-1.5 cursor-pointer"
                  title="Manually add a debt charge to this account"
                >
                  <Plus className="w-3.5 h-3.5 text-amber-600" />
                  <span>+ Manual Charge</span>
                </button>

                {/* Record Repayment Action */}
                <button
                  onClick={() => {
                    setRepayAmount(selectedCustomer.currentBalance);
                    setIsPaymentModalOpen(true);
                  }}
                  disabled={selectedCustomer.currentBalance <= 0}
                  className="px-3 py-1.5 bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 disabled:opacity-40 text-stone-800 dark:text-stone-200 rounded-xl text-xs font-extrabold transition flex items-center gap-1.5 cursor-pointer"
                >
                  <DollarSign className="w-3.5 h-3.5" />
                  <span>Repay</span>
                </button>

                {/* Official STAMP AS PAID Button (Fully manual settlement) */}
                <button
                  onClick={handleOpenStampPaidModal}
                  disabled={selectedCustomer.currentBalance <= 0 && selectedCustomer.isStampedPaid}
                  className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 active:scale-[0.99] disabled:opacity-50 text-white rounded-xl text-xs font-black shadow-sm transition flex items-center gap-1.5 cursor-pointer"
                  title="Officially stamp this credit account as settled and paid"
                >
                  <BadgeCheck className="w-4 h-4 text-rose-200" />
                  <span>STAMP AS PAID</span>
                </button>
              </div>
            </div>

            {/* Account Summary Cards & Authentic Rubber Stamp */}
            <div className="relative p-4 grid grid-cols-1 sm:grid-cols-3 gap-3 border-b border-[#e6dfd5] dark:border-[#362e26] bg-stone-50/50 dark:bg-stone-900/20 overflow-hidden">
              {/* AUTHENTIC OFFICIAL RUBBER STAMP SEAL */}
              {(selectedCustomer.isStampedPaid || (selectedCustomer.currentBalance === 0 && selectedCustomer.lastPaidDate)) && (
                <div className="absolute right-4 top-2 z-10 rotate-[-5deg] pointer-events-none select-none animate-in zoom-in-95 duration-200">
                  <div className="border-3 border-dashed border-rose-600 dark:border-rose-500 rounded-xl px-4 py-2 bg-rose-50/90 dark:bg-rose-950/90 backdrop-blur-xs text-rose-700 dark:text-rose-300 shadow-lg flex flex-col items-center">
                    <div className="text-[9px] tracking-widest font-extrabold uppercase border-b border-rose-300 dark:border-rose-700 pb-0.5">
                      ★ SAPPY OFFICIAL LEDGER ★
                    </div>
                    <div className="text-xl sm:text-2xl font-black tracking-wider uppercase my-0.5 font-sans text-rose-600 dark:text-rose-400">
                      STAMPED PAID
                    </div>
                    <div className="text-[10px] font-bold tracking-tight">
                      SETTLED: {selectedCustomer.lastPaidDate ? new Date(selectedCustomer.lastPaidDate).toLocaleDateString() : new Date().toLocaleDateString()}
                    </div>
                    {selectedCustomer.lastPaidStaff && (
                      <div className="text-[9px] font-mono tracking-tighter opacity-80 uppercase">
                        STAFF: {selectedCustomer.lastPaidStaff}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="p-3 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl">
                <div className="text-[10px] text-stone-400 uppercase font-bold">Current Balance Owed</div>
                <div className="text-lg font-black font-mono-numbers tabular-nums whitespace-nowrap text-amber-600 dark:text-amber-400 mt-1">
                  {selectedCustomer.currentBalance.toFixed(2)} {settings.currency}
                </div>
              </div>

              <div className="p-3 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl">
                <div className="text-[10px] text-stone-400 uppercase font-bold">Approved Credit Limit</div>
                <div className="text-lg font-black font-mono-numbers tabular-nums whitespace-nowrap text-stone-800 dark:text-stone-200 mt-1">
                  {selectedCustomer.creditLimit.toFixed(2)} {settings.currency}
                </div>
              </div>

              <div className="p-3 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl">
                <div className="text-[10px] text-stone-400 uppercase font-bold">Remaining Available Credit</div>
                <div className="text-lg font-black font-mono-numbers tabular-nums whitespace-nowrap text-emerald-700 dark:text-emerald-400 mt-1">
                  {Math.max(0, selectedCustomer.creditLimit - selectedCustomer.currentBalance).toFixed(2)}{' '}
                  {settings.currency}
                </div>
              </div>
            </div>

            {/* Transactions History Table */}
            <div className="flex-1 min-h-0 overflow-y-auto touch-scroll overscroll-contain p-4 pb-24 md:pb-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-2">
                Transaction &amp; Payment Ledger
              </h4>

              {/* Mobile View: Stacked Cards (< 640px) */}
              <div className="block sm:hidden divide-y divide-stone-100 dark:divide-stone-800 border border-stone-200 dark:border-stone-800 rounded-xl overflow-hidden bg-white dark:bg-stone-900 mb-3">
                {transactions.map((t) => (
                  <div key={`tx-card-${t.id}`} className="p-3 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`px-1.5 py-0.5 rounded font-bold text-[10px] ${
                            t.type === 'CHARGE'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                              : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          }`}
                        >
                          {t.type}
                        </span>
                        <span className="font-mono text-[11px] text-stone-400">
                          {new Date(t.date).toLocaleString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <div
                        className={`font-mono font-black tabular-nums whitespace-nowrap text-sm ${
                          t.type === 'CHARGE' ? 'text-amber-600' : 'text-emerald-600'
                        }`}
                      >
                        {t.type === 'CHARGE' ? '+' : '-'}
                        {t.amount.toFixed(2)} {settings.currency}
                      </div>
                    </div>
                    <div className="text-stone-700 dark:text-stone-300 font-medium text-[11px]">
                      {t.notes || 'No description notes'}
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-stone-400 pt-1 font-mono">
                      <span>Balance After: {t.balanceAfter.toFixed(2)} {settings.currency}</span>
                      <span>Staff: {t.staffName}</span>
                    </div>
                  </div>
                ))}

                {transactions.length === 0 && (
                  <div className="p-8 text-center text-stone-400 text-xs">
                    No credit transactions recorded yet for this customer.
                  </div>
                )}
              </div>

              {/* Desktop & Tablet View: Full Table (>= 640px) */}
              <div className="hidden sm:block border border-stone-200 dark:border-stone-800 rounded-xl overflow-hidden text-xs">
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

              {!isEditingCustomer && (
                <div>
                  <label className="block text-xs font-semibold mb-1 text-amber-700 dark:text-amber-300">
                    Opening Debt / Initial Credit Balance ({settings.currency})
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={custInitialBalance || ''}
                    onChange={(e) => setCustInitialBalance(Math.max(0, parseFloat(e.target.value) || 0))}
                    placeholder="0.00 (Enter debt if customer already owes balance)"
                    className="w-full bg-amber-50/50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 rounded-lg p-2 text-xs font-mono font-bold text-amber-900 dark:text-amber-200"
                  />
                  <p className="text-[10px] text-stone-400 mt-0.5">
                    Leave 0 for clean accounts, or enter starting balance to import existing customer debt.
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCustomerModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-stone-500 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#064e3b] hover:bg-[#043b2c] text-white rounded-lg text-xs font-bold cursor-pointer"
                >
                  {isEditingCustomer ? 'Update Account' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: MANUAL CHARGE (FULLY MANUAL DEBT ADDITION) ================= */}
      {isManualChargeModalOpen && selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-5 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-stone-100 dark:border-stone-800 mb-3">
              <h3 className="font-extrabold text-sm text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-amber-600" />
                <span>Add Manual Charge / Debt</span>
              </h3>
              <button
                onClick={() => setIsManualChargeModalOpen(false)}
                className="p-1 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-stone-500 mb-3">
              Customer: <strong className="text-stone-800 dark:text-stone-200">{selectedCustomer.name}</strong> • Current Balance: {selectedCustomer.currentBalance.toFixed(2)} {settings.currency}
            </p>

            <form onSubmit={handleManualChargeSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1">
                  Charge Amount ({settings.currency}) *
                </label>
                <input
                  type="number"
                  min="0.5"
                  step="0.01"
                  required
                  value={manualChargeAmount || ''}
                  onChange={(e) => setManualChargeAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                  placeholder="e.g. 2500"
                  className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-2.5 text-xs font-mono font-bold text-amber-700 dark:text-amber-400"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">
                  Reason / Description / Invoice # *
                </label>
                <input
                  type="text"
                  required
                  value={manualChargeNotes}
                  onChange={(e) => setManualChargeNotes(e.target.value)}
                  placeholder="e.g. 5 Reams Double A Paper + Binding Invoice #104"
                  className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-2 text-xs"
                />
              </div>

              <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-[11px] text-amber-900 dark:text-amber-300">
                <span>New balance after charge will be: </span>
                <strong className="font-mono font-bold">
                  {(selectedCustomer.currentBalance + (manualChargeAmount || 0)).toFixed(2)} {settings.currency}
                </strong>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsManualChargeModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-stone-500 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={manualChargeAmount <= 0}
                  className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-white rounded-lg text-xs font-bold cursor-pointer"
                >
                  Post Manual Charge
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: STAMP AS PAID (FULLY MANUAL STAMPING) ================= */}
      {isStampPaidModalOpen && selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-5 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-stone-100 dark:border-stone-800 mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                  <BadgeCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-stone-900 dark:text-stone-100">
                    Official "Stamp as Paid" Ledger Action
                  </h3>
                  <p className="text-[11px] text-stone-500">
                    Officially clear debt, stamp ledger statement, and record settlement
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsStampPaidModalOpen(false)}
                className="p-1 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmStampPaid} className="space-y-3">
              {/* Account summary display */}
              <div className="p-3 bg-stone-50 dark:bg-stone-800/60 rounded-xl border border-stone-200 dark:border-stone-700 flex justify-between items-center text-xs">
                <div>
                  <span className="text-stone-500 block text-[10px] uppercase font-bold">Customer Account</span>
                  <span className="font-bold text-stone-900 dark:text-stone-100 text-sm">{selectedCustomer.name}</span>
                </div>
                <div className="text-right">
                  <span className="text-stone-500 block text-[10px] uppercase font-bold">Outstanding Balance</span>
                  <span className="font-mono font-black text-amber-600 dark:text-amber-400 text-sm">
                    {selectedCustomer.currentBalance.toFixed(2)} {settings.currency}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">
                  Settlement Amount ({settings.currency}) *
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  max={selectedCustomer.currentBalance}
                  required
                  value={stampSettledAmount || ''}
                  onChange={(e) => setStampSettledAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-2.5 text-xs font-mono font-bold text-rose-600 dark:text-rose-400"
                />
                <p className="text-[10px] text-stone-400 mt-0.5">
                  Pre-filled with full balance ({selectedCustomer.currentBalance.toFixed(2)} {settings.currency}) for complete settlement.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold mb-1">Payment Method</label>
                  <select
                    value={stampPaymentMethod}
                    onChange={(e) => setStampPaymentMethod(e.target.value as any)}
                    className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-2 text-xs font-medium"
                  >
                    <option value="cash">Cash into Drawer</option>
                    <option value="mobile_transfer">Telebirr / CBE Transfer</option>
                    <option value="card">Bank Deposit / Card</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Staff Approver</label>
                  <input
                    type="text"
                    required
                    value={stampStaff}
                    onChange={(e) => setStampStaff(e.target.value)}
                    className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-2 text-xs font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">
                  Official Ledger Stamp Note
                </label>
                <input
                  type="text"
                  value={stampNotes}
                  onChange={(e) => setStampNotes(e.target.value)}
                  placeholder="e.g. OFFICIALLY STAMPED PAID (Full Settlement)"
                  className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-2 text-xs"
                />
              </div>

              {/* Rubber Stamp Preview Box */}
              <div className="p-3 bg-rose-50/70 dark:bg-rose-950/40 rounded-xl border border-rose-200 dark:border-rose-900/60 flex items-center justify-between">
                <div className="text-xs text-rose-900 dark:text-rose-200">
                  <div className="font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-rose-600" />
                    <span>Applies Official STAMPED PAID Seal</span>
                  </div>
                  <span className="text-[11px] opacity-80">
                    Remaining balance after stamp will be:{' '}
                    <strong>{Math.max(0, selectedCustomer.currentBalance - stampSettledAmount).toFixed(2)} {settings.currency}</strong>
                  </span>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsStampPaidModalOpen(false)}
                  className="px-3.5 py-2 text-xs text-stone-500 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 active:scale-[0.99] text-white rounded-xl text-xs font-black shadow-md cursor-pointer flex items-center gap-1.5"
                >
                  <BadgeCheck className="w-4 h-4" />
                  <span>CONFIRM &amp; STAMP AS PAID</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
