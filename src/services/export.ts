import {jsPDF} from 'jspdf';
import autoTable from 'jspdf-autotable';
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import * as XLSX from 'xlsx';
import {Sale, Product, StoreSettings, Customer, Shift, LabelItem, CodeType} from '../types';

export interface BarcodePDFOptions {
  template?: 'a4_30up' | 'a4_24up' | 'thermal_50x30' | 'thermal_40x25' | 'thermal_60x40';
  showStoreName?: boolean;
  showPrice?: boolean;
  showSku?: boolean;
  showProductName?: boolean;
  showBorder?: boolean;
  barcodeFormat?: string;
  filename?: string;
}

export class ExportService {
  // Download any string as CSV file
  static downloadCSV(filename: string, csvContent: string) {
    const blob = new Blob([csvContent], {type: 'text/csv;charset=utf-8;'});
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // --- Export Products to CSV ---
  static exportProductsToCSV(products: Product[]) {
    const headers = [
      'Product Name',
      'SKU',
      'Category',
      'Brand',
      'Cost Price (ETB)',
      'Selling Price (ETB)',
      'Current Stock',
      'Min Stock Threshold',
      'Unit',
      'Primary Barcode/QR',
      'Supplier',
    ];

    const rows = products.map((p) => {
      const primaryCode = p.codes.find((c) => c.isPrimary)?.code || (p.codes[0]?.code ?? '');
      return [
        `"${p.name.replace(/"/g, '""')}"`,
        `"${p.sku}"`,
        `"${p.category}"`,
        `"${p.brand}"`,
        p.costPrice,
        p.sellingPrice,
        p.currentStock,
        p.minStockThreshold,
        `"${p.unit}"`,
        `"${primaryCode}"`,
        `"${p.supplier || ''}"`,
      ].join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    this.downloadCSV(`sappy_inventory_${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  // --- Export Sales Ledger to CSV ---
  static exportSalesToCSV(sales: Sale[]) {
    const headers = [
      'Receipt Number',
      'Date & Time',
      'Cashier',
      'Customer',
      'Items Count',
      'Subtotal',
      'Discount',
      'Tax',
      'Grand Total (ETB)',
      'Payment Methods',
      'Status',
    ];

    const rows = sales.map((s) => {
      const methods = s.payments.map((p) => `${p.method}:${p.amount}`).join('; ');
      return [
        `"${s.receiptNumber}"`,
        `"${new Date(s.date).toLocaleString()}"`,
        `"${s.cashierName}"`,
        `"${s.customerName || 'Walk-in'}"`,
        s.items.reduce((sum, item) => sum + item.quantity, 0),
        s.subtotal.toFixed(2),
        s.totalDiscount.toFixed(2),
        s.taxAmount.toFixed(2),
        s.grandTotal.toFixed(2),
        `"${methods}"`,
        `"${s.status}"`,
      ].join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    this.downloadCSV(`sappy_sales_ledger_${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  // --- Export Products to Excel (.xlsx) ---
  static exportProductsToExcel(products: Product[], filename?: string) {
    const headers = [
      'Product Name',
      'SKU',
      'Category',
      'Brand',
      'Cost Price (ETB)',
      'Selling Price (ETB)',
      'Wholesale Price (ETB)',
      'Current Stock',
      'Min Stock Threshold',
      'Unit',
      'Primary Barcode/QR',
      'Supplier',
      'Description',
    ];

    const dataRows = products.map((p) => {
      const primaryCode = p.codes.find((c) => c.isPrimary)?.code || (p.codes[0]?.code ?? '');
      return [
        p.name,
        p.sku,
        p.category,
        p.brand,
        p.costPrice,
        p.sellingPrice,
        p.wholesalePrice || 0,
        p.currentStock,
        p.minStockThreshold,
        p.unit,
        primaryCode,
        p.supplier || '',
        p.description || '',
      ];
    });

    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);

    // Set column widths
    worksheet['!cols'] = [
      { wch: 30 }, // Name
      { wch: 16 }, // SKU
      { wch: 20 }, // Category
      { wch: 16 }, // Brand
      { wch: 16 }, // Cost
      { wch: 18 }, // Price
      { wch: 18 }, // Wholesale
      { wch: 14 }, // Stock
      { wch: 16 }, // Min Stock
      { wch: 10 }, // Unit
      { wch: 20 }, // Barcode
      { wch: 20 }, // Supplier
      { wch: 30 }, // Description
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Products');

    const finalName = filename || `sappy_inventory_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(workbook, finalName);
  }

  // --- Universal Spreadsheet File Parser (.xlsx, .xls, .csv) ---
  static async parseSpreadsheetFile(
    file: File,
    existingProducts: Product[] = [],
    prefix: string = 'SAP'
  ): Promise<{
    validRows: (Partial<Product> & {
      isAutoGeneratedSku?: boolean;
      isDuplicateOfCatalog?: Product;
      duplicateReason?: 'sku' | 'code' | 'name';
    })[];
    errors: {row: number; message: string; data?: any}[];
    sheetName: string;
    totalRowsRead: number;
    fileType: 'XLSX' | 'XLS' | 'CSV';
  }> {
    const isCsv = file.name.toLowerCase().endsWith('.csv');
    const isXls = file.name.toLowerCase().endsWith('.xls');
    const fileType = isCsv ? 'CSV' : isXls ? 'XLS' : 'XLSX';

    let rawRows: (string | number)[][] = [];
    let sheetName = 'Sheet1';

    try {
      const buffer = await file.arrayBuffer();
      // XLSX can read binary Excel (.xlsx, .xls) and text CSV directly from ArrayBuffer
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
      sheetName = workbook.SheetNames[0] || 'Sheet1';
      const worksheet = workbook.Sheets[sheetName];
      if (worksheet) {
        rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as (string | number)[][];
      }
    } catch {
      // Fallback: If arrayBuffer failed on text CSV, try text reader
      if (isCsv) {
        const text = await file.text();
        const res = this.parseProductCSV(text, existingProducts, prefix);
        return {
          validRows: res.validRows,
          errors: res.errors,
          sheetName: 'CSV',
          totalRowsRead: res.validRows.length + res.errors.length,
          fileType: 'CSV',
        };
      }
      throw new Error(`Unable to read spreadsheet file "${file.name}". Please ensure it is a valid .xlsx, .xls, or .csv document.`);
    }

    const { validRows, errors } = this.parseSpreadsheetRows(rawRows, existingProducts, prefix);
    return {
      validRows,
      errors,
      sheetName,
      totalRowsRead: rawRows.length,
      fileType,
    };
  }

  // --- Parse Raw 2D Grid from Spreadsheet ---
  static parseSpreadsheetRows(
    rawRows: (string | number)[][],
    existingProducts: Product[] = [],
    prefix: string = 'SAP'
  ): {
    validRows: (Partial<Product> & {
      isAutoGeneratedSku?: boolean;
      isDuplicateOfCatalog?: Product;
      duplicateReason?: 'sku' | 'code' | 'name';
    })[];
    errors: {row: number; message: string; data?: any}[];
  } {
    if (!rawRows || rawRows.length < 2) {
      return {
        validRows: [],
        errors: [{row: 1, message: 'Spreadsheet is empty or missing headers.'}],
      };
    }

    const existingSkuSet = new Set(
      existingProducts.map((p) => (p.sku || '').trim().toLowerCase()).filter(Boolean)
    );

    // Analyze header row (row index 0)
    const headers = (rawRows[0] || []).map((h) => String(h || '').trim().toLowerCase());

    const nameIdx = headers.findIndex((h) =>
      h === 'name' || h.includes('product name') || h.includes('item name') || (h.includes('name') && !h.includes('brand') && !h.includes('user')) || h.includes('product') || h.includes('item') || h.includes('title')
    );
    const skuIdx = headers.findIndex((h) =>
      h === 'sku' || h.includes('sku') || h === 'item code' || h === 'product code' || h === 'code' || h === 'part number' || h === 'id'
    );
    const catIdx = headers.findIndex((h) =>
      h.includes('category') || h.includes('dept') || h.includes('department') || h.includes('group') || h.includes('type')
    );
    const brandIdx = headers.findIndex((h) =>
      h.includes('brand') || h.includes('make') || h.includes('manufacturer')
    );
    const costIdx = headers.findIndex((h) =>
      h.includes('cost') || h.includes('buy') || h.includes('purchase')
    );
    const priceIdx = headers.findIndex((h) =>
      h.includes('selling') || h.includes('retail') || (h.includes('price') && !h.includes('cost') && !h.includes('wholesale')) || h.includes('rate')
    );
    const wholesaleIdx = headers.findIndex((h) =>
      h.includes('wholesale') || h.includes('trade') || h.includes('bulk price')
    );
    const stockIdx = headers.findIndex((h) =>
      h.includes('stock') || h.includes('qty') || h.includes('quantity') || h.includes('count') || h.includes('on hand') || h.includes('inventory') || h.includes('balance')
    );
    const minStockIdx = headers.findIndex((h) =>
      h.includes('min') || h.includes('threshold') || h.includes('reorder') || h.includes('alert')
    );
    const unitIdx = headers.findIndex((h) =>
      h.includes('unit') || h.includes('uom') || h.includes('measure') || h.includes('pack')
    );
    const codeIdx = headers.findIndex((h) =>
      h.includes('barcode') || h.includes('qr') || h.includes('upc') || h.includes('ean') || h.includes('serial') || h.includes('isbn')
    );
    const supplierIdx = headers.findIndex((h) =>
      h.includes('supplier') || h.includes('vendor') || h.includes('source')
    );
    const descIdx = headers.findIndex((h) =>
      h.includes('desc') || h.includes('detail') || h.includes('note')
    );

    const validRows: (Partial<Product> & {
      isAutoGeneratedSku?: boolean;
      isDuplicateOfCatalog?: Product;
      duplicateReason?: 'sku' | 'code' | 'name';
    })[] = [];
    const errors: {row: number; message: string; data?: any}[] = [];
    const seenSkus = new Set<string>();
    const seenCodes = new Set<string>();

    const cleanNumber = (val: any, defaultVal = 0): number => {
      if (val === undefined || val === null || val === '') return defaultVal;
      if (typeof val === 'number') {
        return isNaN(val) ? defaultVal : Math.abs(val);
      }
      const str = String(val).replace(/,/g, '').trim();
      if (str === '') return defaultVal;
      const num = parseFloat(str);
      return isNaN(num) ? defaultVal : Math.abs(num);
    };

    for (let i = 1; i < rawRows.length; i++) {
      const cols = rawRows[i] || [];
      const rowNum = i + 1;

      // Skip lines that are completely empty
      if (cols.length === 0 || cols.every((c) => c === undefined || c === null || String(c).trim().length === 0)) {
        continue;
      }

      const name = String(nameIdx !== -1 ? cols[nameIdx] : cols[0] || '').trim();
      const rawSku = String(skuIdx !== -1 ? cols[skuIdx] : cols[1] || '').trim();
      const category = String(catIdx !== -1 ? cols[catIdx] : cols[2] || 'General Stationery').trim() || 'General Stationery';
      const brand = String(brandIdx !== -1 ? cols[brandIdx] : 'Standard').trim() || 'Standard';
      const costRaw = costIdx !== -1 ? cols[costIdx] : '';
      const priceRaw = priceIdx !== -1 ? cols[priceIdx] : '';
      const wholesaleRaw = wholesaleIdx !== -1 ? cols[wholesaleIdx] : '';
      const stockRaw = stockIdx !== -1 ? cols[stockIdx] : '';
      const minStockRaw = minStockIdx !== -1 ? cols[minStockIdx] : '';
      const unit = String(unitIdx !== -1 ? cols[unitIdx] : 'pcs').trim() || 'pcs';
      const code = String(codeIdx !== -1 ? cols[codeIdx] : '').trim();
      const supplier = String(supplierIdx !== -1 ? cols[supplierIdx] : '').trim();
      const description = String(descIdx !== -1 ? cols[descIdx] : '').trim();

      if (!name) {
        errors.push({row: rowNum, message: 'Missing product name.'});
        continue;
      }

      let sku = rawSku;
      let isAutoGeneratedSku = false;

      // Auto-generate unique SKU if blank in spreadsheet
      if (!sku) {
        const storePrefix = (prefix || 'SAP').trim().toUpperCase();
        const catCode = category.replace(/[^a-zA-Z0-9]/g, '').substring(0, 3).toUpperCase() || 'GEN';
        let counter = 1000 + i;
        let candidateSku = `${storePrefix}-${catCode}-${counter}`;
        while (seenSkus.has(candidateSku.toLowerCase()) || existingSkuSet.has(candidateSku.toLowerCase())) {
          counter += Math.floor(Math.random() * 89) + 1;
          candidateSku = `${storePrefix}-${catCode}-${counter}`;
        }
        sku = candidateSku;
        isAutoGeneratedSku = true;
      }

      const cost = cleanNumber(costRaw, 0);
      const price = cleanNumber(priceRaw, 0);
      const wholesalePrice = cleanNumber(wholesaleRaw, 0);
      const stock = cleanNumber(stockRaw, 0);
      const minStock = cleanNumber(minStockRaw, 5) || 5;

      // Check if duplicate of an earlier row within this spreadsheet
      const existingInBatch = validRows.find(
        (r) =>
          (sku && r.sku && r.sku.toLowerCase() === sku.toLowerCase()) ||
          (code && r.codes && r.codes.some((c) => c.code.toLowerCase() === code.toLowerCase())) ||
          (name && r.name && r.name.toLowerCase() === name.toLowerCase())
      );

      if (existingInBatch) {
        // Automatically merge duplicate rows in spreadsheet: add quantities and keep valid codes
        existingInBatch.currentStock = (existingInBatch.currentStock || 0) + stock;
        if (price > 0) existingInBatch.sellingPrice = price;
        if (cost > 0) existingInBatch.costPrice = cost;
        if (
          code &&
          existingInBatch.codes &&
          !existingInBatch.codes.some((c) => c.code.toLowerCase() === code.toLowerCase())
        ) {
          existingInBatch.codes.push({
            id: `code-${Date.now()}-${i}`,
            code,
            type: 'barcode',
            format: 'CODE128',
            source: 'existing',
            isPrimary: false,
            active: true,
            label: 'Imported Code',
            createdDate: new Date().toISOString(),
          });
        }
        continue;
      }

      // Check if this row duplicates an item already in the store catalog
      const catalogMatch = existingProducts.find(
        (p) =>
          (sku && p.sku.toLowerCase() === sku.toLowerCase()) ||
          (code && p.codes.some((c) => c.code.toLowerCase() === code.toLowerCase())) ||
          (name && p.name.trim().toLowerCase() === name.trim().toLowerCase())
      );

      const duplicateReason = catalogMatch
        ? catalogMatch.sku.toLowerCase() === sku.toLowerCase()
          ? ('sku' as const)
          : catalogMatch.name.trim().toLowerCase() === name.trim().toLowerCase()
          ? ('name' as const)
          : ('code' as const)
        : undefined;

      seenSkus.add(sku.toLowerCase());
      if (code) seenCodes.add(code.toLowerCase());

      validRows.push({
        name,
        sku,
        category,
        brand,
        description,
        supplier: supplier || undefined,
        costPrice: cost,
        sellingPrice: price,
        wholesalePrice: wholesalePrice || undefined,
        currentStock: stock,
        minStockThreshold: minStock,
        unit,
        isAutoGeneratedSku,
        isDuplicateOfCatalog: catalogMatch,
        duplicateReason,
        codes: code
          ? [
              {
                id: `code-${Date.now()}-${i}`,
                code,
                type: 'barcode',
                format: 'CODE128',
                source: 'existing',
                isPrimary: true,
                active: true,
                label: 'Imported Code',
                createdDate: new Date().toISOString(),
              },
            ]
          : [],
      });
    }

    return {validRows, errors};
  }

  // --- Parse and Validate Product Import CSV (Legacy / Plain Text Support) ---
  static parseProductCSV(
    csvText: string,
    existingProducts: Product[] = [],
    prefix: string = 'SAP'
  ): {
    validRows: (Partial<Product> & {isAutoGeneratedSku?: boolean})[];
    errors: {row: number; message: string; data?: any}[];
  } {
    const lines = csvText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) {
      return {
        validRows: [],
        errors: [{row: 1, message: 'CSV file is empty or missing headers.'}],
      };
    }

    // Parse simple CSV line handling quotes
    const parseLine = (line: string): string[] => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"' && (i === 0 || line[i - 1] !== '\\')) {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
      return result;
    };

    const rawRows = lines.map(parseLine);
    return this.parseSpreadsheetRows(rawRows, existingProducts, prefix);
  }

  // --- Generate Official Full A4/Letter Tax Invoice & Sales Receipt PDF ---
  static async generateA4InvoicePDF(
    sale: Sale,
    settings: StoreSettings,
    options?: { format?: 'a4' | 'letter' }
  ): Promise<void> {
    const isLetter = options?.format === 'letter';
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: isLetter ? 'letter' : 'a4',
    });

    const pageWidth = isLetter ? 215.9 : 210;
    const pageHeight = isLetter ? 279.4 : 297;
    const margin = 14;
    const contentWidth = pageWidth - margin * 2;
    let y = 16;

    // Header Band: Forest Green Accent Line
    doc.setFillColor(6, 78, 59); // Forest Green #064E3B
    doc.rect(margin, y, contentWidth, 3, 'F');
    y += 10;

    // Store Info (Left) and Invoice Title/Metadata (Right)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(6, 78, 59);
    doc.text(settings.storeName, margin, y);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(30, 41, 59);
    doc.text('TAX INVOICE / SALES RECEIPT', pageWidth - margin, y, { align: 'right' });
    y += 5.5;

    // Tagline / Subtitle
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(settings.tagline || 'Quality stationery & digital printing.', margin, y);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(6, 78, 59);
    doc.text(`INVOICE #: ${sale.receiptNumber}`, pageWidth - margin, y, { align: 'right' });
    y += 5;

    // Address & Phone
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    if (settings.address) {
      doc.text(settings.address, margin, y, { maxWidth: 90 });
      y += 4;
    }
    doc.text(`Phone: ${settings.phone || '+251 911 000 000'}${settings.email ? ` | Email: ${settings.email}` : ''}`, margin, y);

    const dateFormatted = new Date(sale.date).toLocaleString([], {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(`Date & Time: ${dateFormatted}`, pageWidth - margin, y, { align: 'right' });
    y += 4;

    if (settings.taxNumber) {
      doc.text(`TIN: ${settings.taxNumber}`, margin, y);
    }
    doc.text(`Cashier / Operator: ${sale.cashierName}`, pageWidth - margin, y, { align: 'right' });
    y += 7;

    // Divider Line
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.4);
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;

    // Bill To / Customer Information Box
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(margin, y, contentWidth, 20, 2, 2, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin, y, contentWidth, 20, 2, 2, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('BILL TO / CUSTOMER', margin + 4, y + 6);
    doc.text('PAYMENT DETAILS', margin + contentWidth / 2, y + 6);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text(sale.customerName || 'Walk-in Retail Customer', margin + 4, y + 12);

    const paymentMethodsSummary = sale.payments
      .map((p) => `${p.method.replace('_', ' ').toUpperCase()}: ${p.amount.toFixed(2)} ${settings.currency}`)
      .join(', ');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(paymentMethodsSummary || 'Cash Sale', margin + contentWidth / 2, y + 12);

    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(sale.customerPhone ? `Contact: ${sale.customerPhone}` : 'Direct In-Store Counter Transaction', margin + 4, y + 17);
    doc.text(`Transaction Status: ${sale.status.toUpperCase()}`, margin + contentWidth / 2, y + 17);

    y += 25;

    // Items Table using autoTable
    const tableRows = sale.items.map((item, idx) => [
      String(idx + 1),
      `${item.productName}\nSKU: ${item.sku || 'N/A'}`,
      `${item.quantity} ${item.unit || 'pcs'}`,
      `${item.sellingPrice.toFixed(2)}`,
      `${(item.quantity * item.sellingPrice).toFixed(2)}`,
    ]);

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      theme: 'grid',
      headStyles: {
        fillColor: [6, 78, 59],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8.5,
        halign: 'left',
      },
      styles: {
        fontSize: 8,
        cellPadding: 2.8,
        textColor: [15, 23, 42],
        lineColor: [226, 232, 240],
        lineWidth: 0.2,
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 10 },
        1: { halign: 'left' },
        2: { halign: 'center', cellWidth: 26 },
        3: { halign: 'right', cellWidth: 32 },
        4: { halign: 'right', cellWidth: 36, fontStyle: 'bold' },
      },
      head: [['#', 'Item Description & SKU', 'Quantity', `Unit Price (${settings.currency})`, `Amount (${settings.currency})`]],
      body: tableRows,
    });

    const finalY = (doc as any).lastAutoTable.finalY + 6;

    // Financial Totals Block (Right-aligned)
    const summaryBoxWidth = 85;
    const summaryX = pageWidth - margin - summaryBoxWidth;

    doc.setFillColor(248, 250, 252);
    doc.roundedRect(summaryX, finalY, summaryBoxWidth, 42, 2, 2, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(summaryX, finalY, summaryBoxWidth, 42, 2, 2, 'S');

    let sumY = finalY + 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);

    // Subtotal
    doc.text('Subtotal:', summaryX + 4, sumY);
    doc.text(`${sale.subtotal.toFixed(2)} ${settings.currency}`, pageWidth - margin - 4, sumY, { align: 'right' });
    sumY += 5;

    // Discount
    if (sale.totalDiscount > 0) {
      doc.setTextColor(225, 29, 72);
      doc.text('Discount Applied:', summaryX + 4, sumY);
      doc.text(`-${sale.totalDiscount.toFixed(2)} ${settings.currency}`, pageWidth - margin - 4, sumY, { align: 'right' });
      doc.setTextColor(71, 85, 105);
      sumY += 5;
    }

    // VAT / Tax
    doc.text(`Tax / VAT (${sale.taxRate}%):`, summaryX + 4, sumY);
    doc.text(`${sale.taxAmount.toFixed(2)} ${settings.currency}`, pageWidth - margin - 4, sumY, { align: 'right' });
    sumY += 6;

    // Divider in summary box
    doc.setDrawColor(203, 213, 225);
    doc.line(summaryX + 3, sumY - 1, pageWidth - margin - 3, sumY - 1);
    sumY += 2;

    // Grand Total
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(6, 78, 59);
    doc.text('GRAND TOTAL:', summaryX + 4, sumY + 2);
    doc.text(`${sale.grandTotal.toFixed(2)} ${settings.currency}`, pageWidth - margin - 4, sumY + 2, { align: 'right' });

    // Tender Details on Left of Summary Box
    const leftDetailX = margin + 2;
    let leftDetailY = finalY + 4;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(30, 41, 59);
    doc.text('PAYMENT TENDER BREAKDOWN:', leftDetailX, leftDetailY);
    leftDetailY += 5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    sale.payments.forEach((p) => {
      const pLabel = p.method === 'mobile_transfer' ? 'Telebirr / CBE Mobile Transfer' : p.method.replace('_', ' ').toUpperCase();
      doc.text(`• ${pLabel}: ${p.amount.toFixed(2)} ${settings.currency}`, leftDetailX, leftDetailY);
      leftDetailY += 4;
    });

    if (sale.changeGiven > 0) {
      doc.text(`• Change Returned to Customer: ${sale.changeGiven.toFixed(2)} ${settings.currency}`, leftDetailX, leftDetailY);
      leftDetailY += 4;
    }
    if (sale.creditAdded > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(217, 119, 6);
      doc.text(`• Added to Store Credit Balance: ${sale.creditAdded.toFixed(2)} ${settings.currency}`, leftDetailX, leftDetailY);
      leftDetailY += 4;
    }

    // Barcode & QR Code verification on bottom left
    const qrPng = await this.generateQRPNG(sale.receiptNumber);
    const barcodePng = this.generateBarcodePNG(sale.receiptNumber);

    const bottomY = Math.max(finalY + 46, leftDetailY + 6);

    if (qrPng) {
      doc.addImage(qrPng, 'PNG', margin, bottomY, 20, 20);
    }
    if (barcodePng) {
      doc.addImage(barcodePng, 'PNG', margin + 24, bottomY + 1, 48, 14);
      doc.setFont('courier', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text(sale.receiptNumber, margin + 48, bottomY + 18, { align: 'center' });
    }

    // Official Stamp / Signature Area on Bottom Right
    const stampX = pageWidth - margin - 55;
    doc.setDrawColor(203, 213, 225);
    doc.line(stampX, bottomY + 14, pageWidth - margin, bottomY + 14);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text('Authorized Signature & Stamp', stampX + 27, bottomY + 18, { align: 'center' });

    // Official Paid Stamp
    if (sale.status === 'COMPLETED') {
      doc.setDrawColor(6, 78, 59);
      doc.setLineWidth(0.8);
      doc.roundedRect(pageWidth - margin - 38, bottomY - 3, 36, 13, 1.5, 1.5, 'S');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(6, 78, 59);
      doc.text('✓ PAID IN FULL', pageWidth - margin - 20, bottomY + 4.5, { align: 'center' });
      doc.setFontSize(6.5);
      doc.text(new Date(sale.date).toLocaleDateString(), pageWidth - margin - 20, bottomY + 8.5, { align: 'center' });
    }

    // Terms / Footer Notes
    const footerY = pageHeight - 12;
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, footerY - 4, pageWidth - margin, footerY - 4);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      settings.receiptFooterMessage || 'Thank you for choosing Sappy Stationary! Quality stationery & digital printing.',
      pageWidth / 2,
      footerY,
      { align: 'center' }
    );

    doc.save(`Invoice_${sale.receiptNumber}.pdf`);
  }

  // Backwards-compatible alias: generates full A4 invoice
  static async generatePDFReceipt(sale: Sale, settings: StoreSettings): Promise<void> {
    return this.generateA4InvoicePDF(sale, settings);
  }

  // --- Generate Shift Summary Report PDF ---
  static generateShiftReportPDF(shift: Shift, settings: StoreSettings) {
    const doc = new jsPDF();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(6, 78, 59);
    doc.text(settings.storeName, 14, 15);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(`Shift Closeout Report #${shift.shiftNumber}`, 14, 21);
    doc.text(`Cashier: ${shift.cashierName} | Opened: ${new Date(shift.openedAt).toLocaleString()}`, 14, 26);
    if (shift.closedAt) {
      doc.text(`Closed: ${new Date(shift.closedAt).toLocaleString()}`, 14, 31);
    }

    autoTable(doc, {
      startY: 36,
      head: [['Shift Metric', 'Amount (ETB)']],
      body: [
        ['Opening Cash Float', shift.openingFloat.toFixed(2)],
        ['Cash Sales Collected', shift.cashSales.toFixed(2)],
        ['Card Sales', shift.cardSales.toFixed(2)],
        ['Mobile Transfer (Telebirr/CBE)', shift.mobileSales.toFixed(2)],
        ['Store Credit Sales', shift.creditSales.toFixed(2)],
        ['Cash Added to Drawer', `+${shift.cashAdditions.toFixed(2)}`],
        ['Refunds Paid Out', `-${shift.refundsGiven.toFixed(2)}`],
        ['Cash Drops to Safe', `-${shift.cashDrops.toFixed(2)}`],
        ['Petty Cash Expenses', `-${shift.expenses.toFixed(2)}`],
        ['Expected Cash in Drawer', shift.expectedCash.toFixed(2)],
        ['Actual Counted Cash', (shift.actualCash ?? 0).toFixed(2)],
        ['Variance (Shortage/Overage)', `${(shift.variance ?? 0) >= 0 ? '+' : ''}${(shift.variance ?? 0).toFixed(2)}`],
      ],
      theme: 'grid',
      headStyles: {fillColor: [6, 78, 59]},
    });

    doc.save(`Shift_Report_${shift.shiftNumber}.pdf`);
  }

  // --- Generate Customer Statement PDF ---
  static generateCustomerStatementPDF(customer: Customer, transactions: any[], settings: StoreSettings) {
    const doc = new jsPDF();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(6, 78, 59);
    doc.text(settings.storeName, 14, 15);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    doc.text(`Customer Ledger Statement`, 14, 21);
    doc.text(`Customer: ${customer.name} | Phone: ${customer.phone}`, 14, 26);
    doc.text(`Credit Limit: ${customer.creditLimit.toFixed(2)} ETB | Current Balance: ${customer.currentBalance.toFixed(2)} ETB`, 14, 31);

    const body = transactions.map((t) => [
      new Date(t.date).toLocaleDateString(),
      t.type,
      t.notes || '',
      t.type === 'CHARGE' ? `+${t.amount.toFixed(2)}` : `-${t.amount.toFixed(2)}`,
      t.balanceAfter.toFixed(2),
    ]);

    // If customer is stamped paid or settled, draw authentic official rubber stamp seal
    if (customer.isStampedPaid || (customer.currentBalance === 0 && customer.lastPaidDate)) {
      doc.setDrawColor(185, 28, 28); // Official Crimson Stamp
      doc.setLineWidth(1.2);
      doc.roundedRect(138, 12, 58, 22, 2, 2, 'S');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(185, 28, 28);
      doc.text('★ STAMPED PAID ★', 167, 19, { align: 'center' });
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'bold');
      const paidDateStr = customer.lastPaidDate ? new Date(customer.lastPaidDate).toLocaleDateString() : new Date().toLocaleDateString();
      doc.text(`SETTLED: ${paidDateStr}`, 167, 24, { align: 'center' });
      const staffStr = (customer.lastPaidStaff || 'AUTHORIZED').toUpperCase();
      doc.text(`BY: ${staffStr}`, 167, 28, { align: 'center' });
      doc.setTextColor(80, 80, 80);
    }

    doc.save(`Statement_${customer.name.replace(/\s+/g, '_')}.pdf`);
  }

  // --- Helper: Generate 1D Barcode PNG Data URL ---
  private static generateBarcodePNG(code: string, format = 'CODE128'): string {
    try {
      const canvas = document.createElement('canvas');
      let fmt = (format || 'CODE128').toUpperCase();
      if (fmt === 'EAN13' && code.length !== 12 && code.length !== 13) fmt = 'CODE128';
      if (fmt === 'UPC' && code.length !== 11 && code.length !== 12) fmt = 'CODE128';

      JsBarcode(canvas, code, {
        format: fmt,
        width: 2,
        height: 50,
        displayValue: false,
        margin: 2,
        lineColor: '#000000',
        background: '#ffffff',
      });
      return canvas.toDataURL('image/png');
    } catch {
      try {
        const canvas = document.createElement('canvas');
        JsBarcode(canvas, code, {
          format: 'CODE128',
          width: 2,
          height: 50,
          displayValue: false,
          margin: 2,
          lineColor: '#000000',
          background: '#ffffff',
        });
        return canvas.toDataURL('image/png');
      } catch {
        return '';
      }
    }
  }

  // --- Helper: Generate 2D QR Code PNG Data URL ---
  private static async generateQRPNG(code: string): Promise<string> {
    try {
      return await QRCode.toDataURL(code, {
        width: 240,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
      });
    } catch {
      return '';
    }
  }

  // --- Export Barcode / QR Label Batch to PDF ---
  static async exportBarcodeLabelsToPDF(
    items: LabelItem[],
    settings: StoreSettings,
    options: BarcodePDFOptions = {}
  ): Promise<void> {
    const {
      template = 'a4_30up',
      showStoreName = true,
      showPrice = true,
      showSku = true,
      showProductName = true,
      showBorder = true,
      barcodeFormat = 'CODE128',
      filename,
    } = options;

    if (!items || items.length === 0) {
      throw new Error('No items selected for label generation.');
    }

    // Flatten all items by copies
    const flatStickers: LabelItem[] = items.flatMap((item) =>
      Array.from({length: Math.max(1, item.copies || 1)}, () => item)
    );

    if (flatStickers.length === 0) {
      throw new Error('Total sticker count is 0.');
    }

    // Cache generated barcode and QR images for fast generation
    const barcodeCache = new Map<string, string>();
    const qrCache = new Map<string, string>();

    const getBarcodeImg = (code: string) => {
      if (!barcodeCache.has(code)) {
        barcodeCache.set(code, this.generateBarcodePNG(code, barcodeFormat));
      }
      return barcodeCache.get(code) || '';
    };

    const getQRImg = async (code: string) => {
      if (!qrCache.has(code)) {
        const url = await this.generateQRPNG(code);
        qrCache.set(code, url);
      }
      return qrCache.get(code) || '';
    };

    // Pre-cache all distinct codes
    for (const item of items) {
      if (item.type === 'barcode' || item.type === 'both') {
        getBarcodeImg(item.code);
      }
      if (item.type === 'qr' || item.type === 'both') {
        await getQRImg(item.code);
      }
    }

    const isThermal = template.startsWith('thermal');

    if (isThermal) {
      // Setup thermal roll document
      let rollWidth = 50;
      let rollHeight = 30;
      if (template === 'thermal_40x25') {
        rollWidth = 40;
        rollHeight = 25;
      } else if (template === 'thermal_60x40') {
        rollWidth = 60;
        rollHeight = 40;
      }

      // In jsPDF landscape, format is [height, width]
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: [rollHeight, rollWidth],
      });

      for (let i = 0; i < flatStickers.length; i++) {
        if (i > 0) {
          doc.addPage([rollHeight, rollWidth], 'landscape');
        }
        const item = flatStickers[i];
        await this.renderSingleLabel(doc, item, settings, {
          x: 1,
          y: 1,
          width: rollWidth - 2,
          height: rollHeight - 2,
          showStoreName,
          showPrice,
          showSku,
          showProductName,
          showBorder: false, // roll stickers usually have border cut by paper edge
          getBarcodeImg,
          getQRImg,
        });
      }

      const saveName =
        filename ||
        `Sappy_Stationary_Labels_${template}_${new Date().toISOString().slice(0, 10)}.pdf`;
      doc.save(saveName);
      return;
    }

    // A4 Sheet Layout (a4_30up or a4_24up)
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const is30Up = template === 'a4_30up';
    const cols = 3;
    const rows = is30Up ? 10 : 8;
    const perPage = cols * rows;

    const labelWidth = is30Up ? 63.5 : 64;
    const labelHeight = is30Up ? 27.5 : 33.5;
    const gapX = 2.5;
    const gapY = 0.8;

    const marginX = (210 - (cols * labelWidth + (cols - 1) * gapX)) / 2;
    const marginY = (297 - (rows * labelHeight + (rows - 1) * gapY)) / 2;

    for (let i = 0; i < flatStickers.length; i++) {
      const pageIndex = i % perPage;
      if (i > 0 && pageIndex === 0) {
        doc.addPage('a4', 'portrait');
      }

      const col = pageIndex % cols;
      const row = Math.floor(pageIndex / cols);

      const x = marginX + col * (labelWidth + gapX);
      const y = marginY + row * (labelHeight + gapY);

      const item = flatStickers[i];
      await this.renderSingleLabel(doc, item, settings, {
        x,
        y,
        width: labelWidth,
        height: labelHeight,
        showStoreName,
        showPrice,
        showSku,
        showProductName,
        showBorder,
        getBarcodeImg,
        getQRImg,
      });
    }

    const saveName =
      filename ||
      `Sappy_Stationary_Labels_${template}_(${flatStickers.length}_stickers).pdf`;
    doc.save(saveName);
  }

  // --- Helper: Render a single label sticker into jsPDF ---
  private static async renderSingleLabel(
    doc: jsPDF,
    item: LabelItem,
    settings: StoreSettings,
    opts: {
      x: number;
      y: number;
      width: number;
      height: number;
      showStoreName: boolean;
      showPrice: boolean;
      showSku: boolean;
      showProductName: boolean;
      showBorder: boolean;
      getBarcodeImg: (c: string) => string;
      getQRImg: (c: string) => Promise<string>;
    }
  ) {
    const {x, y, width, height, showStoreName, showPrice, showSku, showProductName, showBorder, getBarcodeImg, getQRImg} =
      opts;

    // Draw subtle border / cutoff guideline
    if (showBorder) {
      doc.setDrawColor(220, 220, 220);
      doc.setLineWidth(0.15);
      doc.rect(x, y, width, height);
    }

    let curY = y + 2.4;

    // 1. Store Header Name
    if (showStoreName) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6);
      doc.setTextColor(80, 80, 80);
      const storeTxt = settings.storeName.toUpperCase();
      doc.text(storeTxt, x + width / 2, curY, {align: 'center'});
      curY += 2.6;
    }

    // 2. Product Name
    if (showProductName) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(0, 0, 0);
      const maxLen = width > 50 ? 28 : 22;
      const cleanName = item.name.length > maxLen ? item.name.substring(0, maxLen - 2) + '...' : item.name;
      doc.text(cleanName, x + width / 2, curY, {align: 'center'});
      curY += 3.2;
    }

    // Available space for barcode / QR code
    const reservedFooter = 5.0; // mm for sku + price
    const graphicAreaHeight = Math.max(8, height - (curY - y) - reservedFooter);

    // 3. Barcode / QR Code Image
    if (item.type === 'qr') {
      const qrSize = Math.min(graphicAreaHeight, 16);
      const qrImg = await getQRImg(item.code);
      if (qrImg) {
        doc.addImage(qrImg, 'PNG', x + (width - qrSize) / 2, curY, qrSize, qrSize);
      }
    } else if (item.type === 'both') {
      const qrSize = Math.min(graphicAreaHeight, 13);
      const bcWidth = Math.max(16, width - qrSize - 6);
      const bcHeight = Math.min(graphicAreaHeight - 1, 9);
      const bcImg = getBarcodeImg(item.code);
      const qrImg = await getQRImg(item.code);

      if (bcImg) doc.addImage(bcImg, 'PNG', x + 2, curY + 1, bcWidth, bcHeight);
      if (qrImg) doc.addImage(qrImg, 'PNG', x + width - qrSize - 2, curY, qrSize, qrSize);
    } else {
      // Standard 1D Barcode
      const bcWidth = Math.min(width - 6, 52);
      const bcHeight = Math.min(graphicAreaHeight, 12);
      const bcImg = getBarcodeImg(item.code);
      if (bcImg) {
        doc.addImage(bcImg, 'PNG', x + (width - bcWidth) / 2, curY, bcWidth, bcHeight);
      }
    }

    // 4. Footer: SKU / Code (left) & Price (right)
    const footerY = y + height - 2.0;
    doc.setFont('courier', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(60, 60, 60);

    const codeLabel = showSku && item.sku ? item.sku : item.code;
    doc.text(codeLabel, x + 2.5, footerY);

    if (showPrice && item.price > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(0, 0, 0);
      const priceStr = `${item.price.toFixed(2)} ${settings.currency}`;
      doc.text(priceStr, x + width - 2.5, footerY, {align: 'right'});
    }
  }

  // --- Export Single Product Barcode / QR Code to PDF ---
  static async exportIndividualBarcodeToPDF(
    product: Product,
    codeValue: string,
    codeType: CodeType,
    copies: number,
    settings: StoreSettings,
    options: BarcodePDFOptions = {}
  ): Promise<void> {
    const item: LabelItem = {
      id: `lbl-${product.id}`,
      productId: product.id,
      name: product.name,
      sku: product.sku,
      code: codeValue,
      price: product.sellingPrice,
      type: codeType,
      copies: Math.max(1, copies),
    };

    const cleanName = product.sku || product.name.replace(/\s+/g, '_');
    const filename = `Barcode_${cleanName}_(${copies}_copies).pdf`;

    await this.exportBarcodeLabelsToPDF([item], settings, {
      ...options,
      filename,
    });
  }
}
