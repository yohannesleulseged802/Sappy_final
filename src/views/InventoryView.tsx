import React, {useState, useMemo} from 'react';
import {
  Package,
  Plus,
  Search,
  Filter,
  ArrowUpDown,
  Download,
  Upload,
  AlertTriangle,
  Barcode,
  QrCode,
  Edit,
  Trash2,
  TrendingUp,
  TrendingDown,
  Layers,
  Check,
  X,
  Camera,
  RefreshCw,
  FileSpreadsheet,
  ShieldAlert,
  CheckSquare,
  Square,
  ListPlus,
  FileDown,
  Sparkles,
  ChevronDown,
  Loader2,
} from 'lucide-react';
import {Product, ProductCode, StockMovementType, StoreSettings, Staff, LabelItem, CodeType} from '../types';
import {storage} from '../services/storage';
import {sound} from '../services/sound';
import {ExportService} from '../services/export';
import {BarcodeRenderer} from '../components/common/BarcodeRenderer';
import {CameraScannerModal} from '../components/common/CameraScannerModal';
import {ItemSelectorModal, SelectedItemConfig} from '../components/common/ItemSelectorModal';
import {IndividualCodeViewModal} from '../components/common/IndividualCodeViewModal';

interface InventoryViewProps {
  products: Product[];
  settings: StoreSettings;
  currentStaff: Staff;
  onRefreshData: () => void;
  onNavigateToBarcodeStudio?: (items: LabelItem[]) => void;
}

export const InventoryView: React.FC<InventoryViewProps> = ({
  products,
  settings,
  currentStaff,
  onRefreshData,
  onNavigateToBarcodeStudio,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'out'>('all');

  // Multi-Selection State for Batch Barcode/QR Generation
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [isBarcodeSelectorOpen, setIsBarcodeSelectorOpen] = useState(false);

  // Individual Code View State
  const [individualCodeProduct, setIndividualCodeProduct] = useState<Product | null>(null);
  const [individualCodeObj, setIndividualCodeObj] = useState<ProductCode | null>(null);
  const [isIndividualCodeModalOpen, setIsIndividualCodeModalOpen] = useState(false);

  const handleOpenIndividualCodeView = (prod: Product, code?: ProductCode) => {
    setIndividualCodeProduct(prod);
    setIndividualCodeObj(code || null);
    setIsIndividualCodeModalOpen(true);
  };

  // Modals
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Stock Adjustment Modal
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [selectedProductForStock, setSelectedProductForStock] = useState<Product | null>(null);
  const [stockOpType, setStockOpType] = useState<StockMovementType>('STOCK_IN');
  const [stockOpQty, setStockOpQty] = useState<number>(10);
  const [stockOpReason, setStockOpReason] = useState<string>('Restock from supplier');

  // Excel / CSV Import Modal State
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importPreviewRows, setImportPreviewRows] = useState<any[]>([]);
  const [importErrors, setImportErrors] = useState<any[]>([]);
  const [importFileInfo, setImportFileInfo] = useState<{
    name: string;
    type: 'XLSX' | 'XLS' | 'CSV';
    sheet: string;
    total: number;
  } | null>(null);
  const [isParsingImport, setIsParsingImport] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

  // Duplicate Conflict Resolution State (Requirement #3: Duplicate Item Insertion Prohibition & Choice)
  const [duplicateConflict, setDuplicateConflict] = useState<{
    incomingProduct: Product;
    existingProduct: Product;
    reason: 'sku' | 'code' | 'name';
    value: string;
  } | null>(null);

  // Bulk Import Duplicate Policy Strategy (Requirement #3)
  const [importDuplicateStrategy, setImportDuplicateStrategy] = useState<'merge' | 'replace' | 'skip'>('merge');

  // Camera Scanner for Product Code Modal
  const [isCameraOpen, setIsCameraOpen] = useState(false);

  // --- Form State for Add / Edit Product ---
  const [formName, setFormName] = useState('');
  const [formSku, setFormSku] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCategory, setFormCategory] = useState('Paper & Printing');
  const [formBrand, setFormBrand] = useState('');
  const [formCostPrice, setFormCostPrice] = useState<number>(0);
  const [formSellingPrice, setFormSellingPrice] = useState<number>(0);
  const [formWholesalePrice, setFormWholesalePrice] = useState<number>(0);
  const [formCurrentStock, setFormCurrentStock] = useState<number>(0);
  const [formMinStock, setFormMinStock] = useState<number>(settings.lowStockDefaultThreshold);
  const [formUnit, setFormUnit] = useState('pcs');
  const [formSupplier, setFormSupplier] = useState('');

  // Code Assignment Form State (Requirement #7, #8, #35)
  const [codeSourceMode, setCodeSourceMode] = useState<'existing' | 'generated'>('existing');
  const [codeType, setCodeType] = useState<'barcode' | 'qr' | 'both'>('barcode');
  const [codeValue, setCodeValue] = useState('');
  const [barcodeFormat, setBarcodeFormat] = useState<'CODE128' | 'EAN13' | 'UPC'>('CODE128');
  const [codeVerificationResult, setCodeVerificationResult] = useState<{
    valid: boolean;
    message: string;
    conflictingProduct?: Product;
  } | null>(null);

  const [codesList, setCodesList] = useState<ProductCode[]>([]);

  // Unique Categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return ['All', ...Array.from(set)];
  }, [products]);

  // Filtered List
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (selectedCategory !== 'All' && p.category !== selectedCategory) return false;
      if (stockFilter === 'out' && p.currentStock > 0) return false;
      if (stockFilter === 'low' && (p.currentStock > p.minStockThreshold || p.currentStock === 0)) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return (
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.brand.toLowerCase().includes(q) ||
          p.codes.some((c) => c.code.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [products, selectedCategory, stockFilter, searchQuery]);

  // --- Open Add Product Modal ---
  const handleOpenAddProduct = () => {
    setEditingProduct(null);
    setFormName('');
    const randomSku = `SAP-${Math.floor(1000 + Math.random() * 9000)}`;
    setFormSku(randomSku);
    setFormDescription('');
    setFormCategory('Paper & Printing');
    setFormBrand('Standard');
    setFormCostPrice(0);
    setFormSellingPrice(0);
    setFormWholesalePrice(0);
    setFormCurrentStock(20);
    setFormMinStock(settings.lowStockDefaultThreshold);
    setFormUnit('pcs');
    setFormSupplier('');

    // Default code mode
    setCodeSourceMode('existing');
    setCodeType('barcode');
    setCodeValue('');
    setCodeVerificationResult(null);
    setCodesList([]);
    setIsProductModalOpen(true);
  };

  // --- Open Edit Product Modal ---
  const handleOpenEditProduct = (prod: Product) => {
    setEditingProduct(prod);
    setFormName(prod.name);
    setFormSku(prod.sku);
    setFormDescription(prod.description);
    setFormCategory(prod.category);
    setFormBrand(prod.brand);
    setFormCostPrice(prod.costPrice);
    setFormSellingPrice(prod.sellingPrice);
    setFormWholesalePrice(prod.wholesalePrice || 0);
    setFormCurrentStock(prod.currentStock);
    setFormMinStock(prod.minStockThreshold);
    setFormUnit(prod.unit);
    setFormSupplier(prod.supplier || '');

    setCodesList([...prod.codes]);
    setCodeSourceMode('existing');
    setCodeValue('');
    setCodeVerificationResult(null);
    setIsProductModalOpen(true);
  };

  // --- Code Verification Function (Requirement #8) ---
  const verifyCodeAvailability = (val: string) => {
    if (!val || !val.trim()) {
      setCodeVerificationResult({valid: false, message: 'Please enter a code value first.'});
      return;
    }
    const clean = val.trim();
    const conflict = storage.findCodeConflict(clean, editingProduct?.id);

    if (conflict) {
      setCodeVerificationResult({
        valid: false,
        message: `DUPLICATE CODE: Already assigned to "${conflict.conflictingProduct.name}" (${conflict.conflictingCode.label || conflict.conflictingCode.type.toUpperCase()}).`,
        conflictingProduct: conflict.conflictingProduct,
      });
    } else {
      setCodeVerificationResult({
        valid: true,
        message: `Code "${clean}" is available and unique!`,
      });
    }
  };

  // --- Generate Auto Code ---
  const generateNewUniqueCode = () => {
    const randomDigits = Math.floor(1000000000 + Math.random() * 9000000000);
    const generated = `${settings.barcodePrefix || 'SAP'}-${randomDigits}`;
    setCodeValue(generated);
    verifyCodeAvailability(generated);
  };

  // --- Add Code to Codes List ---
  const handleAssignCodeToProduct = () => {
    if (!codeValue.trim()) return;
    const clean = codeValue.trim();
    const conflict = storage.findCodeConflict(clean, editingProduct?.id);
    if (conflict) {
      alert(`Cannot assign code: already owned by "${conflict.conflictingProduct.name}".`);
      return;
    }

    const newCode: ProductCode = {
      id: `code-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      code: clean,
      type: codeType,
      format: barcodeFormat,
      source: codeSourceMode,
      isPrimary: codesList.length === 0, // First code is primary
      active: true,
      label: codeSourceMode === 'existing' ? 'Pre-Printed Packaging Code' : 'Auto Store Barcode',
      createdDate: new Date().toISOString(),
    };

    setCodesList([...codesList, newCode]);
    setCodeValue('');
    setCodeVerificationResult(null);
  };

  // --- Save Product ---
  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formSku.trim()) {
      alert('Product Name and SKU are required.');
      return;
    }

    const isNew = !editingProduct;
    const newProduct: Product = {
      id: editingProduct ? editingProduct.id : `prod-${Date.now()}`,
      name: formName.trim(),
      sku: formSku.trim(),
      description: formDescription,
      category: formCategory,
      brand: formBrand || 'Standard',
      costPrice: formCostPrice,
      sellingPrice: formSellingPrice,
      wholesalePrice: formWholesalePrice || undefined,
      currentStock: formCurrentStock,
      minStockThreshold: formMinStock,
      unit: formUnit || 'pcs',
      supplier: formSupplier,
      codes: codesList,
      createdDate: editingProduct ? editingProduct.createdDate : new Date().toISOString(),
      updatedDate: new Date().toISOString(),
    };

    const result = storage.saveProduct(newProduct, isNew);
    if (!result.success) {
      if (result.duplicateFound && result.existingProduct) {
        sound.playError();
        setDuplicateConflict({
          incomingProduct: newProduct,
          existingProduct: result.existingProduct,
          reason: result.duplicateReason || 'sku',
          value: result.duplicateValue || '',
        });
        return;
      }
      alert(result.error || 'Failed to save product.');
      return;
    }

    sound.playCheckoutSuccess();
    setIsProductModalOpen(false);
    onRefreshData();
  };

  // --- Duplicate Conflict Resolution Handlers (Requirement #3) ---
  const handleResolveMerge = () => {
    if (!duplicateConflict) return;
    storage.mergeProducts(duplicateConflict.existingProduct, duplicateConflict.incomingProduct, {
      updatePrice: true,
    });
    sound.playCheckoutSuccess();
    alert(`Successfully merged duplicate item! Stock combined to ${duplicateConflict.existingProduct.currentStock + duplicateConflict.incomingProduct.currentStock} ${duplicateConflict.existingProduct.unit}.`);
    setDuplicateConflict(null);
    setIsProductModalOpen(false);
    onRefreshData();
  };

  const handleResolveReplace = () => {
    if (!duplicateConflict) return;
    storage.saveProduct(duplicateConflict.incomingProduct, false, 'replace');
    sound.playCheckoutSuccess();
    alert(`Existing catalog item was replaced with incoming product details.`);
    setDuplicateConflict(null);
    setIsProductModalOpen(false);
    onRefreshData();
  };

  const handleResolveCancel = () => {
    setDuplicateConflict(null);
  };

  // --- Stock Adjustment Submit ---
  const handleStockOpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductForStock) return;

    let delta = stockOpQty;
    if (
      stockOpType === 'STOCK_OUT' ||
      stockOpType === 'DAMAGE' ||
      stockOpType === 'LOST'
    ) {
      delta = -Math.abs(stockOpQty);
    } else if (stockOpType === 'STOCKTAKE') {
      delta = stockOpQty - selectedProductForStock.currentStock;
    }

    storage.recordStockMovement(selectedProductForStock.id, stockOpType, delta, stockOpReason);
    setIsStockModalOpen(false);
    setSelectedProductForStock(null);
    onRefreshData();
  };

  // --- Handle Spreadsheet File Upload (.xlsx, .xls, .csv) ---
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsParsingImport(true);
    try {
      const result = await ExportService.parseSpreadsheetFile(file, products, settings.barcodePrefix);
      setImportPreviewRows(result.validRows);
      setImportErrors(result.errors);
      setImportFileInfo({
        name: file.name,
        type: result.fileType,
        sheet: result.sheetName,
        total: result.totalRowsRead,
      });
      setIsImportModalOpen(true);
      if (result.validRows.length > 0) {
        sound.playScanSuccess();
      } else {
        sound.playError();
      }
    } catch (err: any) {
      sound.playError();
      alert(err?.message || 'Failed to read spreadsheet file. Please verify it is a valid .xlsx or .csv document.');
    } finally {
      setIsParsingImport(false);
      e.target.value = '';
    }
  };

  const handleConfirmImport = async () => {
    let importedCount = 0;
    let mergedCount = 0;
    let skippedCount = 0;
    const existingSkus = new Set(products.map((p) => (p.sku || '').toLowerCase()));
    const newProducts: Product[] = [];

    for (let i = 0; i < importPreviewRows.length; i++) {
      const row = importPreviewRows[i];
      let finalSku = (row.sku || '').trim();

      // Auto-generate SKU if row is empty
      if (!finalSku) {
        const prefix = (settings.barcodePrefix || 'SAP').trim().toUpperCase();
        let counter = 1000 + i;
        let cand = `${prefix}-${counter}`;
        while (existingSkus.has(cand.toLowerCase())) {
          counter += Math.floor(Math.random() * 50) + 1;
          cand = `${prefix}-${counter}`;
        }
        finalSku = cand;
      }
      existingSkus.add(finalSku.toLowerCase());

      const prod: Product = {
        id: `prod-${Date.now()}-${Math.random().toString(36).substring(2, 6)}-${i}`,
        name: row.name || 'Unnamed Product',
        sku: finalSku,
        category: row.category || 'General Stationery',
        brand: row.brand || 'Standard',
        description: row.description || '',
        costPrice: row.costPrice || 0,
        sellingPrice: row.sellingPrice || 0,
        wholesalePrice: row.wholesalePrice || 0,
        currentStock: row.currentStock || 0,
        minStockThreshold: row.minStockThreshold || settings.lowStockDefaultThreshold || 5,
        unit: row.unit || 'pcs',
        codes: row.codes && row.codes.length > 0 ? row.codes : [],
        createdDate: new Date().toISOString(),
        updatedDate: new Date().toISOString(),
      };

      // Check if duplicate exists in catalog
      const duplicate = storage.findDuplicateProduct(prod);
      if (duplicate) {
        if (importDuplicateStrategy === 'merge') {
          storage.mergeProducts(duplicate.product, prod, { updatePrice: true });
          mergedCount++;
        } else if (importDuplicateStrategy === 'replace') {
          storage.saveProduct(prod, false, 'replace');
          importedCount++;
        } else {
          // 'skip'
          skippedCount++;
        }
      } else {
        const res = storage.saveProduct(prod, true);
        if (res.success) {
          importedCount++;
          newProducts.push(prod);
        }
      }
    }

    if (newProducts.length > 0) {
      await storage.pushProductsBatchToFirestore(newProducts);
    }

    sound.playCheckoutSuccess();
    const parts = [];
    if (importedCount > 0) parts.push(`${importedCount} new products added`);
    if (mergedCount > 0) parts.push(`${mergedCount} duplicates merged & stock combined`);
    if (skippedCount > 0) parts.push(`${skippedCount} duplicates skipped`);

    alert(`Spreadsheet import complete: ${parts.join(', ') || 'Catalog updated'}! Synced across all devices.`);
    setIsImportModalOpen(false);
    setImportPreviewRows([]);
    setImportErrors([]);
    onRefreshData();
  };

  // Multi-Selection Methods for Barcode / QR Generation
  const toggleSelectProduct = (productId: string) => {
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  };

  const isAllVisibleSelected = useMemo(() => {
    if (filteredProducts.length === 0) return false;
    return filteredProducts.every((p) => selectedProductIds.has(p.id));
  }, [filteredProducts, selectedProductIds]);

  const toggleSelectAllVisible = () => {
    if (isAllVisibleSelected) {
      setSelectedProductIds((prev) => {
        const next = new Set(prev);
        filteredProducts.forEach((p) => next.delete(p.id));
        return next;
      });
    } else {
      setSelectedProductIds((prev) => {
        const next = new Set(prev);
        filteredProducts.forEach((p) => next.add(p.id));
        return next;
      });
    }
  };

  const clearSelection = () => {
    setSelectedProductIds(new Set());
  };

  const handleOpenBatchBarcodeGeneration = (singleProd?: Product) => {
    if (singleProd) {
      setSelectedProductIds(new Set([singleProd.id]));
    }
    setIsBarcodeSelectorOpen(true);
  };

  const handleBatchBarcodeConfirmed = (configs: SelectedItemConfig[]) => {
    const labelItems: LabelItem[] = configs.map((c) => ({
      id: `lbl-${Date.now()}-${c.product.id}`,
      productId: c.product.id,
      name: c.product.name,
      sku: c.product.sku,
      code: c.code || c.product.sku,
      price: c.product.sellingPrice,
      type: c.type,
      copies: c.copies,
    }));

    if (onNavigateToBarcodeStudio) {
      onNavigateToBarcodeStudio(labelItems);
    } else {
      alert(`Selected ${labelItems.length} products for Barcode & QR Code generation!`);
    }
  };

  // Direct batch PDF export for selected inventory items
  const [isBatchExportingPDF, setIsBatchExportingPDF] = useState(false);
  const handleExportSelectedToPDF = async () => {
    const selectedProds = products.filter((p) => selectedProductIds.has(p.id));
    if (selectedProds.length === 0) return;
    setIsBatchExportingPDF(true);
    try {
      const itemsToExport: LabelItem[] = selectedProds.map((p) => {
        const primary = p.codes.find((c) => c.isPrimary) || p.codes[0];
        return {
          id: `lbl-${p.id}`,
          productId: p.id,
          name: p.name,
          sku: p.sku,
          code: primary?.code || p.sku,
          price: p.sellingPrice,
          type: (primary?.type as CodeType) || 'barcode',
          copies: 4,
        };
      });

      await ExportService.exportBarcodeLabelsToPDF(itemsToExport, settings, {
        template: 'a4_30up',
        showStoreName: true,
        showPrice: true,
        showSku: true,
        showProductName: true,
        showBorder: true,
      });
    } catch (err: any) {
      alert(err?.message || 'Failed to export PDF');
    } finally {
      setIsBatchExportingPDF(false);
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col h-full max-h-full overflow-hidden bg-[#fdfbf7] dark:bg-[#12100e]">
      {/* Batch Action Bar for Selected Items */}
      {selectedProductIds.size > 0 && (
        <div className="p-2.5 px-4 bg-emerald-50 dark:bg-[#142920] border-b border-emerald-200 dark:border-emerald-900/60 flex flex-wrap items-center justify-between gap-2 text-xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-[#064e3b] dark:text-[#6ee7b7] flex items-center gap-1.5">
              <CheckSquare className="w-4 h-4" />
              <span>{selectedProductIds.size} Products Selected</span>
            </span>
            <span className="text-stone-400">•</span>
            <button
              onClick={clearSelection}
              className="text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 underline cursor-pointer"
            >
              Clear Selection
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleExportSelectedToPDF}
              disabled={isBatchExportingPDF}
              className="px-3 py-1.5 bg-emerald-100 dark:bg-emerald-900/80 hover:bg-emerald-200 text-[#064e3b] dark:text-[#6ee7b7] border border-emerald-300 dark:border-emerald-700 rounded-xl font-bold flex items-center gap-1.5 shadow-2xs transition cursor-pointer disabled:opacity-50"
              title="Download print-ready PDF labels for all selected products"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span>{isBatchExportingPDF ? 'Generating PDF...' : 'Export PDF'}</span>
            </button>

            <button
              onClick={() => handleOpenBatchBarcodeGeneration()}
              className="px-3.5 py-1.5 bg-[#064e3b] hover:bg-[#043b2c] text-white rounded-xl font-bold flex items-center gap-1.5 shadow-sm transition cursor-pointer"
            >
              <Barcode className="w-3.5 h-3.5" />
              <QrCode className="w-3.5 h-3.5" />
              <span>Generate Codes ({selectedProductIds.size})</span>
            </button>

            {onNavigateToBarcodeStudio && (
              <button
                onClick={() => {
                  const itemsToQueue: LabelItem[] = products
                    .filter((p) => selectedProductIds.has(p.id))
                    .map((p) => {
                      const primary = p.codes.find((c) => c.isPrimary) || p.codes[0];
                      return {
                        id: `lbl-${p.id}`,
                        productId: p.id,
                        name: p.name,
                        sku: p.sku,
                        code: primary?.code || p.sku,
                        price: p.sellingPrice,
                        type: (primary?.type as CodeType) || 'barcode',
                        copies: 4,
                      };
                    });
                  onNavigateToBarcodeStudio(itemsToQueue);
                }}
                className="px-3 py-1.5 bg-white dark:bg-stone-900 border border-emerald-300 dark:border-emerald-800 text-[#064e3b] dark:text-[#6ee7b7] rounded-xl font-bold flex items-center gap-1 hover:bg-emerald-50 dark:hover:bg-emerald-950 transition cursor-pointer"
              >
                <ListPlus className="w-3.5 h-3.5" />
                <span>Open in Barcode Studio</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Top Action Bar */}
      <div className="p-3 bg-white dark:bg-[#1c1815] border-b border-[#e6dfd5] dark:border-[#362e26] flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by product name, SKU, or code..."
              className="w-full bg-[#f5f1e8] dark:bg-[#25201b] border border-transparent focus:border-[#064e3b] dark:focus:border-[#6ee7b7] rounded-xl pl-9 pr-4 py-2 text-xs text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-hidden"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Stock Filter Pills */}
          <div className="flex bg-stone-100 dark:bg-stone-800 p-0.5 rounded-lg text-xs font-semibold">
            <button
              onClick={() => setStockFilter('all')}
              className={`px-2.5 py-1 rounded-md transition ${
                stockFilter === 'all'
                  ? 'bg-white dark:bg-stone-900 shadow-xs text-stone-900 dark:text-stone-100'
                  : 'text-stone-500'
              }`}
            >
              All ({products.length})
            </button>
            <button
              onClick={() => setStockFilter('low')}
              className={`px-2.5 py-1 rounded-md transition ${
                stockFilter === 'low'
                  ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-200'
                  : 'text-stone-500'
              }`}
            >
              Low Stock
            </button>
            <button
              onClick={() => setStockFilter('out')}
              className={`px-2.5 py-1 rounded-md transition ${
                stockFilter === 'out'
                  ? 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-200'
                  : 'text-stone-500'
              }`}
            >
              Out of Stock
            </button>
          </div>

          {/* Export Dropdown (.xlsx & .csv) */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="p-2 border border-stone-200 dark:border-stone-800 rounded-xl text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition text-xs font-bold flex items-center gap-1 cursor-pointer"
              title="Export Product Catalog"
            >
              <Download className="w-3.5 h-3.5 text-stone-600 dark:text-stone-400" />
              <span className="hidden sm:inline">Export</span>
              <ChevronDown className="w-3 h-3 text-stone-400" />
            </button>
            {showExportMenu && (
              <div
                className="absolute right-0 mt-1 w-52 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl shadow-xl z-30 p-1 py-1 text-xs"
                onMouseLeave={() => setShowExportMenu(false)}
              >
                <button
                  onClick={() => {
                    ExportService.exportProductsToExcel(products);
                    setShowExportMenu(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-stone-700 dark:text-stone-200 flex items-center gap-2 cursor-pointer font-medium"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <div>
                    <div className="font-bold text-stone-900 dark:text-stone-100">Excel Spreadsheet</div>
                    <div className="text-[10px] text-stone-500">Microsoft Excel (.xlsx)</div>
                  </div>
                </button>
                <button
                  onClick={() => {
                    ExportService.exportProductsToCSV(products);
                    setShowExportMenu(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-200 flex items-center gap-2 cursor-pointer font-medium"
                >
                  <FileSpreadsheet className="w-4 h-4 text-stone-400 shrink-0" />
                  <div>
                    <div className="font-bold text-stone-900 dark:text-stone-100">CSV Document</div>
                    <div className="text-[10px] text-stone-500">Comma Separated (.csv)</div>
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* Import Spreadsheet (.xlsx, .xls, .csv) */}
          <label
            className={`p-2 border border-stone-200 dark:border-stone-800 rounded-xl text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
              isParsingImport ? 'opacity-60 pointer-events-none' : ''
            }`}
            title="Bulk Import Catalog from Excel (.xlsx, .xls) or CSV"
          >
            {isParsingImport ? (
              <Loader2 className="w-3.5 h-3.5 text-emerald-600 animate-spin" />
            ) : (
              <Upload className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
            )}
            <span className="hidden sm:inline">
              {isParsingImport ? 'Reading File...' : 'Import Excel / CSV'}
            </span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
              onChange={handleFileUpload}
              disabled={isParsingImport}
              className="hidden"
            />
          </label>

          {/* Select Items for Barcode / QR Button */}
          <button
            onClick={() => handleOpenBatchBarcodeGeneration()}
            className="p-2 border border-emerald-300 dark:border-emerald-800/80 rounded-xl text-[#064e3b] dark:text-[#6ee7b7] bg-emerald-50/50 dark:bg-emerald-950/30 hover:bg-emerald-100/50 dark:hover:bg-emerald-950/60 transition text-xs font-bold flex items-center gap-1 cursor-pointer"
            title="Select items from catalog to batch generate Barcodes & QR codes"
          >
            <Barcode className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Generate Codes</span>
          </button>

          {/* Cloud Sync Button */}
          <button
            onClick={async () => {
              await storage.syncEverythingWithFirestore();
              onRefreshData();
              sound.playScanSuccess();
            }}
            className="p-2 border border-stone-200 dark:border-stone-800 rounded-xl text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition text-xs font-bold flex items-center gap-1 cursor-pointer"
            title="Sync all products with Firebase Cloud Database across devices"
          >
            <RefreshCw className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="hidden lg:inline">Cloud Sync</span>
          </button>

          {/* Add Product Button */}
          <button
            onClick={handleOpenAddProduct}
            className="px-3.5 py-2 bg-[#064e3b] hover:bg-[#043b2c] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Product</span>
          </button>
        </div>
      </div>

      {/* Categories Filter Strip */}
      <div className="px-3 py-1.5 bg-white/60 dark:bg-[#1c1815]/60 border-b border-[#e6dfd5] dark:border-[#362e26] flex gap-1.5 overflow-x-auto scrollbar-none">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-2.5 py-0.5 rounded-lg text-xs font-medium whitespace-nowrap transition cursor-pointer ${
              selectedCategory === cat
                ? 'bg-[#064e3b] text-white'
                : 'text-stone-600 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-800'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Inventory Products Table */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="bg-white dark:bg-[#1c1815] border border-[#e6dfd5] dark:border-[#362e26] rounded-2xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#f5f1e8] dark:bg-[#25201b] border-b border-[#e6dfd5] dark:border-[#362e26] text-stone-700 dark:text-stone-300 font-bold uppercase tracking-wider">
                  <th className="p-3 w-10 text-center">
                    <button
                      type="button"
                      onClick={toggleSelectAllVisible}
                      className="text-stone-400 hover:text-emerald-700 transition cursor-pointer"
                      title={isAllVisibleSelected ? "Deselect All Visible" : "Select All Visible"}
                    >
                      {isAllVisibleSelected ? (
                        <CheckSquare className="w-4 h-4 text-[#064e3b] dark:text-[#6ee7b7]" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </th>
                  <th className="p-3">Product / SKU</th>
                  <th className="p-3">Category</th>
                  <th className="p-3">Barcode / QR</th>
                  <th className="p-3 text-right">Cost Price</th>
                  <th className="p-3 text-right">Selling Price</th>
                  <th className="p-3 text-center">Stock Level</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e6dfd5] dark:divide-[#2d251f]">
                {filteredProducts.map((p) => {
                  const isOutOfStock = p.currentStock <= 0 && p.category !== 'Print Services';
                  const isLowStock = p.currentStock <= p.minStockThreshold && !isOutOfStock;
                  const primaryCode = p.codes.find((c) => c.isPrimary) || p.codes[0];
                  const isSelected = selectedProductIds.has(p.id);

                  return (
                    <tr
                      key={p.id}
                      className={`transition ${
                        isSelected
                          ? 'bg-emerald-50/60 dark:bg-[#142920]/50 hover:bg-emerald-100/60 dark:hover:bg-[#142920]'
                          : 'hover:bg-[#fdfbf7] dark:hover:bg-[#201b17]'
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() => toggleSelectProduct(p.id)}
                          className="text-stone-400 hover:text-emerald-700 transition cursor-pointer"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-[#064e3b] dark:text-[#6ee7b7]" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>

                      {/* Name & SKU */}
                      <td className="p-3">
                        <div className="font-bold text-stone-900 dark:text-stone-100">
                          {p.name}
                        </div>
                        <div className="text-[11px] text-stone-400 font-mono">
                          {p.sku} {p.brand ? `• ${p.brand}` : ''}
                        </div>
                      </td>

                      {/* Category */}
                      <td className="p-3 text-stone-600 dark:text-stone-300">
                        {p.category}
                      </td>

                      {/* Barcode / QR Preview & Interactive Inspection */}
                      <td className="p-3">
                        {primaryCode ? (
                          <button
                            type="button"
                            onClick={() => handleOpenIndividualCodeView(p, primaryCode)}
                            className="group flex items-center gap-1.5 font-mono text-[11px] p-1 -m-1 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950/60 transition text-left cursor-pointer"
                            title="Click to open full Individual Barcode / QR Code View"
                          >
                            {primaryCode.type === 'qr' ? (
                              <QrCode className="w-3.5 h-3.5 text-stone-500 group-hover:text-emerald-600 transition" />
                            ) : (
                              <Barcode className="w-3.5 h-3.5 text-stone-500 group-hover:text-emerald-600 transition" />
                            )}
                            <span className="font-semibold text-stone-800 dark:text-stone-200 group-hover:text-emerald-700 dark:group-hover:text-emerald-300 underline decoration-dashed decoration-stone-300 dark:decoration-stone-700">
                              {primaryCode.code}
                            </span>
                            {p.codes.length > 1 && (
                              <span className="text-[9px] px-1 bg-stone-100 dark:bg-stone-800 rounded font-sans text-stone-500 group-hover:bg-emerald-100 dark:group-hover:bg-emerald-900">
                                +{p.codes.length - 1} more
                              </span>
                            )}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleOpenIndividualCodeView(p)}
                            className="text-stone-400 hover:text-emerald-600 italic text-[11px] hover:underline cursor-pointer flex items-center gap-1"
                          >
                            <Barcode className="w-3 h-3" />
                            <span>View / Add Code</span>
                          </button>
                        )}
                      </td>

                      {/* Cost */}
                      <td className="p-3 text-right font-mono font-medium text-stone-600 dark:text-stone-400">
                        {p.costPrice.toFixed(2)} {settings.currency}
                      </td>

                      {/* Selling Price */}
                      <td className="p-3 text-right font-mono font-bold text-[#064e3b] dark:text-[#6ee7b7]">
                        {p.sellingPrice.toFixed(2)} {settings.currency}
                      </td>

                      {/* Stock Level with Alert Badges */}
                      <td className="p-3 text-center">
                        {isOutOfStock ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                            <AlertTriangle className="w-3 h-3" />
                            OUT OF STOCK
                          </span>
                        ) : isLowStock ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                            <AlertTriangle className="w-3 h-3" />
                            LOW: {p.currentStock} {p.unit}
                          </span>
                        ) : (
                          <span className="font-mono font-semibold text-stone-800 dark:text-stone-200">
                            {p.category === 'Print Services' ? 'Service' : `${p.currentStock} ${p.unit}`}
                          </span>
                        )}
                      </td>

                      {/* Action Buttons */}
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* Individual Barcode / QR View & Quick Print */}
                          <button
                            onClick={() => handleOpenIndividualCodeView(p, primaryCode)}
                            className="p-1.5 hover:bg-emerald-50 dark:hover:bg-emerald-950/60 text-[#064e3b] dark:text-[#6ee7b7] rounded-lg transition cursor-pointer"
                            title="View Individual Barcode / QR Code (Full Screen / Print / PNG / SVG)"
                          >
                            <Barcode className="w-3.5 h-3.5" />
                          </button>

                          {/* Stock IN / OUT Adjustment Button */}
                          <button
                            onClick={() => {
                              setSelectedProductForStock(p);
                              setStockOpQty(10);
                              setIsStockModalOpen(true);
                            }}
                            className="p-1.5 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300 rounded-lg transition cursor-pointer"
                            title="Adjust Stock (IN/OUT/Stocktake)"
                          >
                            <TrendingUp className="w-3.5 h-3.5" />
                          </button>

                          {/* Edit Product */}
                          <button
                            onClick={() => handleOpenEditProduct(p)}
                            className="p-1.5 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300 rounded-lg transition cursor-pointer"
                            title="Edit Product & Identifiers"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete Product */}
                          <button
                            onClick={() => {
                              if (confirm(`Are you sure you want to delete product "${p.name}"?`)) {
                                storage.deleteProduct(p.id);
                                onRefreshData();
                              }
                            }}
                            className="p-1.5 hover:bg-rose-100 dark:hover:bg-rose-950 text-rose-600 rounded-lg transition cursor-pointer"
                            title="Delete Product"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {filteredProducts.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-12 text-center text-stone-400">
                      No products found. Click "Add Product" to create one.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ================= MODAL: ADD / EDIT PRODUCT & CODE WORKFLOW ================= */}
      {isProductModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl shadow-2xl text-stone-900 dark:text-stone-100 flex flex-col max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-stone-100 dark:border-stone-800 shrink-0 bg-[#fdfbf7] dark:bg-[#171412]">
              <div>
                <h3 className="font-extrabold text-base text-[#064e3b] dark:text-[#6ee7b7]">
                  {editingProduct ? 'Edit Product Catalog Item' : 'New Product Registration'}
                </h3>
                <p className="text-xs text-stone-500">
                  Assign existing packaging barcodes or generate new unique store codes
                </p>
              </div>
              <button
                onClick={() => setIsProductModalOpen(false)}
                className="p-1 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              {/* --- Scrollable Form Body: Save button stays sticky on screen! --- */}
              <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-4">
                {/* --- Section 1: Basic Product Information --- */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-2">
                  1. Product Details
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold mb-1">Product Name *</label>
                    <input
                      type="text"
                      required
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="e.g. Double A Copy Paper A4 80gsm"
                      className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-2 text-xs focus:outline-hidden focus:border-emerald-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1">SKU (Stock Keeping Unit) *</label>
                    <input
                      type="text"
                      required
                      value={formSku}
                      onChange={(e) => setFormSku(e.target.value)}
                      placeholder="e.g. PAP-A4-80G"
                      className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-2 text-xs font-mono focus:outline-hidden focus:border-emerald-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1">Category</label>
                    <input
                      type="text"
                      list="categories-list"
                      value={formCategory}
                      onChange={(e) => setFormCategory(e.target.value)}
                      placeholder="Category"
                      className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-2 text-xs focus:outline-hidden focus:border-emerald-600"
                    />
                    <datalist id="categories-list">
                      <option value="Paper & Printing" />
                      <option value="Writing & Pens" />
                      <option value="Office Supplies & Desk" />
                      <option value="Printer Supplies & Ink" />
                      <option value="Print Services" />
                      <option value="Art & Drafting" />
                    </datalist>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1">Brand / Manufacturer</label>
                    <input
                      type="text"
                      value={formBrand}
                      onChange={(e) => setFormBrand(e.target.value)}
                      placeholder="e.g. Deli, Double A, Parker"
                      className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-2 text-xs focus:outline-hidden focus:border-emerald-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1">Unit of Measure</label>
                    <select
                      value={formUnit}
                      onChange={(e) => setFormUnit(e.target.value)}
                      className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-2 text-xs focus:outline-hidden focus:border-emerald-600"
                    >
                      <option value="pcs">Pieces (pcs)</option>
                      <option value="ream">Reams (ream)</option>
                      <option value="box">Boxes (box)</option>
                      <option value="pack">Packs (pack)</option>
                      <option value="roll">Rolls (roll)</option>
                      <option value="set">Sets (set)</option>
                      <option value="sheet">Sheets (sheet)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* --- Section 2: Pricing & Stock Levels --- */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-2">
                  2. Pricing &amp; Stock Levels
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1">Cost Price ({settings.currency})</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formCostPrice}
                      onChange={(e) => setFormCostPrice(parseFloat(e.target.value) || 0)}
                      className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-2 text-xs font-mono font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1">Selling Price ({settings.currency}) *</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={formSellingPrice}
                      onChange={(e) => setFormSellingPrice(parseFloat(e.target.value) || 0)}
                      className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-2 text-xs font-mono font-black text-emerald-700 dark:text-emerald-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1">Current Stock</label>
                    <input
                      type="number"
                      min="0"
                      value={formCurrentStock}
                      onChange={(e) => setFormCurrentStock(parseInt(e.target.value, 10) || 0)}
                      className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-2 text-xs font-mono font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1">Low-Stock Alert Level</label>
                    <input
                      type="number"
                      min="1"
                      value={formMinStock}
                      onChange={(e) => setFormMinStock(parseInt(e.target.value, 10) || 1)}
                      className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-2 text-xs font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* --- Section 3: IDENTIFICATION (Requirement #7, #8, #35) --- */}
              <div className="p-3 bg-stone-50 dark:bg-stone-800/50 border border-stone-200 dark:border-stone-800 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-400">
                    3. Barcode &amp; QR Code Assignment
                  </h4>
                  <span className="text-[11px] text-stone-500">
                    {codesList.length} code(s) assigned
                  </span>
                </div>

                {/* Mode Selector: Existing vs Generate (Requirement #7) */}
                <div className="grid grid-cols-2 gap-2 bg-white dark:bg-stone-900 p-1 rounded-xl border border-stone-200 dark:border-stone-700">
                  <button
                    type="button"
                    onClick={() => {
                      setCodeSourceMode('existing');
                      setCodeVerificationResult(null);
                    }}
                    className={`py-1.5 rounded-lg text-xs font-bold transition ${
                      codeSourceMode === 'existing'
                        ? 'bg-[#064e3b] text-white shadow-xs'
                        : 'text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800'
                    }`}
                  >
                    Option A: Use Existing Code
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCodeSourceMode('generated');
                      generateNewUniqueCode();
                    }}
                    className={`py-1.5 rounded-lg text-xs font-bold transition ${
                      codeSourceMode === 'generated'
                        ? 'bg-[#064e3b] text-white shadow-xs'
                        : 'text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800'
                    }`}
                  >
                    Option B: Generate New Code
                  </button>
                </div>

                {/* Code Type: Barcode / QR / Both */}
                <div className="flex items-center gap-4 text-xs font-semibold">
                  <span className="text-stone-500">Code Type:</span>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="radio"
                      name="codeType"
                      checked={codeType === 'barcode'}
                      onChange={() => setCodeType('barcode')}
                    />
                    <span>Barcode</span>
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="radio"
                      name="codeType"
                      checked={codeType === 'qr'}
                      onChange={() => setCodeType('qr')}
                    />
                    <span>QR Code</span>
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="radio"
                      name="codeType"
                      checked={codeType === 'both'}
                      onChange={() => setCodeType('both')}
                    />
                    <span>Both</span>
                  </label>
                </div>

                {/* Code Value Entry and Verification */}
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        value={codeValue}
                        onChange={(e) => {
                          setCodeValue(e.target.value);
                          setCodeVerificationResult(null);
                        }}
                        placeholder={
                          codeSourceMode === 'existing'
                            ? 'Scan or enter existing packaging barcode/QR...'
                            : 'Generated unique store code...'
                        }
                        className="w-full bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-lg p-2 text-xs font-mono font-bold text-stone-900 dark:text-stone-100 focus:outline-hidden focus:border-emerald-600"
                      />
                    </div>

                    {/* Camera Scanner Button */}
                    <button
                      type="button"
                      onClick={() => setIsCameraOpen(true)}
                      className="px-2.5 py-2 bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 text-stone-700 dark:text-stone-200 rounded-lg text-xs font-semibold flex items-center gap-1"
                      title="Scan with Camera"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>Scan</span>
                    </button>

                    {/* Verify Button */}
                    <button
                      type="button"
                      onClick={() => verifyCodeAvailability(codeValue)}
                      className="px-3 py-2 bg-stone-800 text-white dark:bg-stone-200 dark:text-stone-900 rounded-lg text-xs font-bold hover:opacity-90"
                    >
                      Verify
                    </button>

                    {/* Assign Button */}
                    <button
                      type="button"
                      onClick={handleAssignCodeToProduct}
                      disabled={!codeValue.trim() || Boolean(codeVerificationResult && !codeVerificationResult.valid)}
                      className="px-3 py-2 bg-[#064e3b] hover:bg-[#043b2c] disabled:opacity-40 text-white rounded-lg text-xs font-bold"
                    >
                      Assign Code
                    </button>
                  </div>

                  {/* Verification Feedback Banner */}
                  {codeVerificationResult && (
                    <div
                      className={`p-2 rounded-lg text-xs flex items-center gap-2 ${
                        codeVerificationResult.valid
                          ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200'
                          : 'bg-rose-50 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200'
                      }`}
                    >
                      {codeVerificationResult.valid ? (
                        <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : (
                        <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                      )}
                      <span>{codeVerificationResult.message}</span>
                    </div>
                  )}

                  {/* Live Render Preview */}
                  {codeValue && (
                    <div className="p-2.5 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl flex items-center justify-center">
                      <BarcodeRenderer
                        code={codeValue}
                        type={codeType}
                        format={barcodeFormat}
                        height={35}
                        width={1.4}
                      />
                    </div>
                  )}
                </div>

                {/* List of currently assigned codes */}
                {codesList.length > 0 && (
                  <div className="space-y-1.5 pt-2 border-t border-stone-200 dark:border-stone-700">
                    <span className="text-[11px] font-bold text-stone-500">
                      Assigned Identifiers ({codesList.length}):
                    </span>
                    {codesList.map((c, idx) => (
                      <div
                        key={c.id || idx}
                        className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-xs font-mono"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-1.5 py-0.2 text-[9px] rounded font-sans uppercase font-bold ${
                              c.isPrimary
                                ? 'bg-[#064e3b] text-white'
                                : 'bg-stone-100 dark:bg-stone-800 text-stone-500'
                            }`}
                          >
                            {c.isPrimary ? 'PRIMARY' : 'SECONDARY'}
                          </span>
                          <span className="font-bold">{c.code}</span>
                          <span className="text-[10px] text-stone-400">({c.type})</span>
                        </div>
                        <div className="flex items-center gap-1 font-sans">
                          {!c.isPrimary && (
                            <button
                              type="button"
                              onClick={() => {
                                setCodesList(
                                  codesList.map((item, i) => ({
                                    ...item,
                                    isPrimary: i === idx,
                                  }))
                                );
                              }}
                              className="text-[10px] text-emerald-700 hover:underline px-1"
                            >
                              Set Primary
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setCodesList(codesList.filter((_, i) => i !== idx));
                            }}
                            className="p-1 text-stone-400 hover:text-rose-600"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              </div>

              {/* Sticky Form Footer - Always visible on screen without scrolling */}
              <div className="p-3.5 bg-white/95 dark:bg-stone-900/95 border-t border-stone-200 dark:border-stone-800 backdrop-blur-xs flex justify-end gap-2 shrink-0 z-10">
                <button
                  type="button"
                  onClick={() => setIsProductModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-[#064e3b] hover:bg-[#043b2c] active:scale-[0.99] text-white text-xs font-extrabold rounded-lg shadow-sm cursor-pointer"
                >
                  Save Product
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: DUPLICATE CONFLICT RESOLUTION (Requirement #3) ================= */}
      {duplicateConflict && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-white dark:bg-stone-900 border-2 border-amber-500 rounded-2xl shadow-2xl p-5 text-stone-900 dark:text-stone-100">
            <div className="flex items-center gap-2.5 mb-3 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <div>
                <h3 className="font-extrabold text-base leading-tight">
                  Duplicate Item Detected — Insertion Prohibited
                </h3>
                <p className="text-xs text-stone-500 dark:text-stone-400">
                  A product with the same {duplicateConflict.reason.toUpperCase()} already exists in your store catalog.
                </p>
              </div>
            </div>

            {/* Comparison card */}
            <div className="grid grid-cols-2 gap-3 p-3 bg-stone-50 dark:bg-stone-800/60 rounded-xl border border-stone-200 dark:border-stone-700 text-xs mb-4">
              <div className="p-2.5 bg-white dark:bg-stone-900 rounded-lg border border-stone-200 dark:border-stone-700">
                <span className="text-[10px] uppercase font-bold text-stone-400 block mb-1">
                  Existing Catalog Item
                </span>
                <div className="font-bold text-sm truncate" title={duplicateConflict.existingProduct.name}>
                  {duplicateConflict.existingProduct.name}
                </div>
                <div className="text-stone-500 font-mono text-[11px] mt-0.5">SKU: {duplicateConflict.existingProduct.sku}</div>
                <div className="mt-2 text-stone-700 dark:text-stone-300">
                  Current Stock: <strong className="font-mono text-emerald-600">{duplicateConflict.existingProduct.currentStock} {duplicateConflict.existingProduct.unit}</strong>
                </div>
                <div className="text-stone-700 dark:text-stone-300 text-[11px]">
                  Price: <span className="font-mono">{duplicateConflict.existingProduct.sellingPrice.toFixed(2)} {settings.currency}</span>
                </div>
              </div>

              <div className="p-2.5 bg-amber-50/60 dark:bg-amber-950/40 rounded-lg border border-amber-300 dark:border-amber-800">
                <span className="text-[10px] uppercase font-bold text-amber-700 dark:text-amber-300 block mb-1">
                  Incoming New Item
                </span>
                <div className="font-bold text-sm truncate" title={duplicateConflict.incomingProduct.name}>
                  {duplicateConflict.incomingProduct.name}
                </div>
                <div className="text-stone-500 font-mono text-[11px] mt-0.5">SKU: {duplicateConflict.incomingProduct.sku}</div>
                <div className="mt-2 text-stone-700 dark:text-stone-300">
                  Incoming Stock: <strong className="font-mono text-amber-700 dark:text-amber-300">+{duplicateConflict.incomingProduct.currentStock} {duplicateConflict.incomingProduct.unit}</strong>
                </div>
                <div className="text-stone-700 dark:text-stone-300 text-[11px]">
                  Price: <span className="font-mono">{duplicateConflict.incomingProduct.sellingPrice.toFixed(2)} {settings.currency}</span>
                </div>
              </div>
            </div>

            <p className="text-xs text-stone-600 dark:text-stone-300 mb-3 font-medium">
              Duplicate insertion is forbidden. Choose how you want to resolve this conflict:
            </p>

            {/* Resolution Buttons */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleResolveMerge}
                className="w-full p-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white rounded-xl text-xs font-bold transition flex items-center justify-between cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4" />
                  <span>Merge Items (Combine Stock into Existing Item)</span>
                </div>
                <span className="text-[10px] bg-emerald-700 px-2 py-0.5 rounded-full font-sans">
                  Total: {duplicateConflict.existingProduct.currentStock + duplicateConflict.incomingProduct.currentStock} {duplicateConflict.existingProduct.unit}
                </span>
              </button>

              <button
                type="button"
                onClick={handleResolveReplace}
                className="w-full p-2.5 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 rounded-xl text-xs font-bold transition flex items-center justify-between cursor-pointer"
              >
                <span>Replace / Overwrite Existing Item Details</span>
                <span className="text-[10px] text-stone-500 font-normal">Keep existing ID</span>
              </button>

              <button
                type="button"
                onClick={handleResolveCancel}
                className="w-full p-2 text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 text-xs font-semibold cursor-pointer"
              >
                Cancel / Keep Existing Item Untouched
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: STOCK ADJUSTMENT ================= */}
      {isStockModalOpen && selectedProductForStock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-5 shadow-2xl">
            <h3 className="font-bold text-sm mb-1 text-stone-900 dark:text-stone-100">
              Adjust Stock: {selectedProductForStock.name}
            </h3>
            <p className="text-xs text-stone-500 mb-3 font-mono">
              Current Stock: {selectedProductForStock.currentStock} {selectedProductForStock.unit}
            </p>

            <form onSubmit={handleStockOpSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Operation Type</label>
                <select
                  value={stockOpType}
                  onChange={(e) => setStockOpType(e.target.value as StockMovementType)}
                  className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-2 text-xs"
                >
                  <option value="STOCK_IN">Stock IN (Receive from Supplier)</option>
                  <option value="STOCK_OUT">Stock OUT (Usage / Withdrawal)</option>
                  <option value="STOCKTAKE">Physical Count (Set Exact Qty)</option>
                  <option value="DAMAGE">Damaged / Expired Goods</option>
                  <option value="RETURN">Customer Return</option>
                  <option value="LOST">Lost / Missing</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">
                  {stockOpType === 'STOCKTAKE' ? 'New Exact Count Quantity' : 'Quantity'}
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={stockOpQty}
                  onChange={(e) => setStockOpQty(parseInt(e.target.value, 10) || 0)}
                  className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-2 text-xs font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Reason / Note *</label>
                <input
                  type="text"
                  required
                  value={stockOpReason}
                  onChange={(e) => setStockOpReason(e.target.value)}
                  placeholder="e.g. Delivered on Invoice #892"
                  className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-2 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsStockModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-stone-500"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#064e3b] text-white rounded-lg text-xs font-bold"
                >
                  Confirm Adjustment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: SPREADSHEET IMPORT PREVIEW (.xlsx, .xls, .csv) ================= */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-5 shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between pb-3 border-b border-stone-200 dark:border-stone-800 mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/80 flex items-center justify-center">
                  <FileSpreadsheet className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm text-stone-900 dark:text-stone-100">
                      Bulk Spreadsheet Import Preview
                    </h3>
                    {importFileInfo && (
                      <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                        importFileInfo.type === 'XLSX' || importFileInfo.type === 'XLS'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                          : 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300'
                      }`}>
                        {importFileInfo.type === 'XLSX' ? 'Excel (.xlsx)' : importFileInfo.type === 'XLS' ? 'Excel (.xls)' : 'CSV Document'}
                      </span>
                    )}
                  </div>
                  {importFileInfo && (
                    <div className="text-[11px] text-stone-500 flex items-center gap-2 mt-0.5">
                      <span className="font-medium text-stone-700 dark:text-stone-300 truncate max-w-[200px]" title={importFileInfo.name}>
                        {importFileInfo.name}
                      </span>
                      <span>•</span>
                      <span>Sheet: <strong className="text-stone-800 dark:text-stone-200">{importFileInfo.sheet}</strong></span>
                      <span>•</span>
                      <span>{importFileInfo.total} rows read</span>
                    </div>
                  )}
                </div>
              </div>
              <span className="text-xs font-mono font-bold px-2.5 py-1 bg-stone-100 dark:bg-stone-800 rounded-lg text-stone-700 dark:text-stone-300">
                {importPreviewRows.length} ready
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500 mb-3">
              <span>Ready to add to your product catalog.</span>
              {importPreviewRows.some((r) => r.isAutoGeneratedSku) && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded-md">
                  <Sparkles className="w-3 h-3 text-emerald-600" />
                  <span>
                    {importPreviewRows.filter((r) => r.isAutoGeneratedSku).length} missing SKU{importPreviewRows.filter((r) => r.isAutoGeneratedSku).length === 1 ? '' : 's'} auto-assigned
                  </span>
                </span>
              )}
            </div>

            {importErrors.length > 0 && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl mb-3 text-xs text-rose-800 dark:text-rose-200 max-h-28 overflow-y-auto">
                <div className="font-bold mb-1 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>Skipped Rows / Validation Warnings ({importErrors.length}):</span>
                </div>
                {importErrors.map((err, i) => (
                  <div key={i} className="font-mono text-[11px]">
                    Row {err.row}: {err.message}
                  </div>
                ))}
              </div>
            )}

            {/* Duplicate Item Policy Selector (Requirement #3) */}
            <div className="p-2.5 bg-stone-50 dark:bg-stone-800/60 border border-stone-200 dark:border-stone-700 rounded-xl mb-3 text-xs">
              <div className="flex items-center justify-between mb-1.5 font-bold">
                <span className="text-stone-800 dark:text-stone-200">Duplicate Conflict Resolution Policy:</span>
                <span className="text-[10px] text-amber-700 dark:text-amber-300 font-bold">*Duplicate insertions strictly prohibited</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setImportDuplicateStrategy('merge')}
                  className={`p-2 rounded-lg text-left border transition cursor-pointer ${
                    importDuplicateStrategy === 'merge'
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-500 text-emerald-900 dark:text-emerald-300 font-bold shadow-xs'
                      : 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400'
                  }`}
                >
                  <div className="flex items-center gap-1 font-bold">
                    <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Merge (Combine Stock)</span>
                  </div>
                  <div className="text-[10px] opacity-75 mt-0.5">Recommended: Combines stock quantity into existing catalog items</div>
                </button>

                <button
                  type="button"
                  onClick={() => setImportDuplicateStrategy('replace')}
                  className={`p-2 rounded-lg text-left border transition cursor-pointer ${
                    importDuplicateStrategy === 'replace'
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-500 text-emerald-900 dark:text-emerald-300 font-bold shadow-xs'
                      : 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400'
                  }`}
                >
                  <div className="font-bold">Replace / Overwrite</div>
                  <div className="text-[10px] opacity-75 mt-0.5">Overwrites existing catalog items with file details</div>
                </button>

                <button
                  type="button"
                  onClick={() => setImportDuplicateStrategy('skip')}
                  className={`p-2 rounded-lg text-left border transition cursor-pointer ${
                    importDuplicateStrategy === 'skip'
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-500 text-emerald-900 dark:text-emerald-300 font-bold shadow-xs'
                      : 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400'
                  }`}
                >
                  <div className="font-bold">Skip Duplicates</div>
                  <div className="text-[10px] opacity-75 mt-0.5">Keeps existing catalog items and skips duplicates in file</div>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto border border-stone-200 dark:border-stone-800 rounded-xl mb-4 text-xs">
              <table className="w-full text-left">
                <thead className="bg-stone-100 dark:bg-stone-800/80 font-bold sticky top-0 z-10 text-[11px] uppercase tracking-wider text-stone-600 dark:text-stone-300">
                  <tr>
                    <th className="p-2.5">Product Name</th>
                    <th className="p-2.5">SKU</th>
                    <th className="p-2.5">Category</th>
                    <th className="p-2.5 text-right">Selling Price</th>
                    <th className="p-2.5 text-right">Stock</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                  {importPreviewRows.map((r, i) => (
                    <tr key={i} className="hover:bg-stone-50/70 dark:hover:bg-stone-800/40 transition">
                      <td className="p-2.5 font-medium text-stone-900 dark:text-stone-100">
                        <div>{r.name}</div>
                        {r.brand && r.brand !== 'Standard' && (
                          <span className="text-[10px] text-stone-400 font-normal">{r.brand}</span>
                        )}
                      </td>
                      <td className="p-2.5 font-mono">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-stone-900 dark:text-stone-100">{r.sku}</span>
                          {r.isAutoGeneratedSku && (
                            <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-sans font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800" title="Auto-generated unique SKU">
                              Auto SKU
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-2.5 text-stone-600 dark:text-stone-400">{r.category}</td>
                      <td className="p-2.5 text-right font-mono">
                        {r.sellingPrice === 0 ? (
                          <span className="inline-flex items-center text-[10px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 px-1.5 py-0.5 rounded" title="Price is 0 (will be edited later)">
                            0.00 (Pending)
                          </span>
                        ) : (
                          <span className="font-semibold text-stone-900 dark:text-stone-100">
                            {Number(r.sellingPrice).toFixed(2)}
                          </span>
                        )}
                      </td>
                      <td className="p-2.5 text-right font-mono">
                        {r.currentStock === 0 ? (
                          <span className="inline-flex items-center text-[10px] font-medium text-stone-500 dark:text-stone-400 bg-stone-100 dark:bg-stone-800 px-1.5 py-0.5 rounded" title="Stock quantity is 0">
                            0 ({r.unit || 'pcs'})
                          </span>
                        ) : (
                          <span className="font-medium">
                            {r.currentStock} <span className="text-[10px] text-stone-400">{r.unit || 'pcs'}</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-[11px] text-stone-400">
                Supports Excel (.xlsx, .xls) and CSV files.
              </span>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setIsImportModalOpen(false)}
                  className="px-3.5 py-2 text-xs font-semibold text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmImport}
                  disabled={importPreviewRows.length === 0}
                  className="px-4 py-2 bg-[#064e3b] hover:bg-[#043b2c] text-white rounded-xl text-xs font-bold transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Confirm & Import {importPreviewRows.length} Products</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= CAMERA SCANNER FOR CODE ASSIGNMENT ================= */}
      <CameraScannerModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onScanSuccess={(scanned) => {
          setCodeValue(scanned);
          verifyCodeAvailability(scanned);
        }}
        title="Scan Existing Product Code"
        subtitle="Aim camera at packaging barcode or manufacturer QR"
      />

      {/* ================= BATCH BARCODE / QR GENERATION MODAL ================= */}
      <ItemSelectorModal
        isOpen={isBarcodeSelectorOpen}
        onClose={() => setIsBarcodeSelectorOpen(false)}
        products={products}
        settings={settings}
        title="Select Items for Barcode & QR Code Generation"
        description="Choose stationery items from inventory to batch generate printable barcode and QR labels."
        initialSelectedProductIds={Array.from(selectedProductIds)}
        defaultCopies={4}
        defaultType="barcode"
        actionButtonText="Open in Barcode & QR Studio"
        onConfirmSelection={handleBatchBarcodeConfirmed}
        onRefreshData={onRefreshData}
      />

      {/* ================= INDIVIDUAL BARCODE & QR CODE VIEW MODAL ================= */}
      <IndividualCodeViewModal
        isOpen={isIndividualCodeModalOpen}
        onClose={() => setIsIndividualCodeModalOpen(false)}
        product={individualCodeProduct}
        initialCode={individualCodeObj}
        settings={settings}
        onSendToStudio={onNavigateToBarcodeStudio}
        onRefreshData={onRefreshData}
      />
    </div>
  );
};
