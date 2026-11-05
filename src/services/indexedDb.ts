import { Sale } from '../types';

const DB_NAME = 'sappy_pos_db';
const DB_VERSION = 1;
const SALES_STORE = 'sales';

class IndexedDbService {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private isAvailable(): boolean {
    return typeof window !== 'undefined' && 'indexedDB' in window;
  }

  async getDb(): Promise<IDBDatabase> {
    if (!this.isAvailable()) {
      throw new Error('IndexedDB is not supported in this environment');
    }

    if (this.dbPromise) {
      return this.dbPromise;
    }

    this.dbPromise = new Promise((resolve, reject) => {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(SALES_STORE)) {
          const store = db.createObjectStore(SALES_STORE, { keyPath: 'id' });
          store.createIndex('by_receipt', 'receiptNumber', { unique: false });
          store.createIndex('by_date', 'date', { unique: false });
          store.createIndex('by_sync', 'isSynced', { unique: false });
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error || new Error('Failed to open IndexedDB'));
      };
    });

    return this.dbPromise;
  }

  /**
   * Retrieve all sales stored in IndexedDB.
   */
  async getAllSales(): Promise<Sale[]> {
    if (!this.isAvailable()) return [];
    try {
      const db = await this.getDb();
      return new Promise<Sale[]>((resolve, reject) => {
        const transaction = db.transaction([SALES_STORE], 'readonly');
        const store = transaction.objectStore(SALES_STORE);
        const request = store.getAll();

        request.onsuccess = () => {
          const sales: Sale[] = (request.result || []) as Sale[];
          sales.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          resolve(sales);
        };

        request.onerror = () => {
          reject(request.error);
        };
      });
    } catch (err) {
      console.warn('IndexedDB getAllSales fallback notice:', err);
      return [];
    }
  }

  /**
   * Retrieve a specific sale by ID from IndexedDB.
   */
  async getSaleById(id: string): Promise<Sale | null> {
    if (!this.isAvailable()) return null;
    try {
      const db = await this.getDb();
      return new Promise<Sale | null>((resolve, reject) => {
        const transaction = db.transaction([SALES_STORE], 'readonly');
        const store = transaction.objectStore(SALES_STORE);
        const request = store.get(id);

        request.onsuccess = () => {
          resolve(request.result || null);
        };

        request.onerror = () => {
          reject(request.error);
        };
      });
    } catch {
      return null;
    }
  }

  /**
   * Save or update a single sale in IndexedDB.
   */
  async putSale(sale: Sale): Promise<void> {
    if (!this.isAvailable() || !sale?.id) return;
    try {
      const db = await this.getDb();
      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([SALES_STORE], 'readwrite');
        const store = transaction.objectStore(SALES_STORE);
        const request = store.put(sale);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (err) {
      console.warn('IndexedDB putSale notice:', err);
    }
  }

  /**
   * Save or update an array of sales in IndexedDB (atomic transaction).
   */
  async putSalesBatch(sales: Sale[]): Promise<void> {
    if (!this.isAvailable() || !sales || sales.length === 0) return;
    try {
      const db = await this.getDb();
      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([SALES_STORE], 'readwrite');
        const store = transaction.objectStore(SALES_STORE);

        sales.forEach((sale) => {
          if (sale && sale.id) {
            store.put(sale);
          }
        });

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    } catch (err) {
      console.warn('IndexedDB putSalesBatch notice:', err);
    }
  }

  /**
   * Remove a sale from IndexedDB.
   */
  async deleteSale(id: string): Promise<void> {
    if (!this.isAvailable()) return;
    try {
      const db = await this.getDb();
      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([SALES_STORE], 'readwrite');
        const store = transaction.objectStore(SALES_STORE);
        const request = store.delete(id);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (err) {
      console.warn('IndexedDB deleteSale notice:', err);
    }
  }

  /**
   * Clear all sales from IndexedDB.
   */
  async clearSales(): Promise<void> {
    if (!this.isAvailable()) return;
    try {
      const db = await this.getDb();
      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([SALES_STORE], 'readwrite');
        const store = transaction.objectStore(SALES_STORE);
        const request = store.clear();

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (err) {
      console.warn('IndexedDB clearSales notice:', err);
    }
  }

  /**
   * Bidirectional sync between LocalStorage and IndexedDB:
   * Merges records from both stores, ensuring IndexedDB holds all sales.
   */
  async syncLocalStorageAndIndexedDB(localSales: Sale[]): Promise<Sale[]> {
    if (!this.isAvailable()) return localSales;

    try {
      const idbSales = await this.getAllSales();
      const map = new Map<string, Sale>();

      // Load idb sales first
      idbSales.forEach((s) => {
        if (s?.id) map.set(s.id, s);
      });

      // Merge local sales
      localSales.forEach((s) => {
        if (!s?.id) return;
        const existing = map.get(s.id);
        if (!existing) {
          map.set(s.id, s);
        } else {
          // Status precedence: REFUNDED takes priority
          if (s.status === 'REFUNDED') {
            map.set(s.id, { ...existing, ...s });
          } else {
            map.set(s.id, { ...s, ...existing });
          }
        }
      });

      const merged = Array.from(map.values()).sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );

      // Write merged set back into IndexedDB
      await this.putSalesBatch(merged);

      return merged;
    } catch (err) {
      console.warn('syncLocalStorageAndIndexedDB notice:', err);
      return localSales;
    }
  }
}

export const indexedDbService = new IndexedDbService();
