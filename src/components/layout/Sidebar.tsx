import React from 'react';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Receipt,
  Users,
  CreditCard,
  QrCode,
  BarChart3,
  ShieldCheck,
  FileText,
  Settings,
  DollarSign,
  BookmarkCheck,
} from 'lucide-react';
import {Staff, StaffRole} from '../../types';

export type NavSection =
  | 'dashboard'
  | 'inventory'
  | 'pos'
  | 'sales'
  | 'credit'
  | 'expenses'
  | 'barcode_studio'
  | 'reports'
  | 'staff'
  | 'audit'
  | 'settings';

interface SidebarProps {
  currentSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  cartItemCount: number;
  heldOrdersCount: number;
  currentStaff: Staff;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentSection,
  onSelectSection,
  cartItemCount,
  heldOrdersCount,
  currentStaff,
}) => {
  const navItems = [
    {
      id: 'dashboard' as NavSection,
      label: 'Dashboard Overview',
      icon: LayoutDashboard,
      badge: null,
    },
    {
      id: 'pos' as NavSection,
      label: 'Record Sales',
      icon: ShoppingCart,
      isPrimary: true,
      badge: cartItemCount > 0 ? `${cartItemCount}` : null,
      subBadge: heldOrdersCount > 0 ? `${heldOrdersCount} held` : null,
    },
    {
      id: 'inventory' as NavSection,
      label: 'Inventory Catalog',
      icon: Package,
      badge: null,
    },
    {
      id: 'barcode_studio' as NavSection,
      label: 'Barcode & QR Studio',
      icon: QrCode,
      badge: null,
    },
    {
      id: 'sales' as NavSection,
      label: 'Sales Ledger',
      icon: Receipt,
      badge: null,
    },
    {
      id: 'credit' as NavSection,
      label: 'Credit Accounts',
      icon: CreditCard,
      badge: null,
    },
    {
      id: 'expenses' as NavSection,
      label: 'Expense Tracker',
      icon: DollarSign,
      badge: null,
    },
    {
      id: 'reports' as NavSection,
      label: 'Reports & Export',
      icon: BarChart3,
      badge: null,
    },
    {
      id: 'staff' as NavSection,
      label: 'Staff & Roles',
      icon: Users,
      badge: null,
      adminOnly: true,
    },
    {
      id: 'audit' as NavSection,
      label: 'Activity Logs',
      icon: FileText,
      badge: null,
    },
    {
      id: 'settings' as NavSection,
      label: 'Store Settings',
      icon: Settings,
      badge: null,
      adminOnly: true,
    },
  ];

  const isPermittedForRole = (sectionId: NavSection, role: StaffRole): boolean => {
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

  const visibleNavItems = navItems.filter((item) =>
    isPermittedForRole(item.id, currentStaff.role)
  );

  return (
    <aside className="w-64 bg-white dark:bg-[#1c1815] border-r border-[#e6dfd5] dark:border-[#362e26] flex flex-col h-[calc(100vh-3.5rem)] shrink-0 select-none overflow-y-auto">
      {/* POS Highlight Quick Card (if permitted for role) */}
      {isPermittedForRole('pos', currentStaff.role) && (
        <div className="p-3 border-b border-[#e6dfd5] dark:border-[#362e26]">
          <button
            onClick={() => onSelectSection('pos')}
            className={`w-full p-3 rounded-xl transition text-left flex items-center justify-between shadow-xs ${
              currentSection === 'pos'
                ? 'bg-[#064e3b] text-white shadow-md'
                : 'bg-[#f5f1e8] dark:bg-[#25201b] hover:bg-stone-200 dark:hover:bg-stone-800 text-stone-900 dark:text-stone-100'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <div
                className={`p-2 rounded-lg ${
                  currentSection === 'pos'
                    ? 'bg-[#043b2c] text-[#6ee7b7]'
                    : 'bg-white dark:bg-stone-900 text-[#064e3b] dark:text-[#6ee7b7]'
                }`}
              >
                <ShoppingCart className="w-5 h-5" />
              </div>
              <div>
                <div className="font-bold text-sm tracking-tight">Record Sale</div>
                <div className="text-[11px] opacity-75 font-mono">
                  Internal Records Ready
                </div>
              </div>
            </div>

            {cartItemCount > 0 && (
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-black ${
                  currentSection === 'pos'
                    ? 'bg-[#6ee7b7] text-[#064e3b]'
                    : 'bg-[#064e3b] text-white'
                }`}
              >
                {cartItemCount}
              </span>
            )}
          </button>

          {heldOrdersCount > 0 && (
            <div className="mt-1.5 flex items-center justify-between px-2 py-1 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg text-[11px] text-amber-800 dark:text-amber-300 font-medium">
              <span className="flex items-center gap-1">
                <BookmarkCheck className="w-3.5 h-3.5" />
                Parked Carts
              </span>
              <span className="font-bold">{heldOrdersCount}</span>
            </div>
          )}
        </div>
      )}

      {/* Nav Menu Links */}
      <nav className="flex-1 p-2 space-y-0.5">
        {visibleNavItems
          .filter((item) => !item.isPrimary)
          .map((item) => {
            const Icon = item.icon;
            const isActive = currentSection === item.id;

            return (
              <button
                key={item.id}
                onClick={() => onSelectSection(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition ${
                  isActive
                    ? 'bg-[#064e3b] text-white shadow-xs'
                    : 'text-stone-700 dark:text-stone-300 hover:bg-[#f5f1e8] dark:hover:bg-[#25201b]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon
                    className={`w-4 h-4 ${
                      isActive
                        ? 'text-[#6ee7b7]'
                        : 'text-stone-500 dark:text-stone-400'
                    }`}
                  />
                  <span>{item.label}</span>
                </div>

                {item.badge && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
      </nav>

      {/* Footer Info Box */}
      <div className="p-3 border-t border-[#e6dfd5] dark:border-[#362e26] bg-[#fdfbf7] dark:bg-[#171412]">
        <div className="flex items-center justify-between text-[11px] text-stone-500 dark:text-stone-400">
          <span>Logged In</span>
          <span className="font-semibold text-stone-800 dark:text-stone-200">
            {currentStaff.name.split(' ')[0]}
          </span>
        </div>
        <div className="flex items-center justify-between text-[11px] text-stone-500 dark:text-stone-400 mt-1">
          <span>System Mode</span>
          <span className="font-mono text-emerald-700 dark:text-emerald-400 font-bold">
            INTERNAL RECORDS
          </span>
        </div>
      </div>
    </aside>
  );
};
