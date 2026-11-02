import React, { useRef } from 'react';
import {
  X,
  Printer,
  Download,
  FileText,
} from 'lucide-react';
import { Sale, StoreSettings } from '../../types';
import { ExportService } from '../../services/export';
import { InvoiceTemplate } from './InvoiceTemplate';

interface A4InvoiceModalProps {
  sale: Sale | null;
  settings: StoreSettings;
  isOpen: boolean;
  onClose: () => void;
}

export const A4InvoiceModal: React.FC<A4InvoiceModalProps> = ({
  sale,
  settings,
  isOpen,
  onClose,
}) => {
  const printContainerRef = useRef<HTMLDivElement>(null);

  if (!isOpen || !sale) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = async () => {
    await ExportService.generateA4InvoicePDF(sale, settings);
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
        <div className="print:hidden p-4 sm:px-6 bg-stone-950/80 border-b border-stone-800 rounded-t-3xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#064e3b] text-[#6ee7b7] flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <span>Tax Invoice / Receipt #{sale.receiptNumber}</span>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800">
                  Full A4 Document
                </span>
              </h2>
              <p className="text-xs text-stone-400">
                Issued on {formattedDate} • Cashier: {sale.cashierName}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-3 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 hover:text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
              title="Print document"
            >
              <Printer className="w-4 h-4 text-[#6ee7b7]" />
              <span className="hidden sm:inline">Print Document</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadPDF}
              className="px-4 py-2 bg-[#064e3b] hover:bg-[#053e2f] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md transition cursor-pointer"
              title="Download official PDF"
            >
              <Download className="w-4 h-4" />
              <span>Download PDF</span>
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
            onPrint={handlePrint}
            onDownloadPDF={handleDownloadPDF}
          />
        </div>
      </div>
    </div>
  );
};
