export type StaffRole = 'admin' | 'manager' | 'cashier' | 'auditor';
export type AccountStatus = 'approved' | 'pending' | 'rejected' | 'disabled';

export interface Staff {
  id: string; // employee uid
  employeeId?: string; // unique employee code, e.g. SAP-EMP-1001
  name: string; // full name
  firstName?: string;
  lastName?: string;
  username?: string; // unique handle
  email: string;
  role: StaffRole;
  pin: string; // 4-digit PIN for quick switch
  password?: string; // hashed or credentials
  active: boolean;
  approvalStatus?: AccountStatus;
  avatar?: string; // Profile picture URL / secure storage
  profilePictureUrl?: string; // alias for avatar
  phone?: string;
  gender?: string;
  dateOfBirth?: string;
  address?: string;
  city?: string;
  addressDetails?: string;
  jobTitle?: string;
  department?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  bio?: string;
  displayName?: string;
  createdAt?: string;
  updatedAt?: string;
  approvedAt?: string;
  approvedBy?: string;
  lastLogin?: string;
}

export type CodeType = 'barcode' | 'qr' | 'both';
export type CodeSource = 'existing' | 'generated';
export type BarcodeFormat = 'CODE128' | 'EAN13' | 'UPC' | 'CODE39' | 'EAN8';

export interface ProductCode {
  id: string;
  code: string;
  type: CodeType;
  format?: BarcodeFormat;
  source: CodeSource;
  isPrimary: boolean;
  active: boolean;
  label?: string; // e.g. "Packaging Barcode", "Supplier QR", "Box Code"
  createdDate: string;
}

export interface LabelItem {
  id: string;
  productId?: string;
  name: string;
  sku: string;
  code: string;
  price: number;
  type: CodeType;
  copies: number;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  category: string;
  brand: string;
  sku: string;
  costPrice: number;
  sellingPrice: number;
  wholesalePrice?: number;
  currentStock: number;
  minStockThreshold: number;
  unit: string; // 'pcs', 'ream', 'pack', 'box', 'roll', 'book'
  supplier?: string;
  imageUrl?: string;
  codes: ProductCode[];
  createdDate: string;
  updatedDate: string;
}

export type StockMovementType =
  | 'STOCK_IN'
  | 'STOCK_OUT'
  | 'ADJUSTMENT'
  | 'STOCKTAKE'
  | 'RETURN'
  | 'DAMAGE'
  | 'LOST'
  | 'SALE';

export interface StockMovement {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  type: StockMovementType;
  quantityChange: number; // positive or negative
  previousStock: number;
  newStock: number;
  reason: string;
  performedBy: string; // Staff name
  date: string;
  costImpact?: number;
}

export interface CartItem {
  productId: string;
  productName: string;
  sku: string;
  unit: string;
  sellingPrice: number;
  quantity: number;
  discountType?: 'percent' | 'fixed';
  discountValue?: number; // e.g. 10% or 50 ETB
  costPrice: number;
  notes?: string;
}

export type PaymentMethod = 'cash' | 'card' | 'mobile_transfer' | 'credit';

export interface PaymentSplit {
  method: PaymentMethod;
  amount: number;
  reference?: string; // e.g. Telebirr transaction ID, CBE ref
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  company?: string;
  creditLimit: number;
  currentBalance: number; // positive means owes store
  notes?: string;
  createdDate: string;
  lastPaidDate?: string;
  lastPaidStaff?: string;
  lastPaidAmount?: number;
  isStampedPaid?: boolean;
}

export interface CreditTransaction {
  id: string;
  customerId: string;
  saleId?: string;
  type: 'CHARGE' | 'PAYMENT' | 'ADJUSTMENT';
  amount: number;
  balanceAfter: number;
  paymentMethod?: PaymentMethod;
  reference?: string;
  date: string;
  staffName: string;
  notes?: string;
  isStampPaid?: boolean;
}

export type SaleStatus = 'COMPLETED' | 'REFUNDED' | 'PARTIALLY_REFUNDED' | 'CANCELLED';

export interface Sale {
  id: string;
  receiptNumber: string;
  shiftId?: string;
  cashierId: string;
  cashierName: string;
  customerId?: string;
  customerName?: string;
  items: CartItem[];
  subtotal: number;
  cartDiscountType?: 'percent' | 'fixed';
  cartDiscountValue?: number;
  totalDiscount: number;
  taxRate: number; // e.g. 15 for 15%
  taxAmount: number;
  grandTotal: number;
  payments: PaymentSplit[];
  amountPaid: number;
  changeGiven: number;
  creditAdded: number;
  status: SaleStatus;
  refundReason?: string;
  refundedBy?: string;
  refundDate?: string;
  date: string;
  isSynced: boolean;
  notes?: string;
}

export interface HeldOrder {
  id: string;
  label: string;
  customerName?: string;
  items: CartItem[];
  cartDiscountType?: 'percent' | 'fixed';
  cartDiscountValue?: number;
  savedAt: string;
  savedBy: string;
}

export interface Shift {
  id: string;
  shiftNumber: number;
  cashierId: string;
  cashierName: string;
  openedAt: string;
  closedAt?: string;
  openingFloat: number;
  cashSales: number;
  cardSales: number;
  mobileSales: number;
  creditSales: number;
  cashAdditions: number; // float additions during shift
  cashDrops: number; // cash deposited to safe
  expenses: number; // cash spent on petty expenses
  refundsGiven: number;
  expectedCash: number;
  actualCash?: number;
  variance?: number; // actual - expected
  varianceReason?: string;
  status: 'OPEN' | 'CLOSED';
  notes?: string;
}

export interface StoreExpense {
  id: string;
  shiftId?: string;
  category: 'Supplies' | 'Printing Ink & Toner' | 'Paper Stock' | 'Maintenance' | 'Petty Cash' | 'Utilities' | 'Other';
  description: string;
  amount: number;
  paidWith: 'cash_drawer' | 'bank_transfer' | 'petty_cash';
  paidBy: string; // Staff
  receiptRef?: string;
  date: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  staffId: string;
  staffName: string;
  action: string;
  category: 'AUTH' | 'INVENTORY' | 'SALES' | 'REFUND' | 'CREDIT' | 'CODE_MANAGEMENT' | 'SHIFT' | 'SETTINGS';
  details: string;
  affectedId?: string;
  previousValue?: string;
  newValue?: string;
}

export interface StoreSettings {
  storeName: string;
  tagline: string;
  address: string;
  phone: string;
  email: string;
  taxNumber?: string;
  currency: string; // default 'ETB'
  currencySymbol: string; // default 'ETB' or 'Br'
  taxRatePercent: number; // e.g. 15 for 15% VAT, or 0
  pricesIncludeTax: boolean;
  receiptMode: 'record_only' | 'ask_each_time' | 'always_print'; // 'record_only': records sale silently without printing receipt popups
  autoPrintReceipt?: boolean; // whether to automatically trigger print dialog
  thermalReceiptWidth: '80mm' | '58mm';
  receiptFooterMessage: string;
  showBarcodeOnReceipt: boolean;
  showQROnReceipt: boolean;
  lowStockDefaultThreshold: number;
  barcodePrefix: string; // e.g. "SAP"
  themeMode: 'light' | 'dark';
  inactivityLockMinutes?: number; // e.g. 15 (0 for disabled)
}

export interface SyncQueueItem {
  id: string;
  entityType: 'sale' | 'product' | 'inventory' | 'customer' | 'shift' | 'credit' | 'expense';
  action: 'create' | 'update' | 'delete';
  payload: any;
  timestamp: string;
  retries: number;
}
