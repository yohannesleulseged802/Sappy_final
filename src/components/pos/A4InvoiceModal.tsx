import React, { useRef, useState } from 'react';
import {
  X,
  Printer,
  FileDown,
  FileText,
} from 'lucide-react';
import { Sale, StoreSettings } from '../../types';
import { ExportService } from '../../services/export';
import { sound } from '../../services/sound';
import { InvoiceTemplate } from './InvoiceTemplate';
import { toast } from '../../services/toast';

interface A4InvoiceModalProps {
  sale: Sale | null;
  settings: StoreSettings;
  isOpen: boolean;
  onClose: () => void;
  defaultFormat?: 'a4' | 'letter';
}

export const A4InvoiceModal: React.FC<A4InvoiceModalProps> = ({
  sale,
  settings,
  isOpen,
  onClose,
  defaultFormat = 'a4',
}) => {
  const printContainerRef = useRef<HTMLDivElement>(null);
  const [docFormat, setDocFormat] = useState<'a4' | 'letter'>(defaultFormat);
  const [isExporting, setIsExporting] = useState(false);

  if (!isOpen || !sale) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = async () => {
    try {
      setIsExporting(true);
      await ExportService.generateA4InvoicePDF(sale, settings, { format: docFormat });
      sound.playCheckoutSuccess();
      toast.success(`Invoice ${sale.receiptNumber} exported as ${docFormat.toUpperCase()} PDF!`);
    } catch (err) {
      console.error('Failed to export PDF:', err);
      toast.error('Failed to generate PDF. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const formattedDate = new Date(sale.date).toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/70 backdrop-blur-xs overflow-y-auto">
      {/* Container Card */}
      <div className="relative w-full max-w-4xl bg-stone-900 border border-stone-800 rounded-3xl shadow-2xl flex flex-col my-auto max-h-[94vh]">
        {/* Top Control Bar (Hidden when printing) */}
        <div className="print:hidden p-4 sm:px-6 bg-stone-950/80 border-b border-stone-800 rounded-t-3xl flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#064e3b] text-[#6ee7b7] flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <span>Tax Invoice / Receipt #{sale.receiptNumber}</span>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800">
                  {docFormat.toUpperCase()} Format
                </span>
              </h2>
              <p className="text-xs text-stone-400">
                Issued on {formattedDate} • Cashier: {sale.cashierName}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Format Switcher */}
            <div className="flex items-center p-0.5 bg-stone-800 rounded-lg text-xs font-semibold">
              <button
                type="button"
                onClick={() => setDocFormat('a4')}
                className={`px-2.5 py-1 rounded-md transition ${
                  docFormat === 'a4'
                    ? 'bg-[#064e3b] text-white shadow-xs'
                    : 'text-stone-400 hover:text-white'
                }`}
              >
                A4
              </button>
              <button
                type="button"
                onClick={() => setDocFormat('letter')}
                className={`px-2.5 py-1 rounded-md transition ${
                  docFormat === 'letter'
                    ? 'bg-[#064e3b] text-white shadow-xs'
                    : 'text-stone-400 hover:text-white'
                }`}
              >
                Letter
              </button>
            </div>

            <button
              type="button"
              onClick={handlePrint}
              className="px-3 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 hover:text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
              title="Print document"
            >
              <Printer className="w-4 h-4 text-[#6ee7b7]" />
              <span className="hidden sm:inline">Print</span>
            </button>

            <button
              type="button"
              disabled={isExporting}
              onClick={handleDownloadPDF}
              className="px-4 py-2 bg-[#064e3b] hover:bg-[#053e2f] disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md transition cursor-pointer"
              title={`Export official ${docFormat.toUpperCase()} PDF`}
            >
              {isExporting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <FileDown className="w-4 h-4 text-[#6ee7b7]" />
                  <span>Export to PDF ({docFormat.toUpperCase()})</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-stone-400 hover:text-white hover:bg-stone-800 rounded-xl transition cursor-pointer ml-1"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Document Canvas with Reusable InvoiceTemplate */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-6 bg-stone-900/60 flex justify-center">
          <InvoiceTemplate
            ref={printContainerRef}
            sale={sale}
            settings={settings}
            format={docFormat}
            onPrint={handlePrint}
            onDownloadPDF={handleDownloadPDF}
          />
        </div>
      </div>
    </div>
  );
};
