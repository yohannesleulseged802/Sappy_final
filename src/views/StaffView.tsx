import React, { useState, useEffect } from 'react';
import {
  Users,
  Plus,
  ShieldCheck,
  Key,
  Check,
  X,
  Phone,
  Mail,
  Briefcase,
  AlertCircle,
  Trash2,
  CheckCircle2,
  Clock,
  Sparkles,
  ShieldAlert,
  KeyRound,
  Eye,
  EyeOff,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { Staff, StaffRole } from '../types';
import { storage } from '../services/storage';
import { sound } from '../services/sound';
import { authService } from '../services/authService';
import { MasterPasscodeSignupModal } from '../components/common/MasterPasscodeSignupModal';

interface StaffViewProps {
  currentStaff: Staff;
  onRefreshData: () => void;
  onSwitchStaff: (staffId: string) => void;
  onResetAllAccounts?: () => void;
}

export const StaffView: React.FC<StaffViewProps> = ({
  currentStaff,
  onRefreshData,
  onSwitchStaff,
  onResetAllAccounts,
}) => {
  const staffList = storage.getStaffList();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isPasscodeSignupOpen, setIsPasscodeSignupOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);

  useEffect(() => {
    storage.syncStaffFromBackend().then(() => {
      onRefreshData();
    });
  }, []);

  // Remove All Accounts State
  const [showResetAllModal, setShowResetAllModal] = useState(false);
  const [resetPasscode, setResetPasscode] = useState('');
  const [showResetPasscode, setShowResetPasscode] = useState(false);
  const [isExecutingReset, setIsExecutingReset] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<StaffRole>('cashier');
  const [pin, setPin] = useState('');
  const [jobTitle, setJobTitle] = useState('POS Cashier');

  const isAdmin = currentStaff.role === 'admin';
  const pendingStaff = staffList.filter((s) => s.approvalStatus === 'pending');

  const handleOpenAdd = () => {
    setEditingStaff(null);
    setName('');
    setEmail('');
    setPhone('');
    setRole('cashier');
    setPin('1111');
    setJobTitle('POS Cashier');
    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (s: Staff) => {
    setEditingStaff(s);
    setName(s.name);
    setEmail(s.email);
    setPhone(s.phone || '');
    setRole(s.role);
    setPin(s.pin);
    setJobTitle(s.jobTitle || 'POS Cashier');
    setIsAddModalOpen(true);
  };

  const handleSaveStaff = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || pin.length !== 4) {
      alert('Name and a 4-digit PIN are required.');
      return;
    }

    let updatedList: Staff[];
    if (editingStaff) {
      updatedList = staffList.map((s) =>
        s.id === editingStaff.id
          ? {
              ...s,
              name: name.trim(),
              email: email.trim(),
              phone: phone.trim() || undefined,
              jobTitle: jobTitle.trim() || undefined,
              role,
              pin,
            }
          : s
      );
      storage.addAuditLog('STAFF_UPDATED', 'AUTH', `Staff account ${name} updated by ${currentStaff.name}.`);
    } else {
      const newStaff: Staff = {
        id: `staff-${Date.now()}`,
        employeeId: `SAP-EMP-${staffList.length + 1001}`,
        name: name.trim(),
        email: email.trim() || `${name.toLowerCase().replace(/\s+/g, '')}@sappystationary.com`,
        phone: phone.trim() || undefined,
        jobTitle: jobTitle.trim() || undefined,
        role,
        pin,
        active: true,
        approvalStatus: 'approved',
      };
      updatedList = [...staffList, newStaff];
      storage.addAuditLog(
        'STAFF_CREATED',
        'AUTH',
        `New staff account ${name} created with role ${role.toUpperCase()} by ${currentStaff.name}.`
      );
    }

    storage.saveStaffList(updatedList);
    if (editingStaff && editingStaff.id === currentStaff.id) {
      storage.setCurrentStaff(editingStaff.id);
    }
    // Sync update to server
    try {
      fetch('/api/auth/update-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: editingStaff ? editingStaff.id : undefined,
          fullName: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          jobTitle: jobTitle.trim(),
          pin,
        }),
      }).catch(() => {});
    } catch {}

    setIsAddModalOpen(false);
    sound.playCheckoutSuccess();
    onRefreshData();
  };

  const handleApproveStaff = (staffId: string) => {
    storage.approveStaff(staffId, currentStaff.name);
    sound.playCheckoutSuccess();
    onRefreshData();
  };

  const handleRejectStaff = (staffId: string) => {
    if (confirm('Are you sure you want to reject this staff account?')) {
      storage.rejectStaff(staffId, currentStaff.name);
      sound.playError();
      onRefreshData();
    }
  };

  const handleDeleteStaff = (staffId: string, staffName: string) => {
    if (staffId === currentStaff.id) {
      alert('You cannot delete your own currently active session account.');
      return;
    }
    if (confirm(`Are you sure you want to remove staff account "${staffName}"? This action is logged in audit trails.`)) {
      storage.deleteStaff(staffId);
      sound.playCheckoutSuccess();
      onRefreshData();
    }
  };

  const handleRemoveAllAccounts = async () => {
    if (!resetPasscode.trim()) {
      setResetError('Please enter the Master Passcode (Sappy#1313).');
      sound.playError();
      return;
    }

    setIsExecutingReset(true);
    setResetError(null);
    try {
      const result = await authService.verifyMasterPasscode(resetPasscode.trim());
      if (!result.valid) {
        setIsExecutingReset(false);
        sound.playError();
        setResetError(result.error || 'Incorrect Master Passcode.');
        return;
      }

      // Reset all users
      storage.resetAllUsers();
      setIsExecutingReset(false);
      setShowResetAllModal(false);
      sound.playCheckoutSuccess();
      if (onResetAllAccounts) {
        onResetAllAccounts();
      } else {
        window.location.reload();
      }
    } catch (err: any) {
      setIsExecutingReset(false);
      sound.playError();
      setResetError(err?.message || 'Failed to remove accounts.');
    }
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto touch-scroll overscroll-contain p-4 sm:p-6 pb-24 md:pb-6 bg-[#fdfbf7] dark:bg-[#12100e] space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-white dark:bg-[#1c1815] border border-[#e6dfd5] dark:border-[#362e26] rounded-2xl shadow-xs">
        <div>
          <h2 className="font-extrabold text-base text-stone-900 dark:text-stone-100 flex items-center gap-2">
            <Users className="w-5 h-5 text-[#064e3b] dark:text-[#6ee7b7]" />
            <span>Staff Accounts &amp; Access Security</span>
          </h2>
          <p className="text-xs text-stone-500">
            Configure register access permissions, roles, and Master Passcode staff registrations
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <button
              type="button"
              onClick={() => {
                setResetPasscode('');
                setResetError(null);
                setShowResetAllModal(true);
              }}
              className="px-3.5 py-2 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Trash2 className="w-4 h-4 text-rose-600" />
              <span>Remove All Accounts</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsPasscodeSignupOpen(true)}
            className="px-3.5 py-2 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-[#064e3b] dark:text-[#6ee7b7] border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Register with Master Passcode</span>
          </button>
          <button
            type="button"
            onClick={handleOpenAdd}
            className="px-3.5 py-2 bg-[#064e3b] hover:bg-[#043b2c] text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Staff Member</span>
          </button>
        </div>
      </div>

      {/* --- PENDING APPROVALS QUEUE BANNER (Admins Only) --- */}
      {isAdmin && pendingStaff.length > 0 && (
        <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-2xl space-y-3 animate-in fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-900 dark:text-amber-200">
              <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span>Pending Staff Registrations ({pendingStaff.length})</span>
            </div>
            <span className="text-[11px] text-amber-700 dark:text-amber-400 font-mono">
              Action Required
            </span>
          </div>
          <p className="text-xs text-amber-800 dark:text-amber-300">
            The following accounts were registered without the Master Passcode and are awaiting administrator approval before POS terminal access is granted.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
            {pendingStaff.map((p) => (
              <div
                key={p.id}
                className="p-3 bg-white dark:bg-stone-900 border border-amber-200 dark:border-amber-800/60 rounded-xl shadow-xs flex flex-col justify-between"
              >
                <div className="flex items-center gap-3 mb-2">
                  <img
                    src={p.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=128&h=128&q=80'}
                    alt={p.name}
                    className="w-10 h-10 rounded-full object-cover border border-amber-400 shrink-0"
                  />
                  <div className="overflow-hidden">
                    <h4 className="font-bold text-xs text-stone-900 dark:text-white truncate">
                      {p.name}
                    </h4>
                    <p className="text-[11px] text-stone-500 font-mono truncate">{p.email}</p>
                    <p className="text-[10px] text-[#064e3b] dark:text-[#6ee7b7] font-semibold">
                      ID: {p.employeeId || 'New'} • {p.jobTitle || 'Cashier'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-stone-100 dark:border-stone-800">
                  <button
                    type="button"
                    onClick={() => handleApproveStaff(p.id)}
                    className="flex-1 py-1.5 bg-[#064e3b] hover:bg-[#043b2c] text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Approve</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRejectStaff(p.id)}
                    className="py-1.5 px-3 bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 rounded-lg text-xs font-semibold transition cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Staff Grid Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {staffList.map((s) => {
          const isCurrent = s.id === currentStaff.id;
          const isPending = s.approvalStatus === 'pending';
          const isRejected = s.approvalStatus === 'rejected';

          return (
            <div
              key={s.id}
              className={`p-4 rounded-2xl border transition flex flex-col justify-between ${
                isCurrent
                  ? 'bg-emerald-50/50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800 shadow-xs'
                  : isPending
                  ? 'bg-amber-50/30 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800/50'
                  : 'bg-white dark:bg-[#1c1815] border-[#e6dfd5] dark:border-[#362e26]'
              }`}
            >
              <div>
                <div className="flex items-start justify-between mb-3">
                  {s.avatar ? (
                    <img
                      src={s.avatar}
                      alt={s.name}
                      className="w-11 h-11 rounded-xl object-cover border border-[#064e3b]/30 shadow-xs shrink-0"
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-xl bg-[#064e3b] text-[#6ee7b7] flex items-center justify-center font-bold text-base shadow-xs">
                      {s.name.charAt(0)}
                    </div>
                  )}

                  <div className="flex flex-col items-end gap-1">
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                        s.role === 'admin'
                          ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300'
                          : s.role === 'manager'
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300'
                          : s.role === 'cashier'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300'
                          : 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300'
                      }`}
                    >
                      {s.role}
                    </span>

                    {/* Status Badge */}
                    {isPending && (
                      <span className="text-[9px] px-1.5 py-0.2 rounded-md font-bold uppercase bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
                        Pending
                      </span>
                    )}
                    {isRejected && (
                      <span className="text-[9px] px-1.5 py-0.2 rounded-md font-bold uppercase bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-300">
                        Rejected
                      </span>
                    )}
                  </div>
                </div>

                <h3 className="font-bold text-sm text-stone-900 dark:text-stone-100">
                  {s.name}
                </h3>
                {s.employeeId && (
                  <span className="text-[10px] text-[#064e3b] dark:text-[#6ee7b7] font-mono font-semibold block">
                    ID: {s.employeeId}
                  </span>
                )}
                <p className="text-xs text-stone-500 font-mono mt-0.5 truncate">{s.email}</p>
                {s.jobTitle && (
                  <p className="text-[11px] text-stone-600 dark:text-stone-400 mt-1 flex items-center gap-1">
                    <Briefcase className="w-3 h-3 text-stone-400" />
                    <span>{s.jobTitle}</span>
                  </p>
                )}
                {s.phone && (
                  <p className="text-[11px] text-stone-400 mt-0.5 flex items-center gap-1">
                    <Phone className="w-3 h-3" />
                    <span>{s.phone}</span>
                  </p>
                )}

                <div className="mt-3 pt-2 border-t border-stone-100 dark:border-stone-800 text-[11px] text-stone-500 flex items-center justify-between">
                  <span>Security PIN:</span>
                  <span className="font-mono font-bold tracking-widest">••••</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-4 pt-2 border-t border-stone-100 dark:border-stone-800 flex items-center justify-between">
                {!isCurrent && !isPending && !isRejected ? (
                  <button
                    type="button"
                    onClick={() => onSwitchStaff(s.id)}
                    className="text-xs font-bold text-[#064e3b] dark:text-[#6ee7b7] hover:underline cursor-pointer min-h-[44px] flex items-center touch-manipulation"
                  >
                    Switch User
                  </button>
                ) : isCurrent ? (
                  <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 min-h-[44px] flex items-center">
                    Active Session
                  </span>
                ) : isPending && isAdmin ? (
                  <button
                    type="button"
                    onClick={() => handleApproveStaff(s.id)}
                    className="text-xs font-bold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer min-h-[44px] flex items-center touch-manipulation"
                  >
                    Approve Now
                  </button>
                ) : (
                  <span className="text-xs text-stone-400 italic min-h-[44px] flex items-center">Inactive</span>
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(s)}
                    className="text-xs text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-stone-100 cursor-pointer min-h-[44px] px-2 flex items-center touch-manipulation font-semibold"
                  >
                    Edit
                  </button>
                  {isAdmin && !isCurrent && (
                    <button
                      type="button"
                      onClick={() => handleDeleteStaff(s.id, s.name)}
                      className="text-stone-400 hover:text-rose-600 transition p-2 min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer touch-manipulation"
                      title="Remove staff account"
                      aria-label="Remove staff account"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Role Permission Matrix Card */}
      <div className="p-4 bg-white dark:bg-[#1c1815] border border-[#e6dfd5] dark:border-[#362e26] rounded-2xl shadow-xs">
        <h3 className="font-bold text-sm text-stone-900 dark:text-stone-100 mb-2">
          Role-Based Access Permissions
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
          <div className="p-3 bg-stone-50 dark:bg-stone-800/40 rounded-xl">
            <span className="font-bold text-purple-700 dark:text-purple-400 block mb-1">Admin</span>
            <p className="text-stone-500 text-[11px]">
              Full unrestricted access to POS register, stock overrides, refunds, store settings, user accounts, and fiscal reports.
            </p>
          </div>
          <div className="p-3 bg-stone-50 dark:bg-stone-800/40 rounded-xl">
            <span className="font-bold text-blue-700 dark:text-blue-400 block mb-1">Manager</span>
            <p className="text-stone-500 text-[11px]">
              Operational supervisor. Authorizes discounts up to 20%, executes sales refunds, opens/closes register shifts, and records stock adjustments.
            </p>
          </div>
          <div className="p-3 bg-stone-50 dark:bg-stone-800/40 rounded-xl">
            <span className="font-bold text-emerald-700 dark:text-emerald-400 block mb-1">Cashier</span>
            <p className="text-stone-500 text-[11px]">
              Checkout terminal speed operator. Product scanning, cart management, cash/mobile/card split checkout, customer store credit charging.
            </p>
          </div>
          <div className="p-3 bg-stone-50 dark:bg-stone-800/40 rounded-xl">
            <span className="font-bold text-stone-700 dark:text-stone-300 block mb-1">Auditor</span>
            <p className="text-stone-500 text-[11px]">
              Read-only oversight. Can inspect transaction ledgers, inventory valuations, register shift variances, and system activity logs.
            </p>
          </div>
        </div>
      </div>

      {/* ================= MODAL: ADD / EDIT STAFF ================= */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-5 shadow-2xl">
            <h3 className="font-bold text-sm mb-3 text-stone-900 dark:text-stone-100">
              {editingStaff ? 'Edit Staff Account' : 'New Staff Account'}
            </h3>

            <form onSubmit={handleSaveStaff} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Staff Full Name *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Sara Tadesse"
                  className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-2 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="sara@sappystationary.com"
                  className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-2 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Phone Number</label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+251 911 ..."
                  className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-2 text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Job Title</label>
                <input
                  type="text"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder="e.g. Lead Cashier"
                  className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-2 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">System Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as StaffRole)}
                  className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-2 text-xs font-semibold"
                >
                  <option value="cashier">Cashier (POS &amp; Sales Checkout)</option>
                  <option value="manager">Manager (Refunds &amp; Operational Management)</option>
                  <option value="admin">Admin (Full System Access)</option>
                  <option value="auditor">Auditor (Read-Only Financials &amp; Logs)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">4-Digit Security PIN *</label>
                <input
                  type="password"
                  maxLength={4}
                  required
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="4 digits"
                  className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-2 text-xs font-mono tracking-widest text-center font-bold"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-stone-500 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#064e3b] text-white rounded-lg text-xs font-bold cursor-pointer"
                >
                  Save Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: MASTER PASSCODE SIGNUP ================= */}
      <MasterPasscodeSignupModal
        isOpen={isPasscodeSignupOpen}
        onClose={() => setIsPasscodeSignupOpen(false)}
        onSuccess={() => {
          onRefreshData();
        }}
      />

      {/* ================= MODAL: REMOVE ALL ACCOUNTS ================= */}
      {showResetAllModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-stone-900 border-2 border-rose-300 dark:border-rose-800 rounded-3xl p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-2xl bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-300 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-rose-950 dark:text-rose-100">
                  Remove All Staff Accounts
                </h3>
                <p className="text-xs text-rose-700 dark:text-rose-300 mt-0.5">
                  Clear all users, administrator credentials, and login sessions
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl text-xs text-rose-800 dark:text-rose-300 space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>Security Account Wipe</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                This will delete all staff members, cashiers, and administrator accounts across all terminals. The store will revert to the initial Root Administrator setup screen. Inventory items, catalog, and sales records will remain preserved.
              </p>
            </div>

            {resetError && (
              <div className="p-3 bg-rose-100 dark:bg-rose-900/60 border border-rose-300 dark:border-rose-700 rounded-xl text-xs text-rose-900 dark:text-rose-100 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{resetError}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1.5 flex items-center justify-between">
                <span>Enter Master Passcode to Authorize:</span>
                <span className="text-[10px] text-stone-400 font-mono">Default: Sappy#1313</span>
              </label>
              <div className="relative">
                <input
                  type={showResetPasscode ? 'text' : 'password'}
                  value={resetPasscode}
                  onChange={(e) => setResetPasscode(e.target.value)}
                  placeholder="Master Passcode (Sappy#1313)"
                  disabled={isExecutingReset}
                  className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-xl p-2.5 text-xs font-mono font-bold pr-10 focus:ring-2 focus:ring-rose-500 focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={() => setShowResetPasscode(!showResetPasscode)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 cursor-pointer"
                >
                  {showResetPasscode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-stone-200 dark:border-stone-800">
              <button
                type="button"
                disabled={isExecutingReset}
                onClick={() => setShowResetAllModal(false)}
                className="px-4 py-2 rounded-xl border border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 text-xs font-bold transition cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={isExecutingReset}
                onClick={handleRemoveAllAccounts}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black shadow-md transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {isExecutingReset ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Removing Accounts...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remove All Accounts</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
