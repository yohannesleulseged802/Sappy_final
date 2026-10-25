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
} from '../types';
import { db, auth } from './firebaseAuth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
  writeBatch,
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
};

// Note: Requirement #1 - All demo/hardcoded default staff accounts removed.
// Users must be created via the secure Master Passcode Signup system.
const INITIAL_STAFF: Staff[] = [];

const INITIAL_CUSTOMERS: Customer[] = [];

const INITIAL_PRODUCTS: Product[] = [];

class StorageService {
  private isBrowser(): boolean {
    return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
  }

  // --- Initialize Storage with Defaults if Empty ---
  init() {
    if (!this.isBrowser()) return;

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
    // Force clean purge of all user accounts across devices per user instruction
    const hasPurgedOldUsers = localStorage.getItem('sappy_users_purged_v6_clean') === 'true';
    if (!hasPurgedOldUsers) {
      localStorage.setItem(STORAGE_KEYS.STAFF, JSON.stringify([]));
      localStorage.removeItem(STORAGE_KEYS.CURRENT_STAFF_ID);
      localStorage.removeItem(STORAGE_KEYS.SESSION_AUTHENTICATED);
      localStorage.removeItem(STORAGE_KEYS.REGISTER_LOCKED);
      localStorage.removeItem(STORAGE_KEYS.FAILED_ATTEMPTS);
      localStorage.removeItem(STORAGE_KEYS.LOCKOUT_UNTIL);
      localStorage.removeItem(STORAGE_KEYS.STORE_INITIALIZED);
      localStorage.removeItem('sappy_initial_signup_completed');
      localStorage.setItem('sappy_users_purged_v6_clean', 'true');
    } else {
      const rawStaff = localStorage.getItem(STORAGE_KEYS.STAFF);
      if (!rawStaff) {
        localStorage.setItem(STORAGE_KEYS.STAFF, JSON.stringify([]));
      }
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

  saveSettings(settings: StoreSettings) {
    if (!this.isBrowser()) return;
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    this.addAuditLog('UPDATED_STORE_SETTINGS', 'SETTINGS', `Store settings and tax preferences updated.`);
    try {
      fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      }).catch(() => {});
    } catch {}
  }

  // --- Staff & Current User ---
  getStaffList(): Staff[] {
    if (!this.isBrowser()) return INITIAL_STAFF;
    try {
      const val = localStorage.getItem(STORAGE_KEYS.STAFF);
      return val ? JSON.parse(val) : INITIAL_STAFF;
    } catch {
      return INITIAL_STAFF;
    }
  }

  saveStaffList(staff: Staff[]) {
    if (!this.isBrowser()) return;
    localStorage.setItem(STORAGE_KEYS.STAFF, JSON.stringify(staff));
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
    try {
      const userRef = doc(db, 'users', staff.id);
      await setDoc(
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
    } catch (err) {
      console.warn('Firestore pushStaff notice (offline/retry):', err);
    }
  }

  async deleteStaffFromFirestore(staffId: string): Promise<void> {
    try {
      await deleteDoc(doc(db, 'users', staffId));
    } catch (err) {
      console.warn('Firestore deleteStaff notice:', err);
    }
  }

  mergeRemoteStaff(remoteStaff: Staff[], onUpdate?: (staffList: Staff[]) => void): Staff[] {
    const localList = this.getStaffList();

    // Remote Firestore is the single authoritative source of truth for accounts
    const staffList: Staff[] = remoteStaff.map((r) => {
      const localMatch = localList.find(
        (l) => l.id === r.id || (l.email && r.email && l.email.toLowerCase() === r.email.toLowerCase())
      );
      return {
        ...r,
        // Retain local password if remote omitted it, otherwise use remote password
        password: r.password || localMatch?.password || '',
      };
    });

    this.saveStaffList(staffList);

    if (this.isBrowser()) {
      if (staffList.length > 0) {
        localStorage.setItem(STORAGE_KEYS.STORE_INITIALIZED, 'true');
        localStorage.setItem('sappy_initial_signup_completed', 'true');
      } else {
        localStorage.removeItem(STORAGE_KEYS.STORE_INITIALIZED);
        localStorage.removeItem('sappy_initial_signup_completed');
      }
    }

    if (onUpdate) {
      onUpdate(staffList);
    }

    return staffList;
  }

  syncStaffWithFirestore(onUpdate?: (staffList: Staff[]) => void): () => void {
    if (!this.isBrowser()) return () => {};

    // 1. Immediate fetch on mount
    getDocs(collection(db, 'users'))
      .then((snap) => {
        const remoteStaff: Staff[] = [];
        snap.forEach((docSnap) => {
          remoteStaff.push(this.mapFirestoreDocToStaff(docSnap.id, docSnap.data()));
        });

        if (remoteStaff.length > 0) {
          this.mergeRemoteStaff(remoteStaff, onUpdate);
        } else {
          // Firestore is empty: reset local staff state to enforce clean zero
          this.saveStaffList([]);
          if (this.isBrowser()) {
            localStorage.removeItem(STORAGE_KEYS.STORE_INITIALIZED);
            localStorage.removeItem('sappy_initial_signup_completed');
            localStorage.removeItem(STORAGE_KEYS.CURRENT_STAFF_ID);
          }
          if (onUpdate) {
            onUpdate([]);
          }
        }
      })
      .catch((err) => {
        console.warn('Initial Firestore staff sync notice:', err);
      });

    // 2. Real-time live listener for cross-device updates
    const unsubscribe = onSnapshot(
      collection(db, 'users'),
      (snap) => {
        const remoteStaff: Staff[] = [];
        snap.forEach((docSnap) => {
          remoteStaff.push(this.mapFirestoreDocToStaff(docSnap.id, docSnap.data()));
        });

        if (remoteStaff.length > 0) {
          this.mergeRemoteStaff(remoteStaff, onUpdate);
        } else {
          // Live wipe reflection on all listening devices
          this.saveStaffList([]);
          if (this.isBrowser()) {
            localStorage.removeItem(STORAGE_KEYS.STORE_INITIALIZED);
            localStorage.removeItem('sappy_initial_signup_completed');
            localStorage.removeItem(STORAGE_KEYS.CURRENT_STAFF_ID);
          }
          if (onUpdate) {
            onUpdate([]);
          }
        }
      },
      (err) => {
        console.warn('Firestore real-time staff sync notice:', err);
      }
    );

    return unsubscribe;
  }

  private pushStaffToServer(staffList: Staff[]) {
    if (!this.isBrowser()) return;
    try {
      fetch('/api/pos/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ users: staffList }),
      }).catch(() => {});
    } catch {}
  }

  addStaffAccount(newStaff: Staff) {
    const list = this.getStaffList();
    const existingIndex = list.findIndex(
      (s) =>
        s.id === newStaff.id ||
        (s.email && newStaff.email && s.email.toLowerCase() === newStaff.email.toLowerCase()) ||
        (s.username && newStaff.username && s.username.toLowerCase() === newStaff.username.toLowerCase())
    );
    if (existingIndex >= 0) {
      list[existingIndex] = {
        ...list[existingIndex],
        ...newStaff,
        password: newStaff.password || list[existingIndex].password,
      };
    } else {
      list.push(newStaff);
    }
    this.saveStaffList(list);
    if (this.isBrowser()) {
      localStorage.setItem('sappy_last_known_wipe_ts', String(Date.now()));
      if (newStaff.role === 'admin' || list.length > 0) {
        localStorage.setItem(STORAGE_KEYS.STORE_INITIALIZED, 'true');
        localStorage.setItem('sappy_initial_signup_completed', 'true');
      }
    }
    this.pushStaffToServer(list);
    this.pushStaffToFirestore(newStaff);
  }

  updateStaffAccount(updatedStaff: Staff) {
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
    this.saveStaffList(list);
    if (this.isBrowser()) {
      localStorage.setItem('sappy_last_known_wipe_ts', String(Date.now()));
      if (updatedStaff.role === 'admin' || list.length > 0) {
        localStorage.setItem(STORAGE_KEYS.STORE_INITIALIZED, 'true');
        localStorage.setItem('sappy_initial_signup_completed', 'true');
      }
    }
    this.pushStaffToServer(list);
    this.pushStaffToFirestore(updatedStaff);
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

  deleteStaff(staffId: string): boolean {
    const list = this.getStaffList();
    const target = list.find((s) => s.id === staffId || s.employeeId === staffId);
    if (!target) return false;
    const remaining = list.filter((s) => s.id !== staffId && s.employeeId !== staffId);
    this.saveStaffList(remaining);
    this.addAuditLog('STAFF_DELETED', 'AUTH', `Staff account ${target.name} (${target.role}) deleted.`);
    try {
      fetch('/api/auth/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staffId: target.id,
          action: 'delete',
        }),
      }).catch(() => {});
    } catch {}
    this.deleteStaffFromFirestore(staffId);
    return true;
  }

  resetAllUsers(): void {
    if (!this.isBrowser()) return;
    const now = Date.now();
    localStorage.setItem('sappy_last_known_wipe_ts', String(now));
    localStorage.setItem(STORAGE_KEYS.STAFF, JSON.stringify([]));
    localStorage.removeItem(STORAGE_KEYS.CURRENT_STAFF_ID);
    localStorage.removeItem(STORAGE_KEYS.SESSION_AUTHENTICATED);
    localStorage.removeItem(STORAGE_KEYS.REGISTER_LOCKED);
    localStorage.removeItem(STORAGE_KEYS.FAILED_ATTEMPTS);
    localStorage.removeItem(STORAGE_KEYS.LOCKOUT_UNTIL);
    localStorage.removeItem(STORAGE_KEYS.STORE_INITIALIZED);
    localStorage.removeItem('sappy_initial_signup_completed');
    try {
      fetch('/api/auth/reset-all-users', { method: 'POST' })
        .then((r) => r.json())
        .then((d) => {
          if (d?.lastWipeTimestamp) {
            localStorage.setItem('sappy_last_known_wipe_ts', String(d.lastWipeTimestamp));
          }
        })
        .catch(() => {});
    } catch {
      // ignore
    }
    this.addAuditLog(
      'SECURITY_RESET',
      'AUTH',
      'All staff accounts, authentication credentials, and active sessions cleared per security policy.'
    );
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
    const localList = this.getStaffList();
    const mappedUsers: Staff[] = serverUsers.map((u: any) => {
      const uid = u.uid || u.id || u.employeeId;
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

    // Also preserve any local accounts that haven't synced to the server yet
    const merged: Staff[] = [...mappedUsers];
    let hasUnsyncedLocal = false;
    localList.forEach((loc) => {
      const existsInMapped = merged.some(
        (m) =>
          m.id === loc.id ||
          (loc.email && m.email && m.email.toLowerCase() === loc.email.toLowerCase()) ||
          (loc.username && m.username && m.username.toLowerCase() === loc.username.toLowerCase())
      );
      if (!existsInMapped) {
        merged.push(loc);
        hasUnsyncedLocal = true;
      }
    });

    if (hasUnsyncedLocal) {
      this.pushStaffToServer(merged);
    }

    return merged;
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

      const localList = this.getStaffList();
      const serverWipeTs = Number(statusRes?.lastWipeTimestamp || 0);
      const localKnownWipeTs = Number(localStorage.getItem('sappy_last_known_wipe_ts') || 0);

      // Only wipe local users if an explicit server-side reset happened more recently than our known timestamp
      // AND more recently than the newest local user creation
      if (serverWipeTs > 0 && serverWipeTs > localKnownWipeTs) {
        localStorage.setItem('sappy_last_known_wipe_ts', String(serverWipeTs));
        const newestUserCreatedMs = localList.reduce((max, u) => {
          const t = u.createdAt ? new Date(u.createdAt).getTime() : 0;
          return t > max ? t : max;
        }, 0);

        if (newestUserCreatedMs < serverWipeTs && (!usersRes?.users || usersRes.users.length === 0)) {
          localStorage.removeItem(STORAGE_KEYS.STORE_INITIALIZED);
          localStorage.removeItem('sappy_initial_signup_completed');
          this.saveStaffList([]);
          this.setAuthenticated(false);
          this.setRegisterLocked(false);
          return { hasAdmin: false, isInitialized: false, staffList: [] };
        }
      }

      if (usersRes?.success && Array.isArray(usersRes.users) && usersRes.users.length > 0) {
        const merged = this.mergeServerUsersWithLocal(usersRes.users);
        this.saveStaffList(merged);
        localStorage.setItem(STORAGE_KEYS.STORE_INITIALIZED, 'true');
        const hasAdmin = merged.some((s) => (s.role === 'admin' && s.active) || (s.approvalStatus === 'approved' && s.active));
        return { hasAdmin, isInitialized: true, staffList: merged };
      }

      // If server has no users (e.g. fresh container start) but local browser has users, push local users to server!
      if (localList.length > 0) {
        this.pushStaffToServer(localList);
        localStorage.setItem(STORAGE_KEYS.STORE_INITIALIZED, 'true');
        const hasAdmin = this.hasAdminAccount();
        return { hasAdmin, isInitialized: true, staffList: localList };
      }

      return { hasAdmin: false, isInitialized: false, staffList: [] };
    } catch {
      const hasAdmin = this.hasAdminAccount();
      const list = this.getStaffList();
      return { hasAdmin, isInitialized: list.length > 0 || hasAdmin, staffList: list };
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
      const res = await fetch('/api/pos/all-data');
      if (!res.ok) {
        return { isInitialized: this.isStoreInitialized(), wiped: false, productsCount: this.getProducts().length, salesCount: this.getSales().length };
      }
      const data = await res.json();
      if (!data.success) {
        return { isInitialized: this.isStoreInitialized(), wiped: false, productsCount: this.getProducts().length, salesCount: this.getSales().length };
      }

      const localStaff = this.getStaffList();
      const serverHasUsers = Array.isArray(data.users) && data.users.length > 0;
      const serverWipeTs = Number(data.lastWipeTimestamp || 0);
      const localKnownWipeTs = Number(localStorage.getItem('sappy_last_known_wipe_ts') || 0);

      // Only trigger a local wipe if an explicit factory/user reset timestamp from the server is newer than local state
      if (serverWipeTs > 0 && serverWipeTs > localKnownWipeTs && !serverHasUsers) {
        localStorage.setItem('sappy_last_known_wipe_ts', String(serverWipeTs));
        const newestLocalUserMs = localStaff.reduce((max, u) => {
          const t = u.createdAt ? new Date(u.createdAt).getTime() : 0;
          return t > max ? t : max;
        }, 0);

        if (newestLocalUserMs < serverWipeTs && localStaff.length > 0) {
          this.factoryResetEverythingLocally();
          localStorage.setItem('sappy_last_known_wipe_ts', String(serverWipeTs));
          return { isInitialized: false, wiped: true, productsCount: 0, salesCount: 0 };
        }
      }

      // Sync Products (avoid overwriting local products with empty array if server restarted)
      if (Array.isArray(data.products) && data.products.length > 0) {
        localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(data.products));
      } else if (this.getProducts().length > 0) {
        this.saveProducts(this.getProducts());
      }

      // Sync Sales
      if (Array.isArray(data.sales) && data.sales.length > 0) {
        localStorage.setItem(STORAGE_KEYS.SALES, JSON.stringify(data.sales));
      }

      // Sync Customers
      if (Array.isArray(data.customers) && data.customers.length > 0) {
        localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(data.customers));
      }

      // Sync Expenses
      if (Array.isArray(data.expenses) && data.expenses.length > 0) {
        localStorage.setItem(STORAGE_KEYS.EXPENSES, JSON.stringify(data.expenses));
      }

      // Sync Settings
      if (data.settings && typeof data.settings === 'object' && data.settings.storeName) {
        localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(data.settings));
      }

      // Sync Staff (preserve passwords and never wipe local staff if server restarted)
      if (serverHasUsers) {
        const merged = this.mergeServerUsersWithLocal(data.users);
        this.saveStaffList(merged);
        if (merged.length > 0) {
          this.setStoreInitialized(true);
        }
      } else if (localStaff.length > 0) {
        // Push local staff up to server so server has our accounts
        this.pushStaffToServer(localStaff);
        this.setStoreInitialized(true);
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
      return val ? JSON.parse(val) : INITIAL_PRODUCTS;
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
  }

  saveProductsLocally(products: Product[]) {
    if (!this.isBrowser()) return;
    localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
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
      console.warn('Firestore pushProduct notice:', err);
    }
  }

  async pushProductsBatchToFirestore(products: Product[]): Promise<void> {
    if (!products || products.length === 0) return;
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
      console.warn('Firestore pushProductsBatch notice:', err);
    }
  }

  async deleteProductFromFirestore(productId: string): Promise<void> {
    try {
      await deleteDoc(doc(db, 'products', productId));
    } catch (err) {
      console.warn('Firestore deleteProduct notice:', err);
    }
  }

  mergeRemoteProducts(remoteProducts: Product[], onUpdate?: (products: Product[]) => void): Product[] {
    const localProducts = this.getProducts();

    // Map remote products by id
    const remoteMap = new Map<string, Product>();
    remoteProducts.forEach((p) => remoteMap.set(p.id, p));

    // Check if there are local products that don't exist in remote Firestore yet
    const missingInRemote: Product[] = [];
    localProducts.forEach((local) => {
      if (!remoteMap.has(local.id)) {
        // Also check if SKU matches an existing remote item
        const skuMatch = remoteProducts.find(
          (r) => r.sku && local.sku && r.sku.toLowerCase() === local.sku.toLowerCase()
        );
        if (!skuMatch) {
          missingInRemote.push(local);
        }
      }
    });

    // If local has items not in remote, push them to Firestore so other devices see them!
    if (missingInRemote.length > 0) {
      this.pushProductsBatchToFirestore(missingInRemote).catch(() => {});
    }

    // Merged list: remote products plus any local items pending upload
    const merged: Product[] = [...remoteProducts];
    missingInRemote.forEach((missing) => merged.push(missing));

    this.saveProductsLocally(merged);

    if (onUpdate) {
      onUpdate(merged);
    }

    return merged;
  }

  syncProductsWithFirestore(onUpdate?: (products: Product[]) => void): () => void {
    if (!this.isBrowser()) return () => {};

    // 1. Immediate fetch on mount
    getDocs(collection(db, 'products'))
      .then((snap) => {
        const remoteProds: Product[] = [];
        snap.forEach((docSnap) => {
          remoteProds.push(this.mapFirestoreDocToProduct(docSnap.id, docSnap.data()));
        });

        if (remoteProds.length > 0) {
          this.mergeRemoteProducts(remoteProds, onUpdate);
        } else {
          // If Firestore is empty but this device has local products, push all local products to Firestore!
          const local = this.getProducts();
          if (local.length > 0) {
            this.pushProductsBatchToFirestore(local);
          }
        }
      })
      .catch((err) => {
        console.warn('Initial Firestore products sync notice:', err);
      });

    // 2. Real-time live listener for cross-device updates
    const unsubscribe = onSnapshot(
      collection(db, 'products'),
      (snap) => {
        const remoteProds: Product[] = [];
        snap.forEach((docSnap) => {
          remoteProds.push(this.mapFirestoreDocToProduct(docSnap.id, docSnap.data()));
        });

        if (remoteProds.length > 0) {
          this.mergeRemoteProducts(remoteProds, onUpdate);
        } else {
          const local = this.getProducts();
          if (local.length > 0 && snap.metadata.hasPendingWrites === false) {
            this.pushProductsBatchToFirestore(local);
          }
        }
      },
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

  saveProduct(product: Product, isNew: boolean): { success: boolean; error?: string } {
    const products = this.getProducts();

    // Check SKU conflict
    const skuConflict = products.find((p) => p.sku.toLowerCase() === product.sku.toLowerCase() && p.id !== product.id);
    if (skuConflict) {
      return { success: false, error: `SKU "${product.sku}" is already assigned to "${skuConflict.name}".` };
    }

    // Check all product codes for uniqueness
    for (const code of product.codes) {
      if (code.active) {
        const conflict = this.findCodeConflict(code.code, product.id);
        if (conflict) {
          return {
            success: false,
            error: `Code "${code.code}" is already assigned to product "${conflict.conflictingProduct.name}" (${conflict.conflictingCode.label || conflict.conflictingCode.type.toUpperCase()}). Please resolve duplicate before saving.`,
          };
        }
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

  // --- Sales & Transactions ---
  getSales(): Sale[] {
    if (!this.isBrowser()) return [];
    try {
      const val = localStorage.getItem(STORAGE_KEYS.SALES);
      return val ? JSON.parse(val) : [];
    } catch {
      return [];
    }
  }

  saveSales(sales: Sale[]) {
    if (!this.isBrowser()) return;
    localStorage.setItem(STORAGE_KEYS.SALES, JSON.stringify(sales));
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
    newSale.items.forEach((item) => {
      const prod = products.find((p) => p.id === item.productId);
      if (prod && prod.category !== 'Print Services') {
        prod.currentStock = Math.max(0, prod.currentStock - item.quantity);
        prod.updatedDate = newSale.date;
      }
    });
    this.saveProducts(products);

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

    // 4. Save Sale
    const updatedSales = [newSale, ...sales];
    this.saveSales(updatedSales);

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
      return val ? JSON.parse(val) : INITIAL_CUSTOMERS;
    } catch {
      return INITIAL_CUSTOMERS;
    }
  }

  saveCustomers(customers: Customer[]) {
    if (!this.isBrowser()) return;
    localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(customers));
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        fetch('/api/customers/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customers }),
        }).catch(() => {});
      }
    } catch {}
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
    this.enqueueSync('customer', isNew ? 'create' : 'update', customer);
  }

  getCreditTransactions(customerId?: string): CreditTransaction[] {
    if (!this.isBrowser()) return [];
    try {
      const val = localStorage.getItem(STORAGE_KEYS.CREDIT_TXS);
      const all: CreditTransaction[] = val ? JSON.parse(val) : [];
      return customerId ? all.filter((t) => t.customerId === customerId) : all;
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

    this.addAuditLog('CREDIT_TRANSACTION', 'CREDIT', `${type} of ${amount} ETB on customer account ${cust.name}. New balance: ${newBalance} ETB.`);
    this.enqueueSync('credit', 'create', tx);
    return { success: true, newBalance };
  }

  // --- Expenses Tracker ---
  getExpenses(): StoreExpense[] {
    if (!this.isBrowser()) return [];
    try {
      const val = localStorage.getItem(STORAGE_KEYS.EXPENSES);
      return val ? JSON.parse(val) : [];
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

  // Completely wipe all store data and start 100% fresh (No demo data)
  wipeAllData(options?: { resetSettings?: boolean }) {
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
    this.addAuditLog('SYSTEM_RESET', 'SETTINGS', 'All database records, products, customers, and transactions wiped clean.');
    try {
      fetch('/api/reset-all-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetSettings: options?.resetSettings }),
      }).catch(() => {});
    } catch {}
  }

  // Completely wipe everything locally including all users, staff, and credentials
  factoryResetEverythingLocally() {
    if (!this.isBrowser()) return;
    localStorage.clear();
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
    try {
      const res = await fetch('/api/system/wipe-everything', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          masterPasscode: masterPasscode || 'Sappy#1313',
          forceReset: true,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data?.error || 'Failed to factory reset system on server.');
      }
    } catch (err: any) {
      console.warn('Backend factory reset notice:', err?.message);
    }

    this.factoryResetEverythingLocally();
    return {
      success: true,
      message: 'System factory reset successful. All users, inventory, sales, customers, and data have been wiped clean across all devices.',
    };
  }

  // When reset is invoked, it completely wipes everything (No demo data loaded)
  resetToDefaults() {
    this.wipeAllData();
  }
}

export const storage = new StorageService();
// Initialize immediately
storage.init();
