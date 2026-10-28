import React, {useState, useMemo} from 'react';
import {FileText, Search, Filter, Download} from 'lucide-react';
import {AuditLog} from '../types';
import {storage} from '../services/storage';
import {ExportService} from '../services/export';

export const AuditLogsView: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  const logs = storage.getAuditLogs();

  const filteredLogs = useMemo(() => {
    return logs.filter((l) => {
      if (selectedCategory !== 'ALL' && l.category !== selectedCategory) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return (
          l.action.toLowerCase().includes(q) ||
          l.staffName.toLowerCase().includes(q) ||
          l.details.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [logs, selectedCategory, searchQuery]);

  const handleExportCSV = () => {
    const headers = ['Timestamp', 'Staff Member', 'Action', 'Category', 'Details'];
    const rows = filteredLogs.map((l) => [
      `"${new Date(l.timestamp).toLocaleString()}"`,
      `"${l.staffName}"`,
      `"${l.action}"`,
      `"${l.category}"`,
      `"${l.details.replace(/"/g, '""')}"`,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    ExportService.downloadCSV(`sappy_audit_logs_${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col h-full max-h-full overflow-hidden bg-[#fdfbf7] dark:bg-[#12100e]">
      {/* Top Controls */}
      <div className="p-3 bg-white dark:bg-[#1c1815] border-b border-[#e6dfd5] dark:border-[#362e26] flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search audit trail by user, action, or details..."
              className="w-full bg-[#f5f1e8] dark:bg-[#25201b] border border-transparent focus:border-[#064e3b] rounded-xl pl-9 pr-4 py-2 text-xs text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-hidden"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="bg-[#f5f1e8] dark:bg-[#25201b] border border-stone-200 dark:border-stone-700 rounded-xl px-2.5 py-2 text-xs font-semibold text-stone-900 dark:text-stone-100"
          >
            <option value="ALL">All Categories</option>
            <option value="AUTH">Authentication &amp; User</option>
            <option value="INVENTORY">Inventory &amp; Stock</option>
            <option value="SALES">Sales &amp; Carts</option>
            <option value="REFUND">Refunds &amp; Cancellations</option>
            <option value="CREDIT">Store Credit Ledger</option>
            <option value="CODE_MANAGEMENT">Barcode &amp; QR Assignment</option>
            <option value="SHIFT">Register Shifts</option>
            <option value="SETTINGS">Store Settings</option>
          </select>

          <button
            onClick={handleExportCSV}
            className="p-2 border border-stone-200 dark:border-stone-800 rounded-xl text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition text-xs font-bold flex items-center gap-1"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export Audit CSV</span>
          </button>
        </div>
      </div>

      {/* Audit Logs Table */}
      <div className="flex-1 min-h-0 overflow-y-auto touch-scroll overscroll-contain p-3 pb-24 md:pb-3">
        <div className="bg-white dark:bg-[#1c1815] border border-[#e6dfd5] dark:border-[#362e26] rounded-2xl shadow-xs overflow-hidden">
          {/* Mobile View: Stacked Cards (< 640px) */}
          <div className="block sm:hidden divide-y divide-[#e6dfd5] dark:divide-[#2d251f]">
            {filteredLogs.map((log) => (
              <div key={`log-card-${log.id}`} className="p-3.5 space-y-2 bg-white dark:bg-[#1c1815]">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-bold text-xs text-emerald-800 dark:text-emerald-400">
                      {log.action}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400">
                      {log.category}
                    </span>
                  </div>
                  <span className="font-mono text-[10px] text-stone-400">
                    {new Date(log.timestamp).toLocaleString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </span>
                </div>

                <div className="text-xs text-stone-800 dark:text-stone-200">
                  {log.details}
                </div>

                <div className="text-[11px] text-stone-500 pt-1 border-t border-stone-100 dark:border-stone-800/80 flex items-center justify-between">
                  <span>Staff: <strong>{log.staffName}</strong></span>
                </div>
              </div>
            ))}

            {filteredLogs.length === 0 && (
              <div className="p-10 text-center text-stone-400 text-xs">
                No audit events recorded for the selected filter.
              </div>
            )}
          </div>

          {/* Desktop & Tablet View: Full Table (>= 640px) */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#f5f1e8] dark:bg-[#25201b] border-b border-[#e6dfd5] dark:border-[#362e26] text-stone-700 dark:text-stone-300 font-bold uppercase tracking-wider text-[10px]">
                  <th className="p-3">Timestamp</th>
                  <th className="p-3">Staff Member</th>
                  <th className="p-3">Action</th>
                  <th className="p-3">Category</th>
                  <th className="p-3">Audit Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e6dfd5] dark:divide-[#2d251f]">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-[#fdfbf7] dark:hover:bg-[#201b17]">
                    <td className="p-3 font-mono text-stone-500 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </td>
                    <td className="p-3 font-semibold text-stone-900 dark:text-stone-100 whitespace-nowrap">
                      {log.staffName}
                    </td>
                    <td className="p-3 font-mono font-bold text-emerald-800 dark:text-emerald-400 whitespace-nowrap">
                      {log.action}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400">
                        {log.category}
                      </span>
                    </td>
                    <td className="p-3 text-stone-700 dark:text-stone-300 font-medium">
                      {log.details}
                    </td>
                  </tr>
                ))}

                {filteredLogs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-12 text-center text-stone-400">
                      No audit events recorded for the selected filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
