/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {useState, useEffect, useCallback, useRef} from 'react';
import {
  Product,
  Sale,
  Staff,
  StoreSettings,
  LabelItem,
} from './types';
import {storage} from './services/storage';
import {sound} from './services/sound';
import {useHardwareScanner} from './hooks/useBarcodeScanner';

// Layout Components
import {Navbar} from './components/layout/Navbar';
import {Sidebar, NavSection} from './components/layout/Sidebar';
import {MobileNav} from './components/layout/MobileNav';

// Common Modals & Security Overlays
import {PinModal} from './components/common/PinModal';
import {KeyboardShortcutsModal} from './components/common/KeyboardShortcutsModal';
import {UserProfileModal} from './components/common/UserProfileModal';

// Views
import {LoginView} from './views/LoginView';
import {DashboardView} from './views/DashboardView';
import {PosRegisterView} from './views/PosRegisterView';
import {InventoryView} from './views/InventoryView';
import {BarcodeStudioView} from './views/BarcodeStudioView';
import {SalesLedgerView} from './views/SalesLedgerView';
import {CreditAccountsView} from './views/CreditAccountsView';
import {ExpensesView} from './views/ExpensesView';
import {ReportsView} from './views/ReportsView';
import {StaffView} from './views/StaffView';
import {AuditLogsView} from './views/AuditLogsView';
import {SettingsView} from './views/SettingsView';

export default function App() {
  // Authentication Session State
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => storage.isAuthenticated());

  // Online / Offline Connectivity State
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  // Global Domain State
  const [currentStaff, setCurrentStaff] = useState<Staff>(() => storage.getCurrentStaff());
  const [settings, setSettings] = useState<StoreSettings>(() => storage.getSettings());
  const [products, setProducts] = useState<Product[]>(() => storage.getProducts());
  const [sales, setSales] = useState<Sale[]>(() => storage.getSales());
  const [heldOrdersCount, setHeldOrdersCount] = useState<number>(() => storage.getHeldOrders().length);
  const [barcodeQueueItems, setBarcodeQueueItems] = useState<LabelItem[]>([]);

  // Default section based on staff role
  const getDefaultSectionForRole = (role: string): NavSection => {
    switch (role) {
      case 'cashier':
        return 'pos';
      case 'manager':
        return 'dashboard';
      case 'admin':
        return 'dashboard';
      case 'auditor':
        return 'reports';
      default:
        return 'pos';
    }
  };

  const [currentSection, setCurrentSection] = useState<NavSection>(() =>
    getDefaultSectionForRole(currentStaff.role)
  );

  // Theme Mode: Warm Light Mode vs Dim Store Dark Mode
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('sappy_theme') as 'light' | 'dark') || 'light';
    }
    return 'light';
  });

  // Modals & Register Lock State
  const [isLocked, setIsLocked] = useState<boolean>(() => storage.isRegisterLocked());
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);

  // Inactivity Timer Ref (Requirement #37 Session Security)
  const inactivityTimerRef = useRef<any>(null);

  // Sync state from storage
  const refreshAllData = useCallback(() => {
    setProducts(storage.getProducts());
    setSales(storage.getSales());
    const freshStaff = storage.getCurrentStaff();
    setCurrentStaff(freshStaff);
    setSettings(storage.getSettings());
    setHeldOrdersCount(storage.getHeldOrders().length);
    setIsAuthenticated(storage.isAuthenticated());
    setIsLocked(storage.isRegisterLocked());
  }, []);

  // Update theme class on root html/body
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('sappy_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  // Online / Offline listener
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Hardware USB/Bluetooth Barcode Scanner listener
  useHardwareScanner({
    onScan: (scannedCode) => {
      if (!isAuthenticated) return;
      const product = storage.findProductByCode(scannedCode);
      if (product) {
        sound.playScanSuccess();
        if (currentSection !== 'pos') {
          setCurrentSection('pos');
        }
      } else {
        sound.playError();
      }
    },
    enabled: isAuthenticated && !isLocked,
  });

  // Global Keyboard Shortcuts (F1, F2, ESC, etc.)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isAuthenticated || isLocked) return;
      if (e.key === 'F1') {
        e.preventDefault();
        setIsShortcutsModalOpen((prev) => !prev);
      } else if (e.key === 'Escape') {
        setIsShortcutsModalOpen(false);
        setIsPinModalOpen(false);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCurrentSection('pos');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAuthenticated, isLocked]);

  // Handle Login Success (from LoginView)
  const handleLoginSuccess = (staff: Staff, targetSection: NavSection) => {
    storage.setCurrentStaff(staff.id);
    storage.setAuthenticated(true);
    storage.setRegisterLocked(false);
    setCurrentStaff(staff);
    setIsAuthenticated(true);
    setIsLocked(false);
    setCurrentSection(targetSection);
    refreshAllData();
  };

  // Sign out
  const handleSignOut = () => {
    storage.signOut();
    setIsAuthenticated(false);
    setIsLocked(false);
    refreshAllData();
  };

  // Cross-device continuous uniformity synchronization (Requirement: Uniform Across Devices)
  useEffect(() => {
    let isMounted = true;

    // Real-time Firebase Database Staff Synchronization
    const unsubscribeStaff = storage.syncStaffWithFirestore(() => {
      if (!isMounted) return;
      refreshAllData();
    });

    const syncInterval = setInterval(async () => {
      if (!isMounted || !isOnline) return;
      const res = await storage.syncAllDataWithBackend();
      if (!isMounted) return;
      if (res.wiped) {
        handleSignOut();
      } else {
        refreshAllData();
      }
    }, 7000);

    const handleFocus = async () => {
      if (!isMounted || !isOnline) return;
      const res = await storage.syncAllDataWithBackend();
      if (!isMounted) return;
      if (res.wiped) {
        handleSignOut();
      } else {
        refreshAllData();
      }
    };

    window.addEventListener('focus', handleFocus);

    return () => {
      isMounted = false;
      unsubscribeStaff();
      clearInterval(syncInterval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [isOnline, refreshAllData]);

  // Cashier Switch via PIN Modal
  const handleCashierAuthenticated = (staff: Staff) => {
    storage.setCurrentStaff(staff.id);
    setCurrentStaff(staff);
    const newSection = getDefaultSectionForRole(staff.role);
    setCurrentSection(newSection);
    refreshAllData();
  };

  // ================= SCENARIO 1: NOT AUTHENTICATED -> RENDER LOGIN VIEW =================
  if (!isAuthenticated) {
    return (
      <LoginView
        onLoginSuccess={handleLoginSuccess}
        isOnline={isOnline}
      />
    );
  }

  // ================= SCENARIO 2: AUTHENTICATED POS WORKSPACE =================
  return (
    <div className="min-h-screen bg-[#fdfbf7] dark:bg-[#12100e] text-[#26201b] dark:text-[#f5f1e8] flex flex-col font-sans transition-colors duration-200">
      {/* 1. Global Header Bar */}
      <Navbar
        currentStaff={currentStaff}
        settings={settings}
        onOpenPinModal={() => setIsPinModalOpen(true)}
        onOpenProfileModal={() => setIsProfileModalOpen(true)}
        onOpenShortcuts={() => setIsShortcutsModalOpen(true)}
        onThemeToggle={toggleTheme}
        onSignOut={handleSignOut}
        theme={theme}
      />

      {/* 2. Main Workstation Area: Sidebar + Active View */}
      <div className="flex-1 flex overflow-hidden">
        {/* Desktop Sidebar (hidden on mobile) */}
        <div className="hidden md:block">
          <Sidebar
            currentSection={currentSection}
            onSelectSection={setCurrentSection}
            cartItemCount={0}
            heldOrdersCount={heldOrdersCount}
            currentStaff={currentStaff}
          />
        </div>

        {/* Dynamic View Panel */}
        <main className="flex-1 flex flex-col overflow-hidden pb-14 md:pb-0">
          {currentSection === 'dashboard' && (
            <DashboardView
              products={products}
              sales={sales}
              settings={settings}
              currentStaff={currentStaff}
              onNavigate={setCurrentSection}
            />
          )}

          {currentSection === 'pos' && (
            <PosRegisterView
              products={products}
              currentStaff={currentStaff}
              settings={settings}
              onRefreshData={refreshAllData}
            />
          )}

          {currentSection === 'inventory' && (
            <InventoryView
              products={products}
              settings={settings}
              currentStaff={currentStaff}
              onRefreshData={refreshAllData}
              onNavigateToBarcodeStudio={(items) => {
                setBarcodeQueueItems(items);
                setCurrentSection('barcode_studio');
              }}
            />
          )}

          {currentSection === 'barcode_studio' && (
            <BarcodeStudioView
              products={products}
              settings={settings}
              queuedItems={barcodeQueueItems}
              onQueueChanged={setBarcodeQueueItems}
              onRefreshData={refreshAllData}
            />
          )}

          {currentSection === 'sales' && (
            <SalesLedgerView
              sales={sales}
              settings={settings}
              currentStaff={currentStaff}
              onRefreshData={refreshAllData}
            />
          )}

          {currentSection === 'credit' && (
            <CreditAccountsView
              settings={settings}
              currentStaff={currentStaff}
              onRefreshData={refreshAllData}
            />
          )}

          {currentSection === 'expenses' && (
            <ExpensesView
              settings={settings}
              currentStaff={currentStaff}
              onRefreshData={refreshAllData}
            />
          )}

          {currentSection === 'reports' && (
            <ReportsView
              sales={sales}
              products={products}
              settings={settings}
              currentStaff={currentStaff}
            />
          )}

          {currentSection === 'staff' && (
            <StaffView
              currentStaff={currentStaff}
              onRefreshData={refreshAllData}
              onResetAllAccounts={handleSignOut}
              onSwitchStaff={(staffId) => {
                storage.setCurrentStaff(staffId);
                refreshAllData();
              }}
            />
          )}

          {currentSection === 'audit' && <AuditLogsView />}

          {currentSection === 'settings' && (
            <SettingsView
              settings={settings}
              currentStaff={currentStaff}
              onRefreshData={refreshAllData}
              onFactoryReset={handleSignOut}
            />
          )}
        </main>
      </div>

      {/* 3. Mobile Navigation Bottom Bar & Drawer */}
      <MobileNav
        currentSection={currentSection}
        onSelectSection={setCurrentSection}
        cartItemCount={0}
        heldOrdersCount={heldOrdersCount}
        currentStaff={currentStaff}
      />

      {/* Fast Cashier Switch PIN Modal */}
      <PinModal
        isOpen={isPinModalOpen}
        onClose={() => setIsPinModalOpen(false)}
        onSuccess={handleCashierAuthenticated}
        title="Switch Cashier Session"
        description="Select cashier name and authenticate with your 4-digit PIN"
      />

      {/* 6. Keyboard Shortcuts Modal (F1) */}
      <KeyboardShortcutsModal
        isOpen={isShortcutsModalOpen}
        onClose={() => setIsShortcutsModalOpen(false)}
      />

      {/* 7. User Profile & Account Settings Modal */}
      <UserProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        currentStaff={currentStaff}
        onProfileUpdated={(updated) => {
          setCurrentStaff(updated);
          refreshAllData();
        }}
      />
    </div>
  );
}
