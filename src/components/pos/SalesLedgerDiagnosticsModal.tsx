import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Database,
  Cloud,
  UploadCloud,
  DownloadCloud,
  GitCompare,
  Clock,
  Search,
  Download,
  Check,
  ChevronDown,
  ChevronUp,
  HardDrive,
  ShieldAlert,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';
import {
  SalesDiagnosticReport,
  DiagnosticDiscrepancy,
  DiagnosticIssueType,
  Sale,
} from '../../types';
import { salesDiagnosticsService } from '../../services/salesDiagnostics';
import { storage } from '../../services/storage';
import { sound } from '../../services/sound';
import { toast } from '../../services/toast';

interface SalesLedgerDiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDataChanged: () => void;
}

export const SalesLedgerDiagnosticsModal: React.FC<SalesLedgerDiagnosticsModalProps> = ({
  isOpen,
  onClose,
  onDataChanged,
}) => {
  const [report, setReport] = useState<SalesDiagnosticReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isResolvingAll, setIsResolvingAll] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'ALL' | DiagnosticIssueType>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const runScan = async () => {
    setIsLoading(true);
    try {
      const res = await salesDiagnosticsService.runSalesDiagnostics();
      setReport(res);
      if (res.discrepancies.length === 0) {
        sound.playCheckoutSuccess();
      }
    } catch (err: any) {
      toast.error('Diagnostic scan encountered an error: ' + (err?.message || 'Unknown'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      runScan();
    }
  }, [isOpen]);

  const handleResyncAll = async () => {
    if (!report || report.discrepancies.length === 0) return;
    setIsResolvingAll(true);
    try {
      const result = await salesDiagnosticsService.resyncAllDiscrepancies(report);
      if (result.success) {
        sound.playCheckoutSuccess();
        toast.success(
          `Re-sync complete! Pushed: ${result.pushedCount}, Pulled: ${result.pulledCount}, Conflicts Resolved: ${result.resolvedCount}.`
        );
        onDataChanged();
        await runScan();
      } else {
        toast.error('Re-sync partially failed: ' + (result.error || 'Unknown issue'));
      }
    } catch (err: any) {
      toast.error('Failed to re-sync discrepancies: ' + err?.message);
    } finally {
      setIsResolvingAll(false);
    }
  };

  const handlePushSingle = async (sale: Sale) => {
    setProcessingId(sale.id);
    try {
      const res = await salesDiagnosticsService.pushSingleSaleToCloud(sale);
      if (res.success) {
        sound.playScanSuccess();
        toast.success(`Sale #${sale.receiptNumber} successfully uploaded to Cloud Firestore!`);
        onDataChanged();
        await runScan();
      } else {
        toast.error(res.error || 'Failed to upload sale.');
      }
    } finally {
      setProcessingId(null);
    }
  };

  const handlePullSingle = async (sale: Sale) => {
    setProcessingId(sale.id);
    try {
      const res = await salesDiagnosticsService.pullSingleSaleToLocal(sale);
      if (res.success) {
        sound.playScanSuccess();
        toast.success(`Sale #${sale.receiptNumber} successfully pulled into local IndexedDB!`);
        onDataChanged();
        await runScan();
      } else {
        toast.error(res.error || 'Failed to pull sale.');
      }
    } finally {
      setProcessingId(null);
    }
  };

  const handleResolveConflict = async (
    saleId: string,
    resolution: 'prefer_local' | 'prefer_cloud' | 'prefer_refunded',
    localSale?: Sale,
    cloudSale?: Sale
  ) => {
    setProcessingId(saleId);
    try {
      const res = await salesDiagnosticsService.resolveConflict(
        saleId,
        resolution,
        localSale,
        cloudSale
      );
      if (res.success) {
        sound.playScanSuccess();
        toast.success(`Conflict resolved for sale #${localSale?.receiptNumber || cloudSale?.receiptNumber}`);
        onDataChanged();
        await runScan();
      } else {
        toast.error(res.error || 'Failed to resolve conflict.');
      }
    } finally {
      setProcessingId(null);
    }
  };

  const handleRetryQueueItem = async (queueItemId: string) => {
    setProcessingId(queueItemId);
    try {
      const res = await salesDiagnosticsService.retryQueueItem(queueItemId);
      if (res.success) {
        sound.playScanSuccess();
        toast.success('Queued sale successfully retried and synchronized!');
        onDataChanged();
        await runScan();
      } else {
        toast.error(res.error || 'Retry failed.');
      }
    } finally {
      setProcessingId(null);
    }
  };

  const handleDismissQueueItem = (queueItemId: string) => {
    salesDiagnosticsService.removeSaleFromQueue(queueItemId);
    toast.success('Stuck queue item dismissed.');
    onDataChanged();
    runScan();
  };

  const filteredDiscrepancies = useMemo(() => {
    if (!report) return [];
    return report.discrepancies.filter((item) => {
      if (activeFilter !== 'ALL' && item.issueType !== activeFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return (
          item.receiptNumber.toLowerCase().includes(q) ||
          item.title.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q) ||
          (item.localSale?.cashierName && item.localSale.cashierName.toLowerCase().includes(q)) ||
          (item.cloudSale?.cashierName && item.cloudSale.cashierName.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [report, activeFilter, searchQuery]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs">
      <div className="bg-white dark:bg-[#1a1614] border border-[#e6dfd5] dark:border-[#382f27] rounded-3xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[#e6dfd5] dark:border-[#332a22] flex items-center justify-between gap-3 bg-[#fbf9f5] dark:bg-[#201b17]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-stone-900 dark:text-stone-100">
                  Sales Ledger Sync Diagnostics
                </h2>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  IndexedDB ↔ Firestore
                </span>
              </div>
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                Audit and reconcile orphaned or failed-to-sync records between local storage and Cloud Firestore
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => report && salesDiagnosticsService.exportReportToJson(report)}
              disabled={!report}
              title="Export Diagnostic Log to JSON"
              className="p-2 border border-stone-200 dark:border-stone-800 rounded-xl text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition text-xs font-bold flex items-center gap-1.5 disabled:opacity-40"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Export Log</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 touch-scroll">
          {/* Cloud Quota Status Notice */}
          {storage.isQuotaExceeded() && (
            <div className="p-3.5 rounded-2xl border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs">
                <span className="font-bold">Cloud Firestore Daily Write Limit Reached (Free Tier Quota).</span>
                <p className="mt-0.5 text-amber-800 dark:text-amber-300">
                  Sales are safely preserved in browser <span className="font-bold">IndexedDB</span> and synchronized with the <span className="font-bold">Express Server</span>. Cloud Firestore outbound writes are automatically paused to prevent API errors and will resume when the quota resets daily at 00:00 UTC.
                </p>
              </div>
            </div>
          )}

          {/* Health Status Banner */}
          {report && (
            <div
              className={`p-3.5 sm:p-4 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                report.discrepancies.length === 0
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/50 text-emerald-900 dark:text-emerald-100'
                  : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/50 text-amber-900 dark:text-amber-100'
              }`}
            >
              <div className="flex items-center gap-3">
                {report.discrepancies.length === 0 ? (
                  <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-6 h-6 text-amber-600 dark:text-amber-400 shrink-0" />
                )}
                <div>
                  <h3 className="text-sm font-bold">
                    {report.discrepancies.length === 0
                      ? 'Local IndexedDB & Cloud Firestore are 100% In Sync'
                      : `${report.discrepancies.length} Discrepanc${report.discrepancies.length === 1 ? 'y' : 'ies'} Found`}
                  </h3>
                  <p className="text-xs opacity-80 mt-0.5">
                    {report.discrepancies.length === 0
                      ? `All ${report.totalIndexedDbSales} sales match exactly across local stores and live cloud database.`
                      : `Found ${report.orphanedLocalCount} unsynced local, ${report.orphanedCloudCount} cloud-only, ${report.mismatchCount} conflicts, ${report.stuckQueueCount} stuck queue items.`}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto w-full sm:w-auto">
                <button
                  onClick={runScan}
                  disabled={isLoading || isResolvingAll}
                  className="flex-1 sm:flex-initial px-3 py-2 bg-white dark:bg-[#1a1614] border border-stone-200 dark:border-stone-800 rounded-xl text-xs font-bold text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 transition flex items-center justify-center gap-1.5 shadow-2xs disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                  Re-Scan
                </button>

                {report.discrepancies.length > 0 && (
                  <button
                    onClick={handleResyncAll}
                    disabled={isResolvingAll || isLoading}
                    className="flex-1 sm:flex-initial px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50"
                  >
                    {isResolvingAll ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    Resolve & Re-Sync All
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Metric Cards Grid */}
          {report && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-2.5">
              <div className="p-3 bg-stone-50 dark:bg-[#201b17] border border-stone-200 dark:border-stone-800/80 rounded-2xl flex flex-col justify-between">
                <div className="flex items-center justify-between text-stone-500 dark:text-stone-400">
                  <span className="text-[11px] font-bold">Local IndexedDB</span>
                  <HardDrive className="w-3.5 h-3.5 text-stone-600 dark:text-stone-400" />
                </div>
                <div className="text-lg sm:text-xl font-black font-mono text-stone-900 dark:text-stone-100 mt-1">
                  {report.totalIndexedDbSales}
                </div>
              </div>

              <div className="p-3 bg-stone-50 dark:bg-[#201b17] border border-stone-200 dark:border-stone-800/80 rounded-2xl flex flex-col justify-between">
                <div className="flex items-center justify-between text-stone-500 dark:text-stone-400">
                  <span className="text-[11px] font-bold">Cloud Firestore</span>
                  <Cloud className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                </div>
                <div className="text-lg sm:text-xl font-black font-mono text-stone-900 dark:text-stone-100 mt-1">
                  {report.totalCloudSales}
                </div>
              </div>

              <div className="p-3 bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-800/40 rounded-2xl flex flex-col justify-between">
                <div className="flex items-center justify-between text-amber-700 dark:text-amber-400">
                  <span className="text-[11px] font-bold">Local Orphaned</span>
                  <UploadCloud className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="text-lg sm:text-xl font-black font-mono text-amber-800 dark:text-amber-300 mt-1">
                  {report.orphanedLocalCount}
                </div>
              </div>

              <div className="p-3 bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200/70 dark:border-purple-800/40 rounded-2xl flex flex-col justify-between">
                <div className="flex items-center justify-between text-purple-700 dark:text-purple-400">
                  <span className="text-[11px] font-bold">Cloud Orphaned</span>
                  <DownloadCloud className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                </div>
                <div className="text-lg sm:text-xl font-black font-mono text-purple-800 dark:text-purple-300 mt-1">
                  {report.orphanedCloudCount}
                </div>
              </div>

              <div className="p-3 bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200/70 dark:border-rose-800/40 rounded-2xl flex flex-col justify-between">
                <div className="flex items-center justify-between text-rose-700 dark:text-rose-400">
                  <span className="text-[11px] font-bold">Field Conflicts</span>
                  <GitCompare className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                </div>
                <div className="text-lg sm:text-xl font-black font-mono text-rose-800 dark:text-rose-300 mt-1">
                  {report.mismatchCount}
                </div>
              </div>

              <div className="p-3 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/70 dark:border-blue-800/40 rounded-2xl flex flex-col justify-between">
                <div className="flex items-center justify-between text-blue-700 dark:text-blue-400">
                  <span className="text-[11px] font-bold">Stuck in Queue</span>
                  <Clock className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="text-lg sm:text-xl font-black font-mono text-blue-800 dark:text-blue-300 mt-1">
                  {report.stuckQueueCount}
                </div>
              </div>
            </div>
          )}

          {/* Filter Bar & Search */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-1">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 touch-scroll">
              <button
                onClick={() => setActiveFilter('ALL')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 ${
                  activeFilter === 'ALL'
                    ? 'bg-stone-900 text-white dark:bg-white dark:text-stone-900'
                    : 'bg-stone-100 dark:bg-[#25201b] text-stone-600 dark:text-stone-400 hover:bg-stone-200'
                }`}
              >
                All Issues ({report?.discrepancies.length || 0})
              </button>
              <button
                onClick={() => setActiveFilter('ORPHAN_LOCAL')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 ${
                  activeFilter === 'ORPHAN_LOCAL'
                    ? 'bg-amber-600 text-white'
                    : 'bg-stone-100 dark:bg-[#25201b] text-stone-600 dark:text-stone-400 hover:bg-stone-200'
                }`}
              >
                Local Unsynced ({report?.orphanedLocalCount || 0})
              </button>
              <button
                onClick={() => setActiveFilter('ORPHAN_CLOUD')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 ${
                  activeFilter === 'ORPHAN_CLOUD'
                    ? 'bg-purple-600 text-white'
                    : 'bg-stone-100 dark:bg-[#25201b] text-stone-600 dark:text-stone-400 hover:bg-stone-200'
                }`}
              >
                Cloud Only ({report?.orphanedCloudCount || 0})
              </button>
              <button
                onClick={() => setActiveFilter('STATUS_MISMATCH')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 ${
                  activeFilter === 'STATUS_MISMATCH'
                    ? 'bg-rose-600 text-white'
                    : 'bg-stone-100 dark:bg-[#25201b] text-stone-600 dark:text-stone-400 hover:bg-stone-200'
                }`}
              >
                Conflicts ({report?.mismatchCount || 0})
              </button>
              <button
                onClick={() => setActiveFilter('QUEUE_STUCK')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 ${
                  activeFilter === 'QUEUE_STUCK'
                    ? 'bg-blue-600 text-white'
                    : 'bg-stone-100 dark:bg-[#25201b] text-stone-600 dark:text-stone-400 hover:bg-stone-200'
                }`}
              >
                Queue ({report?.stuckQueueCount || 0})
              </button>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search receipt #, cashier..."
                className="w-full bg-stone-100 dark:bg-[#25201b] border border-transparent focus:border-stone-400 dark:focus:border-stone-600 rounded-xl pl-8 pr-3 py-1.5 text-xs text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-hidden"
              />
            </div>
          </div>

          {/* Discrepancy Items List */}
          <div className="space-y-2.5">
            {isLoading ? (
              <div className="p-12 text-center text-stone-400 flex flex-col items-center justify-center gap-3">
                <RefreshCw className="w-8 h-8 animate-spin text-amber-500" />
                <p className="text-xs font-bold">Scanning IndexedDB and Cloud Firestore collections...</p>
              </div>
            ) : filteredDiscrepancies.length === 0 ? (
              <div className="p-10 border border-dashed border-stone-200 dark:border-stone-800 rounded-2xl text-center">
                <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2 opacity-80" />
                <h4 className="text-sm font-bold text-stone-800 dark:text-stone-200">
                  {report?.discrepancies.length === 0
                    ? 'All Records In Sync!'
                    : 'No Discrepancies Match the Selected Filter'}
                </h4>
                <p className="text-xs text-stone-500 dark:text-stone-400 mt-1 max-w-sm mx-auto">
                  {report?.discrepancies.length === 0
                    ? 'Every completed sale and refund is uniformly recorded in both your local browser database and Cloud Firestore.'
                    : 'Try clearing the search query or switching tabs above to inspect other categories.'}
                </p>
              </div>
            ) : (
              filteredDiscrepancies.map((item) => {
                const isExpanded = expandedId === item.id;
                const isItemProcessing = processingId === item.id;

                let badgeColor = 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300';
                if (item.issueType === 'ORPHAN_LOCAL') {
                  badgeColor = 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-300 dark:border-amber-800';
                } else if (item.issueType === 'ORPHAN_CLOUD') {
                  badgeColor = 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border-purple-300 dark:border-purple-800';
                } else if (item.issueType === 'STATUS_MISMATCH') {
                  badgeColor = 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border-rose-300 dark:border-rose-800';
                } else if (item.issueType === 'QUEUE_STUCK') {
                  badgeColor = 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border-blue-300 dark:border-blue-800';
                }

                return (
                  <div
                    key={item.id}
                    className="p-3.5 bg-stone-50 dark:bg-[#201b17] border border-stone-200 dark:border-stone-800 rounded-2xl transition hover:border-stone-300 dark:hover:border-stone-700"
                  >
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-xl bg-white dark:bg-[#2d2620] border border-stone-200 dark:border-stone-700/80 flex items-center justify-center shrink-0 mt-0.5">
                          {item.issueType === 'ORPHAN_LOCAL' ? (
                            <UploadCloud className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                          ) : item.issueType === 'ORPHAN_CLOUD' ? (
                            <DownloadCloud className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                          ) : item.issueType === 'STATUS_MISMATCH' ? (
                            <GitCompare className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                          ) : (
                            <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                          )}
                        </div>

                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono font-black text-sm text-stone-900 dark:text-stone-100">
                              {item.receiptNumber}
                            </span>
                            <span
                              className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${badgeColor}`}
                            >
                              {item.issueType.replace('_', ' ')}
                            </span>
                            {item.localSale && (
                              <span className="text-xs font-mono font-bold text-stone-600 dark:text-stone-400">
                                {item.localSale.grandTotal.toFixed(2)} ETB
                              </span>
                            )}
                            {item.localSale?.cashierName && (
                              <span className="text-[11px] text-stone-500 dark:text-stone-400">
                                • {item.localSale.cashierName}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-stone-600 dark:text-stone-300 mt-1">
                            {item.description}
                          </p>
                        </div>
                      </div>

                      {/* Item Resolution Actions */}
                      <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : item.id)}
                          className="px-2.5 py-1.5 rounded-xl border border-stone-200 dark:border-stone-700 text-[11px] font-bold text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition flex items-center gap-1"
                        >
                          <span>{isExpanded ? 'Hide Diff' : 'View Diff'}</span>
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>

                        {item.issueType === 'ORPHAN_LOCAL' && item.localSale && (
                          <button
                            onClick={() => handlePushSingle(item.localSale!)}
                            disabled={isItemProcessing}
                            className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                          >
                            {isItemProcessing ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <UploadCloud className="w-3.5 h-3.5" />
                            )}
                            <span>Push to Cloud</span>
                          </button>
                        )}

                        {item.issueType === 'ORPHAN_CLOUD' && item.cloudSale && (
                          <button
                            onClick={() => handlePullSingle(item.cloudSale!)}
                            disabled={isItemProcessing}
                            className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                          >
                            {isItemProcessing ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <DownloadCloud className="w-3.5 h-3.5" />
                            )}
                            <span>Pull to Local</span>
                          </button>
                        )}

                        {item.issueType === 'STATUS_MISMATCH' && (
                          <button
                            onClick={() =>
                              handleResolveConflict(
                                item.id,
                                'prefer_refunded',
                                item.localSale,
                                item.cloudSale
                              )
                            }
                            disabled={isItemProcessing}
                            className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                          >
                            {isItemProcessing ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Check className="w-3.5 h-3.5" />
                            )}
                            <span>Enforce Unified</span>
                          </button>
                        )}

                        {item.issueType === 'QUEUE_STUCK' && item.queueItem && (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleRetryQueueItem(item.queueItem!.id)}
                              disabled={isItemProcessing}
                              className="px-2.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition flex items-center gap-1 disabled:opacity-50"
                            >
                              <RefreshCw className={`w-3.5 h-3.5 ${isItemProcessing ? 'animate-spin' : ''}`} />
                              <span>Retry</span>
                            </button>
                            <button
                              onClick={() => handleDismissQueueItem(item.queueItem!.id)}
                              className="px-2.5 py-1.5 rounded-xl border border-rose-200 dark:border-rose-900 text-rose-600 text-xs font-bold hover:bg-rose-50 dark:hover:bg-rose-950 transition"
                            >
                              Dismiss
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Comparative Side-by-Side Diff Section */}
                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-stone-200 dark:border-stone-800/80 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        {/* Local Record */}
                        <div className="p-3 bg-white dark:bg-[#181412] rounded-xl border border-stone-200 dark:border-stone-800">
                          <div className="flex items-center gap-2 font-bold text-stone-900 dark:text-stone-100 mb-2">
                            <HardDrive className="w-3.5 h-3.5 text-amber-500" />
                            <span>Local IndexedDB State</span>
                          </div>
                          {item.localSale ? (
                            <div className="space-y-1 font-mono text-[11px] text-stone-600 dark:text-stone-400">
                              <div>Receipt: <strong className="text-stone-900 dark:text-stone-100">{item.localSale.receiptNumber}</strong></div>
                              <div>Status: <span className="font-bold">{item.localSale.status}</span></div>
                              <div>Total: <strong>{item.localSale.grandTotal.toFixed(2)} ETB</strong></div>
                              <div>Items: {item.localSale.items?.length || 0} product(s)</div>
                              <div>Cashier: {item.localSale.cashierName}</div>
                              <div>Date: {new Date(item.localSale.date).toLocaleString()}</div>
                              <div>Synced Flag: {item.localSale.isSynced ? 'true' : 'false'}</div>
                            </div>
                          ) : (
                            <div className="text-stone-400 italic py-2">
                              Record does not exist in local IndexedDB.
                            </div>
                          )}
                        </div>

                        {/* Cloud Record */}
                        <div className="p-3 bg-white dark:bg-[#181412] rounded-xl border border-stone-200 dark:border-stone-800">
                          <div className="flex items-center gap-2 font-bold text-stone-900 dark:text-stone-100 mb-2">
                            <Cloud className="w-3.5 h-3.5 text-sky-500" />
                            <span>Cloud Firestore Collection State</span>
                          </div>
                          {item.cloudSale ? (
                            <div className="space-y-1 font-mono text-[11px] text-stone-600 dark:text-stone-400">
                              <div>Receipt: <strong className="text-stone-900 dark:text-stone-100">{item.cloudSale.receiptNumber}</strong></div>
                              <div>Status: <span className="font-bold">{item.cloudSale.status}</span></div>
                              <div>Total: <strong>{item.cloudSale.grandTotal.toFixed(2)} ETB</strong></div>
                              <div>Items: {item.cloudSale.items?.length || 0} product(s)</div>
                              <div>Cashier: {item.cloudSale.cashierName}</div>
                              <div>Date: {new Date(item.cloudSale.date).toLocaleString()}</div>
                              <div>Synced Flag: {item.cloudSale.isSynced ? 'true' : 'false'}</div>
                            </div>
                          ) : (
                            <div className="text-stone-400 italic py-2">
                              Record does not exist in Cloud Firestore collection.
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#e6dfd5] dark:border-[#332a22] flex flex-col sm:flex-row items-center justify-between gap-3 bg-[#fbf9f5] dark:bg-[#201b17] text-xs text-stone-500 dark:text-stone-400">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse" />
            <span>
              Last scanned:{' '}
              {report?.scannedAt ? new Date(report.scannedAt).toLocaleTimeString() : 'Pending'}
              {report?.durationMs !== undefined && ` (${report.durationMs}ms)`}
            </span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-stone-200 dark:bg-stone-800 hover:bg-stone-300 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 rounded-xl font-bold transition"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
