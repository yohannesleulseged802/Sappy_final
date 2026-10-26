import React, {useState, useEffect, useRef} from 'react';
import {
  Wifi,
  WifiOff,
  RefreshCw,
  CheckCircle2,
  Maximize,
  Minimize,
  Moon,
  Sun,
  Keyboard,
  User,
  Sparkles,
  Lock,
  LogOut,
  KeyRound,
  ChevronDown,
} from 'lucide-react';
import {Staff, StoreSettings} from '../../types';
import {storage} from '../../services/storage';
import {PWAInstallBadge} from '../common/PWAInstallBadge';
import {SappyBrandLogo} from '../common/SappyBrandLogo';

interface NavbarProps {
  currentStaff: Staff;
  settings: StoreSettings;
  onOpenPinModal: () => void;
  onOpenProfileModal: () => void;
  onOpenShortcuts: () => void;
  onThemeToggle: () => void;
  onSignOut: () => void;
  theme: 'light' | 'dark';
}

export const Navbar: React.FC<NavbarProps> = ({
  currentStaff,
  settings,
  onOpenPinModal,
  onOpenProfileModal,
  onOpenShortcuts,
  onThemeToggle,
  onSignOut,
  theme,
}) => {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [syncQueueCount, setSyncQueueCount] = useState(0);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      triggerSync();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial sync queue count
    setSyncQueueCount(storage.getSyncQueue().length);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const triggerSync = async () => {
    setIsSyncing(true);
    try {
      await storage.syncEverythingWithFirestore();
      storage.clearSyncQueue();
      setSyncQueueCount(0);
    } catch (err) {
      console.warn('Manual sync trigger error:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  return (
    <header className="sticky top-0 z-30 h-14 bg-white dark:bg-[#1c1815] border-b border-[#e6dfd5] dark:border-[#362e26] px-3 sm:px-4 flex items-center justify-between">
      {/* Brand & Tagline */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-[#fbf9f4] dark:bg-[#25201b] border border-[#e6dfd5] dark:border-[#362e26] text-[#244834] dark:text-[#6ee7b7] flex items-center justify-center shadow-xs">
          <SappyBrandLogo size="sm" className="text-[#244834] dark:text-[#6ee7b7]" />
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <h1 className="font-extrabold text-sm sm:text-base tracking-widest text-[#244834] dark:text-[#6ee7b7]">
              {settings.storeName}
            </h1>
            <span className="hidden md:inline-block text-[11px] font-serif text-stone-500 dark:text-stone-400 italic">
              — {settings.tagline}
            </span>
          </div>
        </div>
      </div>

      {/* Center/Right Status Indicators and Controls */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Offline / Online Sync Status Pill (Requirement #23) */}
        <div className="flex items-center">
          {isSyncing ? (
            <button
              onClick={triggerSync}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 animate-pulse"
              title="Synchronizing local database with cloud storage"
            >
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span className="hidden sm:inline">↻ SYNCING</span>
            </button>
          ) : !isOnline ? (
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300 dark:border-amber-800"
              title="Operating in offline mode. All sales and edits are saved locally."
            >
              <WifiOff className="w-3.5 h-3.5 text-amber-600" />
              <span>● OFFLINE {syncQueueCount > 0 ? `(${syncQueueCount} queued)` : ''}</span>
            </div>
          ) : (
            <button
              onClick={triggerSync}
              className="flex items-center gap-1.5 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 transition"
              title="Connected. Click to verify database synchronization."
            >
              <Wifi className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
              <span className="hidden sm:inline">● ONLINE</span>
              <span className="text-[10px] opacity-80 hidden lg:inline">✓ ALL DATA SYNCED</span>
            </button>
          )}
        </div>

        {/* Active Cashier Badge & User Profile Popover */}
        <div className="relative" ref={userMenuRef}>
          <button
            type="button"
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 text-xs font-semibold transition cursor-pointer border border-stone-200/60 dark:border-stone-700/60 shadow-2xs"
            title="My Profile & Staff Credentials"
          >
            <div className="w-5 h-5 rounded-full bg-[#064e3b] text-white flex items-center justify-center text-[10px] font-bold overflow-hidden shrink-0">
              {currentStaff.avatar || currentStaff.profilePictureUrl ? (
                <img
                  src={currentStaff.avatar || currentStaff.profilePictureUrl}
                  alt={currentStaff.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                currentStaff.name.charAt(0)
              )}
            </div>
            <span className="max-w-[90px] truncate">{currentStaff.name.split(' ')[0]}</span>
            <span className="text-[10px] px-1 py-0.2 bg-stone-200 dark:bg-stone-700 text-stone-600 dark:text-stone-300 rounded uppercase font-mono">
              {currentStaff.role}
            </span>
            <ChevronDown className="w-3 h-3 text-stone-400" />
          </button>

          {/* User Profile Dropdown Menu */}
          {isUserMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-[#1f1b17] border border-[#e6dfd5] dark:border-[#362e26] rounded-2xl shadow-xl p-2 z-50 text-xs animate-in fade-in zoom-in-95">
              {/* Profile Card Header */}
              <div className="p-2.5 border-b border-stone-100 dark:border-stone-800 flex items-center gap-2.5 mb-1 bg-stone-50/60 dark:bg-stone-800/40 rounded-xl">
                <div className="w-9 h-9 rounded-xl bg-[#064e3b] text-white flex items-center justify-center font-bold text-sm overflow-hidden shrink-0">
                  {currentStaff.avatar || currentStaff.profilePictureUrl ? (
                    <img
                      src={currentStaff.avatar || currentStaff.profilePictureUrl}
                      alt={currentStaff.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    currentStaff.name.charAt(0)
                  )}
                </div>
                <div className="overflow-hidden">
                  <div className="font-extrabold text-stone-900 dark:text-stone-100 truncate">
                    {currentStaff.name}
                  </div>
                  <div className="text-[10px] text-stone-400 font-mono truncate">
                    {currentStaff.email || currentStaff.username}
                  </div>
                </div>
              </div>

              {/* Action 1: Edit Profile */}
              <button
                type="button"
                onClick={() => {
                  setIsUserMenuOpen(false);
                  onOpenProfileModal();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-stone-700 dark:text-stone-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/60 hover:text-[#064e3b] dark:hover:text-[#6ee7b7] font-semibold transition cursor-pointer text-left"
              >
                <User className="w-4 h-4 text-[#064e3b] dark:text-[#6ee7b7]" />
                <div>
                  <div className="font-bold">Edit My Profile</div>
                  <div className="text-[10px] text-stone-400 font-normal">Photo, contact, password &amp; PIN</div>
                </div>
              </button>

              {/* Action 2: Switch Cashier / PIN */}
              <button
                type="button"
                onClick={() => {
                  setIsUserMenuOpen(false);
                  onOpenPinModal();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 font-semibold transition cursor-pointer text-left"
              >
                <KeyRound className="w-4 h-4 text-stone-500" />
                <span>Switch Cashier (PIN)</span>
              </button>

              {/* Action 3: Sign Out */}
              <div className="pt-1 mt-1 border-t border-stone-100 dark:border-stone-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    onSignOut();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 font-bold transition cursor-pointer text-left"
                >
                  <LogOut className="w-4 h-4 text-rose-500" />
                  <span>Sign Out of POS</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* PWA Install Badge */}
        <PWAInstallBadge />

        {/* Keyboard Shortcuts Button */}
        <button
          onClick={onOpenShortcuts}
          className="hidden sm:flex p-1.5 rounded-lg text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800 transition"
          title="Keyboard Shortcuts (F1)"
        >
          <Keyboard className="w-4 h-4" />
        </button>

        {/* Fullscreen Toggle */}
        <button
          onClick={toggleFullscreen}
          className="hidden sm:flex p-1.5 rounded-lg text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800 transition"
          title="Toggle Fullscreen Mode"
        >
          {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
        </button>

        {/* Warm Light / Dim Store Dark Theme Toggle */}
        <button
          onClick={onThemeToggle}
          className="p-1.5 rounded-lg text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800 transition"
          title={`Switch to ${theme === 'light' ? 'Dim Store Dark' : 'Warm Light'} Mode`}
        >
          {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4 text-amber-400" />}
        </button>

        {/* Sign Out Button */}
        <button
          onClick={onSignOut}
          className="p-1.5 rounded-lg text-stone-600 hover:text-rose-600 dark:text-stone-400 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
          title="Sign Out of POS"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
