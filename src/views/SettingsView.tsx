import React, {useState, useEffect} from 'react';
import {
  Settings,
  Save,
  Download,
  Upload,
  RefreshCw,
  Printer,
  Barcode,
  Receipt,
  Store,
  Check,
  Trash2,
  AlertCircle,
  Loader2,
  CheckCircle2,
  ShieldAlert,
  KeyRound,
  Eye,
  EyeOff,
  AlertTriangle,
} from 'lucide-react';
import {StoreSettings, Staff} from '../types';
import {storage} from '../services/storage';
import {sound} from '../services/sound';

interface SettingsViewProps {
  settings: StoreSettings;
  currentStaff: Staff;
  onRefreshData: () => void;
  onFactoryReset?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  currentStaff,
  onRefreshData,
  onFactoryReset,
}) => {
  const [storeName, setStoreName] = useState(settings.storeName || '');
  const [tagline, setTagline] = useState(settings.tagline || '');
  const [address, setAddress] = useState(settings.address || '');
  const [phone, setPhone] = useState(settings.phone || '');
  const [email, setEmail] = useState(settings.email || '');
  const [taxNumber, setTaxNumber] = useState(settings.taxNumber || '');
  const [currency, setCurrency] = useState(settings.currency || 'ETB');
  const [taxRatePercent, setTaxRatePercent] = useState<number>(settings.taxRatePercent ?? 15);
  const [thermalReceiptWidth, setThermalReceiptWidth] = useState<'80mm' | '58mm'>(
    settings.thermalReceiptWidth || '80mm'
  );
  const [receiptMode, setReceiptMode] = useState<'record_only' | 'ask_each_time' | 'always_print'>(
    settings.receiptMode || 'record_only'
  );
  const [autoPrintReceipt, setAutoPrintReceipt] = useState<boolean>(
    settings.autoPrintReceipt ?? false
  );
  const [receiptFooterMessage, setReceiptFooterMessage] = useState(
    settings.receiptFooterMessage || ''
  );
  const [lowStockDefaultThreshold, setLowStockDefaultThreshold] = useState<number>(
    settings.lowStockDefaultThreshold ?? 5
  );
  const [barcodePrefix, setBarcodePrefix] = useState(settings.barcodePrefix || 'SAP');

  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [resetProfileOnWipe, setResetProfileOnWipe] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);

  // Total System Factory Reset State (Requirement: Remove everything including all users)
  const [showFactoryResetModal, setShowFactoryResetModal] = useState(false);
  const [factoryResetPasscode, setFactoryResetPasscode] = useState('');
  const [showResetPasscode, setShowResetPasscode] = useState(false);
  const [factoryResetConfirmText, setFactoryResetConfirmText] = useState('');
  const [isExecutingFactoryReset, setIsExecutingFactoryReset] = useState(false);
  const [factoryResetError, setFactoryResetError] = useState<string | null>(null);

  const handleExecuteFactoryReset = async () => {
    setFactoryResetError(null);
    if (!factoryResetPasscode.trim() && factoryResetConfirmText.trim().toUpperCase() !== 'RESET ALL') {
      setFactoryResetError('Please enter the Master Passcode or type "RESET ALL" to confirm.');
      sound.playError();
      return;
    }

    setIsExecutingFactoryReset(true);
    try {
      const res = await storage.factoryResetEverything(factoryResetPasscode.trim());
      setIsExecutingFactoryReset(false);
      setShowFactoryResetModal(false);
      sound.playCheckoutSuccess();
      if (onFactoryReset) {
        onFactoryReset();
      } else {
        window.location.reload();
      }
    } catch (err: any) {
      setIsExecutingFactoryReset(false);
      sound.playError();
      setFactoryResetError(err?.message || 'Factory reset failed. Incorrect Master Passcode.');
    }
  };

  // Synchronize state when settings prop updates
  useEffect(() => {
    setStoreName(settings.storeName || '');
    setTagline(settings.tagline || '');
    setAddress(settings.address || '');
    setPhone(settings.phone || '');
    setEmail(settings.email || '');
    setTaxNumber(settings.taxNumber || '');
    setCurrency(settings.currency || 'ETB');
    setTaxRatePercent(settings.taxRatePercent ?? 15);
    setThermalReceiptWidth(settings.thermalReceiptWidth || '80mm');
    setReceiptMode(settings.receiptMode || 'record_only');
    setAutoPrintReceipt(settings.autoPrintReceipt ?? false);
    setReceiptFooterMessage(settings.receiptFooterMessage || '');
    setLowStockDefaultThreshold(settings.lowStockDefaultThreshold ?? 5);
    setBarcodePrefix(settings.barcodePrefix || 'SAP');
  }, [settings]);

  const handleSaveSettings = async (e?: React.FormEvent) => {
    if (e && e.preventDefault) e.preventDefault();
    setIsSaving(true);

    const updated: StoreSettings = {
      ...settings,
      storeName: storeName.trim() || 'Sappy Stationary',
      tagline: tagline.trim(),
      address: address.trim(),
      phone: phone.trim(),
      email: email.trim(),
      taxNumber: taxNumber.trim(),
      currency: currency.trim() || 'ETB',
      currencySymbol: currency.trim() || 'ETB',
      taxRatePercent,
      receiptMode,
      autoPrintReceipt,
      thermalReceiptWidth,
      receiptFooterMessage: receiptFooterMessage.trim(),
      lowStockDefaultThreshold,
      barcodePrefix: barcodePrefix.trim() || 'SAP',
    };

    storage.saveSettings(updated);
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
    } catch {}

    sound.playCheckoutSuccess();
    setSavedSuccess(true);
    setIsSaving(false);
    setTimeout(() => setSavedSuccess(false), 3500);
    onRefreshData();
  };

  // Export Complete Local Database to JSON Backup
  const handleExportFullBackup = () => {
    const backupData = {
      products: storage.getProducts(),
      customers: storage.getCustomers(),
      sales: storage.getSales(),
      expenses: storage.getExpenses(),
      staff: storage.getStaffList(),
      settings: storage.getSettings(),
      creditTransactions: storage.getCreditTransactions(),
      auditLogs: storage.getAuditLogs(),
      timestamp: new Date().toISOString(),
      appName: 'Sappy Stationary POS',
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], {
      type: 'application/json',
    });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `sappy_stationary_complete_backup_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
  };

  // Restore Database from JSON
  const handleRestoreBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (json.products && Array.isArray(json.products)) {
          storage.saveProducts(json.products);
        }
        if (json.customers && Array.isArray(json.customers)) {
          storage.saveCustomers(json.customers);
        }
        if (json.sales && Array.isArray(json.sales)) {
          storage.saveSales(json.sales);
        }
        if (json.settings) {
          storage.saveSettings(json.settings);
        }
        alert('Complete system backup successfully restored!');
        onRefreshData();
      } catch {
        alert('Invalid backup JSON file.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto touch-scroll overscroll-contain p-4 sm:p-6 pb-24 md:pb-6 bg-[#fdfbf7] dark:bg-[#12100e] space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-white dark:bg-[#1c1815] border border-[#e6dfd5] dark:border-[#362e26] rounded-2xl shadow-xs">
        <div>
          <h2 className="font-extrabold text-base text-stone-900 dark:text-stone-100 flex items-center gap-2">
            <Settings className="w-5 h-5 text-[#064e3b] dark:text-[#6ee7b7]" />
            Store Configuration &amp; System Settings
          </h2>
          <p className="text-xs text-stone-500">
            Branding, tax calculation, receipt printers, and offline database backup
          </p>
        </div>

        <div className="flex items-center gap-2">
          {savedSuccess && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 rounded-xl text-xs font-bold animate-in fade-in">
              <Check className="w-4 h-4 text-emerald-600" />
              <span>Settings Saved!</span>
            </div>
          )}

          <button
            type="button"
            onClick={() => handleSaveSettings()}
            disabled={isSaving}
            className="px-4 py-2 bg-[#064e3b] hover:bg-[#043b2c] text-white font-bold text-xs rounded-xl shadow-sm transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {isSaving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#6ee7b7]" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            <span>Save Settings</span>
          </button>
        </div>
      </div>

      <form onSubmit={handleSaveSettings} className="space-y-6">
        {/* Store Profile */}
        <div className="p-5 bg-white dark:bg-[#1c1815] border border-[#e6dfd5] dark:border-[#362e26] rounded-2xl shadow-xs space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-bold text-sm text-stone-900 dark:text-stone-100 flex items-center gap-2">
              <Store className="w-4 h-4 text-emerald-600" />
              <span>Store Profile &amp; Location Branding</span>
            </h3>

            <button
              type="button"
              onClick={() => handleSaveSettings()}
              disabled={isSaving}
              className="px-3.5 py-1.5 bg-[#064e3b] hover:bg-[#043b2c] text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {isSaving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              <span>Save Store Profile</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-semibold mb-1">Store Name</label>
              <input
                type="text"
                required
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-2.5 font-bold"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1">Brand Tagline</label>
              <input
                type="text"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-2.5 italic"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block font-semibold mb-1">Store Physical Address</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-2.5"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1">Contact Phone(s)</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-2.5 font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1">Store Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-2.5 font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1">TIN / Tax Identification Number</label>
              <input
                type="text"
                value={taxNumber}
                onChange={(e) => setTaxNumber(e.target.value)}
                placeholder="TIN-00..."
                className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-2.5 font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1">Default Operating Currency</label>
              <input
                type="text"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                placeholder="ETB"
                className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-2.5 font-mono font-bold"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-stone-100 dark:border-stone-800">
            <span className="text-[11px] text-stone-500">
              Changes update your store receipt headers, location branding, and tax documents immediately.
            </span>

            <button
              type="button"
              onClick={() => handleSaveSettings()}
              disabled={isSaving}
              className="px-4 py-2 bg-[#064e3b] hover:bg-[#043b2c] text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {isSaving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#6ee7b7]" />
              ) : (
                <Check className="w-3.5 h-3.5 text-[#6ee7b7]" />
              )}
              <span>Save Profile Changes</span>
            </button>
          </div>
        </div>

        {/* Taxes & Printing Configuration */}
        <div className="p-5 bg-white dark:bg-[#1c1815] border border-[#e6dfd5] dark:border-[#362e26] rounded-2xl shadow-xs space-y-4">
          <h3 className="font-bold text-sm text-stone-900 dark:text-stone-100 flex items-center gap-2">
            <Receipt className="w-4 h-4 text-emerald-600" />
            <span>Fiscal Taxes &amp; Receipt Settings</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            {/* Receipt Mode & Printing Preference */}
            <div className="sm:col-span-2 p-3 bg-stone-50 dark:bg-stone-800/60 rounded-xl border border-stone-200 dark:border-stone-700">
              <label className="block font-bold mb-1.5 text-stone-900 dark:text-stone-100">
                Receipt Behavior on Checkout Completion
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-2">
                <label
                  className={`p-3 rounded-xl border flex flex-col cursor-pointer transition ${
                    receiptMode === 'record_only'
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-950 dark:text-emerald-200 font-bold shadow-xs'
                      : 'border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <input
                      type="radio"
                      name="receiptMode"
                      value="record_only"
                      checked={receiptMode === 'record_only'}
                      onChange={() => setReceiptMode('record_only')}
                      className="text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="text-xs font-black">Just Record Sale (No Receipt)</span>
                  </div>
                  <p className="text-[11px] text-stone-500 dark:text-stone-400 font-normal ml-5">
                    Records transaction directly into ledger/reports. No popup, no printer spool. Fast checkout.
                  </p>
                </label>

                <label
                  className={`p-3 rounded-xl border flex flex-col cursor-pointer transition ${
                    receiptMode === 'ask_each_time'
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-950 dark:text-emerald-200 font-bold shadow-xs'
                      : 'border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <input
                      type="radio"
                      name="receiptMode"
                      value="ask_each_time"
                      checked={receiptMode === 'ask_each_time'}
                      onChange={() => setReceiptMode('ask_each_time')}
                      className="text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="text-xs font-black">Ask Each Time (Preview Modal)</span>
                  </div>
                  <p className="text-[11px] text-stone-500 dark:text-stone-400 font-normal ml-5">
                    Shows the completed sale preview modal with optional Thermal Print &amp; PDF download buttons.
                  </p>
                </label>

                <label
                  className={`p-3 rounded-xl border flex flex-col cursor-pointer transition ${
                    receiptMode === 'always_print'
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-950 dark:text-emerald-200 font-bold shadow-xs'
                      : 'border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <input
                      type="radio"
                      name="receiptMode"
                      value="always_print"
                      checked={receiptMode === 'always_print'}
                      onChange={() => setReceiptMode('always_print')}
                      className="text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="text-xs font-black">Always Print Thermal Receipt</span>
                  </div>
                  <p className="text-[11px] text-stone-500 dark:text-stone-400 font-normal ml-5">
                    Records the sale and triggers the browser print dialog immediately upon checkout.
                  </p>
                </label>
              </div>
            </div>

            <div>
              <label className="block font-semibold mb-1">VAT / Sales Tax Percentage (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={taxRatePercent}
                onChange={(e) => setTaxRatePercent(parseFloat(e.target.value) || 0)}
                className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-2.5 font-mono font-bold"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1">Thermal Tape Paper Width</label>
              <select
                value={thermalReceiptWidth}
                onChange={(e) => setThermalReceiptWidth(e.target.value as any)}
                className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-2.5 font-semibold"
              >
                <option value="80mm">Standard 80mm POS Thermal Roll</option>
                <option value="58mm">Compact 58mm Mobile Thermal Printer</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block font-semibold mb-1">Receipt Footer Message</label>
              <input
                type="text"
                value={receiptFooterMessage}
                onChange={(e) => setReceiptFooterMessage(e.target.value)}
                className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-2.5"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1">Store Barcode Prefix</label>
              <input
                type="text"
                value={barcodePrefix}
                onChange={(e) => setBarcodePrefix(e.target.value)}
                placeholder="SAP"
                className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-2.5 font-mono font-bold"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1">Default Low Stock Threshold</label>
              <input
                type="number"
                min="1"
                value={lowStockDefaultThreshold}
                onChange={(e) => setLowStockDefaultThreshold(parseInt(e.target.value, 10) || 5)}
                className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-2.5 font-mono"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2">
          {savedSuccess && (
            <div className="flex items-center gap-2 px-3.5 py-2 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-700 rounded-xl text-xs font-bold text-emerald-800 dark:text-emerald-200 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Store Profile &amp; Settings Saved Successfully!</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isSaving}
            className="px-6 py-2.5 bg-[#064e3b] hover:bg-[#043b2c] text-white font-extrabold text-xs sm:text-sm rounded-xl shadow-md transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-[#6ee7b7]" />
                <span>Saving...</span>
              </>
            ) : savedSuccess ? (
              <>
                <Check className="w-4 h-4 text-[#6ee7b7]" />
                <span>Saved Successfully!</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Save Store Settings</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Disaster Recovery & Complete Database Backup */}
      <div className="p-5 bg-white dark:bg-[#1c1815] border border-[#e6dfd5] dark:border-[#362e26] rounded-2xl shadow-xs space-y-3">
        <h3 className="font-bold text-sm text-stone-900 dark:text-stone-100 flex items-center gap-2">
          <Download className="w-4 h-4 text-emerald-600" />
          <span>Disaster Recovery &amp; Offline Data Backup</span>
        </h3>
        <p className="text-xs text-stone-500">
          Export full JSON snapshot containing products, barcodes, customers, transaction ledger, and audit history.
        </p>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            type="button"
            onClick={handleExportFullBackup}
            className="px-4 py-2 bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download Full Database Backup (JSON)</span>
          </button>

          <label className="px-4 py-2 border border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer text-stone-700 dark:text-stone-300">
            <Upload className="w-3.5 h-3.5" />
            <span>Restore Backup from File</span>
            <input
              type="file"
              accept=".json"
              onChange={handleRestoreBackup}
              className="hidden"
            />
          </label>

          <button
            type="button"
            onClick={() => setShowResetModal(true)}
            className="px-3.5 py-2 text-amber-700 hover:text-white hover:bg-amber-600 border border-amber-300 dark:border-amber-900/60 rounded-xl text-xs font-bold transition ml-auto flex items-center gap-1.5 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Wipe Catalog &amp; Sales Data Only</span>
          </button>
        </div>
      </div>

      {/* ================= DANGER ZONE: TOTAL SYSTEM FACTORY RESET ================= */}
      {/* Requirement: Add a way to remove everything including all users and system uniform across devices */}
      <div className="p-5 bg-rose-50/70 dark:bg-rose-950/20 border-2 border-rose-300 dark:border-rose-900/60 rounded-2xl shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-md">
              <ShieldAlert className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-extrabold text-sm text-rose-950 dark:text-rose-100">
                  Danger Zone: Total System Factory Reset
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-200 dark:bg-rose-900/80 text-rose-900 dark:text-rose-200 uppercase font-black tracking-wider">
                  Removes Everything Including All Users
                </span>
              </div>
              <p className="text-xs text-rose-800 dark:text-rose-300/90 mt-1 max-w-2xl leading-relaxed">
                Permanently wipes all <strong>users &amp; staff accounts</strong> (including Administrator and Cashiers), credentials, sessions, <strong>products, catalog, inventory, sales receipts, customer debts, expenses, and settings</strong> across all connected terminals and devices. The system will revert back to the clean initial root administrator setup.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setFactoryResetPasscode('');
              setFactoryResetConfirmText('');
              setFactoryResetError(null);
              setShowFactoryResetModal(true);
            }}
            className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs rounded-xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer shrink-0 group"
          >
            <Trash2 className="w-4 h-4 group-hover:scale-110 transition-transform" />
            <span>Factory Reset: Remove Everything</span>
          </button>
        </div>
      </div>

      {/* Modal 1: Reset Catalog & Sales Data Only */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-3xl p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-300 flex items-center justify-center">
              <Trash2 className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-base font-black text-stone-900 dark:text-stone-100">
                Wipe Catalog &amp; Sales Data?
              </h3>
              <p className="text-xs text-stone-600 dark:text-stone-400 mt-1 leading-relaxed">
                This will delete products, sales orders, customers, and expenses. Staff accounts and credentials will remain intact.
              </p>

              <label className="mt-3 flex items-center gap-2 p-2 rounded-xl bg-stone-50 dark:bg-stone-800 text-xs font-semibold text-stone-700 dark:text-stone-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={resetProfileOnWipe}
                  onChange={(e) => setResetProfileOnWipe(e.target.checked)}
                  className="rounded text-amber-600 focus:ring-amber-500"
                />
                <span>Also reset Store Profile to defaults</span>
              </label>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                className="px-4 py-2 rounded-xl border border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 text-xs font-bold transition cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => {
                  storage.wipeAllData({ resetSettings: resetProfileOnWipe });
                  sound.playCheckoutSuccess();
                  setShowResetModal(false);
                  onRefreshData();
                }}
                className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black shadow-md transition cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Wipe Catalog &amp; Sales</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: TOTAL SYSTEM FACTORY RESET (Removes Everything Including All Users) */}
      {showFactoryResetModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white dark:bg-stone-900 border-2 border-rose-300 dark:border-rose-800 rounded-3xl p-6 sm:p-7 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 max-h-[92vh] overflow-y-auto">
            <div className="flex items-start gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-300 flex items-center justify-center shrink-0 shadow-sm">
                <ShieldAlert className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-black text-rose-900 dark:text-rose-100">
                  Complete System Factory Reset
                </h3>
                <p className="text-xs text-rose-700 dark:text-rose-300 mt-0.5 font-bold">
                  Remove everything including all users across all devices
                </p>
              </div>
            </div>

            {/* Itemized Destruction Warning */}
            <div className="p-4 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/60 rounded-2xl space-y-2 text-xs text-rose-900 dark:text-rose-200">
              <div className="font-extrabold flex items-center gap-1.5 text-rose-700 dark:text-rose-300">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>The following will be permanently erased:</span>
              </div>
              <ul className="list-disc pl-5 space-y-1 text-[11px] font-medium leading-relaxed">
                <li><strong>All User Accounts:</strong> Root Administrator, Managers, Cashiers, Auditor accounts, and authentication credentials.</li>
                <li><strong>All Inventory &amp; Products:</strong> Product items, custom barcodes, categories, and stock movement logs.</li>
                <li><strong>All Financials:</strong> Sales receipts, held orders, refund logs, till shifts, and credit accounts.</li>
                <li><strong>All Store Settings:</strong> Reverts branding, tax rates, printer settings, and local backups to factory zero.</li>
                <li><strong>All Connected Devices:</strong> Uniformly clears state across all terminals via backend server synchronization.</li>
              </ul>
            </div>

            {/* Error Message */}
            {factoryResetError && (
              <div className="p-3 bg-rose-100 dark:bg-rose-900/60 border border-rose-300 dark:border-rose-700 rounded-xl text-xs text-rose-900 dark:text-rose-100 flex items-center gap-2 animate-in fade-in">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{factoryResetError}</span>
              </div>
            )}

            {/* Master Passcode Verification Field */}
            <div className="space-y-3 pt-1">
              <div>
                <label className="block text-xs font-bold text-stone-800 dark:text-stone-200 mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-rose-600" />
                    <span>Enter Master Passcode to Authorize Reset</span>
                  </span>
                  <span className="text-[10px] text-stone-500 font-mono">Default: Sappy#1313</span>
                </label>
                <div className="relative">
                  <input
                    type={showResetPasscode ? 'text' : 'password'}
                    value={factoryResetPasscode}
                    onChange={(e) => setFactoryResetPasscode(e.target.value)}
                    placeholder="Enter Master Passcode (Sappy#1313)"
                    disabled={isExecutingFactoryReset}
                    className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-xl p-2.5 text-xs font-mono font-bold pr-10 focus:ring-2 focus:ring-rose-500 focus:outline-hidden"
                  />
                  <button
                    type="button"
                    onClick={() => setShowResetPasscode(!showResetPasscode)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 cursor-pointer"
                  >
                    {showResetPasscode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-600 dark:text-stone-400 mb-1">
                  Or type <span className="font-mono font-bold text-rose-600">RESET ALL</span> to confirm:
                </label>
                <input
                  type="text"
                  value={factoryResetConfirmText}
                  onChange={(e) => setFactoryResetConfirmText(e.target.value)}
                  placeholder="RESET ALL"
                  disabled={isExecutingFactoryReset}
                  className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-xl p-2.5 text-xs font-mono uppercase focus:ring-2 focus:ring-rose-500 focus:outline-hidden"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-stone-200 dark:border-stone-800">
              <button
                type="button"
                disabled={isExecutingFactoryReset}
                onClick={() => setShowFactoryResetModal(false)}
                className="px-4 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 text-xs font-bold transition cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={isExecutingFactoryReset}
                onClick={handleExecuteFactoryReset}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black shadow-lg transition cursor-pointer flex items-center gap-2 disabled:opacity-50"
              >
                {isExecutingFactoryReset ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Wiping System Everywhere...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Confirm &amp; Remove Everything</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
