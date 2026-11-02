import React, { forwardRef } from 'react';
import {
  Printer,
  Download,
  CheckCircle2,
  Phone,
  Mail,
  MapPin,
  FileText,
} from 'lucide-react';
import { Sale, StoreSettings } from '../../types';
import { BarcodeRenderer } from '../common/BarcodeRenderer';
import { ExportService } from '../../services/export';

export interface InvoiceTemplateProps {
  sale: Sale;
  settings: StoreSettings;
  className?: string;
  id?: string;
  showSignatureLine?: boolean;
  watermarkText?: string;
  format?: 'a4' | 'letter';
  showActionsBar?: boolean;
  onDownloadPDF?: () => void;
  onPrint?: () => void;
}

/**
 * Reusable InvoiceTemplate component for formatting sale details, tax calculations,
 * and corporate store branding into an official A4/Letter layout.
 *
 * Implements forwardRef so that the DOM element can be directly passed to
 * jsPDF (`doc.html(element)`), print handlers, or rendered inside modal previews.
 */
export const InvoiceTemplate = forwardRef<HTMLDivElement, InvoiceTemplateProps>(
  (
    {
      sale,
      settings,
      className = '',
      id = 'printable-a4-invoice',
      showSignatureLine = true,
      watermarkText,
      format = 'a4',
      showActionsBar = false,
      onDownloadPDF,
      onPrint,
    },
    ref
  ) => {
    const formattedDate = new Date(sale.date).toLocaleString([], {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const isLetter = format === 'letter';
    const currency = settings.currency || 'ETB';

    const handlePrint = () => {
      if (onPrint) {
        onPrint();
      } else {
        window.print();
      }
    };

    const handleDownload = async () => {
      if (onDownloadPDF) {
        onDownloadPDF();
      } else {
        await ExportService.generateA4InvoicePDF(sale, settings, {
          format: isLetter ? 'letter' : 'a4',
        });
      }
    };

    return (
      <div className={`flex flex-col items-center w-full ${className}`}>
        {/* Optional Action Controls Toolbar (Hidden during print) */}
        {showActionsBar && (
          <div className="print:hidden w-full max-w-[794px] mb-4 p-3 bg-stone-900 border border-stone-800 rounded-2xl flex items-center justify-between gap-3 shadow-md">
            <div className="flex items-center gap-2 text-xs text-stone-300">
              <FileText className="w-4 h-4 text-emerald-400" />
              <span className="font-semibold text-white">Invoice #{sale.receiptNumber}</span>
              <span className="text-stone-500">•</span>
              <span className="text-stone-400 uppercase font-mono text-[10px]">
                {format.toUpperCase()} Layout
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrint}
                className="px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-200 hover:text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                title="Print Invoice"
              >
                <Printer className="w-3.5 h-3.5 text-emerald-400" />
                <span>Print</span>
              </button>
              <button
                type="button"
                onClick={handleDownload}
                className="px-3.5 py-1.5 bg-[#064e3b] hover:bg-[#053e2f] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                title="Download PDF"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download PDF</span>
              </button>
            </div>
          </div>
        )}

        {/* Official Printable A4 / Letter Document Sheet */}
        <div
          ref={ref}
          id={id}
          data-format={format}
          className={`relative w-full max-w-[794px] min-h-[1050px] bg-white text-stone-900 rounded-2xl shadow-xl p-8 sm:p-12 flex flex-col justify-between transition-all print:p-0 print:m-0 print:shadow-none print:w-full print:max-w-none print:rounded-none print:min-h-0 print:text-black`}
          style={{
            boxSizing: 'border-box',
          }}
        >
          {/* Subtle Watermark (if provided) */}
          {watermarkText && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden select-none z-0">
              <span className="text-stone-100 font-black text-7xl sm:text-9xl uppercase tracking-widest transform -rotate-30 opacity-70">
                {watermarkText}
              </span>
            </div>
          )}

          {/* Main Invoice Content Container */}
          <div className="relative z-10">
            {/* Top Corporate Brand Accent Strip */}
            <div className="h-2 w-full bg-[#064e3b] rounded-full mb-6 print:rounded-none" />

            {/* Header: Store Identity & Invoice Title */}
            <div className="flex flex-col sm:flex-row justify-between items-start gap-4 pb-6 border-b border-stone-200">
              {/* Left Column: Store Branding & Contact */}
              <div className="space-y-1">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-[#064e3b] text-white flex items-center justify-center font-black text-lg shadow-xs">
                    {settings.storeName ? settings.storeName.charAt(0).toUpperCase() : 'S'}
                  </div>
                  <h1 className="text-xl sm:text-2xl font-black text-[#064e3b] tracking-tight">
                    {settings.storeName || 'Sappy Stationary'}
                  </h1>
                </div>

                <p className="text-xs font-medium text-stone-500">
                  {settings.tagline || 'Quality stationery & digital printing.'}
                </p>

                {settings.address && (
                  <p className="text-xs text-stone-600 max-w-sm pt-1 flex items-start gap-1">
                    <MapPin className="w-3.5 h-3.5 text-stone-400 shrink-0 mt-0.5 print:hidden" />
                    <span>{settings.address}</span>
                  </p>
                )}

                <div className="text-xs text-stone-600 flex flex-wrap items-center gap-x-4 pt-1">
                  <span className="flex items-center gap-1">
                    <Phone className="w-3 h-3 text-stone-400 print:hidden" />
                    <span>Phone: {settings.phone || '+251 911 000 000'}</span>
                  </span>
                  {settings.email && (
                    <span className="flex items-center gap-1">
                      <Mail className="w-3 h-3 text-stone-400 print:hidden" />
                      <span>Email: {settings.email}</span>
                    </span>
                  )}
                  {settings.taxNumber && (
                    <span className="font-mono font-bold text-stone-800 bg-stone-100 px-2 py-0.5 rounded border border-stone-200/80">
                      TIN: {settings.taxNumber}
                    </span>
                  )}
                </div>
              </div>

              {/* Right Column: Invoice Reference & Metadata */}
              <div className="text-left sm:text-right space-y-1">
                <span className="inline-block text-xs font-black uppercase tracking-wider text-[#064e3b] bg-emerald-50 px-3 py-1 rounded-md border border-emerald-200">
                  Tax Invoice / Sales Receipt
                </span>
                <div className="text-lg sm:text-xl font-mono font-black text-stone-900 pt-1">
                  #{sale.receiptNumber}
                </div>
                <p className="text-xs text-stone-500">
                  Issued: <span className="font-medium text-stone-700">{formattedDate}</span>
                </p>
                <p className="text-xs text-stone-600">
                  Cashier: <span className="font-semibold text-stone-900">{sale.cashierName}</span>
                </p>
              </div>
            </div>

            {/* Bill To & Tender Summary Info Blocks */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-5 border-b border-stone-200 text-xs">
              {/* Customer Info Block */}
              <div className="p-3.5 bg-stone-50 rounded-xl border border-stone-200/80">
                <span className="font-bold uppercase tracking-wider text-stone-400 block mb-1 text-[10px]">
                  Bill To / Customer Information
                </span>
                <div className="font-bold text-sm text-stone-900">
                  {sale.customerName || 'Walk-in Retail Customer'}
                </div>
                <div className="text-stone-500 mt-0.5">
                  {sale.customerPhone
                    ? `Contact: ${sale.customerPhone}`
                    : 'Direct Over-the-Counter Purchase'}
                </div>
              </div>

              {/* Tender Status Block */}
              <div className="p-3.5 bg-stone-50 rounded-xl border border-stone-200/80">
                <span className="font-bold uppercase tracking-wider text-stone-400 block mb-1 text-[10px]">
                  Payment Tender Status
                </span>
                <div className="font-semibold text-stone-900 flex flex-wrap gap-1.5 items-center">
                  {sale.payments.map((p, idx) => (
                    <span
                      key={idx}
                      className="font-mono bg-white border border-stone-200 px-2 py-0.5 rounded text-[11px]"
                    >
                      {p.method === 'mobile_transfer'
                        ? 'Telebirr/CBE'
                        : p.method.replace('_', ' ').toUpperCase()}
                      : {p.amount.toFixed(2)} {currency}
                    </span>
                  ))}
                </div>
                <div className="text-stone-500 mt-1 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>
                    Status:{' '}
                    <strong className="text-emerald-700 font-semibold">{sale.status}</strong> •
                    Order Completed
                  </span>
                </div>
              </div>
            </div>

            {/* Itemized Line Items Table */}
            <div className="py-6">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#064e3b] text-white font-bold text-[11px]">
                    <th className="py-2.5 px-3 rounded-l-lg text-center w-10">#</th>
                    <th className="py-2.5 px-3">Item Description &amp; SKU</th>
                    <th className="py-2.5 px-3 text-center w-24">Quantity</th>
                    <th className="py-2.5 px-3 text-right w-28">
                      Unit Price ({currency})
                    </th>
                    <th className="py-2.5 px-3 rounded-r-lg text-right w-32">
                      Total ({currency})
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200">
                  {sale.items.map((item, idx) => (
                    <tr key={idx} className="hover:bg-stone-50/50">
                      <td className="py-3 px-3 text-center font-mono text-stone-400">
                        {idx + 1}
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-bold text-stone-900">{item.productName}</div>
                        <div className="text-[10px] font-mono text-stone-400">
                          SKU: {item.sku || 'N/A'}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center font-mono text-stone-700">
                        {item.quantity} {item.unit || 'pcs'}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-stone-700">
                        {item.sellingPrice.toFixed(2)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-stone-900">
                        {(item.quantity * item.sellingPrice).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Financial Calculation & Tender Breakdown Strip */}
            <div className="flex flex-col sm:flex-row justify-between items-start gap-6 pt-4 border-t border-stone-200">
              {/* Left Side: Detailed Tender & Change summary */}
              <div className="w-full sm:w-1/2 space-y-2 text-xs">
                <div className="font-bold text-stone-800 uppercase tracking-wider text-[11px]">
                  Tender Breakdown:
                </div>
                <div className="space-y-1 font-mono text-stone-600 bg-stone-50 p-3 rounded-xl border border-stone-200/80">
                  {sale.payments.map((p, i) => (
                    <div key={i} className="flex justify-between">
                      <span className="capitalize">{p.method.replace('_', ' ')}:</span>
                      <span>
                        {p.amount.toFixed(2)} {currency}
                      </span>
                    </div>
                  ))}
                  {sale.changeGiven > 0 && (
                    <div className="flex justify-between pt-1 border-t border-stone-200 text-stone-900 font-semibold">
                      <span>Change Given:</span>
                      <span>
                        {sale.changeGiven.toFixed(2)} {currency}
                      </span>
                    </div>
                  )}
                  {sale.creditAdded > 0 && (
                    <div className="flex justify-between pt-1 border-t border-stone-200 text-amber-700 font-semibold">
                      <span>Added to Store Credit:</span>
                      <span>
                        {sale.creditAdded.toFixed(2)} {currency}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Side: Subtotal, Discount, Tax Rate & Amount, Grand Total */}
              <div className="w-full sm:w-80 space-y-2 text-xs">
                <div className="bg-stone-50 p-4 rounded-xl border border-stone-200 space-y-2">
                  <div className="flex justify-between text-stone-600">
                    <span>Subtotal:</span>
                    <span className="font-mono font-semibold">
                      {sale.subtotal.toFixed(2)} {currency}
                    </span>
                  </div>

                  {sale.totalDiscount > 0 && (
                    <div className="flex justify-between text-rose-600">
                      <span>Discount Applied:</span>
                      <span className="font-mono font-semibold">
                        -{sale.totalDiscount.toFixed(2)} {currency}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between text-stone-600">
                    <span>VAT / Tax ({sale.taxRate}%):</span>
                    <span className="font-mono font-semibold">
                      {sale.taxAmount.toFixed(2)} {currency}
                    </span>
                  </div>

                  <div className="pt-2 border-t border-stone-300 flex justify-between items-baseline">
                    <span className="font-black text-stone-900 text-sm">Grand Total:</span>
                    <span className="font-mono font-black text-base text-[#064e3b]">
                      {sale.grandTotal.toFixed(2)} {currency}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Document Bottom Authentication, Stamps & Terms */}
          <div className="pt-10 mt-8 border-t border-stone-200 relative z-10">
            <div className="flex flex-col sm:flex-row justify-between items-end gap-6 pb-6">
              {/* Verification Barcode */}
              <div className="space-y-1">
                <div className="font-mono text-[10px] text-stone-400">
                  DOCUMENT VERIFICATION BARCODE
                </div>
                <BarcodeRenderer
                  code={sale.receiptNumber}
                  format="CODE128"
                  width={1.6}
                  height={38}
                  displayValue={true}
                  className="border border-stone-200 p-1.5 rounded-lg bg-white"
                />
              </div>

              {/* Stamp & Authorized Signature */}
              <div className="flex items-center gap-6">
                {/* Official Paid Stamp */}
                {sale.status === 'COMPLETED' && (
                  <div className="border-2 border-[#064e3b] text-[#064e3b] px-4 py-2 rounded-xl text-center transform -rotate-3 select-none">
                    <div className="font-black text-xs tracking-widest">★ PAID IN FULL ★</div>
                    <div className="text-[9px] font-mono font-bold mt-0.5">
                      {new Date(sale.date).toLocaleDateString()}
                    </div>
                  </div>
                )}

                {showSignatureLine && (
                  <div className="text-center w-48 border-t border-stone-300 pt-1">
                    <p className="text-[11px] font-bold text-stone-800">
                      Authorized Signature
                    </p>
                    <p className="text-[10px] text-stone-400">
                      {settings.storeName || 'Sappy Stationary'} Operations
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Legal & Terms Note */}
            <div className="text-center text-[10px] text-stone-400 pt-4 border-t border-stone-100">
              <p>
                {settings.receiptFooterMessage ||
                  'Thank you for choosing Sappy Stationary! Quality stationery & digital printing.'}
              </p>
              <p className="pt-0.5">
                Goods once sold in good condition cannot be returned unless defective. Please retain
                this invoice for warranty and tax claims.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }
);

InvoiceTemplate.displayName = 'InvoiceTemplate';
