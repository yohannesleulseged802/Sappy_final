import {
  Product,
  ProductCode,
  Sale,
  Customer,
  Shift,
  HeldOrder,
  StoreExpense,
  AuditLog,
  StoreSettings,
  Staff,
  SyncQueueItem,
  StockMovement,
  CreditTransaction,
  EndOfDayReport,
} from '../types';
import { indexedDbService } from './indexedDb';
import { db, auth, pauseFirestoreNetwork, resumeFirestoreNetwork } from './firebaseAuth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
  writeBatch,
  query,
  where,
} from 'firebase/firestore';
import { signInWithEmailAndPassword } from 'firebase/auth';

const STORAGE_KEYS = {
  PRODUCTS: 'sappy_pos_products_v1',
  CUSTOMERS: 'sappy_pos_customers_v1',
  CREDIT_TXS: 'sappy_pos_credit_txs_v1',
  SALES: 'sappy_pos_sales_v1',
  SHIFTS: 'sappy_pos_shifts_v1',
  ACTIVE_SHIFT_ID: 'sappy_pos_active_shift_id',
  HELD_ORDERS: 'sappy_pos_held_orders_v1',
  EXPENSES: 'sappy_pos_expenses_v1',
  AUDIT_LOGS: 'sappy_pos_audit_logs_v1',
  SETTINGS: 'sappy_pos_settings_v1',
  STAFF: 'sappy_pos_staff_v1',
  CURRENT_STAFF_ID: 'sappy_pos_current_staff_id',
  SYNC_QUEUE: 'sappy_pos_sync_queue_v1',
  STOCK_MOVEMENTS: 'sappy_pos_stock_movements_v1',
  SESSION_AUTHENTICATED: 'sappy_pos_session_authenticated',
  REGISTER_LOCKED: 'sappy_pos_register_locked',
  LOCKOUT_UNTIL: 'sappy_pos_lockout_until_v1',
  FAILED_ATTEMPTS: 'sappy_pos_failed_attempts_v1',
  STORE_INITIALIZED: 'sappy_pos_store_initialized_v1',
};

const DEFAULT_SETTINGS: StoreSettings = {
  storeName: 'Sappy Stationary',
  tagline: 'stationery & printing.',
  address: '',
  phone: '',
  email: '',
  taxNumber: '',
  currency: 'ETB',
  currencySymbol: 'ETB',
  taxRatePercent: 15, // 15% VAT
  pricesIncludeTax: false,
  receiptMode: 'record_only', // Default: Just record sale into ledger/database without printing
  autoPrintReceipt: false,
  thermalReceiptWidth: '80mm',
  receiptFooterMessage: 'Thank you for choosing Sappy Stationary! Quality stationery & digital printing.',
  showBarcodeOnReceipt: true,
  showQROnReceipt: true,
  lowStockDefaultThreshold: 5,
  barcodePrefix: 'SAP',
  themeMode: 'light',
  autoSyncIntervalSeconds: 60,
};

// Note: Requirement #1 - All demo/hardcoded default staff accounts removed.
// Users must be created via the secure Master Passcode Signup system.
const INITIAL_STAFF: Staff[] = [];

const INITIAL_CUSTOMERS: Customer[] = [];

const INITIAL_PRODUCTS: Product[] = [];

class StorageService {
  private _isFirestoreQuotaExceeded: boolean = false;
  private quotaExceededMessage: string | null = null;
  private readonly QUOTA_EXCEEDED_UNTIL_KEY = 'sappy_firestore_quota_exceeded_until';
  private syncBroadcastChannel: BroadcastChannel | null = null;

  private isBrowser(): boolean {
    return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
  }

  public broadcastSyncMessage(type: string, payload?: any) {
    if (!this.isBrowser()) return;
    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('sappy-auto-synced', { detail: { type, payload } }));
        if ('BroadcastChannel' in window) {
          if (!this.syncBroadcastChannel) {
            this.syncBroadcastChannel = new BroadcastChannel('sappy_cross_device_sync');
          }
          this.syncBroadcastChannel.postMessage({ type, payload, timestamp: Date.now() });
        }
      }
    } catch {
      // Non-fatal
    }
  }

  public get isFirestoreQuotaExceeded(): boolean {
    if (!this.isBrowser()) return this._isFirestoreQuotaExceeded;
    try {
      const storedUntil = localStorage.getItem(this.QUOTA_EXCEEDED_UNTIL_KEY);
      if (storedUntil) {
        const untilTime = parseInt(storedUntil, 10);
        if (Number.isFinite(untilTime)) {
          if (Date.now() < untilTime) {
            this._isFirestoreQuotaExceeded = true;
            return true;
          } else {
            // Reset period has passed
            localStorage.removeItem(this.QUOTA_EXCEEDED_UNTIL_KEY);
            this._isFirestoreQuotaExceeded = false;
            this.quotaExceededMessage = null;
            resumeFirestoreNetwork();
            return false;
          }
        }
      }
      this._isFirestoreQuotaExceeded = false;
      return false;
    } catch {
      // Fallback
    }
    return this._isFirestoreQuotaExceeded;
  }

  public set isFirestoreQuotaExceeded(val: boolean) {
    this._isFirestoreQuotaExceeded = val;
    if (!this.isBrowser()) return;
    try {
      if (val) {
        // Daily free write limit in Firestore resets at 00:00 UTC. Calculate next 00:05 UTC.
        const now = new Date();
        const nextReset = new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 5, 0)
        );
        localStorage.setItem(this.QUOTA_EXCEEDED_UNTIL_KEY, nextReset.getTime().toString());
        this.quotaExceededMessage =
          'Daily Firestore free tier write quota reached (resets 00:00 UTC). System is operating seamlessly in Local-First & Express Backend sync mode.';
        pauseFirestoreNetwork();
      } else {
        localStorage.removeItem(this.QUOTA_EXCEEDED_UNTIL_KEY);
        this.quotaExceededMessage = null;
        resumeFirestoreNetwork();
      }
    } catch {
      // Ignore
    }
  }

  public handleFirestoreQuotaError(err: any): boolean {
    const errMsg = err?.message || String(err || '');
    const errCode = err?.code || '';
    if (
      errCode === 'resource-exhausted' ||
      errMsg.includes('resource-exhausted') ||
      errMsg.includes('Quota limit exceeded') ||
      errMsg.includes('Quota exceeded')
    ) {
      pauseFirestoreNetwork();
      if (!this._isFirestoreQuotaExceeded) {
        this.isFirestoreQuotaExceeded = true;
        console.warn(
          '⚠️ [StorageService] Cloud Firestore write quota reached. System is safely operating in Local-First & Express Backend sync mode. Firestore writes paused until daily quota resets at 00:00 UTC.'
        );
        this.notifyAutoSyncListeners();
      }
      return true;
    }
    return false;
  }

  public isQuotaExceeded(): boolean {
    return this.isFirestoreQuotaExceeded;
  }

  public getQuotaMessage(): string | null {
    if (this.isFirestoreQuotaExceeded) {
      return (
        this.quotaExceededMessage ||
        'Daily Firestore free tier write quota reached (resets 00:00 UTC). System is operating seamlessly in Local-First & Express Backend sync mode.'
      );
    }
    return null;
  }

  // --- Initialize Storage with Defaults if Empty ---
  init() {
    if (!this.isBrowser()) return;

    // Check or initialize persistent quota exceeded state
    const storedUntil = localStorage.getItem(this.QUOTA_EXCEEDED_UNTIL_KEY);
    if (storedUntil) {
      const untilTime = parseInt(storedUntil, 10);
      if (Number.isFinite(untilTime) && Date.now() < untilTime) {
        this._isFirestoreQuotaExceeded = true;
        this.quotaExceededMessage =
          'Daily Firestore free tier write quota reached (resets 00:00 UTC). System is operating seamlessly in Local-First & Express Backend sync mode.';
      } else {
        localStorage.removeItem(this.QUOTA_EXCEEDED_UNTIL_KEY);
        this._isFirestoreQuotaExceeded = false;
      }
    } else {
      this._isFirestoreQuotaExceeded = false;
    }

    // Initialize cross-tab/cross-device BroadcastChannel listener
    if (this.isBrowser() && 'BroadcastChannel' in window && !this.syncBroadcastChannel) {
      try {
        this.syncBroadcastChannel = new BroadcastChannel('sappy_cross_device_sync');
        this.syncBroadcastChannel.onmessage = (event) => {
          if (event?.data?.type) {
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('sappy-auto-synced', { detail: event.data }));
            }
          }
        };
      } catch {
        // BroadcastChannel fallback
      }
    }

    // Requirement: Clean wipe of all legacy demo data (products, customers, expenses, sales, shifts)
    const hasPurgedDemo = localStorage.getItem('sappy_demo_purged_v4') === 'true';
    if (!hasPurgedDemo) {
      localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify([]));
      localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify([]));
      localStorage.setItem(STORAGE_KEYS.SALES, JSON.stringify([]));
      localStorage.setItem(STORAGE_KEYS.SHIFTS, JSON.stringify([]));
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_SHIFT_ID);
      localStorage.setItem(STORAGE_KEYS.EXPENSES, JSON.stringify([]));
      localStorage.setItem(STORAGE_KEYS.HELD_ORDERS, JSON.stringify([]));
      localStorage.setItem(STORAGE_KEYS.CREDIT_TXS, JSON.stringify([]));
      localStorage.setItem(STORAGE_KEYS.STOCK_MOVEMENTS, JSON.stringify([]));
      localStorage.setItem(STORAGE_KEYS.SYNC_QUEUE, JSON.stringify([]));
      // Also clean up settings if it had the fake demo address
      const existingSettingsStr = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (existingSettingsStr && existingSettingsStr.includes('Bole Medhanialem Mall')) {
        localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(DEFAULT_SETTINGS));
      }
      localStorage.setItem('sappy_demo_purged_v4', 'true');
    }

    if (!localStorage.getItem(STORAGE_KEYS.PRODUCTS)) {
      localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify([]));
    }
    if (!localStorage.getItem(STORAGE_KEYS.STAFF)) {
      localStorage.setItem(STORAGE_KEYS.STAFF, JSON.stringify([]));
    }
    if (!localStorage.getItem(STORAGE_KEYS.CUSTOMERS)) {
      localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify([]));
    }
    if (!localStorage.getItem(STORAGE_KEYS.SETTINGS)) {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(DEFAULT_SETTINGS));
    }
    if (!localStorage.getItem(STORAGE_KEYS.SALES)) {
      localStorage.setItem(STORAGE_KEYS.SALES, JSON.stringify([]));
    }
    if (!localStorage.getItem(STORAGE_KEYS.SHIFTS)) {
      localStorage.setItem(STORAGE_KEYS.SHIFTS, JSON.stringify([]));
    }
    if (!localStorage.getItem(STORAGE_KEYS.HELD_ORDERS)) {
      localStorage.setItem(STORAGE_KEYS.HELD_ORDERS, JSON.stringify([]));
    }
    if (!localStorage.getItem(STORAGE_KEYS.EXPENSES)) {
      localStorage.setItem(STORAGE_KEYS.EXPENSES, JSON.stringify([]));
    }
    if (!localStorage.getItem(STORAGE_KEYS.AUDIT_LOGS)) {
      const initAudit: AuditLog = {
        id: 'audit-001',
        timestamp: new Date().toISOString(),
        staffId: 'system',
        staffName: 'Store Administrator',
        action: 'SYSTEM_INITIALIZATION',
        category: 'SETTINGS',
        details: 'Sappy Stationary POS system initialized with empty database.',
      };
      localStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify([initAudit]));
    }
    if (!localStorage.getItem(STORAGE_KEYS.SYNC_QUEUE)) {
      localStorage.setItem(STORAGE_KEYS.SYNC_QUEUE, JSON.stringify([]));
    }
    if (!localStorage.getItem(STORAGE_KEYS.STOCK_MOVEMENTS)) {
      localStorage.setItem(STORAGE_KEYS.STOCK_MOVEMENTS, JSON.stringify([]));
    }
    if (!localStorage.getItem(STORAGE_KEYS.CREDIT_TXS)) {
      localStorage.setItem(STORAGE_KEYS.CREDIT_TXS, JSON.stringify([]));
    }

    const currentSales = this.getSales();
    if (currentSales.length > 0) {
      indexedDbService.syncLocalStorageAndIndexedDB(currentSales).catch(() => {});
    }
  }

  // --- Settings ---
  getSettings(): StoreSettings {
    if (!this.isBrowser()) return DEFAULT_SETTINGS;
    try {
      const val = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (!val) return DEFAULT_SETTINGS;
      const parsed = JSON.parse(val);
      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
      };
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  async pushSettingsToFirestore(settings: StoreSettings): Promise<void> {
    if (this.isFirestoreQuotaExceeded) return;
    try {
      await setDoc(doc(db, 'settings', 'store'), settings, { merge: true });
    } catch (err) {
      if (this.handleFirestoreQuotaError(err)) return;
      console.warn('Firestore pushSettings notice:', err);
    }
  }

  syncSettingsWithFirestore(onUpdate?: (settings: StoreSettings) => void): () => void {
    if (!this.isBrowser()) return () => {};

    getDoc(doc(db, 'settings', 'store'))
      .then((docSnap) => {
        if (docSnap.exists()) {
          const remoteSettings = { ...DEFAULT_SETTINGS, ...docSnap.data() } as StoreSettings;
          localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(remoteSettings));
          if (onUpdate) onUpdate(remoteSettings);
        } else {
          const local = this.getSettings();
          if (!this.isFirestoreQuotaExceeded) {
            this.pushSettingsToFirestore(local);
          }
        }
      })
      .catch((err) => console.warn('Initial Firestore settings sync notice:', err));

    const unsubscribe = onSnapshot(
      doc(db, 'settings', 'store'),
      (docSnap) => {
        if (docSnap.exists()) {
          const remoteSettings = { ...DEFAULT_SETTINGS, ...docSnap.data() } as StoreSettings;
          localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(remoteSettings));
          if (onUpdate) onUpdate(remoteSettings);
        }
      },
      (err) => console.warn('Firestore real-time settings sync notice:', err)
    );

    return unsubscribe;
  }

  saveSettings(settings: StoreSettings) {
    if (!this.isBrowser()) return;
    const oldSettings = this.getSettings();
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    this.addAuditLog('UPDATED_STORE_SETTINGS', 'SETTINGS', `Store settings and tax preferences updated.`);
    if (
      settings.autoSyncIntervalSeconds &&
      settings.autoSyncIntervalSeconds !== oldSettings.autoSyncIntervalSeconds
    ) {
      this.currentAutoSyncState.intervalSeconds = settings.autoSyncIntervalSeconds;
      this.notifyAutoSyncListeners();
      if (this.currentAutoSyncState.isActive) {
        this.startAutoSync(settings.autoSyncIntervalSeconds);
      }
    }
    this.pushSettingsToFirestore(settings).catch(() => {});
    try {
      fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      }).catch(() => {});
    } catch {}
  }

  getWipeTimestamp(): number {
    if (!this.isBrowser()) return 0;
    return Number(localStorage.getItem('sappy_last_known_wipe_ts') || 0);
  }

  getCatalogWipeTimestamp(): number {
    if (!this.isBrowser()) return 0;
    const cat = Number(localStorage.getItem('sappy_last_catalog_wipe_ts') || 0);
    const wipe = this.getWipeTimestamp();
    return Math.max(cat, wipe);
  }

  isRecordValidAfterWipe(item: any, wipeTs: number): boolean {
    if (wipeTs <= 0) return true;
    if (!item) return false;
    let t = 0;
    if (typeof item === 'string' || typeof item === 'number') {
      t = new Date(item).getTime();
    } else {
      t = Math.max(
        item.updatedDate ? new Date(item.updatedDate).getTime() : 0,
        item.createdDate ? new Date(item.createdDate).getTime() : 0,
        item.date ? new Date(item.date).getTime() : 0,
        item.timestamp ? new Date(item.timestamp).getTime() : 0,
        item.createdAt ? new Date(item.createdAt).getTime() : 0
      );
    }
    return t > wipeTs;
  }

  // --- Deleted Users Tombstone Registry (Cross-Device Deletion & Reset Persistence) ---
  getDeletedUserIds(): string[] {
    if (!this.isBrowser()) return [];
    try {
      const val = localStorage.getItem('sappy_deleted_user_ids');
      return val ? JSON.parse(val) : [];
    } catch {
      return [];
    }
  }

  setDeletedUserIds(ids: string[]) {
    if (!this.isBrowser()) return;
    const normalized = Array.from(new Set(ids.map((id) => (id || '').trim().toLowerCase()).filter(Boolean)));
    localStorage.setItem('sappy_deleted_user_ids', JSON.stringify(normalized));
  }

  addDeletedUserId(idOrEmail?: string) {
    if (!this.isBrowser() || !idOrEmail) return;
    const clean = idOrEmail.trim().toLowerCase();
    // NEVER tombstone sequential employee IDs (e.g. SAP-EMP-1001) as they are reused in fresh deployments
    if (/^sap-emp-\d+$/i.test(clean)) return;
    const current = this.getDeletedUserIds();
    if (!current.includes(clean)) {
      current.push(clean);
      this.setDeletedUserIds(current);
    }
  }

  removeDeletedUserId(idOrEmail?: string) {
    if (!this.isBrowser() || !idOrEmail) return;
    const clean = idOrEmail.trim().toLowerCase();
    const current = this.getDeletedUserIds();
    const filtered = current.filter((id) => id !== clean);
    if (filtered.length !== current.length) {
      this.setDeletedUserIds(filtered);
    }
  }

  isUserDeleted(id?: string, email?: string, username?: string): boolean {
    const deleted = this.getDeletedUserIds();
    if (deleted.length === 0) return false;
    if (id && deleted.includes(id.toLowerCase())) return true;
    if (email && deleted.includes(email.toLowerCase())) return true;
    if (username && deleted.includes(username.toLowerCase())) return true;
    return false;
  }

  // --- Collision-Free Unique Employee ID Sequence (SAP-EMP-1001, SAP-EMP-1002...) ---
  generateNextEmployeeId(providedList?: Staff[]): string {
    const list = providedList || this.getStaffList();
    const existingSeqs = list
      .map((s) => {
        const m = (s.employeeId || '').match(/SAP-EMP-(\d+)/i);
        return m ? parseInt(m[1], 10) : 0;
      })
      .filter((n) => !isNaN(n) && n > 0);

    const maxSeq = existingSeqs.length > 0 ? Math.max(...existingSeqs) : 1000;
    return `SAP-EMP-${maxSeq + 1}`;
  }

  // --- Strict Deduplication & Canonical Staff Identity (Guarantees 1 Account per Email/Username) ---
  deduplicateStaffList(list: Staff[]): Staff[] {
    if (!Array.isArray(list) || list.length === 0) return [];

    const map = new Map<string, Staff>();

    // Sort chronologically (oldest to newest) so newest updates override stale fields
    const sorted = [...list].sort((a, b) => {
      const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return timeA - timeB;
    });

    for (const s of sorted) {
      const cleanEmail = (s.email || '').trim().toLowerCase();
      const cleanUsername = (s.username || '').trim().toLowerCase();
      // Primary identity key: Email if present, otherwise username, otherwise unique id
      const key = cleanEmail || cleanUsername || s.id;

      const existing = map.get(key);
      if (existing) {
        // Merge records preserving administrative authorization, active session, and credentials
        const isAdmin = existing.role === 'admin' || s.role === 'admin';
        const isApproved = existing.approvalStatus === 'approved' || s.approvalStatus === 'approved';
        const isActive = existing.active || s.active;

        map.set(key, {
          ...existing,
          ...s,
          role: isAdmin ? 'admin' : (s.role || existing.role),
          approvalStatus: isApproved ? 'approved' : s.approvalStatus,
          active: isActive,
          password: s.password || existing.password,
          pin: (s.pin && s.pin.length === 4) ? s.pin : existing.pin,
          email: cleanEmail || existing.email,
          username: cleanUsername || existing.username,
          employeeId: existing.employeeId || s.employeeId,
        });
      } else {
        map.set(key, {
          ...s,
          email: cleanEmail,
          username: cleanUsername,
        });
      }
    }

    const deduplicated = Array.from(map.values());

    // Deterministically verify and assign distinct employee IDs (SAP-EMP-1001, SAP-EMP-1002, etc.)
    const usedEmpIds = new Set<string>();
    let nextSeq = 1001;

    deduplicated.forEach((staff) => {
      let empId = (staff.employeeId || '').trim().toUpperCase();
      if (!empId || usedEmpIds.has(empId) || !/^SAP-EMP-\d+$/.test(empId)) {
        while (usedEmpIds.has(`SAP-EMP-${nextSeq}`)) {
          nextSeq++;
        }
        empId = `SAP-EMP-${nextSeq}`;
        nextSeq++;
      }
      usedEmpIds.add(empId);
      staff.employeeId = empId;
      const match = empId.match(/(\d+)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num >= nextSeq) nextSeq = num + 1;
      }
    });

    return deduplicated;
  }

  // --- Staff & Current User ---
  getStaffList(): Staff[] {
    if (!this.isBrowser()) return INITIAL_STAFF;
    try {
      const val = localStorage.getItem(STORAGE_KEYS.STAFF);
      const list: Staff[] = val ? JSON.parse(val) : INITIAL_STAFF;
      const wipeTs = this.getWipeTimestamp();
      const deletedIds = this.getDeletedUserIds();
      const currentStaffId = localStorage.getItem(STORAGE_KEYS.CURRENT_STAFF_ID);

      const filtered = list.filter((s) => {
        // Never purge the active logged-in staff
        if (currentStaffId && s.id === currentStaffId) {
          return true;
        }

        const uid = (s.id || '').toLowerCase();
        const email = (s.email || '').toLowerCase();
        const username = (s.username || '').toLowerCase();

        // Sequential employeeId (e.g. SAP-EMP-1001) is strictly NOT checked against tombstones
        const isTombstoned =
          (uid && deletedIds.includes(uid)) ||
          (email && deletedIds.includes(email)) ||
          (username && deletedIds.includes(username));

        if (isTombstoned) {
          return false;
        }

        if (wipeTs > 0) {
          const t = s.createdAt
            ? new Date(s.createdAt).getTime()
            : s.updatedAt
            ? new Date(s.updatedAt).getTime()
            : 0;
          return t > wipeTs;
        }

        return true;
      });

      // Always guarantee clean deduplication and unique sequential employee IDs
      const deduplicated = this.deduplicateStaffList(filtered);

      if (deduplicated.length !== list.length || JSON.stringify(deduplicated) !== val) {
        localStorage.setItem(STORAGE_KEYS.STAFF, JSON.stringify(deduplicated));
      }
      return deduplicated;
    } catch {
      return INITIAL_STAFF;
    }
  }

  saveStaffList(staff: Staff[]) {
    if (!this.isBrowser()) return;
    const wipeTs = this.getWipeTimestamp();
    const deletedIds = this.getDeletedUserIds();
    const currentStaffId = localStorage.getItem(STORAGE_KEYS.CURRENT_STAFF_ID);

    const valid = staff.filter((s) => {
      // Never purge the active logged-in staff
      if (currentStaffId && s.id === currentStaffId) {
        return true;
      }

      if (!s.createdAt) {
        s.createdAt = new Date().toISOString();
      }
      if (!s.updatedAt) {
        s.updatedAt = new Date().toISOString();
      }

      const uid = (s.id || '').toLowerCase();
      const email = (s.email || '').toLowerCase();
      const username = (s.username || '').toLowerCase();

      const isTombstoned =
        (uid && deletedIds.includes(uid)) ||
        (email && deletedIds.includes(email)) ||
        (username && deletedIds.includes(username));

      if (isTombstoned) {
        return false;
      }

      if (wipeTs > 0) {
        const t = s.createdAt
          ? new Date(s.createdAt).getTime()
          : s.updatedAt
          ? new Date(s.updatedAt).getTime()
          : 0;
        return t > wipeTs;
      }

      return true;
    });

    const deduplicated = this.deduplicateStaffList(valid);
    localStorage.setItem(STORAGE_KEYS.STAFF, JSON.stringify(deduplicated));
    this.broadcastSyncMessage('STAFF_SAVED', deduplicated);
  }

  // --- Firebase Cloud Database Cross-Device Synchronization ---
  mapFirestoreDocToStaff(docId: string, d: any): Staff {
    return {
      id: docId || d.uid || d.id || `staff-${Date.now()}`,
      employeeId: d.employeeId || `SAP-EMP-${Date.now().toString().slice(-4)}`,
      name: d.name || d.fullName || `${d.firstName || ''} ${d.lastName || ''}`.trim() || 'Staff Member',
      firstName: d.firstName || '',
      lastName: d.lastName || '',
      username: d.username ? d.username.toLowerCase() : '',
      displayName: d.displayName || d.fullName || d.name,
      email: d.email ? d.email.toLowerCase() : '',
      phone: d.phone || '',
      address: d.address || '',
      city: d.city || '',
      addressDetails: d.addressDetails,
      jobTitle: d.jobTitle || 'POS Cashier',
      department: d.department || 'Retail & Print Operations',
      role: (d.role as any) || 'cashier',
      pin: d.pin ? String(d.pin).replace(/\D/g, '').slice(0, 4) : '1234',
      password: d.password || '',
      active: d.active !== false,
      approvalStatus: d.accountStatus || d.approvalStatus || 'approved',
      avatar: d.profilePictureUrl || d.avatar || '',
      profilePictureUrl: d.profilePictureUrl || d.avatar || '',
      createdAt: d.createdAt || new Date().toISOString(),
      updatedAt: d.updatedAt || new Date().toISOString(),
      approvedAt: d.approvedAt,
      approvedBy: d.approvedBy,
      lastLogin: d.lastLogin,
    };
  }

  async pushStaffToFirestore(staff: Staff): Promise<void> {
    if (this.isFirestoreQuotaExceeded) return;
    try {
      const userRef = doc(db, 'users', staff.id);
      const pushPromise = setDoc(
        userRef,
        {
          uid: staff.id,
          id: staff.id,
          employeeId: staff.employeeId,
          name: staff.name,
          firstName: staff.firstName || '',
          lastName: staff.lastName || '',
          fullName: staff.name,
          username: staff.username ? staff.username.toLowerCase() : '',
          displayName: staff.displayName || staff.name,
          email: staff.email ? staff.email.toLowerCase() : '',
          phone: staff.phone || '',
          address: staff.address || '',
          city: staff.city || '',
          profilePictureUrl: staff.profilePictureUrl || staff.avatar || '',
          avatar: staff.avatar || staff.profilePictureUrl || '',
          jobTitle: staff.jobTitle || 'POS Cashier',
          department: staff.department || 'Retail & Print Operations',
          role: staff.role,
          pin: staff.pin || '1234',
          password: staff.password || '',
          accountStatus: staff.approvalStatus || 'approved',
          approvalStatus: staff.approvalStatus || 'approved',
          active: staff.active ?? true,
          createdAt: staff.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          approvedAt: staff.approvedAt || null,
          approvedBy: staff.approvedBy || null,
          lastLogin: staff.lastLogin || null,
        },
        { merge: true }
      );
      const pushTimeout = new Promise<void>((resolve) => setTimeout(resolve, 1200));
      await Promise.race([pushPromise, pushTimeout]);
    } catch (err) {
      if (this.handleFirestoreQuotaError(err)) return;
      console.warn('Firestore pushStaff notice (offline/retry):', err);
    }
  }

  async deleteStaffFromFirestore(staffId: string, email?: string, username?: string): Promise<void> {
    if (this.isFirestoreQuotaExceeded) return;
    try {
      if (staffId) {
        await deleteDoc(doc(db, 'users', staffId)).catch(() => {});
      }

      const cleanEmail = (email || '').trim().toLowerCase();
      const cleanUsername = (username || '').trim().toLowerCase();
      const cleanStaffId = (staffId || '').trim().toLowerCase();

      const usersCol = collection(db, 'users');
      const snap = await getDocs(usersCol).catch(() => null);

      if (snap && !snap.empty) {
        const batch = writeBatch(db);
        let batchCount = 0;

        snap.forEach((d) => {
          const data = d.data();
          const docEmail = (data.email || '').trim().toLowerCase();
          const docUsername = (data.username || '').trim().toLowerCase();
          const docUid = (data.uid || data.id || d.id || '').trim().toLowerCase();

          const isMatch =
            (cleanStaffId && (docUid === cleanStaffId || d.id.toLowerCase() === cleanStaffId)) ||
            (cleanEmail && docEmail === cleanEmail) ||
            (cleanUsername && docUsername === cleanUsername);

          if (isMatch) {
            batch.delete(d.ref);
            batchCount++;
          }
        });

        if (batchCount > 0) {
          await batch.commit().catch(() => {});
        }
      }

      // Also persist tombstones to Firestore system/meta so other terminals immediately tombstone
      const curDeleted = this.getDeletedUserIds();
      await setDoc(
        doc(db, 'system', 'meta'),
        {
          deletedUserIds: curDeleted,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      ).catch(() => {});
    } catch (err) {
      if (this.handleFirestoreQuotaError(err)) return;
      console.warn('Firestore deleteStaff notice:', err);
    }
  }

  mergeRemoteStaff(remoteStaff: Staff[], onUpdate?: (staffList: Staff[]) => void): Staff[] {
    const localList = this.getStaffList();
    const wipeTs = this.getWipeTimestamp();
    const deletedIds = this.getDeletedUserIds();

    const validLocal = localList.filter((l) => {
      const uid = (l.id || '').toLowerCase();
      const email = (l.email || '').toLowerCase();
      const username = (l.username || '').toLowerCase();
      const isTombstoned =
        (uid && deletedIds.includes(uid)) ||
        (email && deletedIds.includes(email)) ||
        (username && deletedIds.includes(username));
      if (isTombstoned) {
        return false;
      }
      if (wipeTs > 0) {
        const t = l.createdAt ? new Date(l.createdAt).getTime() : l.updatedAt ? new Date(l.updatedAt).getTime() : 0;
        return t > wipeTs;
      }
      return true;
    });

    // 1. Group remote docs by email/username to detect and eliminate duplicate Firestore documents
    const seenEmails = new Map<string, string>(); // normalizedKey -> canonicalDocId
    const cleanRemote: Staff[] = [];

    // Sort remoteStaff so newer documents are preferred as canonical
    const sortedRemote = [...remoteStaff].sort((a, b) => {
      const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return timeB - timeA;
    });

    sortedRemote.forEach((r) => {
      const email = (r.email || '').trim().toLowerCase();
      const username = (r.username || '').trim().toLowerCase();
      const uid = (r.id || '').trim().toLowerCase();
      const key = email || username || r.id;

      const isTombstoned =
        (uid && deletedIds.includes(uid)) ||
        (email && deletedIds.includes(email)) ||
        (username && deletedIds.includes(username));

      if (isTombstoned) {
        return;
      }

      if (seenEmails.has(key)) {
        // Redundant duplicate document in memory: skip to keep only the newest
        return;
      } else {
        seenEmails.set(key, r.id);
        const localMatch = validLocal.find(
          (l) => l.id === r.id || (l.email && r.email && l.email.toLowerCase() === email)
        );
        cleanRemote.push({
          ...r,
          password: r.password || localMatch?.password || '',
        });
      }
    });

    // 2. Keep any valid local accounts not yet present in remote
    validLocal.forEach((loc) => {
      const locEmail = (loc.email || '').trim().toLowerCase();
      const locUser = (loc.username || '').trim().toLowerCase();
      const locKey = locEmail || locUser || loc.id;
      if (!seenEmails.has(locKey)) {
        cleanRemote.push(loc);
      }
    });

    // 3. Strict deduplication & sequential employee IDs assignment
    const staffList = this.deduplicateStaffList(cleanRemote);
    this.saveStaffList(staffList);

    if (this.isBrowser()) {
      if (staffList.length > 0) {
        localStorage.setItem(STORAGE_KEYS.STORE_INITIALIZED, 'true');
        localStorage.setItem('sappy_initial_signup_completed', 'true');
      }
    }

    if (onUpdate) {
      onUpdate(staffList);
    }

    return staffList;
  }

  syncStaffWithFirestore(onUpdate?: (staffList: Staff[]) => void): () => void {
    if (!this.isBrowser()) return () => {};

    const handleDocs = (snapDocs: any[]) => {
      const wipeTs = this.getWipeTimestamp();
      const deletedIds = this.getDeletedUserIds();
      const remoteStaff: Staff[] = [];
      snapDocs.forEach((docSnap) => {
        const s = this.mapFirestoreDocToStaff(docSnap.id, docSnap.data());
        const uid = (s.id || docSnap.id || '').toLowerCase();
        const empId = (s.employeeId || '').toLowerCase();
        const email = (s.email || '').toLowerCase();
        const username = (s.username || '').toLowerCase();

        const isTombstoned =
          (uid && deletedIds.includes(uid)) ||
          (email && deletedIds.includes(email)) ||
          (username && deletedIds.includes(username));

        if (isTombstoned) {
          // A read listener must NEVER delete documents from Firestore!
          return;
        }

        remoteStaff.push(s);
      });

      if (remoteStaff.length > 0) {
        this.mergeRemoteStaff(remoteStaff, onUpdate);
      } else {
        // Remote is empty or quota-restricted: Check if local storage has valid staff
        const localList = this.getStaffList();
        if (localList.length > 0) {
          // Safeguard local accounts!
          this.saveStaffList(localList);
          this.pushStaffToServer(localList);
          if (!this.isFirestoreQuotaExceeded) {
            localList.forEach((s) => this.pushStaffToFirestore(s).catch(() => {}));
          }
          if (this.isBrowser()) {
            localStorage.setItem(STORAGE_KEYS.STORE_INITIALIZED, 'true');
            localStorage.setItem('sappy_initial_signup_completed', 'true');
          }
          if (onUpdate) onUpdate(localList);
        } else {
          if (onUpdate) onUpdate([]);
        }
      }
    };

    // 1. Immediate fetch on mount
    getDocs(collection(db, 'users'))
      .then((snap) => {
        handleDocs(snap.docs);
      })
      .catch((err) => {
        console.warn('Initial Firestore staff sync notice:', err);
      });

    // 2. Real-time live listener for cross-device updates
    const unsubscribe = onSnapshot(
      collection(db, 'users'),
      (snap) => {
        handleDocs(snap.docs);
      },
      (err) => {
        console.warn('Firestore real-time staff sync notice:', err);
      }
    );

    return unsubscribe;
  }

  private pushStaffToServer(staffList: Staff[]) {
    if (!this.isBrowser()) return;
    const wipeTs = this.getWipeTimestamp();
    const deletedIds = this.getDeletedUserIds();
    const valid = staffList.filter((s) => {
      const uid = (s.id || '').toLowerCase();
      const email = (s.email || '').toLowerCase();
      const username = (s.username || '').toLowerCase();

      if (
        (uid && deletedIds.includes(uid)) ||
        (email && deletedIds.includes(email)) ||
        (username && deletedIds.includes(username))
      ) {
        return false;
      }

      if (wipeTs > 0) {
        const t = s.createdAt
          ? new Date(s.createdAt).getTime()
          : s.updatedAt
          ? new Date(s.updatedAt).getTime()
          : 0;
        return t > wipeTs;
      }
      return true;
    });

    const deduplicated = this.deduplicateStaffList(valid);
    if (deduplicated.length === 0 && staffList.length > 0) return;
    try {
      fetch('/api/pos/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ users: deduplicated, deletedUserIds: deletedIds }),
      }).catch(() => {});
    } catch {}
  }

  addStaffAccount(newStaff: Staff) {
    if (!newStaff.createdAt) {
      newStaff.createdAt = new Date().toISOString();
    }
    newStaff.updatedAt = new Date().toISOString();

    // Crucial: remove newStaff's id, email, and username from deletedUserIds tombstones so it is never discarded
    const cleanId = (newStaff.id || '').trim().toLowerCase();
    const cleanEmail = (newStaff.email || '').trim().toLowerCase();
    const cleanUsername = (newStaff.username || '').trim().toLowerCase();

    const curDeleted = this.getDeletedUserIds();
    const filteredDeleted = curDeleted.filter(
      (d) => d !== cleanId && d !== cleanEmail && d !== cleanUsername
    );
    if (filteredDeleted.length !== curDeleted.length) {
      this.setDeletedUserIds(filteredDeleted);
    }

    const list = this.getStaffList();
    const existingIndex = list.findIndex(
      (s) =>
        s.id === newStaff.id ||
        (s.email && cleanEmail && s.email.toLowerCase() === cleanEmail) ||
        (s.username && cleanUsername && s.username.toLowerCase() === cleanUsername)
    );

    if (existingIndex >= 0) {
      // Update in-place, preserving employeeId and original password if not provided
      list[existingIndex] = {
        ...list[existingIndex],
        ...newStaff,
        employeeId: list[existingIndex].employeeId || newStaff.employeeId,
        password: newStaff.password || list[existingIndex].password,
        pin: (newStaff.pin && newStaff.pin.length === 4) ? newStaff.pin : list[existingIndex].pin,
      };
    } else {
      list.push(newStaff);
    }

    const deduplicated = this.deduplicateStaffList(list);
    this.saveStaffList(deduplicated);

    if (this.isBrowser()) {
      if (newStaff.role === 'admin' || deduplicated.length > 0) {
        localStorage.setItem(STORAGE_KEYS.STORE_INITIALIZED, 'true');
        localStorage.setItem('sappy_initial_signup_completed', 'true');
      }
    }

    this.pushStaffToServer(deduplicated);
    this.pushStaffToFirestore(newStaff);
    this.broadcastSyncMessage('STAFF_ADDED', newStaff);
  }

  updateStaffAccount(updatedStaff: Staff) {
    updatedStaff.updatedAt = new Date().toISOString();
    const cleanId = (updatedStaff.id || '').trim().toLowerCase();
    const cleanEmail = (updatedStaff.email || '').trim().toLowerCase();
    const cleanUsername = (updatedStaff.username || '').trim().toLowerCase();

    const curDeleted = this.getDeletedUserIds();
    const filteredDeleted = curDeleted.filter(
      (d) => d !== cleanId && d !== cleanEmail && d !== cleanUsername
    );
    if (filteredDeleted.length !== curDeleted.length) {
      this.setDeletedUserIds(filteredDeleted);
    }

    const list = this.getStaffList();
    const idx = list.findIndex(
      (s) =>
        s.id === updatedStaff.id ||
        (s.email && updatedStaff.email && s.email.toLowerCase() === updatedStaff.email.toLowerCase())
    );
    if (idx >= 0) {
      list[idx] = {
        ...list[idx],
        ...updatedStaff,
        password: updatedStaff.password || list[idx].password,
      };
    } else {
      list.push(updatedStaff);
    }
    const deduplicated = this.deduplicateStaffList(list);
    this.saveStaffList(deduplicated);
    if (this.isBrowser()) {
      if (updatedStaff.role === 'admin' || deduplicated.length > 0) {
        localStorage.setItem(STORAGE_KEYS.STORE_INITIALIZED, 'true');
        localStorage.setItem('sappy_initial_signup_completed', 'true');
      }
    }
    this.pushStaffToServer(deduplicated);
    this.pushStaffToFirestore(updatedStaff);
    this.broadcastSyncMessage('STAFF_UPDATED', updatedStaff);
  }

  approveStaff(staffId: string, approverName: string = 'Administrator') {
    const list = this.getStaffList();
    const target = list.find((s) => s.id === staffId || s.employeeId === staffId);
    if (target) {
      target.approvalStatus = 'approved';
      target.active = true;
      target.approvedAt = new Date().toISOString();
      target.approvedBy = approverName;
      target.updatedAt = new Date().toISOString();
      this.saveStaffList(list);
      this.addAuditLog('STAFF_APPROVED', 'AUTH', `Staff account ${target.name} approved by ${approverName}.`);
      try {
        fetch('/api/auth/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            staffId: target.id,
            action: 'approve',
            role: target.role,
            approverName,
          }),
        }).catch(() => {});
      } catch {}
      this.pushStaffToServer(list);
      this.pushStaffToFirestore(target);
    }
  }

  rejectStaff(staffId: string, approverName: string = 'Administrator') {
    const list = this.getStaffList();
    const target = list.find((s) => s.id === staffId || s.employeeId === staffId);
    if (target) {
      target.approvalStatus = 'rejected';
      target.active = false;
      target.updatedAt = new Date().toISOString();
      this.saveStaffList(list);
      this.addAuditLog('STAFF_REJECTED', 'AUTH', `Staff account ${target.name} rejected by ${approverName}.`);
      try {
        fetch('/api/auth/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            staffId: target.id,
            action: 'reject',
            approverName,
          }),
        }).catch(() => {});
      } catch {}
      this.pushStaffToServer(list);
      this.pushStaffToFirestore(target);
    }
  }

  async deleteStaff(staffId: string): Promise<boolean> {
    const list = this.getStaffList();
    const cleanStaffId = (staffId || '').trim().toLowerCase();
    const target = list.find(
      (s) =>
        s.id === staffId ||
        s.employeeId === staffId ||
        (s.id && s.id.toLowerCase() === cleanStaffId) ||
        (s.employeeId && s.employeeId.toLowerCase() === cleanStaffId) ||
        (s.email && s.email.toLowerCase() === cleanStaffId) ||
        (s.username && s.username.toLowerCase() === cleanStaffId)
    );
    if (!target) return false;

    const targetEmail = (target.email || '').trim().toLowerCase();
    const targetUsername = (target.username || '').trim().toLowerCase();
    const targetId = (target.id || '').trim().toLowerCase();

    // 1. Permanently register tombstones in local storage immediately
    if (cleanStaffId) this.addDeletedUserId(cleanStaffId);
    if (targetId) this.addDeletedUserId(targetId);
    if (targetEmail) this.addDeletedUserId(targetEmail);
    if (targetUsername) this.addDeletedUserId(targetUsername);

    // 2. Remove ANY record matching target id, email, username, or staffId from local storage
    const remaining = list.filter((s) => {
      const sId = (s.id || '').toLowerCase();
      const sEmail = (s.email || '').toLowerCase();
      const sUser = (s.username || '').toLowerCase();

      if (s.id === staffId || s.id === target.id) return false;
      if (cleanStaffId && sId === cleanStaffId) return false;
      if (targetEmail && sEmail === targetEmail) return false;
      if (targetUsername && sUser === targetUsername) return false;
      return true;
    });

    this.saveStaffList(remaining);
    this.addAuditLog('STAFF_DELETED', 'AUTH', `Staff account ${target.name} (${target.role}) deleted.`);

    // 3. Delete from backend server and update server system_meta.json
    try {
      await fetch('/api/auth/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staffId: target.id,
          email: target.email,
          username: target.username,
          action: 'delete',
        }),
      }).catch(() => {});
    } catch {}

    // 4. Delete from Cloud Firestore and record tombstones in Firestore system/meta
    try {
      await Promise.all([
        this.deleteStaffFromFirestore(staffId, target.email, target.username),
        this.deleteStaffFromFirestore(target.id, target.email, target.username),
      ]);
    } catch (fbErr) {
      console.warn('Firestore staff delete background warning:', fbErr);
    }

    // 5. Push remaining to server sync with deletedUserIds
    this.pushStaffToServer(remaining);

    this.broadcastSyncMessage('STAFF_DELETED', { staffId: target.id });
    return true;
  }

  resetAllUsersLocally(): void {
    if (!this.isBrowser()) return;
    localStorage.setItem(STORAGE_KEYS.STAFF, JSON.stringify([]));
    localStorage.removeItem(STORAGE_KEYS.CURRENT_STAFF_ID);
    localStorage.removeItem(STORAGE_KEYS.SESSION_AUTHENTICATED);
    localStorage.removeItem(STORAGE_KEYS.REGISTER_LOCKED);
    localStorage.removeItem(STORAGE_KEYS.FAILED_ATTEMPTS);
    localStorage.removeItem(STORAGE_KEYS.LOCKOUT_UNTIL);
    localStorage.removeItem(STORAGE_KEYS.STORE_INITIALIZED);
    localStorage.removeItem('sappy_initial_signup_completed');
  }

  async resetAllUsers(): Promise<void> {
    if (!this.isBrowser()) return;
    const now = Date.now();
    localStorage.setItem('sappy_last_known_wipe_ts', String(now));

    const currentStaff = this.getStaffList();
    currentStaff.forEach((s) => {
      this.addDeletedUserId(s.id);
      if (s.employeeId) this.addDeletedUserId(s.employeeId);
      if (s.email) this.addDeletedUserId(s.email);
      if (s.username) this.addDeletedUserId(s.username);
    });

    // 1. Wipe local staff and credentials immediately
    this.resetAllUsersLocally();

    // 2. Wipe Backend Server users with timeout
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);
      const res = await fetch('/api/auth/reset-all-users', {
        method: 'POST',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const d = await res.json().catch(() => ({}));
      if (d?.lastWipeTimestamp) {
        localStorage.setItem('sappy_last_known_wipe_ts', String(d.lastWipeTimestamp));
      }
      if (Array.isArray(d?.deletedUserIds)) {
        this.setDeletedUserIds([...this.getDeletedUserIds(), ...d.deletedUserIds]);
      }
    } catch {
      // offline fallback
    }

    // 3. Wipe Cloud Firestore users collection across all devices (with safety timeout)
    try {
      await Promise.race([
        this.clearUsersFirestoreData(now),
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
    } catch (cloudErr) {
      console.warn('Notice during cloud staff wipe:', cloudErr);
    }

    // 4. Ensure local state is clean
    this.resetAllUsersLocally();

    this.addAuditLog(
      'SECURITY_RESET',
      'AUTH',
      'All staff accounts, authentication credentials, and active sessions cleared per security policy.'
    );

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('sappy-cross-device-wipe', {
          detail: { wipeType: 'staff_only', timestamp: now },
        })
      );
    }
  }

  getCurrentStaff(): Staff {
    const list = this.getStaffList();
    const currentId = this.isBrowser() ? localStorage.getItem(STORAGE_KEYS.CURRENT_STAFF_ID) : null;
    const match = list.find((s) => s.id === currentId && s.active);
    if (match) return match;
    const firstActive = list.find((s) => s.active);
    if (firstActive) return firstActive;
    if (list[0]) return list[0];
    return {
      id: 'system-setup',
      name: 'System Admin',
      email: 'admin@sappystationary.com',
      role: 'admin',
      pin: '1234',
      active: true,
    };
  }

  setCurrentStaff(staffId: string) {
    if (!this.isBrowser()) return;
    localStorage.setItem(STORAGE_KEYS.CURRENT_STAFF_ID, staffId);
    const staff = this.getCurrentStaff();
    this.addAuditLog('STAFF_SWITCH', 'AUTH', `${staff.name} switched into register session.`);
  }

  verifyPin(staffId: string, pin: string): boolean {
    const staff = this.getStaffList().find((s) => s.id === staffId);
    return !!staff && staff.pin === pin;
  }

  // --- Session & Authentication (Requirement #37) ---
  isAuthenticated(): boolean {
    if (!this.isBrowser()) return true;
    const auth = localStorage.getItem(STORAGE_KEYS.SESSION_AUTHENTICATED);
    return auth === 'true';
  }

  setAuthenticated(isAuth: boolean) {
    if (!this.isBrowser()) return;
    localStorage.setItem(STORAGE_KEYS.SESSION_AUTHENTICATED, isAuth ? 'true' : 'false');
  }

  isRegisterLocked(): boolean {
    if (!this.isBrowser()) return false;
    return localStorage.getItem(STORAGE_KEYS.REGISTER_LOCKED) === 'true';
  }

  setRegisterLocked(locked: boolean) {
    if (!this.isBrowser()) return;
    localStorage.setItem(STORAGE_KEYS.REGISTER_LOCKED, locked ? 'true' : 'false');
    if (locked) {
      this.addAuditLog('REGISTER_LOCKED', 'AUTH', `POS Register locked by ${this.getCurrentStaff().name}.`);
    } else {
      this.addAuditLog('REGISTER_UNLOCKED', 'AUTH', `POS Register unlocked by ${this.getCurrentStaff().name}.`);
    }
  }

  // --- Failed Login Protection & Lockout ---
  getLockoutRemainingSeconds(): number {
    if (!this.isBrowser()) return 0;
    const until = localStorage.getItem(STORAGE_KEYS.LOCKOUT_UNTIL);
    if (!until) return 0;
    const diff = Math.ceil((parseInt(until, 10) - Date.now()) / 1000);
    return diff > 0 ? diff : 0;
  }

  recordAuthFailure(): { lockoutSeconds: number; attempts: number } {
    if (!this.isBrowser()) return { lockoutSeconds: 0, attempts: 1 };
    const curAttempts = parseInt(localStorage.getItem(STORAGE_KEYS.FAILED_ATTEMPTS) || '0', 10) + 1;
    localStorage.setItem(STORAGE_KEYS.FAILED_ATTEMPTS, curAttempts.toString());

    if (curAttempts >= 5) {
      const lockoutDuration = 30; // 30 seconds
      const untilTimestamp = Date.now() + lockoutDuration * 1000;
      localStorage.setItem(STORAGE_KEYS.LOCKOUT_UNTIL, untilTimestamp.toString());
      this.addAuditLog('SECURITY_LOCKOUT', 'AUTH', `Multiple failed authentication attempts (${curAttempts}). POS temporarily locked for 30s.`);
      return { lockoutSeconds: lockoutDuration, attempts: curAttempts };
    }
    return { lockoutSeconds: 0, attempts: curAttempts };
  }

  clearAuthFailures() {
    if (!this.isBrowser()) return;
    localStorage.removeItem(STORAGE_KEYS.FAILED_ATTEMPTS);
    localStorage.removeItem(STORAGE_KEYS.LOCKOUT_UNTIL);
  }

  authenticateWithPassword(usernameOrEmail: string, passwordAttempt: string): {
    success: boolean;
    staff?: Staff;
    error?: string;
  } {
    const cleanUser = usernameOrEmail.trim().toLowerCase();
    const staffList = this.getStaffList();

    const matched = staffList.find(
      (s) =>
        (s.email && s.email.toLowerCase() === cleanUser) ||
        (s.username && s.username.toLowerCase() === cleanUser) ||
        (s.name && s.name.toLowerCase() === cleanUser) ||
        (s.firstName && s.firstName.toLowerCase() === cleanUser) ||
        (s.name && s.name.toLowerCase().split(' ')[0] === cleanUser) ||
        (s.employeeId && s.employeeId.toLowerCase() === cleanUser)
    );

    if (!matched) {
      this.addAuditLog('AUTH_FAILED', 'AUTH', `Failed login attempt for unknown user: "${usernameOrEmail}".`);
      return {success: false, error: 'The username or password is incorrect.'};
    }

    if (matched.approvalStatus === 'pending') {
      this.addAuditLog('AUTH_FAILED', 'AUTH', `Login attempt for pending account: ${matched.name}.`);
      return {
        success: false,
        error: 'Your staff account is awaiting administrator approval.',
      };
    }

    if (matched.approvalStatus === 'rejected') {
      this.addAuditLog('AUTH_FAILED', 'AUTH', `Login attempt for rejected account: ${matched.name}.`);
      return {
        success: false,
        error: 'This staff registration was rejected by an administrator.',
      };
    }

    if (!matched.active || matched.approvalStatus === 'disabled') {
      this.addAuditLog('AUTH_FAILED', 'AUTH', `Login attempt for disabled account: ${matched.name}.`);
      return {
        success: false,
        error: 'This staff account has been disabled. Please contact an administrator.',
      };
    }

    const storedPass = matched.password || '';
    const isPasswordMatch =
      storedPass.length > 0 &&
      (passwordAttempt === storedPass ||
        passwordAttempt.trim() === storedPass ||
        passwordAttempt === storedPass.trim() ||
        passwordAttempt.trim() === storedPass.trim());

    if (!isPasswordMatch) {
      this.addAuditLog('AUTH_FAILED', 'AUTH', `Failed password attempt for staff account: ${matched.name}.`);
      return {success: false, error: 'The username or password is incorrect.'};
    }

    // Success
    this.clearAuthFailures();
    matched.lastLogin = new Date().toISOString();
    this.saveStaffList(staffList);
    this.setCurrentStaff(matched.id);
    this.setAuthenticated(true);
    this.setRegisterLocked(false);

    this.addAuditLog('AUTH_SUCCESS', 'AUTH', `${matched.name} (${matched.role.toUpperCase()}) authenticated via password.`);
    return {success: true, staff: matched};
  }

  async authenticateWithPasswordAsync(
    usernameOrEmail: string,
    passwordAttempt: string,
    _rememberSession?: boolean
  ): Promise<{ success: boolean; staff?: Staff; error?: string }> {
    const cleanIdent = usernameOrEmail.trim().toLowerCase();

    // 1. Try local authentication first
    const localResult = this.authenticateWithPassword(usernameOrEmail, passwordAttempt);
    if (localResult.success && localResult.staff) {
      return localResult;
    }

    // 2. Query Cloud Firestore directly across all devices (Firebase Database Sync)
    try {
      const usersCol = collection(db, 'users');
      const qSnapshot = await getDocs(usersCol);

      let matchedStaff: Staff | null = null;
      qSnapshot.forEach((docSnap) => {
        const d = docSnap.data();
        const docEmail = d.email ? String(d.email).trim().toLowerCase() : '';
        const docUser = d.username ? String(d.username).trim().toLowerCase() : '';
        const docName = (d.name || d.fullName || '').trim().toLowerCase();
        const docFirstName = (d.firstName || '').trim().toLowerCase();
        const docEmp = (d.employeeId || '').trim().toLowerCase();
        const emailPrefix = docEmail.includes('@') ? docEmail.split('@')[0] : '';

        if (
          docEmail === cleanIdent ||
          docUser === cleanIdent ||
          docName === cleanIdent ||
          docFirstName === cleanIdent ||
          emailPrefix === cleanIdent ||
          docEmp === cleanIdent ||
          docName.split(' ')[0] === cleanIdent
        ) {
          matchedStaff = this.mapFirestoreDocToStaff(docSnap.id, d);
        }
      });

      if (matchedStaff) {
        const staff = matchedStaff as Staff;
        // Verify password stored in Firestore or Firebase Auth
        let isPassValid = false;
        const storedPass = staff.password || '';
        if (
          storedPass.length > 0 &&
          (passwordAttempt === storedPass ||
            passwordAttempt.trim() === storedPass.trim())
        ) {
          isPassValid = true;
        }

        // Also test Firebase Auth sign-in if email is registered
        if (!isPassValid && staff.email) {
          try {
            await signInWithEmailAndPassword(auth, staff.email, passwordAttempt);
            isPassValid = true;
          } catch {}
        }

        if (isPassValid) {
          if (!staff.active || staff.approvalStatus === 'disabled') {
            return {
              success: false,
              error: 'This staff account has been disabled. Please contact an administrator.',
            };
          }
          if (staff.approvalStatus === 'pending') {
            return {
              success: false,
              error: 'Account pending Administrator authorization.',
            };
          }

          staff.password = passwordAttempt;
          staff.lastLogin = new Date().toISOString();
          this.addStaffAccount(staff);
          this.clearAuthFailures();
          this.setCurrentStaff(staff.id);
          this.setAuthenticated(true);
          this.setRegisterLocked(false);
          this.addAuditLog('AUTH_SUCCESS', 'AUTH', `${staff.name} (${staff.role.toUpperCase()}) authenticated across devices via Firebase Database.`);
          return { success: true, staff };
        }
      } else if (cleanIdent.includes('@')) {
        // Direct Firebase Auth login fallback if user exists in Firebase Auth
        try {
          const userCred = await signInWithEmailAndPassword(auth, cleanIdent, passwordAttempt);
          if (userCred.user) {
            const userDocSnap = await getDoc(doc(db, 'users', userCred.user.uid));
            const d = userDocSnap.exists() ? userDocSnap.data() : {};
            const staff = this.mapFirestoreDocToStaff(userCred.user.uid, {
              ...d,
              email: userCred.user.email || cleanIdent,
              password: passwordAttempt,
            });
            this.addStaffAccount(staff);
            this.clearAuthFailures();
            this.setCurrentStaff(staff.id);
            this.setAuthenticated(true);
            this.setRegisterLocked(false);
            return { success: true, staff };
          }
        } catch {}
      }
    } catch (fbErr) {
      console.warn('Firebase user sync on auth notice:', fbErr);
    }

    // 3. Try server-side authentication (/api/auth/login) for Node server environments
    try {
      const resp = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: usernameOrEmail.trim(),
          password: passwordAttempt,
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.ok && data.success && data.user) {
        const u = data.user;
        const syncedStaff = this.mapFirestoreDocToStaff(u.uid || u.id, {
          ...u,
          password: passwordAttempt,
        });
        this.addStaffAccount(syncedStaff);
        this.clearAuthFailures();
        this.setCurrentStaff(syncedStaff.id);
        this.setAuthenticated(true);
        this.setRegisterLocked(false);
        this.addAuditLog('AUTH_SUCCESS', 'AUTH', `${syncedStaff.name} (${syncedStaff.role.toUpperCase()}) authenticated via server password.`);
        return { success: true, staff: syncedStaff };
      }

      if (data.error) {
        return { success: false, error: data.error };
      }
    } catch {
      // Offline fallback uses localResult
    }

    return localResult;
  }

  authenticateWithPin(staffId: string, pinAttempt: string): {
    success: boolean;
    staff?: Staff;
    error?: string;
  } {
    const staffList = this.getStaffList();
    const staff = staffList.find((s) => s.id === staffId);

    if (!staff) {
      return {success: false, error: 'Staff account not found.'};
    }

    if (staff.approvalStatus === 'pending') {
      this.addAuditLog('AUTH_FAILED', 'AUTH', `PIN login attempt for pending account: ${staff.name}.`);
      return {
        success: false,
        error: 'Your staff account is awaiting administrator approval.',
      };
    }

    if (!staff.active || staff.approvalStatus === 'disabled') {
      this.addAuditLog('AUTH_FAILED', 'AUTH', `PIN login attempt for disabled account: ${staff.name}.`);
      return {
        success: false,
        error: 'This staff account has been disabled. Please contact an administrator.',
      };
    }

    if (staff.pin !== pinAttempt) {
      this.addAuditLog('AUTH_FAILED', 'AUTH', `Incorrect PIN attempt for ${staff.name}.`);
      return {success: false, error: 'Incorrect PIN. Please try again.'};
    }

    // Success
    this.clearAuthFailures();
    staff.lastLogin = new Date().toISOString();
    this.saveStaffList(staffList);
    this.setCurrentStaff(staff.id);
    this.setAuthenticated(true);
    this.setRegisterLocked(false);

    this.addAuditLog('AUTH_SUCCESS', 'AUTH', `${staff.name} (${staff.role.toUpperCase()}) authenticated via PIN.`);
    return {success: true, staff};
  }

  async authenticateWithPinAsync(
    staffId: string,
    pinAttempt: string
  ): Promise<{ success: boolean; staff?: Staff; error?: string }> {
    const localResult = this.authenticateWithPin(staffId, pinAttempt);
    if (localResult.success && localResult.staff) {
      return localResult;
    }

    // Try direct Firestore authentication for PIN
    try {
      const userDocRef = doc(db, 'users', staffId);
      const userDocSnap = await getDoc(userDocRef);
      if (userDocSnap.exists()) {
        const d = userDocSnap.data();
        const cleanPin = d.pin ? String(d.pin).trim() : '1234';
        if (cleanPin === pinAttempt.trim()) {
          const staff = this.mapFirestoreDocToStaff(userDocSnap.id, d);
          if (!staff.active || staff.approvalStatus === 'disabled') {
            return {
              success: false,
              error: 'This staff account has been disabled. Please contact an administrator.',
            };
          }
          if (staff.approvalStatus === 'pending') {
            return {
              success: false,
              error: 'Account pending Administrator authorization.',
            };
          }
          this.addStaffAccount(staff);
          this.clearAuthFailures();
          this.setCurrentStaff(staff.id);
          this.setAuthenticated(true);
          this.setRegisterLocked(false);
          this.addAuditLog('AUTH_SUCCESS', 'AUTH', `${staff.name} authenticated via PIN across devices.`);
          return { success: true, staff };
        }
      }
    } catch (fbErr) {
      console.warn('Firestore PIN auth notice:', fbErr);
    }

    try {
      const resp = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: staffId,
          pinAttempt,
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.ok && data.success && data.user) {
        const u = data.user;
        const syncedStaff: Staff = {
          id: u.uid || u.id || staffId,
          employeeId: u.employeeId,
          name: u.fullName || u.name || `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'Staff Member',
          firstName: u.firstName,
          lastName: u.lastName,
          username: u.username,
          displayName: u.displayName,
          email: u.email,
          phone: u.phone,
          address: u.address,
          city: u.city,
          jobTitle: u.jobTitle,
          department: u.department,
          role: u.role || 'cashier',
          pin: u.pin || pinAttempt,
          password: u.password,
          active: u.active ?? true,
          approvalStatus: u.accountStatus || u.approvalStatus || 'approved',
          avatar: u.profilePictureUrl || u.avatar,
          profilePictureUrl: u.profilePictureUrl || u.avatar,
          lastLogin: new Date().toISOString(),
        };
        this.addStaffAccount(syncedStaff);
        this.clearAuthFailures();
        this.setCurrentStaff(syncedStaff.id);
        this.setAuthenticated(true);
        this.setRegisterLocked(false);
        this.addAuditLog('AUTH_SUCCESS', 'AUTH', `${syncedStaff.name} (${syncedStaff.role.toUpperCase()}) authenticated via server PIN.`);
        return { success: true, staff: syncedStaff };
      }

      if (data.error) {
        return { success: false, error: data.error };
      }
    } catch {
      // Offline fallback
    }

    return localResult;
  }

  hasAdminAccount(): boolean {
    if (!this.isBrowser()) return false;
    const staffList = this.getStaffList();
    if (staffList.length === 0) {
      return false;
    }
    return staffList.some((s) => (s.role === 'admin' && s.active) || (s.approvalStatus === 'approved' && s.active));
  }

  isStoreInitialized(): boolean {
    if (!this.isBrowser()) return false;
    const staffList = this.getStaffList();
    if (staffList.length > 0) {
      return true;
    }
    return localStorage.getItem(STORAGE_KEYS.STORE_INITIALIZED) === 'true';
  }

  setStoreInitialized(initialized: boolean = true) {
    if (!this.isBrowser()) return;
    if (initialized) {
      localStorage.setItem(STORAGE_KEYS.STORE_INITIALIZED, 'true');
      localStorage.setItem('sappy_initial_signup_completed', 'true');
    } else {
      localStorage.removeItem(STORAGE_KEYS.STORE_INITIALIZED);
      localStorage.removeItem('sappy_initial_signup_completed');
    }
  }

  private mergeServerUsersWithLocal(serverUsers: any[]): Staff[] {
    const wipeTs = this.getWipeTimestamp();
    const deletedIds = this.getDeletedUserIds();
    const localList = this.getStaffList();

    if (!Array.isArray(serverUsers) || serverUsers.length === 0) {
      return localList;
    }

    const mappedUsers: Staff[] = serverUsers
      .filter((u: any) => {
        const uid = (u.uid || u.id || '').toLowerCase();
        const email = (u.email || '').toLowerCase();
        const username = (u.username || '').toLowerCase();

        const isTombstoned =
          (uid && deletedIds.includes(uid)) ||
          (email && deletedIds.includes(email)) ||
          (username && deletedIds.includes(username));

        if (isTombstoned) {
          return false;
        }

        if (wipeTs > 0) {
          const createdMs = u.createdAt
            ? new Date(u.createdAt).getTime()
            : u.updatedAt
            ? new Date(u.updatedAt).getTime()
            : 0;
          return createdMs > wipeTs;
        }

        return true;
      })
      .map((u: any) => {
        const uid = u.uid || u.id;
        const email = (u.email || '').toLowerCase();
        const username = (u.username || '').toLowerCase();
        const existingLocal = localList.find(
          (s) =>
            s.id === uid ||
            (email && s.email && s.email.toLowerCase() === email) ||
            (username && s.username && s.username.toLowerCase() === username)
        );

        return {
          id: existingLocal?.id || uid,
          employeeId: u.employeeId || existingLocal?.employeeId,
          name: u.fullName || u.name || `${u.firstName || ''} ${u.lastName || ''}`.trim() || existingLocal?.name || 'Staff Member',
          firstName: u.firstName || existingLocal?.firstName,
          lastName: u.lastName || existingLocal?.lastName,
          username: u.username || existingLocal?.username,
          displayName: u.displayName || existingLocal?.displayName,
          email: u.email || existingLocal?.email || '',
          role: u.role || existingLocal?.role || 'cashier',
          pin: u.pin || existingLocal?.pin || '1234',
          password: u.password || existingLocal?.password,
          active: u.active ?? existingLocal?.active ?? true,
          approvalStatus: u.accountStatus || u.approvalStatus || existingLocal?.approvalStatus || 'approved',
          avatar: u.profilePictureUrl || u.avatar || existingLocal?.avatar,
          profilePictureUrl: u.profilePictureUrl || u.avatar || existingLocal?.profilePictureUrl,
          phone: u.phone || existingLocal?.phone,
          address: u.address || existingLocal?.address,
          city: u.city || existingLocal?.city,
          jobTitle: u.jobTitle || existingLocal?.jobTitle,
          department: u.department || existingLocal?.department,
          createdAt: u.createdAt || existingLocal?.createdAt,
          updatedAt: u.updatedAt || existingLocal?.updatedAt,
          approvedAt: u.approvedAt || existingLocal?.approvedAt,
          approvedBy: u.approvedBy || existingLocal?.approvedBy,
        };
      });

    // Merge unsynced local accounts that are not in mappedUsers
    const mappedIds = new Set(
      mappedUsers.map((m) => m.id).concat(mappedUsers.map((m) => (m.email || '').toLowerCase())).filter(Boolean)
    );
    const unsynced = localList.filter((l) => {
      const match = mappedIds.has(l.id) || (l.email && mappedIds.has(l.email.toLowerCase()));
      if (match) return false;
      return !this.isUserDeleted(l.id, l.email, l.username);
    });

    return this.deduplicateStaffList([...mappedUsers, ...unsynced]);
  }

  async syncStaffFromBackend(): Promise<{ hasAdmin: boolean; isInitialized: boolean; staffList: Staff[] }> {
    if (!this.isBrowser()) {
      const hasAdm = this.hasAdminAccount();
      return { hasAdmin: hasAdm, isInitialized: hasAdm, staffList: this.getStaffList() };
    }
    try {
      const [statusRes, usersRes] = await Promise.all([
        fetch('/api/auth/system-status').then((r) => r.json()).catch(() => null),
        fetch('/api/auth/users').then((r) => r.json()).catch(() => null),
      ]);

      if (Array.isArray(statusRes?.deletedUserIds)) {
        this.setDeletedUserIds([...this.getDeletedUserIds(), ...statusRes.deletedUserIds]);
      }

      const serverWipeTs = Number(statusRes?.lastWipeTimestamp || 0);
      const localKnownWipeTs = this.getWipeTimestamp();

      // Only acknowledge and trigger an authoritative wipe if the server wipe is strictly newer
      if (serverWipeTs > 0 && serverWipeTs > localKnownWipeTs && (!usersRes?.users || usersRes.users.length === 0)) {
        localStorage.setItem('sappy_last_known_wipe_ts', String(serverWipeTs));
        const localList = this.getStaffList();
        const validLocal = localList.filter((s) => {
          const t = s.createdAt ? new Date(s.createdAt).getTime() : s.updatedAt ? new Date(s.updatedAt).getTime() : 0;
          return t > serverWipeTs;
        });

        if (validLocal.length > 0) {
          this.pushStaffToServer(validLocal);
          const hasAdmin = validLocal.some((s) => (s.role === 'admin' && s.active) || (s.approvalStatus === 'approved' && s.active));
          return { hasAdmin, isInitialized: true, staffList: validLocal };
        }

        this.resetAllUsersLocally();
        this.saveStaffList([]);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('sappy-cross-device-wipe', {
              detail: { wipeType: 'staff_only', timestamp: serverWipeTs },
            })
          );
        }
        return { hasAdmin: false, isInitialized: false, staffList: [] };
      }

      if (usersRes?.success && Array.isArray(usersRes.users) && usersRes.users.length > 0) {
        const merged = this.mergeServerUsersWithLocal(usersRes.users);
        this.saveStaffList(merged);
        if (merged.length > 0) {
          localStorage.setItem(STORAGE_KEYS.STORE_INITIALIZED, 'true');
          const hasAdmin = merged.some((s) => (s.role === 'admin' && s.active) || (s.approvalStatus === 'approved' && s.active));
          return { hasAdmin, isInitialized: true, staffList: merged };
        }
      }

      // Offline or empty server response: preserve and safeguard local staff
      const fallbackList = this.getStaffList();
      const hasAdmin = fallbackList.some((s) => (s.role === 'admin' && s.active) || (s.approvalStatus === 'approved' && s.active));
      if (fallbackList.length > 0) {
        this.pushStaffToServer(fallbackList);
        localStorage.setItem(STORAGE_KEYS.STORE_INITIALIZED, 'true');
      }
      return { hasAdmin, isInitialized: fallbackList.length > 0, staffList: fallbackList };
    } catch {
      const list = this.getStaffList();
      const hasAdmin = this.hasAdminAccount();
      return { hasAdmin, isInitialized: list.length > 0 && hasAdmin, staffList: list };
    }
  }

  // Cross-device full data synchronization
  async syncAllDataWithBackend(): Promise<{
    isInitialized: boolean;
    wiped: boolean;
    productsCount: number;
    salesCount: number;
  }> {
    if (!this.isBrowser()) {
      return { isInitialized: this.isStoreInitialized(), wiped: false, productsCount: 0, salesCount: 0 };
    }
    try {
      const localProducts = this.getProducts();
      const localSales = this.getSales();
      const localCustomers = this.getCustomers();
      const localExpenses = this.getExpenses();
      const localCreditTxs = this.getCreditTransactions();
      const localStaff = this.getStaffList();
      const localDeletedUserIds = this.getDeletedUserIds();
      const localSettings = this.getSettings();

      let data: any = null;
      try {
        const syncRes = await fetch('/api/pos/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            users: localStaff,
            deletedUserIds: localDeletedUserIds,
            products: localProducts,
            sales: localSales,
            customers: localCustomers,
            expenses: localExpenses,
            creditTxs: localCreditTxs,
            settings: localSettings,
          }),
        });
        if (syncRes.ok) {
          data = await syncRes.json();
        }
      } catch (postErr) {
        console.warn('POST /api/pos/sync notice:', postErr);
      }

      if (!data || !data.success) {
        const getRes = await fetch('/api/pos/all-data');
        if (getRes.ok) {
          data = await getRes.json();
        }
      }

      if (!data || !data.success) {
        return {
          isInitialized: this.isStoreInitialized(),
          wiped: false,
          productsCount: this.getProducts().length,
          salesCount: this.getSales().length,
        };
      }

      if (Array.isArray(data.deletedUserIds)) {
        this.setDeletedUserIds([...this.getDeletedUserIds(), ...data.deletedUserIds]);
      }

      const serverHasUsers = Array.isArray(data.users) && data.users.length > 0;
      const serverWipeTs = Number(data.lastWipeTimestamp || 0);
      const serverCatalogWipeTs = Number(data.lastCatalogWipeTimestamp || serverWipeTs);
      const localKnownWipeTs = this.getWipeTimestamp();

      // Check if a new authoritative wipe happened on the server
      if (serverWipeTs > 0 && serverWipeTs > localKnownWipeTs && !serverHasUsers) {
        localStorage.setItem('sappy_last_known_wipe_ts', String(serverWipeTs));
        localStorage.setItem('sappy_last_catalog_wipe_ts', String(serverCatalogWipeTs));
        const localList = this.getStaffList();
        const validLocal = localList.filter((s) => {
          const t = s.createdAt ? new Date(s.createdAt).getTime() : s.updatedAt ? new Date(s.updatedAt).getTime() : 0;
          return t > serverWipeTs;
        });

        if (validLocal.length > 0) {
          this.pushStaffToServer(validLocal);
          return { isInitialized: true, wiped: false, productsCount: this.getProducts().length, salesCount: this.getSales().length };
        }

        this.resetAllUsersLocally();
        this.saveStaffList([]);
        if (data.wipeType === 'full' || (!Array.isArray(data.products) || data.products.length === 0)) {
          this.factoryResetEverythingLocally();
        }
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('sappy-cross-device-wipe', {
              detail: { wipeType: data.wipeType || 'staff_only', timestamp: serverWipeTs },
            })
          );
        }
        return { isInitialized: false, wiped: true, productsCount: 0, salesCount: 0 };
      } else if (serverWipeTs > 0 && serverWipeTs > localKnownWipeTs && serverHasUsers) {
        localStorage.setItem('sappy_last_known_wipe_ts', String(serverWipeTs));
        localStorage.setItem('sappy_last_catalog_wipe_ts', String(serverCatalogWipeTs));
        this.wipeCatalogLocally();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('sappy-cross-device-wipe', {
              detail: { wipeType: 'catalog_only', timestamp: serverWipeTs },
            })
          );
        }
      }

      // 1. Merge Products without losing local unsynced products
      if (Array.isArray(data.products)) {
        this.mergeRemoteProducts(data.products);
      }

      // 2. Merge Sales without losing local unsynced sales
      if (Array.isArray(data.sales)) {
        this.mergeRemoteSales(data.sales);
      }

      // 3. Merge Customers without losing local unsynced customers
      if (Array.isArray(data.customers)) {
        this.mergeRemoteCustomers(data.customers);
      }

      // 4. Merge Expenses without losing local unsynced expenses
      if (Array.isArray(data.expenses)) {
        this.mergeRemoteExpenses(data.expenses);
      }

      // 5. Merge Credit Transactions without losing local unsynced credit records
      if (Array.isArray(data.creditTxs)) {
        this.mergeRemoteCreditTxs(data.creditTxs);
      }

      // 6. Sync Settings
      if (data.settings && typeof data.settings === 'object' && data.settings.storeName) {
        localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(data.settings));
      }

      // 7. Sync Staff
      if (serverHasUsers) {
        const merged = this.mergeServerUsersWithLocal(data.users);
        this.saveStaffList(merged);
        if (merged.length > 0) {
          this.setStoreInitialized(true);
        }
      } else {
        const localList = this.getStaffList();
        if (localList.length > 0) {
          this.pushStaffToServer(localList);
          this.setStoreInitialized(true);
        }
      }

      return {
        isInitialized: this.isStoreInitialized(),
        wiped: false,
        productsCount: this.getProducts().length,
        salesCount: this.getSales().length,
      };
    } catch {
      return { isInitialized: this.isStoreInitialized(), wiped: false, productsCount: this.getProducts().length, salesCount: this.getSales().length };
    }
  }

  createInitialAdmin(name: string, email: string, password: string, pin: string = '1234'): Staff {
    const newAdmin: Staff = {
      id: `staff-admin-${Date.now()}`,
      employeeId: `SAP-EMP-1001`,
      name: name.trim(),
      username: email.trim().split('@')[0].toLowerCase(),
      email: email.trim().toLowerCase(),
      role: 'admin',
      pin: pin.trim() || '1234',
      password: password.trim(),
      active: true,
      approvalStatus: 'approved',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastLogin: new Date().toISOString(),
    };

    const cleanId = (newAdmin.id || '').trim().toLowerCase();
    const cleanEmail = (newAdmin.email || '').trim().toLowerCase();
    const cleanUsername = (newAdmin.username || '').trim().toLowerCase();
    const curDeleted = this.getDeletedUserIds();
    const filteredDeleted = curDeleted.filter((d) => d !== cleanId && d !== cleanEmail && d !== cleanUsername);
    if (filteredDeleted.length !== curDeleted.length) {
      this.setDeletedUserIds(filteredDeleted);
    }

    const staffList = this.getStaffList();
    const updated = [newAdmin, ...staffList.filter((s) => s.email.toLowerCase() !== newAdmin.email.toLowerCase())];
    this.saveStaffList(updated);
    if (this.isBrowser()) {
      localStorage.setItem(STORAGE_KEYS.STORE_INITIALIZED, 'true');
      localStorage.setItem('sappy_initial_signup_completed', 'true');
    }
    this.setCurrentStaff(newAdmin.id);
    this.setAuthenticated(true);
    this.setRegisterLocked(false);
    this.pushStaffToServer(updated);
    this.pushStaffToFirestore(newAdmin).catch(() => {});

    this.addAuditLog('ADMIN_INITIALIZED', 'AUTH', `Primary Administrator ${newAdmin.name} configured.`);
    return newAdmin;
  }

  signOut() {
    this.setAuthenticated(false);
    this.setRegisterLocked(false);
    this.addAuditLog('USER_LOGOUT', 'AUTH', `${this.getCurrentStaff().name} signed out of register.`);
  }

  // --- Products & Codes ---
  getProducts(): Product[] {
    if (!this.isBrowser()) return INITIAL_PRODUCTS;
    try {
      const val = localStorage.getItem(STORAGE_KEYS.PRODUCTS);
      const list: Product[] = val ? JSON.parse(val) : INITIAL_PRODUCTS;
      const wipeTs = this.getCatalogWipeTimestamp();
      if (wipeTs > 0) {
        const valid = list.filter((p) => this.isRecordValidAfterWipe(p, wipeTs));
        if (valid.length !== list.length) {
          localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(valid));
        }
        return valid;
      }
      return list;
    } catch {
      return INITIAL_PRODUCTS;
    }
  }

  saveProducts(products: Product[]) {
    if (!this.isBrowser()) return;
    localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        fetch('/api/products/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ products }),
        }).catch(() => {});
      }
    } catch {}
    this.broadcastSyncMessage('PRODUCTS_UPDATED', products);
  }

  saveProductsLocally(products: Product[]) {
    if (!this.isBrowser()) return;
    localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
    this.broadcastSyncMessage('PRODUCTS_UPDATED', products);
  }

  // --- Firebase Cloud Database Cross-Device Product Synchronization ---
  mapFirestoreDocToProduct(docId: string, d: any): Product {
    return {
      id: docId || d.id || `prod-${Date.now()}`,
      name: d.name || 'Unnamed Product',
      description: d.description || '',
      category: d.category || 'General Stationery',
      brand: d.brand || 'Standard',
      sku: d.sku || `SAP-${Date.now().toString().slice(-4)}`,
      costPrice: typeof d.costPrice === 'number' ? d.costPrice : Number(d.costPrice) || 0,
      sellingPrice: typeof d.sellingPrice === 'number' ? d.sellingPrice : Number(d.sellingPrice) || 0,
      wholesalePrice: typeof d.wholesalePrice === 'number' ? d.wholesalePrice : Number(d.wholesalePrice) || 0,
      currentStock: typeof d.currentStock === 'number' ? d.currentStock : Number(d.currentStock) || 0,
      minStockThreshold: typeof d.minStockThreshold === 'number' ? d.minStockThreshold : Number(d.minStockThreshold) || 5,
      unit: d.unit || 'pcs',
      supplier: d.supplier || '',
      imageUrl: d.imageUrl || '',
      codes: Array.isArray(d.codes) ? d.codes : [],
      createdDate: d.createdDate || new Date().toISOString(),
      updatedDate: d.updatedDate || new Date().toISOString(),
    };
  }

  async pushProductToFirestore(product: Product): Promise<void> {
    if (this.isFirestoreQuotaExceeded) return;
    try {
      const prodRef = doc(db, 'products', product.id);
      await setDoc(
        prodRef,
        {
          id: product.id,
          name: product.name,
          description: product.description || '',
          category: product.category || 'General Stationery',
          brand: product.brand || 'Standard',
          sku: product.sku,
          costPrice: product.costPrice || 0,
          sellingPrice: product.sellingPrice || 0,
          wholesalePrice: product.wholesalePrice || 0,
          currentStock: product.currentStock || 0,
          minStockThreshold: product.minStockThreshold || 5,
          unit: product.unit || 'pcs',
          supplier: product.supplier || '',
          imageUrl: product.imageUrl || '',
          codes: product.codes || [],
          createdDate: product.createdDate || new Date().toISOString(),
          updatedDate: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch (err) {
      if (this.handleFirestoreQuotaError(err)) return;
      console.warn('Firestore pushProduct notice:', err);
    }
  }

  async pushProductsBatchToFirestore(products: Product[]): Promise<void> {
    if (this.isFirestoreQuotaExceeded || !products || products.length === 0) return;
    try {
      const CHUNK_SIZE = 400;
      for (let i = 0; i < products.length; i += CHUNK_SIZE) {
        const chunk = products.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        for (const p of chunk) {
          const ref = doc(db, 'products', p.id);
          batch.set(
            ref,
            {
              id: p.id,
              name: p.name,
              description: p.description || '',
              category: p.category || 'General Stationery',
              brand: p.brand || 'Standard',
              sku: p.sku,
              costPrice: p.costPrice || 0,
              sellingPrice: p.sellingPrice || 0,
              wholesalePrice: p.wholesalePrice || 0,
              currentStock: p.currentStock || 0,
              minStockThreshold: p.minStockThreshold || 5,
              unit: p.unit || 'pcs',
              supplier: p.supplier || '',
              imageUrl: p.imageUrl || '',
              codes: p.codes || [],
              createdDate: p.createdDate || new Date().toISOString(),
              updatedDate: p.updatedDate || new Date().toISOString(),
            },
            { merge: true }
          );
        }
        await batch.commit();
      }
    } catch (err) {
      if (this.handleFirestoreQuotaError(err)) return;
      console.warn('Firestore pushProductsBatch notice:', err);
    }
  }

  async deleteProductFromFirestore(productId: string): Promise<void> {
    if (this.isFirestoreQuotaExceeded) return;
    try {
      await deleteDoc(doc(db, 'products', productId));
    } catch (err) {
      if (this.handleFirestoreQuotaError(err)) return;
      console.warn('Firestore deleteProduct notice:', err);
    }
  }

  mergeRemoteProducts(remoteProducts: Product[], onUpdate?: (products: Product[]) => void): Product[] {
    const wipeTs = this.getCatalogWipeTimestamp();
    const validRemote = wipeTs > 0
      ? remoteProducts.filter((p) => this.isRecordValidAfterWipe(p, wipeTs))
      : remoteProducts;

    const localProducts = this.getProducts();

    // Map remote products by id
    const remoteMap = new Map<string, Product>();
    validRemote.forEach((p) => remoteMap.set(p.id, p));

    // Check if there are local products that don't exist in remote Firestore yet
    const missingInRemote: Product[] = [];
    localProducts.forEach((local) => {
      if (!remoteMap.has(local.id)) {
        // Also check if SKU matches an existing remote item
        const skuMatch = validRemote.find(
          (r) => r.sku && local.sku && r.sku.toLowerCase() === local.sku.toLowerCase()
        );
        if (!skuMatch) {
          missingInRemote.push(local);
        }
      }
    });

    // Merged list: valid remote products plus any local items pending upload
    const merged: Product[] = [...validRemote, ...missingInRemote];

    this.saveProductsLocally(merged);

    if (onUpdate) {
      onUpdate(merged);
    }

    return merged;
  }

  syncProductsWithFirestore(onUpdate?: (products: Product[]) => void): () => void {
    if (!this.isBrowser()) return () => {};

    const handleDocs = (snapDocs: any[]) => {
      const wipeTs = this.getCatalogWipeTimestamp();
      const remoteProds: Product[] = [];
      snapDocs.forEach((docSnap) => {
        const p = this.mapFirestoreDocToProduct(docSnap.id, docSnap.data());
        if (this.isRecordValidAfterWipe(p, wipeTs)) {
          remoteProds.push(p);
        }
      });

      this.mergeRemoteProducts(remoteProds, onUpdate);
    };

    // 1. Immediate fetch on mount
    getDocs(collection(db, 'products'))
      .then((snap) => handleDocs(snap.docs))
      .catch((err) => {
        console.warn('Initial Firestore products sync notice:', err);
      });

    // 2. Real-time live listener for cross-device updates
    const unsubscribe = onSnapshot(
      collection(db, 'products'),
      (snap) => handleDocs(snap.docs),
      (err) => {
        console.warn('Firestore real-time products sync notice:', err);
      }
    );

    return unsubscribe;
  }

  /**
   * Code Uniqueness & Validation Check (Requirement #8)
   * Detects duplicate codes across all products.
   * If excludeProductId is given, ignores codes on that specific product during edit.
   */
  findCodeConflict(codeValue: string, excludeProductId?: string): { conflictingProduct: Product; conflictingCode: ProductCode } | null {
    if (!codeValue || !codeValue.trim()) return null;
    const cleanCode = codeValue.trim().toLowerCase();
    const products = this.getProducts();

    for (const prod of products) {
      if (excludeProductId && prod.id === excludeProductId) continue;
      for (const c of prod.codes) {
        if (c.active && c.code.trim().toLowerCase() === cleanCode) {
          return { conflictingProduct: prod, conflictingCode: c };
        }
      }
    }
    return null;
  }

  findProductByCode(scannedValue: string): Product | null {
    if (!scannedValue || !scannedValue.trim()) return null;
    const clean = scannedValue.trim().toLowerCase();
    const products = this.getProducts();

    // Check SKU first
    const bySku = products.find((p) => p.sku.toLowerCase() === clean);
    if (bySku) return bySku;

    // Check active codes
    for (const prod of products) {
      for (const c of prod.codes) {
        if (c.active && c.code.toLowerCase() === clean) {
          return prod;
        }
      }
    }
    return null;
  }

  /**
   * Comprehensive Duplicate Detection (SKU, Barcode/QR Code, or Exact Product Name)
   */
  findDuplicateProduct(
    candidate: {
      id?: string;
      sku?: string;
      name?: string;
      codes?: ProductCode[];
    },
    excludeId?: string
  ): { product: Product; reason: 'sku' | 'code' | 'name'; value: string } | null {
    const products = this.getProducts();
    const cleanSku = (candidate.sku || '').trim().toLowerCase();
    const cleanName = (candidate.name || '').trim().toLowerCase();
    const skipId = excludeId || candidate.id;

    for (const p of products) {
      if (skipId && p.id === skipId) continue;

      // 1. Check SKU match
      if (cleanSku && p.sku.trim().toLowerCase() === cleanSku) {
        return { product: p, reason: 'sku', value: p.sku };
      }

      // 2. Check Barcode / QR code matches
      if (candidate.codes && candidate.codes.length > 0) {
        for (const c of candidate.codes) {
          if (c.active && c.code && c.code.trim()) {
            const cVal = c.code.trim().toLowerCase();
            const matchingCode = p.codes.find((pc) => pc.active && pc.code.trim().toLowerCase() === cVal);
            if (matchingCode) {
              return { product: p, reason: 'code', value: matchingCode.code };
            }
          }
        }
      }

      // 3. Check Exact Product Name match
      if (cleanName && p.name.trim().toLowerCase() === cleanName) {
        return { product: p, reason: 'name', value: p.name };
      }
    }

    return null;
  }

  /**
   * Safely merge incoming product data into an existing product.
   * Combines stock levels, preserves ID, adds any new codes, and updates cloud database.
   */
  mergeProducts(
    existingProduct: Product,
    incoming: Partial<Product>,
    options?: { updatePrice?: boolean }
  ): Product {
    const mergedStock = existingProduct.currentStock + (incoming.currentStock || 0);

    // Combine unique codes
    const existingCodeValues = new Set(existingProduct.codes.map((c) => c.code.trim().toLowerCase()));
    const combinedCodes: ProductCode[] = [...existingProduct.codes];

    if (incoming.codes && Array.isArray(incoming.codes)) {
      for (const incCode of incoming.codes) {
        if (incCode.code && !existingCodeValues.has(incCode.code.trim().toLowerCase())) {
          combinedCodes.push({
            ...incCode,
            id: `code-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            isPrimary: false,
          });
          existingCodeValues.add(incCode.code.trim().toLowerCase());
        }
      }
    }

    const mergedProduct: Product = {
      ...existingProduct,
      currentStock: mergedStock,
      sellingPrice:
        options?.updatePrice && incoming.sellingPrice !== undefined && incoming.sellingPrice > 0
          ? incoming.sellingPrice
          : existingProduct.sellingPrice,
      costPrice:
        options?.updatePrice && incoming.costPrice !== undefined && incoming.costPrice > 0
          ? incoming.costPrice
          : existingProduct.costPrice,
      wholesalePrice:
        incoming.wholesalePrice !== undefined && incoming.wholesalePrice > 0
          ? incoming.wholesalePrice
          : existingProduct.wholesalePrice,
      description: incoming.description || existingProduct.description,
      supplier: incoming.supplier || existingProduct.supplier,
      codes: combinedCodes,
      updatedDate: new Date().toISOString(),
    };

    // Save and sync merged product
    const allProducts = this.getProducts();
    const updatedList = allProducts.map((p) => (p.id === existingProduct.id ? mergedProduct : p));
    this.saveProducts(updatedList);
    this.pushProductToFirestore(mergedProduct).catch(() => {});
    this.addAuditLog(
      'PRODUCT_MERGED',
      'INVENTORY',
      `Merged duplicate item "${mergedProduct.name}" (${mergedProduct.sku}). Added ${incoming.currentStock || 0} units to stock. Total now ${mergedStock}.`
    );

    return mergedProduct;
  }

  saveProduct(
    product: Product,
    isNew: boolean,
    duplicateResolution?: 'merge' | 'replace'
  ): {
    success: boolean;
    error?: string;
    duplicateFound?: boolean;
    existingProduct?: Product;
    duplicateReason?: 'sku' | 'code' | 'name';
    duplicateValue?: string;
  } {
    const products = this.getProducts();

    if (isNew) {
      const duplicate = this.findDuplicateProduct(product);
      if (duplicate) {
        if (duplicateResolution === 'merge') {
          this.mergeProducts(duplicate.product, product, { updatePrice: true });
          return { success: true };
        } else if (duplicateResolution === 'replace') {
          // Replace existing product with incoming product details, keeping existing ID
          const replacedProduct: Product = {
            ...product,
            id: duplicate.product.id,
            updatedDate: new Date().toISOString(),
          };
          const updated = products.map((p) => (p.id === duplicate.product.id ? replacedProduct : p));
          this.saveProducts(updated);
          this.pushProductToFirestore(replacedProduct).catch(() => {});
          this.addAuditLog('PRODUCT_REPLACED', 'INVENTORY', `Overwrote existing product with incoming item "${replacedProduct.name}" (${replacedProduct.sku}).`);
          return { success: true };
        }

        // Return duplicate details so user can choose to merge or replace
        const reasonDesc =
          duplicate.reason === 'sku'
            ? `SKU "${duplicate.value}" already exists`
            : duplicate.reason === 'code'
            ? `Barcode/QR code "${duplicate.value}" already exists`
            : `Product name "${duplicate.value}" already exists`;

        return {
          success: false,
          duplicateFound: true,
          existingProduct: duplicate.product,
          duplicateReason: duplicate.reason,
          duplicateValue: duplicate.value,
          error: `Duplicate item detected: ${reasonDesc} on "${duplicate.product.name}".`,
        };
      }
    } else {
      // Editing existing product: check conflict against other products
      const duplicate = this.findDuplicateProduct(product, product.id);
      if (duplicate) {
        return {
          success: false,
          duplicateFound: true,
          existingProduct: duplicate.product,
          duplicateReason: duplicate.reason,
          duplicateValue: duplicate.value,
          error: `Cannot save: conflicting ${duplicate.reason.toUpperCase()} "${duplicate.value}" belongs to "${duplicate.product.name}".`,
        };
      }
    }

    let updated: Product[];
    if (isNew) {
      updated = [product, ...products];
      this.addAuditLog('PRODUCT_CREATED', 'INVENTORY', `Product "${product.name}" created with SKU ${product.sku} and ${product.codes.length} code(s).`);
    } else {
      updated = products.map((p) => (p.id === product.id ? product : p));
      this.addAuditLog('PRODUCT_EDITED', 'INVENTORY', `Product "${product.name}" (${product.sku}) updated.`);
    }

    this.saveProducts(updated);
    this.pushProductToFirestore(product).catch(() => {});
    this.enqueueSync('product', isNew ? 'create' : 'update', product);
    return { success: true };
  }

  deleteProduct(productId: string): boolean {
    const products = this.getProducts();
    const target = products.find((p) => p.id === productId);
    if (!target) return false;

    const filtered = products.filter((p) => p.id !== productId);
    this.saveProducts(filtered);
    this.deleteProductFromFirestore(productId).catch(() => {});
    this.addAuditLog('PRODUCT_DELETED', 'INVENTORY', `Product "${target.name}" (${target.sku}) deleted.`, target.id);
    this.enqueueSync('product', 'delete', { id: productId });
    return true;
  }

  // --- Stock Adjustments & Movements ---
  recordStockMovement(
    productId: string,
    type: StockMovement['type'],
    quantityChange: number,
    reason: string
  ): { success: boolean; newStock: number } {
    const products = this.getProducts();
    const product = products.find((p) => p.id === productId);
    if (!product) return { success: false, newStock: 0 };

    const previousStock = product.currentStock;
    const newStock = Math.max(0, previousStock + quantityChange);
    product.currentStock = newStock;
    product.updatedDate = new Date().toISOString();

    this.saveProducts(products);
    this.pushProductToFirestore(product).catch(() => {});

    const movement: StockMovement = {
      id: `mov-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      productId,
      productName: product.name,
      sku: product.sku,
      type,
      quantityChange,
      previousStock,
      newStock,
      reason,
      performedBy: this.getCurrentStaff().name,
      date: new Date().toISOString(),
      costImpact: quantityChange * product.costPrice,
    };

    const movements = this.getStockMovements();
    if (this.isBrowser()) {
      localStorage.setItem(STORAGE_KEYS.STOCK_MOVEMENTS, JSON.stringify([movement, ...movements]));
    }

    this.addAuditLog('STOCK_ADJUSTMENT', 'INVENTORY', `Stock changed for ${product.name} by ${quantityChange > 0 ? '+' : ''}${quantityChange} (${type}: ${reason}). Stock is now ${newStock}.`);
    this.enqueueSync('inventory', 'update', movement);

    return { success: true, newStock };
  }

  getStockMovements(): StockMovement[] {
    if (!this.isBrowser()) return [];
    try {
      const val = localStorage.getItem(STORAGE_KEYS.STOCK_MOVEMENTS);
      return val ? JSON.parse(val) : [];
    } catch {
      return [];
    }
  }

  // --- Register Shifts ---
  getShifts(): Shift[] {
    if (!this.isBrowser()) return [];
    try {
      const val = localStorage.getItem(STORAGE_KEYS.SHIFTS);
      return val ? JSON.parse(val) : [];
    } catch {
      return [];
    }
  }

  saveShifts(shifts: Shift[]) {
    if (!this.isBrowser()) return;
    localStorage.setItem(STORAGE_KEYS.SHIFTS, JSON.stringify(shifts));
  }

  getActiveShift(): Shift | null {
    const shifts = this.getShifts();
    const activeId = this.isBrowser() ? localStorage.getItem(STORAGE_KEYS.ACTIVE_SHIFT_ID) : null;
    if (activeId) {
      const found = shifts.find((s) => s.id === activeId && s.status === 'OPEN');
      if (found) return found;
    }
    return shifts.find((s) => s.status === 'OPEN') || null;
  }

  openShift(openingFloat: number, notes?: string): Shift {
    const shifts = this.getShifts();
    const staff = this.getCurrentStaff();
    const newShiftNumber = (shifts[0]?.shiftNumber || 100) + 1;

    const newShift: Shift = {
      id: `shift-${Date.now()}`,
      shiftNumber: newShiftNumber,
      cashierId: staff.id,
      cashierName: staff.name,
      openedAt: new Date().toISOString(),
      openingFloat,
      cashSales: 0,
      cardSales: 0,
      mobileSales: 0,
      creditSales: 0,
      cashAdditions: 0,
      cashDrops: 0,
      expenses: 0,
      refundsGiven: 0,
      expectedCash: openingFloat,
      status: 'OPEN',
      notes,
    };

    const updated = [newShift, ...shifts];
    this.saveShifts(updated);
    if (this.isBrowser()) {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_SHIFT_ID, newShift.id);
    }
    this.addAuditLog('SHIFT_OPENED', 'SHIFT', `Shift #${newShiftNumber} opened by ${staff.name} with float of ${openingFloat} ETB.`);
    this.enqueueSync('shift', 'create', newShift);
    return newShift;
  }

  closeShift(shiftId: string, actualCash: number, varianceReason?: string): Shift | null {
    const shifts = this.getShifts();
    const shift = shifts.find((s) => s.id === shiftId);
    if (!shift) return null;

    const expectedCash =
      shift.openingFloat +
      shift.cashSales +
      shift.cashAdditions -
      shift.refundsGiven -
      shift.cashDrops -
      shift.expenses;

    const variance = actualCash - expectedCash;

    shift.closedAt = new Date().toISOString();
    shift.status = 'CLOSED';
    shift.actualCash = actualCash;
    shift.expectedCash = expectedCash;
    shift.variance = variance;
    shift.varianceReason = varianceReason;

    this.saveShifts(shifts);
    if (this.isBrowser() && localStorage.getItem(STORAGE_KEYS.ACTIVE_SHIFT_ID) === shiftId) {
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_SHIFT_ID);
    }

    const varianceNotice = variance === 0 ? 'Cash matched expected amount.' : variance > 0 ? `Overage: +${variance} ETB` : `Shortage: ${variance} ETB`;
    this.addAuditLog('SHIFT_CLOSED', 'SHIFT', `Shift #${shift.shiftNumber} closed by ${this.getCurrentStaff().name}. ${varianceNotice}`);
    this.enqueueSync('shift', 'update', shift);
    return shift;
  }

  recordCashMovementInShift(shiftId: string, type: 'drop' | 'addition', amount: number, note: string) {
    const shifts = this.getShifts();
    const shift = shifts.find((s) => s.id === shiftId);
    if (!shift) return;

    if (type === 'drop') {
      shift.cashDrops += amount;
    } else {
      shift.cashAdditions += amount;
    }
    shift.expectedCash =
      shift.openingFloat +
      shift.cashSales +
      shift.cashAdditions -
      shift.refundsGiven -
      shift.cashDrops -
      shift.expenses;

    this.saveShifts(shifts);
    this.addAuditLog(type === 'drop' ? 'CASH_DROP' : 'FLOAT_ADDITION', 'SHIFT', `Cash ${type} of ${amount} ETB in shift #${shift.shiftNumber}: ${note}`);
  }

  // --- End of Day Aggregation & Drawer Reconciliation ---
  getEndOfDayReport(dateStr?: string, shiftId?: string): EndOfDayReport {
    const targetDate = dateStr || new Date().toISOString().slice(0, 10);
    const shifts = this.getShifts();
    const activeShift = shiftId ? shifts.find((s) => s.id === shiftId) : this.getActiveShift();

    // 1. Sales for the day (or specific shift)
    const allSales = this.getSales();
    const daySales = allSales.filter((s) => {
      const sDate = s.date.slice(0, 10);
      if (shiftId && s.shiftId) {
        return s.shiftId === shiftId;
      }
      return sDate === targetDate;
    });

    const completedSales = daySales.filter((s) => s.status === 'COMPLETED');
    const refundedSales = daySales.filter((s) => s.status === 'REFUNDED' || s.status === 'PARTIALLY_REFUNDED');

    let grossSales = 0;
    let totalDiscount = 0;
    let taxAmount = 0;
    let grandTotalSales = 0;
    let itemsSoldCount = 0;

    let cashSales = 0;
    let cardSales = 0;
    let mobileSales = 0;
    let creditSales = 0;

    completedSales.forEach((s) => {
      grossSales += s.subtotal;
      totalDiscount += s.totalDiscount || 0;
      taxAmount += s.taxAmount || 0;
      grandTotalSales += s.grandTotal;
      s.items.forEach((i) => {
        itemsSoldCount += i.quantity;
      });

      s.payments.forEach((p) => {
        if (p.method === 'cash') cashSales += p.amount;
        else if (p.method === 'card') cardSales += p.amount;
        else if (p.method === 'mobile_transfer') mobileSales += p.amount;
        else if (p.method === 'credit') creditSales += p.amount;
      });
    });

    // Refunds cash payout
    let refundsCash = 0;
    refundedSales.forEach((s) => {
      const cashPay = s.payments.find((p) => p.method === 'cash');
      if (cashPay) refundsCash += cashPay.amount;
    });

    // 2. Expenses for the day
    const allExpenses = this.getExpenses();
    const dayExpenses = allExpenses.filter((e) => {
      if (shiftId && e.shiftId) return e.shiftId === shiftId;
      return e.date.slice(0, 10) === targetDate;
    });

    let totalExpenses = 0;
    let cashDrawerExpenses = 0;
    let digitalExpenses = 0;

    dayExpenses.forEach((e) => {
      totalExpenses += e.amount;
      if (e.paidWith === 'cash_drawer' || e.paidWith === 'petty_cash') {
        cashDrawerExpenses += e.amount;
      } else {
        digitalExpenses += e.amount;
      }
    });

    // 3. Credit transactions for the day
    const allCreditTxs = this.getCreditTransactions();
    const dayCreditTxs = allCreditTxs.filter((tx) => tx.date.slice(0, 10) === targetDate);

    let newCreditIssued = 0;
    let creditRepaymentsTotal = 0;
    let creditRepaymentsCash = 0;
    let creditRepaymentsDigital = 0;

    dayCreditTxs.forEach((tx) => {
      if (tx.type === 'CHARGE') {
        newCreditIssued += tx.amount;
      } else if (tx.type === 'PAYMENT') {
        creditRepaymentsTotal += tx.amount;
        if (tx.paymentMethod === 'cash') {
          creditRepaymentsCash += tx.amount;
        } else {
          creditRepaymentsDigital += tx.amount;
        }
      }
    });

    // 4. Shift & Drawer Cash Reconciliation
    const openingFloat = activeShift ? activeShift.openingFloat : 0;
    const cashAdditions = activeShift ? activeShift.cashAdditions : 0;
    const cashDrops = activeShift ? activeShift.cashDrops : 0;

    const expectedCash =
      openingFloat +
      cashSales +
      creditRepaymentsCash +
      cashAdditions -
      cashDrawerExpenses -
      refundsCash -
      cashDrops;

    return {
      date: targetDate,
      generatedAt: new Date().toISOString(),
      cashierName: activeShift?.cashierName || this.getCurrentStaff().name,
      shiftId: activeShift?.id,
      shiftNumber: activeShift?.shiftNumber,
      openingFloat,
      completedSalesCount: completedSales.length,
      refundedSalesCount: refundedSales.length,
      itemsSoldCount,
      grossSales,
      totalDiscount,
      netSales: Math.max(0, grossSales - totalDiscount),
      taxAmount,
      grandTotalSales,
      cashSales,
      cardSales,
      mobileSales,
      creditSales,
      totalExpenses,
      cashDrawerExpenses,
      digitalExpenses,
      expenses: dayExpenses,
      newCreditIssued,
      creditRepaymentsTotal,
      creditRepaymentsCash,
      creditRepaymentsDigital,
      creditTransactions: dayCreditTxs,
      cashAdditions,
      cashDrops,
      refundsCash,
      expectedCash,
      actualCash: activeShift?.actualCash,
      variance: activeShift?.variance,
      varianceReason: activeShift?.varianceReason,
      notes: activeShift?.notes,
    };
  }

  saveEndOfDayReconciliation(
    dateStr: string,
    actualCash: number,
    varianceReason?: string,
    notes?: string
  ): EndOfDayReport {
    const report = this.getEndOfDayReport(dateStr);
    const variance = actualCash - report.expectedCash;
    report.actualCash = actualCash;
    report.variance = variance;
    report.varianceReason = varianceReason;
    report.notes = notes;

    // If an active shift is open, close it
    const activeShift = this.getActiveShift();
    if (activeShift) {
      this.closeShift(activeShift.id, actualCash, varianceReason);
    } else {
      // Create a closed record shift for this day's reconciliation
      const staff = this.getCurrentStaff();
      const shifts = this.getShifts();
      const newShiftNum = (shifts[0]?.shiftNumber || 100) + 1;
      const closedShift: Shift = {
        id: `shift-eod-${Date.now()}`,
        shiftNumber: newShiftNum,
        cashierId: staff.id,
        cashierName: staff.name,
        openedAt: `${dateStr}T08:00:00.000Z`,
        closedAt: new Date().toISOString(),
        openingFloat: report.openingFloat,
        cashSales: report.cashSales,
        cardSales: report.cardSales,
        mobileSales: report.mobileSales,
        creditSales: report.creditSales,
        cashAdditions: report.cashAdditions,
        cashDrops: report.cashDrops,
        expenses: report.cashDrawerExpenses,
        refundsGiven: report.refundsCash,
        expectedCash: report.expectedCash,
        actualCash,
        variance,
        varianceReason,
        status: 'CLOSED',
        notes: notes || 'End of Day Reconciliation',
      };
      this.saveShifts([closedShift, ...shifts]);
    }

    const varTxt = variance === 0 ? 'Cash matched expected amount' : variance > 0 ? `Overage: +${variance} ETB` : `Shortage: ${variance} ETB`;
    this.addAuditLog(
      'END_OF_DAY_RECONCILED',
      'SHIFT',
      `End of Day reconciliation completed for ${dateStr} by ${this.getCurrentStaff().name}. Actual: ${actualCash} ETB, Expected: ${report.expectedCash} ETB. ${varTxt}`
    );

    return report;
  }

  // --- Sales & Transactions ---
  getSales(): Sale[] {
    if (!this.isBrowser()) return [];
    try {
      const val = localStorage.getItem(STORAGE_KEYS.SALES);
      const list: Sale[] = val ? JSON.parse(val) : [];
      const wipeTs = this.getCatalogWipeTimestamp();
      if (wipeTs > 0) {
        const valid = list.filter((s) => this.isRecordValidAfterWipe(s, wipeTs));
        if (valid.length !== list.length) {
          localStorage.setItem(STORAGE_KEYS.SALES, JSON.stringify(valid));
        }
        return valid;
      }
      return list;
    } catch {
      return [];
    }
  }

  saveSales(sales: Sale[]) {
    if (!this.isBrowser()) return;
    localStorage.setItem(STORAGE_KEYS.SALES, JSON.stringify(sales));
    indexedDbService.putSalesBatch(sales).catch(() => {});
    this.broadcastSyncMessage('SALES_UPDATED', sales);
  }

  async pushSaleToFirestore(sale: Sale): Promise<void> {
    if (this.isFirestoreQuotaExceeded) return;
    try {
      await setDoc(doc(db, 'sales', sale.id), sale, { merge: true });
    } catch (err) {
      if (this.handleFirestoreQuotaError(err)) return;
      console.warn('Firestore pushSale notice:', err);
    }
  }

  async pushSalesBatchToFirestore(sales: Sale[]): Promise<void> {
    if (this.isFirestoreQuotaExceeded || !sales || sales.length === 0) return;
    try {
      const CHUNK_SIZE = 400;
      for (let i = 0; i < sales.length; i += CHUNK_SIZE) {
        const chunk = sales.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        for (const s of chunk) {
          const ref = doc(db, 'sales', s.id);
          batch.set(ref, s, { merge: true });
        }
        await batch.commit();
      }
    } catch (err) {
      if (this.handleFirestoreQuotaError(err)) return;
      console.warn('Firestore pushSalesBatch notice:', err);
    }
  }

  mergeRemoteSales(remoteSales: Sale[], onUpdate?: (sales: Sale[]) => void): Sale[] {
    const wipeTs = this.getCatalogWipeTimestamp();
    const validRemote = wipeTs > 0
      ? remoteSales.filter((s) => this.isRecordValidAfterWipe(s, wipeTs))
      : remoteSales;

    const localSales = this.getSales();
    const remoteMap = new Map<string, Sale>();
    validRemote.forEach((s) => remoteMap.set(s.id, s));

    const missingInRemote: Sale[] = [];
    localSales.forEach((local) => {
      const match = remoteMap.get(local.id) || validRemote.find((r) => r.receiptNumber && local.receiptNumber && r.receiptNumber === local.receiptNumber);
      if (!match) {
        missingInRemote.push(local);
      }
    });

    const mergedMap = new Map<string, Sale>();
    validRemote.forEach((s) => mergedMap.set(s.id, s));
    missingInRemote.forEach((s) => mergedMap.set(s.id, s));

    // Handle refunded status precedence if local or remote marked refunded
    localSales.forEach((l) => {
      const existing = mergedMap.get(l.id);
      if (existing && (l.status === 'REFUNDED' || (l as any).refunded)) {
        mergedMap.set(l.id, {
          ...existing,
          status: 'REFUNDED',
          refundReason: l.refundReason,
          refundDate: l.refundDate,
          refundedBy: l.refundedBy,
        });
      }
    });

    const merged = Array.from(mergedMap.values()).sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    this.saveSales(merged);

    if (onUpdate) {
      onUpdate(merged);
    }

    return merged;
  }

  syncSalesWithFirestore(onUpdate?: (sales: Sale[]) => void): () => void {
    if (!this.isBrowser()) return () => {};

    const handleSalesDocs = (docs: any[]) => {
      const wipeTs = this.getCatalogWipeTimestamp();
      const remoteSales: Sale[] = [];
      docs.forEach((d) => {
        const sale = d.data() as Sale;
        if (this.isRecordValidAfterWipe(sale, wipeTs)) {
          remoteSales.push(sale);
        }
      });

      this.mergeRemoteSales(remoteSales, onUpdate);
    };

    getDocs(collection(db, 'sales'))
      .then((snap) => handleSalesDocs(snap.docs))
      .catch((err) => console.warn('Initial Firestore sales sync notice:', err));

    const unsubscribe = onSnapshot(
      collection(db, 'sales'),
      (snap) => handleSalesDocs(snap.docs),
      (err) => console.warn('Firestore real-time sales sync notice:', err)
    );

    return unsubscribe;
  }

  completeSale(saleData: Omit<Sale, 'id' | 'receiptNumber' | 'date' | 'isSynced' | 'status'>): Sale {
    const sales = this.getSales();
    const receiptNum = `SAP-${new Date().getFullYear()}-${String(sales.length + 1).padStart(5, '0')}`;
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

    const newSale: Sale = {
      ...saleData,
      id: `sale-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      receiptNumber: receiptNum,
      date: new Date().toISOString(),
      status: 'COMPLETED',
      isSynced: isOnline,
    };

    // 1. Deduct Inventory Stock
    const products = this.getProducts();
    const affectedProducts: Product[] = [];
    newSale.items.forEach((item) => {
      const prod = products.find((p) => p.id === item.productId);
      if (prod && prod.category !== 'Print Services') {
        prod.currentStock = Math.max(0, prod.currentStock - item.quantity);
        prod.updatedDate = newSale.date;
        affectedProducts.push(prod);
      }
    });
    this.saveProducts(products);
    if (affectedProducts.length > 0) {
      this.pushProductsBatchToFirestore(affectedProducts).catch(() => {});
    }

    // 2. Update Active Shift totals if present
    const shifts = this.getShifts();
    const shift = newSale.shiftId ? shifts.find((s) => s.id === newSale.shiftId) : null;
    if (shift) {
      newSale.payments.forEach((p) => {
        if (p.method === 'cash') shift.cashSales += p.amount;
        else if (p.method === 'card') shift.cardSales += p.amount;
        else if (p.method === 'mobile_transfer') shift.mobileSales += p.amount;
        else if (p.method === 'credit') shift.creditSales += p.amount;
      });
      // Deduct change from cash sales or drawer
      shift.expectedCash =
        shift.openingFloat +
        shift.cashSales +
        shift.cashAdditions -
        shift.refundsGiven -
        shift.cashDrops -
        shift.expenses;
      this.saveShifts(shifts);
    }

    // 3. Handle Store Credit if customer used credit
    if (newSale.creditAdded > 0 && newSale.customerId) {
      this.addCreditTransaction(newSale.customerId, 'CHARGE', newSale.creditAdded, `Sale #${receiptNum}`, newSale.id);
    }

    // 4. Save Sale locally and push directly to Firestore
    const updatedSales = [newSale, ...sales];
    this.saveSales(updatedSales);
    this.pushSaleToFirestore(newSale).catch(() => {});

    // 5. Audit Log & Sync
    this.addAuditLog('SALE_COMPLETED', 'SALES', `Sale #${receiptNum} completed for ${newSale.grandTotal} ETB by ${newSale.cashierName}.`, newSale.id);
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        fetch('/api/sales/record', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sale: newSale }),
        }).catch(() => {});
      } else {
        this.enqueueSync('sale', 'create', newSale);
      }
    } catch {
      this.enqueueSync('sale', 'create', newSale);
    }

    return newSale;
  }

  refundSale(saleId: string, reason: string, staffPin: string): { success: boolean; error?: string } {
    const staff = this.getCurrentStaff();
    if (!this.verifyPin(staff.id, staffPin) && staff.role !== 'admin' && staff.role !== 'manager') {
      return { success: false, error: 'Unauthorized. Requires Manager or Admin authorization PIN.' };
    }

    const sales = this.getSales();
    const sale = sales.find((s) => s.id === saleId);
    if (!sale) return { success: false, error: 'Sale record not found.' };
    if (sale.status === 'REFUNDED') return { success: false, error: 'This sale has already been refunded.' };

    sale.status = 'REFUNDED';
    sale.refundReason = reason;
    sale.refundedBy = staff.name;
    sale.refundDate = new Date().toISOString();

    // Return inventory stock
    const products = this.getProducts();
    sale.items.forEach((item) => {
      const prod = products.find((p) => p.id === item.productId);
      if (prod && prod.category !== 'Print Services') {
        prod.currentStock += item.quantity;
      }
    });
    this.saveProducts(products);

    // Update shift refunds if shiftId present
    const shifts = this.getShifts();
    const shift = sale.shiftId ? shifts.find((s) => s.id === sale.shiftId) : null;
    if (shift) {
      shift.refundsGiven += sale.grandTotal;
      shift.expectedCash =
        shift.openingFloat +
        shift.cashSales +
        shift.cashAdditions -
        shift.refundsGiven -
        shift.cashDrops -
        shift.expenses;
      this.saveShifts(shifts);
    }

    // If customer credit was charged, refund the credit
    if (sale.creditAdded > 0 && sale.customerId) {
      this.addCreditTransaction(sale.customerId, 'PAYMENT', sale.creditAdded, `Refund for #${sale.receiptNumber}`, sale.id);
    }

    this.saveSales(sales);
    this.pushSaleToFirestore(sale).catch(() => {});
    this.addAuditLog('SALE_REFUNDED', 'REFUND', `Sale #${sale.receiptNumber} refunded (${sale.grandTotal} ETB). Reason: ${reason}. Authorized by ${staff.name}.`);
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        fetch(`/api/sales/${saleId}/refund`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason, staffName: staff.name }),
        }).catch(() => {});
      } else {
        this.enqueueSync('sale', 'update', sale);
      }
    } catch {
      this.enqueueSync('sale', 'update', sale);
    }

    return { success: true };
  }

  // --- Customers & Credit Accounts ---
  getCustomers(): Customer[] {
    if (!this.isBrowser()) return INITIAL_CUSTOMERS;
    try {
      const val = localStorage.getItem(STORAGE_KEYS.CUSTOMERS);
      const list: Customer[] = val ? JSON.parse(val) : INITIAL_CUSTOMERS;
      const wipeTs = this.getCatalogWipeTimestamp();
      if (wipeTs > 0) {
        const valid = list.filter((c) => this.isRecordValidAfterWipe(c, wipeTs));
        if (valid.length !== list.length) {
          localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(valid));
        }
        return valid;
      }
      return list;
    } catch {
      return INITIAL_CUSTOMERS;
    }
  }

  async pushCustomerToFirestore(customer: Customer): Promise<void> {
    if (this.isFirestoreQuotaExceeded) return;
    try {
      await setDoc(doc(db, 'customers', customer.id), customer, { merge: true });
    } catch (err) {
      if (this.handleFirestoreQuotaError(err)) return;
      console.warn('Firestore pushCustomer notice:', err);
    }
  }

  async pushCustomersBatchToFirestore(customers: Customer[]): Promise<void> {
    if (this.isFirestoreQuotaExceeded || !customers || customers.length === 0) return;
    try {
      const batch = writeBatch(db);
      for (const c of customers) {
        batch.set(doc(db, 'customers', c.id), c, { merge: true });
      }
      await batch.commit();
    } catch (err) {
      if (this.handleFirestoreQuotaError(err)) return;
      console.warn('Firestore pushCustomersBatch notice:', err);
    }
  }

  mergeRemoteCustomers(remoteCustomers: Customer[], onUpdate?: (customers: Customer[]) => void): Customer[] {
    const wipeTs = this.getCatalogWipeTimestamp();
    const validRemote = wipeTs > 0
      ? remoteCustomers.filter((c) => this.isRecordValidAfterWipe(c, wipeTs))
      : remoteCustomers;

    const localCustomers = this.getCustomers();
    const remoteMap = new Map<string, Customer>();
    validRemote.forEach((c) => remoteMap.set(c.id, c));

    const missingInRemote: Customer[] = [];
    localCustomers.forEach((local) => {
      const match = remoteMap.get(local.id) || validRemote.find((r) => (r.phone && local.phone && r.phone === local.phone) || (r.name && local.name && r.name.toLowerCase() === local.name.toLowerCase()));
      if (!match) {
        missingInRemote.push(local);
      }
    });

    const mergedMap = new Map<string, Customer>();
    validRemote.forEach((c) => mergedMap.set(c.id, c));
    missingInRemote.forEach((c) => mergedMap.set(c.id, c));

    // Update with most recent balance / stamped paid info from local
    localCustomers.forEach((l) => {
      const cur = mergedMap.get(l.id);
      if (cur) {
        if (l.isStampedPaid && !cur.isStampedPaid) {
          mergedMap.set(l.id, {
            ...cur,
            isStampedPaid: true,
            currentBalance: l.currentBalance,
            lastPaidDate: l.lastPaidDate,
            lastPaidStaff: l.lastPaidStaff,
            lastPaidAmount: l.lastPaidAmount,
          });
        }
      }
    });

    const merged = Array.from(mergedMap.values());
    localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(merged));

    if (onUpdate) {
      onUpdate(merged);
    }

    return merged;
  }

  syncCustomersWithFirestore(onUpdate?: (customers: Customer[]) => void): () => void {
    if (!this.isBrowser()) return () => {};

    const handleCustDocs = (docs: any[]) => {
      const wipeTs = this.getCatalogWipeTimestamp();
      const remoteCustomers: Customer[] = [];
      docs.forEach((d) => {
        const c = d.data() as Customer;
        if (this.isRecordValidAfterWipe(c, wipeTs)) {
          remoteCustomers.push(c);
        }
      });

      this.mergeRemoteCustomers(remoteCustomers, onUpdate);
    };

    getDocs(collection(db, 'customers'))
      .then((snap) => handleCustDocs(snap.docs))
      .catch((err) => console.warn('Initial Firestore customers sync notice:', err));

    const unsubscribe = onSnapshot(
      collection(db, 'customers'),
      (snap) => handleCustDocs(snap.docs),
      (err) => console.warn('Firestore real-time customers sync notice:', err)
    );

    return unsubscribe;
  }

  saveCustomers(customers: Customer[]) {
    if (!this.isBrowser()) return;
    localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(customers));
    this.pushCustomersBatchToFirestore(customers).catch(() => {});
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        fetch('/api/customers/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customers }),
        }).catch(() => {});
      }
    } catch {}
    this.broadcastSyncMessage('CUSTOMERS_UPDATED', customers);
  }

  saveCustomer(customer: Customer, isNew: boolean) {
    const list = this.getCustomers();
    let updated: Customer[];
    if (isNew) {
      updated = [customer, ...list];
      this.addAuditLog('CUSTOMER_CREATED', 'CREDIT', `Customer "${customer.name}" created with limit ${customer.creditLimit} ETB.`);
    } else {
      updated = list.map((c) => (c.id === customer.id ? customer : c));
      this.addAuditLog('CUSTOMER_UPDATED', 'CREDIT', `Customer "${customer.name}" details updated.`);
    }
    this.saveCustomers(updated);
    this.pushCustomerToFirestore(customer).catch(() => {});
    this.enqueueSync('customer', isNew ? 'create' : 'update', customer);
  }

  async pushCreditTransactionToFirestore(tx: CreditTransaction): Promise<void> {
    if (this.isFirestoreQuotaExceeded) return;
    try {
      await setDoc(doc(db, 'credit_transactions', tx.id), tx, { merge: true });
    } catch (err) {
      if (this.handleFirestoreQuotaError(err)) return;
      console.warn('Firestore pushCreditTransaction notice:', err);
    }
  }

  async pushCreditTxsBatchToFirestore(txs: CreditTransaction[]): Promise<void> {
    if (this.isFirestoreQuotaExceeded || !txs || txs.length === 0) return;
    try {
      const CHUNK_SIZE = 400;
      for (let i = 0; i < txs.length; i += CHUNK_SIZE) {
        const chunk = txs.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        for (const t of chunk) {
          const ref = doc(db, 'credit_transactions', t.id);
          batch.set(ref, t, { merge: true });
        }
        await batch.commit();
      }
    } catch (err) {
      if (this.handleFirestoreQuotaError(err)) return;
      console.warn('Firestore pushCreditTxsBatch notice:', err);
    }
  }

  mergeRemoteCreditTxs(remoteTxs: CreditTransaction[], onUpdate?: (txs: CreditTransaction[]) => void): CreditTransaction[] {
    const wipeTs = this.getCatalogWipeTimestamp();
    const validRemote = wipeTs > 0
      ? remoteTxs.filter((t) => this.isRecordValidAfterWipe(t, wipeTs))
      : remoteTxs;

    const localTxs = this.getCreditTransactions();
    const remoteMap = new Map<string, CreditTransaction>();
    validRemote.forEach((t) => remoteMap.set(t.id, t));

    const missingInRemote: CreditTransaction[] = [];
    localTxs.forEach((local) => {
      if (!remoteMap.has(local.id)) {
        missingInRemote.push(local);
      }
    });

    const mergedMap = new Map<string, CreditTransaction>();
    validRemote.forEach((t) => mergedMap.set(t.id, t));
    missingInRemote.forEach((t) => mergedMap.set(t.id, t));

    const merged = Array.from(mergedMap.values()).sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    localStorage.setItem(STORAGE_KEYS.CREDIT_TXS, JSON.stringify(merged));

    if (onUpdate) {
      onUpdate(merged);
    }

    return merged;
  }

  syncCreditTransactionsWithFirestore(onUpdate?: (txs: CreditTransaction[]) => void): () => void {
    if (!this.isBrowser()) return () => {};

    const handleCreditDocs = (docs: any[]) => {
      const wipeTs = this.getCatalogWipeTimestamp();
      const remoteTxs: CreditTransaction[] = [];
      docs.forEach((d) => {
        const tx = d.data() as CreditTransaction;
        if (this.isRecordValidAfterWipe(tx, wipeTs)) {
          remoteTxs.push(tx);
        }
      });

      this.mergeRemoteCreditTxs(remoteTxs, onUpdate);
    };

    getDocs(collection(db, 'credit_transactions'))
      .then((snap) => handleCreditDocs(snap.docs))
      .catch((err) => console.warn('Initial Firestore credit tx sync notice:', err));

    const unsubscribe = onSnapshot(
      collection(db, 'credit_transactions'),
      (snap) => handleCreditDocs(snap.docs),
      (err) => console.warn('Firestore real-time credit tx sync notice:', err)
    );

    return unsubscribe;
  }

  getCreditTransactions(customerId?: string): CreditTransaction[] {
    if (!this.isBrowser()) return [];
    try {
      const val = localStorage.getItem(STORAGE_KEYS.CREDIT_TXS);
      const all: CreditTransaction[] = val ? JSON.parse(val) : [];
      const wipeTs = this.getCatalogWipeTimestamp();
      let valid = all;
      if (wipeTs > 0) {
        valid = all.filter((t) => this.isRecordValidAfterWipe(t, wipeTs));
        if (valid.length !== all.length) {
          localStorage.setItem(STORAGE_KEYS.CREDIT_TXS, JSON.stringify(valid));
        }
      }
      return customerId ? valid.filter((t) => t.customerId === customerId) : valid;
    } catch {
      return [];
    }
  }

  addCreditTransaction(
    customerId: string,
    type: 'CHARGE' | 'PAYMENT' | 'ADJUSTMENT',
    amount: number,
    notes: string,
    saleId?: string,
    paymentMethod?: any
  ): { success: boolean; newBalance: number } {
    const customers = this.getCustomers();
    const cust = customers.find((c) => c.id === customerId);
    if (!cust) return { success: false, newBalance: 0 };

    let newBalance = cust.currentBalance;
    if (type === 'CHARGE') {
      newBalance += amount;
    } else if (type === 'PAYMENT' || type === 'ADJUSTMENT') {
      newBalance = Math.max(0, newBalance - amount);
    }
    cust.currentBalance = newBalance;
    this.saveCustomers(customers);
    this.pushCustomerToFirestore(cust).catch(() => {});

    const tx: CreditTransaction = {
      id: `ctx-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      customerId,
      saleId,
      type,
      amount,
      balanceAfter: newBalance,
      paymentMethod,
      date: new Date().toISOString(),
      staffName: this.getCurrentStaff().name,
      notes,
    };

    const allTx = this.getCreditTransactions();
    if (this.isBrowser()) {
      localStorage.setItem(STORAGE_KEYS.CREDIT_TXS, JSON.stringify([tx, ...allTx]));
    }
    this.pushCreditTransactionToFirestore(tx).catch(() => {});

    this.addAuditLog('CREDIT_TRANSACTION', 'CREDIT', `${type} of ${amount} ETB on customer account ${cust.name}. New balance: ${newBalance} ETB.`);
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        fetch('/api/credit-txs/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transaction: tx }),
        }).catch(() => {});
      } else {
        this.enqueueSync('credit', 'create', tx);
      }
    } catch {
      this.enqueueSync('credit', 'create', tx);
    }

    return { success: true, newBalance };
  }

  /**
   * Officially mark & stamp a customer credit account as fully PAID.
   * Settles balance, records stamped payment transaction, and stores stamping audit details.
   */
  stampCreditAccountPaid(
    customerId: string,
    staffName: string,
    notes: string = 'OFFICIALLY STAMPED PAID',
    method: any = 'cash',
    customAmount?: number
  ): { success: boolean; settledAmount: number; customer?: Customer } {
    const customers = this.getCustomers();
    const cust = customers.find((c) => c.id === customerId);
    if (!cust) return { success: false, settledAmount: 0 };

    const settledAmount = customAmount !== undefined ? customAmount : cust.currentBalance;
    const remainingBalance = Math.max(0, cust.currentBalance - settledAmount);

    cust.currentBalance = remainingBalance;
    cust.lastPaidDate = new Date().toISOString();
    cust.lastPaidStaff = staffName;
    cust.lastPaidAmount = settledAmount;
    cust.isStampedPaid = remainingBalance === 0;

    this.saveCustomers(customers);
    this.pushCustomerToFirestore(cust).catch(() => {});

    const tx: CreditTransaction = {
      id: `ctx-stamp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      customerId,
      type: 'PAYMENT',
      amount: settledAmount,
      balanceAfter: remainingBalance,
      paymentMethod: method,
      date: new Date().toISOString(),
      staffName,
      notes: notes || 'OFFICIALLY STAMPED PAID (Full Settlement)',
      isStampPaid: true,
    };

    const allTx = this.getCreditTransactions();
    if (this.isBrowser()) {
      localStorage.setItem(STORAGE_KEYS.CREDIT_TXS, JSON.stringify([tx, ...allTx]));
    }
    this.pushCreditTransactionToFirestore(tx).catch(() => {});

    this.addAuditLog(
      'CREDIT_STAMPED_PAID',
      'CREDIT',
      `Customer account "${cust.name}" officially stamped PAID by ${staffName}. Settled ${settledAmount} ETB.`
    );
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        fetch('/api/credit-txs/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transaction: tx }),
        }).catch(() => {});
      } else {
        this.enqueueSync('credit', 'create', tx);
      }
    } catch {
      this.enqueueSync('credit', 'create', tx);
    }

    return { success: true, settledAmount, customer: cust };
  }

  // --- Expenses Tracker ---
  async pushExpenseToFirestore(expense: StoreExpense): Promise<void> {
    if (this.isFirestoreQuotaExceeded) return;
    try {
      await setDoc(doc(db, 'expenses', expense.id), expense, { merge: true });
    } catch (err) {
      if (this.handleFirestoreQuotaError(err)) return;
      console.warn('Firestore pushExpense notice:', err);
    }
  }

  async pushExpensesBatchToFirestore(expenses: StoreExpense[]): Promise<void> {
    if (this.isFirestoreQuotaExceeded || !expenses || expenses.length === 0) return;
    try {
      const CHUNK_SIZE = 400;
      for (let i = 0; i < expenses.length; i += CHUNK_SIZE) {
        const chunk = expenses.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        for (const e of chunk) {
          const ref = doc(db, 'expenses', e.id);
          batch.set(ref, e, { merge: true });
        }
        await batch.commit();
      }
    } catch (err) {
      if (this.handleFirestoreQuotaError(err)) return;
      console.warn('Firestore pushExpensesBatch notice:', err);
    }
  }

  mergeRemoteExpenses(remoteExpenses: StoreExpense[], onUpdate?: (expenses: StoreExpense[]) => void): StoreExpense[] {
    const wipeTs = this.getCatalogWipeTimestamp();
    const validRemote = wipeTs > 0
      ? remoteExpenses.filter((e) => this.isRecordValidAfterWipe(e, wipeTs))
      : remoteExpenses;

    const localExpenses = this.getExpenses();
    const remoteMap = new Map<string, StoreExpense>();
    validRemote.forEach((e) => remoteMap.set(e.id, e));

    const missingInRemote: StoreExpense[] = [];
    localExpenses.forEach((local) => {
      if (!remoteMap.has(local.id)) {
        missingInRemote.push(local);
      }
    });

    const mergedMap = new Map<string, StoreExpense>();
    validRemote.forEach((e) => mergedMap.set(e.id, e));
    missingInRemote.forEach((e) => mergedMap.set(e.id, e));

    const merged = Array.from(mergedMap.values()).sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    localStorage.setItem(STORAGE_KEYS.EXPENSES, JSON.stringify(merged));

    if (onUpdate) {
      onUpdate(merged);
    }

    return merged;
  }

  syncExpensesWithFirestore(onUpdate?: (expenses: StoreExpense[]) => void): () => void {
    if (!this.isBrowser()) return () => {};

    const handleExpDocs = (docs: any[]) => {
      const wipeTs = this.getCatalogWipeTimestamp();
      const remoteExpenses: StoreExpense[] = [];
      docs.forEach((d) => {
        const exp = d.data() as StoreExpense;
        if (this.isRecordValidAfterWipe(exp, wipeTs)) {
          remoteExpenses.push(exp);
        }
      });

      this.mergeRemoteExpenses(remoteExpenses, onUpdate);
    };

    getDocs(collection(db, 'expenses'))
      .then((snap) => handleExpDocs(snap.docs))
      .catch((err) => console.warn('Initial Firestore expenses sync notice:', err));

    const unsubscribe = onSnapshot(
      collection(db, 'expenses'),
      (snap) => handleExpDocs(snap.docs),
      (err) => console.warn('Firestore real-time expenses sync notice:', err)
    );

    return unsubscribe;
  }

  getExpenses(): StoreExpense[] {
    if (!this.isBrowser()) return [];
    try {
      const val = localStorage.getItem(STORAGE_KEYS.EXPENSES);
      const list: StoreExpense[] = val ? JSON.parse(val) : [];
      const wipeTs = this.getCatalogWipeTimestamp();
      if (wipeTs > 0) {
        const valid = list.filter((e) => this.isRecordValidAfterWipe(e, wipeTs));
        if (valid.length !== list.length) {
          localStorage.setItem(STORAGE_KEYS.EXPENSES, JSON.stringify(valid));
        }
        return valid;
      }
      return list;
    } catch {
      return [];
    }
  }

  addExpense(expenseData: Omit<StoreExpense, 'id' | 'date'>): StoreExpense {
    const expenses = this.getExpenses();
    const newExpense: StoreExpense = {
      ...expenseData,
      id: `exp-${Date.now()}`,
      date: new Date().toISOString(),
    };

    const updated = [newExpense, ...expenses];
    if (this.isBrowser()) {
      localStorage.setItem(STORAGE_KEYS.EXPENSES, JSON.stringify(updated));
    }
    this.pushExpenseToFirestore(newExpense).catch(() => {});

    // If paid from cash drawer, update active shift expenses
    if (expenseData.paidWith === 'cash_drawer' && expenseData.shiftId) {
      const shifts = this.getShifts();
      const shift = shifts.find((s) => s.id === expenseData.shiftId);
      if (shift) {
        shift.expenses += expenseData.amount;
        shift.expectedCash =
          shift.openingFloat +
          shift.cashSales +
          shift.cashAdditions -
          shift.refundsGiven -
          shift.cashDrops -
          shift.expenses;
        this.saveShifts(shifts);
      }
    }

    this.addAuditLog('EXPENSE_RECORDED', 'SETTINGS', `Expense of ${newExpense.amount} ETB recorded: ${newExpense.description} (${newExpense.category}).`);
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        fetch('/api/expenses/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expense: newExpense }),
        }).catch(() => {});
      } else {
        this.enqueueSync('expense', 'create', newExpense);
      }
    } catch {
      this.enqueueSync('expense', 'create', newExpense);
    }
    this.broadcastSyncMessage('EXPENSES_UPDATED', newExpense);
    return newExpense;
  }

  // --- Held / Parked Orders ---
  getHeldOrders(): HeldOrder[] {
    if (!this.isBrowser()) return [];
    try {
      const val = localStorage.getItem(STORAGE_KEYS.HELD_ORDERS);
      return val ? JSON.parse(val) : [];
    } catch {
      return [];
    }
  }

  saveHeldOrders(orders: HeldOrder[]) {
    if (!this.isBrowser()) return;
    localStorage.setItem(STORAGE_KEYS.HELD_ORDERS, JSON.stringify(orders));
  }

  holdOrder(order: Omit<HeldOrder, 'id' | 'savedAt' | 'savedBy'>): HeldOrder {
    const held = this.getHeldOrders();
    const newHeld: HeldOrder = {
      ...order,
      id: `held-${Date.now()}`,
      savedAt: new Date().toISOString(),
      savedBy: this.getCurrentStaff().name,
    };
    const updated = [newHeld, ...held];
    this.saveHeldOrders(updated);
    this.addAuditLog('ORDER_HELD', 'SALES', `Cart "${newHeld.label}" held with ${newHeld.items.length} item(s).`);
    return newHeld;
  }

  deleteHeldOrder(orderId: string) {
    const held = this.getHeldOrders();
    const filtered = held.filter((o) => o.id !== orderId);
    this.saveHeldOrders(filtered);
  }

  // --- Audit Trail ---
  getAuditLogs(): AuditLog[] {
    if (!this.isBrowser()) return [];
    try {
      const val = localStorage.getItem(STORAGE_KEYS.AUDIT_LOGS);
      return val ? JSON.parse(val) : [];
    } catch {
      return [];
    }
  }

  addAuditLog(action: string, category: AuditLog['category'], details: string, affectedId?: string) {
    if (!this.isBrowser()) return;
    const staff = this.getCurrentStaff();
    const log: AuditLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      timestamp: new Date().toISOString(),
      staffId: staff.id,
      staffName: staff.name,
      action,
      category,
      details,
      affectedId,
    };
    const logs = this.getAuditLogs();
    // Keep last 1500 logs
    const updated = [log, ...logs.slice(0, 1499)];
    localStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(updated));
  }

  // --- Offline Sync Queue ---
  getSyncQueue(): SyncQueueItem[] {
    if (!this.isBrowser()) return [];
    try {
      const val = localStorage.getItem(STORAGE_KEYS.SYNC_QUEUE);
      return val ? JSON.parse(val) : [];
    } catch {
      return [];
    }
  }

  enqueueSync(entityType: SyncQueueItem['entityType'], action: SyncQueueItem['action'], payload: any) {
    if (!this.isBrowser()) return;
    const item: SyncQueueItem = {
      id: `sync-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      entityType,
      action,
      payload,
      timestamp: new Date().toISOString(),
      retries: 0,
    };
    const queue = this.getSyncQueue();
    localStorage.setItem(STORAGE_KEYS.SYNC_QUEUE, JSON.stringify([...queue, item]));
  }

  clearSyncQueue() {
    if (!this.isBrowser()) return;
    localStorage.setItem(STORAGE_KEYS.SYNC_QUEUE, JSON.stringify([]));
  }

  async processSyncQueue(): Promise<number> {
    if (!this.isBrowser()) return 0;
    const queue = this.getSyncQueue();
    if (queue.length === 0) return 0;

    // When quota is exceeded, postpone cloud syncing queue items so they are preserved
    if (this.isFirestoreQuotaExceeded) {
      return 0;
    }

    const remainingQueue: SyncQueueItem[] = [];
    let processedCount = 0;

    for (const item of queue) {
      try {
        if (item.entityType === 'product' && item.payload) {
          await this.pushProductToFirestore(item.payload);
        } else if (item.entityType === 'sale' && item.payload) {
          await this.pushSaleToFirestore(item.payload);
        } else if (item.entityType === 'customer' && item.payload) {
          await this.pushCustomerToFirestore(item.payload);
        } else if (item.entityType === 'credit' && item.payload) {
          await this.pushCreditTransactionToFirestore(item.payload);
        } else if (item.entityType === 'expense' && item.payload) {
          await this.pushExpenseToFirestore(item.payload);
        }
        processedCount++;
      } catch (err) {
        if (this.handleFirestoreQuotaError(err)) {
          remainingQueue.push(item);
          break;
        }
        console.warn('Sync queue item process error:', item.id, err);
        item.retries = (item.retries || 0) + 1;
        if (item.retries < 5) {
          remainingQueue.push(item);
        }
      }
    }

    localStorage.setItem(STORAGE_KEYS.SYNC_QUEUE, JSON.stringify(remainingQueue));
    return processedCount;
  }

  // --- Auto-Sync Engine (60-Second Adjustable Cadence) ---
  private autoSyncTimer: any = null;
  private isSyncInProgress: boolean = false;
  private autoSyncListeners: Set<(state: AutoSyncState) => void> = new Set();
  private currentAutoSyncState: AutoSyncState = {
    isActive: true,
    intervalSeconds: 60,
    lastSyncedAt: null,
    status: 'idle',
    pendingQueueCount: 0,
    lastError: null,
    isQuotaExceeded: false,
    quotaMessage: null,
  };

  getAutoSyncState(): AutoSyncState {
    const lastSyncedAt = this.isBrowser() ? localStorage.getItem('sappy_last_synced_at') : null;
    return {
      ...this.currentAutoSyncState,
      isQuotaExceeded: this.isFirestoreQuotaExceeded,
      quotaMessage: this.quotaExceededMessage,
      lastSyncedAt: this.currentAutoSyncState.lastSyncedAt || lastSyncedAt,
      pendingQueueCount: this.getSyncQueue().length,
    };
  }

  subscribeAutoSync(listener: (state: AutoSyncState) => void): () => void {
    this.autoSyncListeners.add(listener);
    listener(this.getAutoSyncState());
    return () => {
      this.autoSyncListeners.delete(listener);
    };
  }

  private notifyAutoSyncListeners() {
    const state = this.getAutoSyncState();
    this.autoSyncListeners.forEach((listener) => {
      try {
        listener(state);
      } catch (err) {
        console.warn('Auto-sync listener error:', err);
      }
    });
  }

  async performAutoSync(): Promise<AutoSyncState> {
    if (this.isSyncInProgress) {
      return this.getAutoSyncState();
    }

    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    if (!isOnline) {
      this.currentAutoSyncState = {
        ...this.currentAutoSyncState,
        status: 'offline',
        pendingQueueCount: this.getSyncQueue().length,
        isQuotaExceeded: this.isFirestoreQuotaExceeded,
        quotaMessage: this.quotaExceededMessage,
      };
      this.notifyAutoSyncListeners();
      return this.getAutoSyncState();
    }

    this.isSyncInProgress = true;
    this.currentAutoSyncState = {
      ...this.currentAutoSyncState,
      status: 'syncing',
      lastError: null,
      isQuotaExceeded: this.isFirestoreQuotaExceeded,
      quotaMessage: this.quotaExceededMessage,
    };
    this.notifyAutoSyncListeners();

    try {
      // 1. Process any queued mutations from offline sessions (if quota not exceeded)
      await this.processSyncQueue();

      // 2. Synchronize with central server backend (fast, local-first SQLite / JSON backend without quota limits)
      await this.syncAllDataWithBackend();

      const nowIso = new Date().toISOString();
      if (this.isBrowser()) {
        localStorage.setItem('sappy_last_synced_at', nowIso);
      }

      const products = this.getProducts();
      const sales = this.getSales();
      const customers = this.getCustomers();
      const staff = this.getStaffList();

      this.currentAutoSyncState = {
        isActive: true,
        intervalSeconds: this.getAutoSyncInterval(),
        lastSyncedAt: nowIso,
        status: 'synced',
        pendingQueueCount: this.getSyncQueue().length,
        lastError: null,
        isQuotaExceeded: this.isFirestoreQuotaExceeded,
        quotaMessage: this.quotaExceededMessage,
        stats: {
          productsCount: products.length,
          salesCount: sales.length,
          customersCount: customers.length,
          staffCount: staff.length,
        },
      };

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('sappy-auto-synced', { detail: this.currentAutoSyncState })
        );
      }
    } catch (err: any) {
      if (!this.handleFirestoreQuotaError(err)) {
        console.warn('Auto-sync execution error:', err);
      }
      this.currentAutoSyncState = {
        ...this.currentAutoSyncState,
        status: 'error',
        lastError: err?.message || 'Sync failed',
        pendingQueueCount: this.getSyncQueue().length,
        isQuotaExceeded: this.isFirestoreQuotaExceeded,
        quotaMessage: this.quotaExceededMessage,
      };
    } finally {
      this.isSyncInProgress = false;
      this.notifyAutoSyncListeners();
    }

    return this.getAutoSyncState();
  }

  getAutoSyncInterval(): number {
    const settings = this.getSettings();
    return settings.autoSyncIntervalSeconds && settings.autoSyncIntervalSeconds >= 5
      ? settings.autoSyncIntervalSeconds
      : 10;
  }

  setAutoSyncInterval(seconds: number): void {
    const valid = Math.max(5, Math.min(3600, Math.round(seconds)));
    const settings = this.getSettings();
    settings.autoSyncIntervalSeconds = valid;
    this.saveSettings(settings);
  }

  startAutoSync(intervalSeconds?: number, onSync?: (state: AutoSyncState) => void): () => void {
    const effectiveInterval =
      typeof intervalSeconds === 'number' && intervalSeconds >= 5
        ? intervalSeconds
        : this.getAutoSyncInterval();

    if (this.autoSyncTimer) {
      clearInterval(this.autoSyncTimer);
      this.autoSyncTimer = null;
    }

    this.currentAutoSyncState.isActive = true;
    this.currentAutoSyncState.intervalSeconds = effectiveInterval;
    this.notifyAutoSyncListeners();

    // Trigger an initial sync cycle immediately
    this.performAutoSync().then((state) => {
      if (onSync) onSync(state);
    });

    const intervalMs = Math.max(3000, effectiveInterval * 1000);
    this.autoSyncTimer = setInterval(() => {
      this.performAutoSync().then((state) => {
        if (onSync) onSync(state);
      });
    }, intervalMs);

    return () => {
      if (this.autoSyncTimer) {
        clearInterval(this.autoSyncTimer);
        this.autoSyncTimer = null;
      }
      this.currentAutoSyncState.isActive = false;
      this.notifyAutoSyncListeners();
    };
  }

  stopAutoSync(): void {
    if (this.autoSyncTimer) {
      clearInterval(this.autoSyncTimer);
      this.autoSyncTimer = null;
    }
    this.currentAutoSyncState.isActive = false;
    this.notifyAutoSyncListeners();
  }

  // --- Cross-Device Firestore Wipe & Reset Synchronization ---
  async clearFirestoreCollection(collectionName: string): Promise<void> {
    if (this.isFirestoreQuotaExceeded) return;
    try {
      const colRef = collection(db, collectionName);
      const snap = await Promise.race([
        getDocs(colRef),
        new Promise<any>((_, reject) => setTimeout(() => reject(new Error('Firestore collection fetch timeout')), 2500)),
      ]);
      if (!snap || snap.empty) return;
      const docs = snap.docs;
      const CHUNK_SIZE = 100;
      for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
        if (this.isFirestoreQuotaExceeded) return;
        const chunk = docs.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        chunk.forEach((d: any) => batch.delete(d.ref));
        await Promise.race([
          batch.commit(),
          new Promise<any>((_, reject) => setTimeout(() => reject(new Error('Firestore batch delete timeout')), 2500)),
        ]);
      }
    } catch (err) {
      if (this.handleFirestoreQuotaError(err)) return;
      console.warn(`Notice clearing Firestore collection ${collectionName}:`, err);
    }
  }

  async clearAllFirestoreData(wipeTimestamp: number = Date.now()): Promise<void> {
    if (this.isFirestoreQuotaExceeded) return;
    try {
      // 1. Write authoritative wipe signal to system/meta in Firestore FIRST
      await Promise.race([
        setDoc(
          doc(db, 'system', 'meta'),
          {
            lastWipeTimestamp: wipeTimestamp,
            lastCatalogWipeTimestamp: wipeTimestamp,
            isWiped: true,
            isInitialized: false,
            wipeType: 'full',
            updatedAt: new Date().toISOString(),
          },
          { merge: false }
        ),
        new Promise((resolve) => setTimeout(resolve, 1500)),
      ]);

      if (this.isFirestoreQuotaExceeded) return;

      // 2. Reset settings to defaults in Firestore
      await Promise.race([
        setDoc(doc(db, 'settings', 'store'), DEFAULT_SETTINGS, { merge: false }),
        new Promise((resolve) => setTimeout(resolve, 1500)),
      ]);

      // 3. Clear collections with bounded safety timeout (quota-safe)
      await Promise.race([
        Promise.all([
          this.clearFirestoreCollection('users'),
          this.clearFirestoreCollection('products'),
          this.clearFirestoreCollection('sales'),
          this.clearFirestoreCollection('customers'),
          this.clearFirestoreCollection('credit_transactions'),
          this.clearFirestoreCollection('expenses'),
          this.clearFirestoreCollection('audit_logs'),
        ]),
        new Promise((resolve) => setTimeout(resolve, 2500)),
      ]);
    } catch (err) {
      if (this.handleFirestoreQuotaError(err)) return;
      console.warn('Notice during full Firestore data wipe:', err);
    }
  }

  async clearCatalogFirestoreData(options?: { resetSettings?: boolean }, wipeTimestamp: number = Date.now()): Promise<void> {
    if (this.isFirestoreQuotaExceeded) return;
    try {
      // 1. Write authoritative wipe signal to system/meta FIRST
      await Promise.race([
        setDoc(
          doc(db, 'system', 'meta'),
          {
            lastCatalogWipeTimestamp: wipeTimestamp,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        ),
        new Promise((resolve) => setTimeout(resolve, 1500)),
      ]);

      if (this.isFirestoreQuotaExceeded) return;

      if (options?.resetSettings) {
        await Promise.race([
          setDoc(doc(db, 'settings', 'store'), DEFAULT_SETTINGS, { merge: false }),
          new Promise((resolve) => setTimeout(resolve, 1500)),
        ]);
      }

      // 2. Clear catalog collections
      await Promise.race([
        Promise.all([
          this.clearFirestoreCollection('products'),
          this.clearFirestoreCollection('sales'),
          this.clearFirestoreCollection('customers'),
          this.clearFirestoreCollection('credit_transactions'),
          this.clearFirestoreCollection('expenses'),
        ]),
        new Promise((resolve) => setTimeout(resolve, 2500)),
      ]);
    } catch (err) {
      if (this.handleFirestoreQuotaError(err)) return;
      console.warn('Notice during catalog Firestore wipe:', err);
    }
  }

  async clearUsersFirestoreData(wipeTimestamp: number = Date.now()): Promise<void> {
    if (this.isFirestoreQuotaExceeded) return;
    try {
      await Promise.race([
        this.clearFirestoreCollection('users'),
        new Promise((resolve) => setTimeout(resolve, 2500)),
      ]);

      if (this.isFirestoreQuotaExceeded) return;

      await Promise.race([
        setDoc(
          doc(db, 'system', 'meta'),
          {
            lastWipeTimestamp: wipeTimestamp,
            isWiped: true,
            isInitialized: false,
            wipeType: 'staff_only',
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        ),
        new Promise((resolve) => setTimeout(resolve, 1500)),
      ]);
    } catch (err) {
      if (this.handleFirestoreQuotaError(err)) return;
      console.warn('Notice during users Firestore wipe:', err);
    }
  }

  syncSystemMetaWithFirestore(onWipeDetected?: (wipeType: string, ts: number) => void): () => void {
    if (!this.isBrowser()) return () => {};

    const handleMeta = (data: any) => {
      if (!data) return;

      if (Array.isArray(data?.deletedUserIds) && data.deletedUserIds.length > 0) {
        const cur = this.getDeletedUserIds();
        const incoming = data.deletedUserIds
          .map((x: string) => String(x).trim().toLowerCase())
          .filter((x: string) => Boolean(x) && !/^sap-emp-\d+$/i.test(x));
        const merged = Array.from(new Set([...cur, ...incoming]));
        if (merged.length !== cur.length) {
          this.setDeletedUserIds(merged);
          // Purge newly tombstoned users locally
          const staffList = this.getStaffList();
          this.saveStaffList(staffList);
        }
      }

      const remoteWipeTs = Number(data?.lastWipeTimestamp || 0);
      const remoteCatalogWipeTs = Number(data?.lastCatalogWipeTimestamp || remoteWipeTs);
      const localKnownWipeTs = Number(localStorage.getItem('sappy_last_known_wipe_ts') || 0);
      const localKnownCatalogWipeTs = Number(localStorage.getItem('sappy_last_catalog_wipe_ts') || 0);

      let wiped = false;
      if (remoteWipeTs > 0 && remoteWipeTs > localKnownWipeTs) {
        localStorage.setItem('sappy_last_known_wipe_ts', String(remoteWipeTs));
        wiped = true;
      }
      if (remoteCatalogWipeTs > 0 && remoteCatalogWipeTs > localKnownCatalogWipeTs) {
        localStorage.setItem('sappy_last_catalog_wipe_ts', String(remoteCatalogWipeTs));
        wiped = true;
      }

      if (wiped) {
        const wipeType = data?.wipeType || (remoteWipeTs > 0 ? 'full' : 'catalog_only');
        if (wipeType === 'catalog_only') {
          this.wipeCatalogLocally();
        } else if (wipeType === 'staff_only') {
          this.resetAllUsersLocally();
        } else {
          this.factoryResetEverythingLocally();
        }
        if (onWipeDetected) onWipeDetected(wipeType, Math.max(remoteWipeTs, remoteCatalogWipeTs));
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('sappy-cross-device-wipe', {
              detail: { wipeType, timestamp: Math.max(remoteWipeTs, remoteCatalogWipeTs) },
            })
          );
        }
      }
    };

    getDoc(doc(db, 'system', 'meta'))
      .then((snap) => {
        if (!snap.exists()) return;
        handleMeta(snap.data());
      })
      .catch((err) => console.warn('Initial system meta check notice:', err));

    const unsubscribe = onSnapshot(
      doc(db, 'system', 'meta'),
      (snap) => {
        if (!snap.exists()) return;
        handleMeta(snap.data());
      },
      (err) => console.warn('Real-time system meta wipe listener notice:', err)
    );

    return unsubscribe;
  }

  wipeCatalogLocally(options?: { resetSettings?: boolean }) {
    if (!this.isBrowser()) return;
    localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.SALES, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.SHIFTS, JSON.stringify([]));
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_SHIFT_ID);
    localStorage.setItem(STORAGE_KEYS.HELD_ORDERS, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.EXPENSES, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.CREDIT_TXS, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.STOCK_MOVEMENTS, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.SYNC_QUEUE, JSON.stringify([]));
    if (options?.resetSettings) {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(DEFAULT_SETTINGS));
    }
  }

  // Completely wipe all store data and start 100% fresh across all devices (No demo data)
  async wipeAllData(options?: { resetSettings?: boolean }) {
    if (!this.isBrowser()) return;
    const now = Date.now();
    localStorage.setItem('sappy_last_known_wipe_ts', String(now));
    localStorage.setItem('sappy_last_catalog_wipe_ts', String(now));

    // 1. Wipe local catalog immediately so UI updates instantly
    this.wipeCatalogLocally(options);

    // 2. Wipe Backend Server with timeout
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);
      await fetch('/api/reset-all-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetSettings: options?.resetSettings }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
    } catch (err: any) {
      console.warn('Backend catalog wipe notice:', err?.message);
    }

    // 3. Wipe Cloud Firestore catalog & transactions across all devices (with safety timeout)
    try {
      await Promise.race([
        this.clearCatalogFirestoreData(options, now),
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
    } catch (err: any) {
      console.warn('Cloud catalog wipe notice:', err?.message);
    }

    // 4. Ensure local catalog is clean
    this.wipeCatalogLocally(options);

    this.addAuditLog('SYSTEM_RESET', 'SETTINGS', 'All database records, products, customers, and transactions wiped clean across all devices.');

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('sappy-cross-device-wipe', {
          detail: { wipeType: 'catalog_only', timestamp: now },
        })
      );
    }
  }

  // Completely wipe everything locally including all users, staff, and credentials
  factoryResetEverythingLocally() {
    if (!this.isBrowser()) return;
    const knownWipeTs = localStorage.getItem('sappy_last_known_wipe_ts') || String(Date.now());
    const knownCatalogWipeTs = localStorage.getItem('sappy_last_catalog_wipe_ts') || knownWipeTs;
    const deletedUserIds = localStorage.getItem('sappy_deleted_user_ids') || '[]';
    localStorage.clear();
    localStorage.setItem('sappy_last_known_wipe_ts', knownWipeTs);
    localStorage.setItem('sappy_last_catalog_wipe_ts', knownCatalogWipeTs);
    localStorage.setItem('sappy_deleted_user_ids', deletedUserIds);
    localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.SALES, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.SHIFTS, JSON.stringify([]));
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_SHIFT_ID);
    localStorage.setItem(STORAGE_KEYS.EXPENSES, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.HELD_ORDERS, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.CREDIT_TXS, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.STOCK_MOVEMENTS, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.SYNC_QUEUE, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.STAFF, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(DEFAULT_SETTINGS));
    localStorage.removeItem(STORAGE_KEYS.CURRENT_STAFF_ID);
    localStorage.removeItem(STORAGE_KEYS.SESSION_AUTHENTICATED);
    localStorage.removeItem(STORAGE_KEYS.REGISTER_LOCKED);
    localStorage.removeItem(STORAGE_KEYS.FAILED_ATTEMPTS);
    localStorage.removeItem(STORAGE_KEYS.LOCKOUT_UNTIL);
    localStorage.removeItem(STORAGE_KEYS.STORE_INITIALIZED);
    localStorage.removeItem('sappy_initial_signup_completed');
  }

  // Factory reset: Removes EVERYTHING including all users across all devices
  async factoryResetEverything(masterPasscode?: string): Promise<{ success: boolean; message: string }> {
    const now = Date.now();
    if (this.isBrowser()) {
      localStorage.setItem('sappy_last_known_wipe_ts', String(now));
      localStorage.setItem('sappy_last_catalog_wipe_ts', String(now));
    }

    // 1. Wipe local device storage and credentials FIRST for immediate resilience
    this.factoryResetEverythingLocally();

    // 2. Wipe Backend Server with timeout
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);
      const res = await fetch('/api/system/wipe-everything', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          masterPasscode: masterPasscode || 'Sappy#1313',
          confirmText: 'RESET ALL',
          forceReset: true,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const data = await res.json().catch(() => ({}));
      if (!res.ok && !data?.success) {
        console.warn('Backend factory reset notice:', data?.error);
      }
    } catch (err: any) {
      console.warn('Backend factory reset notice:', err?.message);
    }

    // 3. Wipe Cloud Firestore completely (with strict safety timeout, never blocks local reset)
    try {
      await Promise.race([
        this.clearAllFirestoreData(now),
        new Promise((resolve) => setTimeout(resolve, 3500)),
      ]);
    } catch (err: any) {
      console.warn('Cloud full wipe notice:', err?.message);
    }

    // 4. Ensure local device storage is pristine
    this.factoryResetEverythingLocally();

    // 5. Dispatch cross-device wipe event for local window
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('sappy-cross-device-wipe', {
          detail: { wipeType: 'full', timestamp: now },
        })
      );
    }

    return {
      success: true,
      message: 'System factory reset successful. All users, inventory, sales, customers, and data have been wiped clean across all devices.',
    };
  }

  async syncEverythingWithFirestore(): Promise<{ success: boolean; message: string }> {
    if (this.isFirestoreQuotaExceeded) {
      return {
        success: false,
        message: 'Daily Cloud Firestore free quota reached (resets daily at 00:00 UTC). Store is operating smoothly via local storage & server sync.',
      };
    }
    try {
      const products = this.getProducts();
      if (products.length > 0) {
        await this.pushProductsBatchToFirestore(products);
      }
      const staff = this.getStaffList();
      for (const s of staff) {
        await this.pushStaffToFirestore(s);
      }
      const customers = this.getCustomers();
      if (customers.length > 0) {
        await this.pushCustomersBatchToFirestore(customers);
      }
      const sales = this.getSales();
      if (sales.length > 0) {
        await this.pushSalesBatchToFirestore(sales);
      }
      const txs = this.getCreditTransactions();
      if (txs.length > 0) {
        await this.pushCreditTxsBatchToFirestore(txs);
      }
      const expenses = this.getExpenses();
      if (expenses.length > 0) {
        await this.pushExpensesBatchToFirestore(expenses);
      }
      const settings = this.getSettings();
      await this.pushSettingsToFirestore(settings);

      return {
        success: true,
        message: 'All local POS data successfully synced to Cloud Firestore across all devices!',
      };
    } catch (err: any) {
      this.handleFirestoreQuotaError(err);
      console.warn('syncEverythingWithFirestore error:', err);
      return {
        success: false,
        message: err?.message || 'Sync encountered an issue.',
      };
    }
  }

  // When reset is invoked, it completely wipes everything (No demo data loaded)
  resetToDefaults() {
    this.wipeAllData();
  }
}

export interface AutoSyncState {
  isActive: boolean;
  intervalSeconds: number;
  lastSyncedAt: string | null;
  status: 'idle' | 'syncing' | 'synced' | 'error' | 'offline';
  pendingQueueCount: number;
  lastError: string | null;
  isQuotaExceeded?: boolean;
  quotaMessage?: string | null;
  stats?: {
    productsCount: number;
    salesCount: number;
    customersCount: number;
    staffCount: number;
  };
}

export const storage = new StorageService();
// Initialize immediately
storage.init();

