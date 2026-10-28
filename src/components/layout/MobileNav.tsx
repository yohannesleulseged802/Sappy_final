import React, {useState} from 'react';
import {
  Menu,
  X,
  ShoppingCart,
  LayoutDashboard,
  Package,
  Receipt,
  MoreHorizontal,
  QrCode,
  CreditCard,
  DollarSign,
  BarChart3,
  Users,
  Settings,
  FileText,
} from 'lucide-react';
import {NavSection} from './Sidebar';
import {Staff} from '../../types';

interface MobileNavProps {
  currentSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  cartItemCount: number;
  heldOrdersCount: number;
  currentStaff: Staff;
}

export const MobileNav: React.FC<MobileNavProps> = ({
  currentSection,
  onSelectSection,
  cartItemCount,
  heldOrdersCount,
  currentStaff,
}) => {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const mainTabs = [
    {id: 'pos' as NavSection, label: 'Record', icon: ShoppingCart, badge: cartItemCount},
    {id: 'inventory' as NavSection, label: 'Inventory', icon: Package},
    {id: 'dashboard' as NavSection, label: 'Overview', icon: LayoutDashboard},
    {id: 'sales' as NavSection, label: 'Ledger', icon: Receipt},
  ];

  const drawerItems = [
    {id: 'barcode_studio' as NavSection, label: 'Barcode & QR Studio', icon: QrCode},
    {id: 'credit' as NavSection, label: 'Store Credit Accounts', icon: CreditCard},
    {id: 'expenses' as NavSection, label: 'Expense Tracker', icon: DollarSign},
    {id: 'reports' as NavSection, label: 'Reports & Export', icon: BarChart3},
    {id: 'staff' as NavSection, label: 'Staff & Roles', icon: Users},
    {id: 'audit' as NavSection, label: 'Activity Logs', icon: FileText},
    {id: 'settings' as NavSection, label: 'Store Settings', icon: Settings},
  ];

  const isPermittedForRole = (sectionId: NavSection): boolean => {
    const role = currentStaff.role;
    if (role === 'admin') return true;
    if (role === 'manager') return sectionId !== 'settings';
    if (role === 'cashier') {
      return ['pos', 'inventory', 'sales', 'dashboard'].includes(sectionId);
    }
    if (role === 'auditor') {
      return ['reports', 'sales', 'inventory', 'audit', 'dashboard'].includes(sectionId);
    }
    return true;
  };

  const filteredMainTabs = mainTabs.filter((t) => isPermittedForRole(t.id));
  const filteredDrawerItems = drawerItems.filter((t) => isPermittedForRole(t.id));

  return (
    <>
      {/* Bottom Sticky Mobile Navigation Bar */}
      <nav aria-label="Mobile Navigation" className="md:hidden shrink-0 z-40 bg-white/95 dark:bg-[#1c1815]/95 backdrop-blur-md border-t border-[#e6dfd5] dark:border-[#362e26] px-2 py-1 flex items-center justify-around safe-area-bottom select-none">
        {filteredMainTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentSection === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onSelectSection(tab.id)}
              className={`relative flex flex-col items-center justify-center min-h-[46px] min-w-[56px] py-1 px-2.5 rounded-xl transition active:scale-95 cursor-pointer touch-manipulation ${
                isActive
                  ? 'text-[#064e3b] dark:text-[#6ee7b7] font-bold'
                  : 'text-stone-500 dark:text-stone-400 font-medium'
              }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.5]' : ''}`} />
                {tab.badge && tab.badge > 0 ? (
                  <span className="absolute -top-1 -right-2 px-1.5 py-0.2 bg-[#064e3b] text-white text-[10px] font-black rounded-full min-w-[16px] text-center">
                    {tab.badge}
                  </span>
                ) : null}
              </div>
              <span className="text-[10px] mt-0.5">{tab.label}</span>
            </button>
          );
        })}

        {/* More Drawer Button */}
        <button
          onClick={() => setDrawerOpen(true)}
          className={`flex flex-col items-center justify-center min-h-[46px] min-w-[56px] py-1 px-2.5 rounded-xl transition active:scale-95 cursor-pointer touch-manipulation ${
            drawerOpen ? 'text-[#064e3b] dark:text-[#6ee7b7]' : 'text-stone-500 dark:text-stone-400'
          }`}
        >
          <MoreHorizontal className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">More</span>
        </button>
      </nav>

      {/* Slide-over Mobile Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex bg-black/60 backdrop-blur-xs md:hidden animate-in fade-in duration-150">
          <div className="w-4/5 max-w-xs bg-white dark:bg-[#1c1815] h-full shadow-2xl flex flex-col p-4 animate-in slide-in-from-left duration-200 safe-area-bottom">
            <div className="flex items-center justify-between pb-3 border-b border-[#e6dfd5] dark:border-[#362e26] mb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[#064e3b] text-[#6ee7b7] flex items-center justify-center font-bold text-sm">
                  S
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-[#064e3b] dark:text-[#6ee7b7]">
                    Sappy Stationary
                  </h3>
                  <p className="text-[10px] text-stone-500">stationery &amp; printing.</p>
                </div>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="p-2 rounded-lg text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 cursor-pointer active:scale-95 min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation"
                aria-label="Close menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-1 overflow-y-auto touch-scroll overscroll-contain flex-1">
              {filteredDrawerItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentSection === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      onSelectSection(item.id);
                      setDrawerOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer active:scale-98 touch-manipulation min-h-[44px] ${
                      isActive
                        ? 'bg-[#064e3b] text-white'
                        : 'text-stone-700 dark:text-stone-300 hover:bg-[#f5f1e8] dark:hover:bg-[#25201b]'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="pt-3 border-t border-[#e6dfd5] dark:border-[#362e26] text-[11px] text-stone-500">
              <div>Active Cashier: {currentStaff.name}</div>
            </div>
          </div>
          <div className="flex-1 cursor-pointer" onClick={() => setDrawerOpen(false)} />
        </div>
      )}
    </>
  );
};
