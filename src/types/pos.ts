export type CodeFormat = 'EAN13' | 'CODE128' | 'UPC' | 'QR';

export interface Product {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  category: string;
  price: number;
  costPrice: number;
  stock: number;
  minStock: number;
  unit: string;
  description?: string;
  color?: string;
  isPopular?: boolean;
}

export interface CartItem {
  product: Product;
  quantity: number;
  discountType?: 'percent' | 'fixed';
  discountValue?: number;
  notes?: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  notes?: string;
  creditBalance?: number;
}

export type PaymentMethod = 'cash' | 'card' | 'split';

export interface SplitPayment {
  method: 'cash' | 'card';
  amount: number;
  reference?: string;
}

export interface HeldOrder {
  id: string;
  orderNumber: string;
  timestamp: string;
  customerName?: string;
  customerPhone?: string;
  items: CartItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  notes?: string;
}

export interface Receipt {
  receiptNumber: string;
  date: string;
  cashierName: string;
  storeName: string;
  storeAddress: string;
  storePhone: string;
  storeTaxNumber: string;
  currency: string;
  customer?: Customer | null;
  items: CartItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  payments: SplitPayment[];
  change: number;
  notes?: string;
}

export type ScreenView = 'checkout' | 'payment' | 'receipt' | 'held-orders';

export interface StoreInfo {
  name: string;
  address: string;
  phone: string;
  taxNumber: string;
  currency: string;
  taxRatePercent: number;
  cashierName: string;
}
