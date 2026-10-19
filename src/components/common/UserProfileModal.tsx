import React, { useState, useEffect, useRef } from 'react';
import {
  User,
  Mail,
  Phone,
  MapPin,
  Briefcase,
  KeyRound,
  Eye,
  EyeOff,
  Camera,
  Upload,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  Trash2,
  ShieldCheck,
  Building,
  Check,
  Sparkles,
} from 'lucide-react';
import { Staff } from '../../types';
import { authService } from '../../services/authService';
import { sound } from '../../services/sound';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentStaff: Staff;
  onProfileUpdated: (updatedStaff: Staff) => void;
}

const AVATAR_PRESETS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&h=256&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=256&h=256&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=256&h=256&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=256&h=256&q=80',
  'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=256&h=256&q=80',
  'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=256&h=256&q=80',
];

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  isOpen,
  onClose,
  currentStaff,
  onProfileUpdated,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form State
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [department, setDepartment] = useState('');
  const [pin, setPin] = useState('');
  const [profilePictureUrl, setProfilePictureUrl] = useState('');

  // Password Update State
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);

  // Submission & Feedback State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Synchronize state when staff or modal opens
  useEffect(() => {
    if (isOpen && currentStaff) {
      const parts = currentStaff.name.split(' ');
      setFirstName(currentStaff.firstName || parts[0] || '');
      setLastName(currentStaff.lastName || parts.slice(1).join(' ') || '');
      setEmail(currentStaff.email || '');
      setPhone(currentStaff.phone || '');
      setAddress(currentStaff.address || '');
      setCity(currentStaff.city || '');
      setJobTitle(currentStaff.jobTitle || 'POS Cashier');
      setDepartment(currentStaff.department || 'Retail & Print Operations');
      setPin(currentStaff.pin || '1234');
      setProfilePictureUrl(currentStaff.profilePictureUrl || currentStaff.avatar || '');
      setShowPasswordChange(false);
      setNewPassword('');
      setConfirmPassword('');
      setErrorMessage(null);
      setSuccessMessage(null);
    }
  }, [isOpen, currentStaff]);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.type)) {
      setErrorMessage('Please select a valid image file (JPG, PNG, WebP).');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage('Image file must be under 5MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setProfilePictureUrl(reader.result as string);
      setErrorMessage(null);
    };
    reader.onerror = () => {
      setErrorMessage('Failed to read image file.');
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!firstName.trim() || !lastName.trim()) {
      setErrorMessage('First Name and Last Name are required.');
      return;
    }

    if (!email.trim() || !email.includes('@')) {
      setErrorMessage('A valid email address is required.');
      return;
    }

    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      setErrorMessage('Quick Terminal PIN must be exactly 4 numeric digits.');
      return;
    }

    if (showPasswordChange && newPassword) {
      if (newPassword.length < 6) {
        setErrorMessage('New password must be at least 6 characters.');
        return;
      }
      if (newPassword !== confirmPassword) {
        setErrorMessage('New password and confirm password do not match.');
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const result = await authService.updateStaffProfile(currentStaff.id, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        name: `${firstName.trim()} ${lastName.trim()}`,
        email: email.trim().toLowerCase(),
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
        city: city.trim() || undefined,
        jobTitle: jobTitle.trim() || undefined,
        department: department.trim() || undefined,
        pin: pin.trim(),
        profilePictureUrl: profilePictureUrl || undefined,
        avatar: profilePictureUrl || undefined,
        ...(showPasswordChange && newPassword ? { newPassword } : {}),
      });

      if (result.success && result.staff) {
        sound.playCheckoutSuccess();
        setSuccessMessage('Profile and account details saved successfully!');
        onProfileUpdated(result.staff);
        setTimeout(() => {
          onClose();
        }, 1200);
      } else {
        setErrorMessage(result.error || 'Failed to update profile.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'An unexpected error occurred while saving.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-[#fdfbf7] dark:bg-[#1a1714] border border-[#e6dfd5] dark:border-[#362e26] w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 border-b border-[#e6dfd5] dark:border-[#362e26] bg-white dark:bg-[#201c18] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#064e3b] text-white flex items-center justify-center shadow-xs">
              <ShieldCheck className="w-5 h-5 text-[#6ee7b7]" />
            </div>
            <div>
              <h2 className="text-base font-black text-stone-900 dark:text-stone-100 flex items-center gap-2">
                <span>My Profile &amp; Staff Account</span>
              </h2>
              <p className="text-xs text-stone-500">
                Manage personal profile picture, credentials, and staff information
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 flex items-center justify-center text-stone-500 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSaveProfile} className="p-5 space-y-5 max-h-[calc(85vh-120px)] overflow-y-auto">
          {/* Alerts */}
          {errorMessage && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/60 rounded-xl text-xs text-rose-800 dark:text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900/60 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Section 1: Profile Photo */}
          <div className="p-4 bg-white dark:bg-[#201c18] border border-[#e6dfd5] dark:border-[#362e26] rounded-2xl flex flex-col sm:flex-row items-center gap-4">
            <div className="relative group shrink-0">
              <div className="w-20 h-20 rounded-2xl overflow-hidden border-2 border-emerald-600/30 bg-stone-100 dark:bg-stone-800 flex items-center justify-center shadow-xs">
                {profilePictureUrl ? (
                  <img
                    src={profilePictureUrl}
                    alt={currentStaff.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User className="w-10 h-10 text-stone-400" />
                )}
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute -bottom-1.5 -right-1.5 p-1.5 rounded-full bg-[#064e3b] text-white hover:bg-[#043b2c] shadow-md transition"
                title="Change Photo"
              >
                <Camera className="w-3.5 h-3.5 text-[#6ee7b7]" />
              </button>
            </div>

            <div className="flex-1 space-y-2 text-center sm:text-left">
              <div>
                <h4 className="text-xs font-bold text-stone-900 dark:text-stone-100">
                  Profile Picture
                </h4>
                <p className="text-[11px] text-stone-500">
                  Visible to teammates and on receipt headers. JPG, PNG, or WebP.
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-[#064e3b] dark:text-[#6ee7b7] border border-emerald-200 dark:border-emerald-800 text-xs font-bold hover:bg-emerald-100 transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload Picture</span>
                </button>

                {profilePictureUrl && (
                  <button
                    type="button"
                    onClick={() => setProfilePictureUrl('')}
                    className="px-2.5 py-1.5 rounded-lg text-stone-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-semibold transition flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remove</span>
                  </button>
                )}
              </div>

              {/* Avatar presets */}
              <div className="pt-1 flex items-center gap-1.5 justify-center sm:justify-start">
                <span className="text-[10px] text-stone-400">Presets:</span>
                {AVATAR_PRESETS.slice(0, 5).map((url, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setProfilePictureUrl(url)}
                    className="w-5 h-5 rounded-full overflow-hidden border border-stone-200 hover:scale-110 transition"
                  >
                    <img src={url} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Section 2: Account Badges & Identification */}
          <div className="grid grid-cols-2 gap-3 p-3 bg-stone-100/70 dark:bg-stone-800/40 rounded-xl text-xs">
            <div>
              <span className="text-[10px] text-stone-400 uppercase font-mono block">Employee ID</span>
              <span className="font-extrabold text-stone-900 dark:text-stone-100 font-mono">
                {currentStaff.employeeId || 'SAP-EMP-1001'}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-stone-400 uppercase font-mono block">System Role</span>
              <span className="inline-block px-2 py-0.5 rounded bg-emerald-100 text-[#064e3b] dark:bg-emerald-950 dark:text-[#6ee7b7] font-bold text-[11px] uppercase font-mono">
                {currentStaff.role}
              </span>
            </div>
          </div>

          {/* Section 3: Personal Details */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-emerald-600" />
              <span>Personal Information</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-semibold mb-1 text-stone-700 dark:text-stone-300">
                  First Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl p-2.5 font-medium"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1 text-stone-700 dark:text-stone-300">
                  Last Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl p-2.5 font-medium"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1 text-stone-700 dark:text-stone-300">
                  Email Address <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl p-2.5 font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1 text-stone-700 dark:text-stone-300">
                  Contact Phone
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+251 9..."
                  className="w-full bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl p-2.5 font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1 text-stone-700 dark:text-stone-300">
                  Physical Address
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Street / Area"
                  className="w-full bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl p-2.5"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1 text-stone-700 dark:text-stone-300">
                  City / Town
                </label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="e.g. Addis Ababa"
                  className="w-full bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl p-2.5"
                />
              </div>
            </div>
          </div>

          {/* Section 4: Employment Details */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
              <Briefcase className="w-3.5 h-3.5 text-emerald-600" />
              <span>Employment Information</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-semibold mb-1 text-stone-700 dark:text-stone-300">
                  Job Title
                </label>
                <input
                  type="text"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder="e.g. Senior Cashier"
                  className="w-full bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl p-2.5"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1 text-stone-700 dark:text-stone-300">
                  Department
                </label>
                <input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="e.g. Retail & Printing"
                  className="w-full bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl p-2.5"
                />
              </div>
            </div>
          </div>

          {/* Section 5: Terminal PIN & Security */}
          <div className="p-4 bg-white dark:bg-[#201c18] border border-[#e6dfd5] dark:border-[#362e26] rounded-2xl space-y-3">
            <h4 className="text-xs font-bold text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-emerald-600" />
              <span>Register Terminal PIN &amp; Password</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-semibold mb-1 text-stone-700 dark:text-stone-300">
                  4-Digit Quick Terminal PIN <span className="text-rose-500">*</span>
                </label>
                <input
                  type="password"
                  maxLength={4}
                  required
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="1234"
                  className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl p-2.5 font-mono text-center tracking-widest text-base font-bold"
                />
                <span className="text-[10px] text-stone-400 mt-1 block">
                  Used for fast switching between staff on the register
                </span>
              </div>

              <div className="flex flex-col justify-end">
                <button
                  type="button"
                  onClick={() => setShowPasswordChange(!showPasswordChange)}
                  className="py-2.5 px-3 rounded-xl border border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <KeyRound className="w-3.5 h-3.5 text-[#064e3b] dark:text-[#6ee7b7]" />
                  <span>{showPasswordChange ? 'Cancel Password Change' : 'Change Login Password'}</span>
                </button>
              </div>
            </div>

            {showPasswordChange && (
              <div className="pt-2 border-t border-stone-100 dark:border-stone-800 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs animate-in fade-in">
                <div>
                  <label className="block font-semibold mb-1 text-stone-700 dark:text-stone-300">
                    New Password
                  </label>
                  <div className="relative">
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Minimum 6 characters"
                      className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl p-2.5 pr-8"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400"
                    >
                      {showNewPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block font-semibold mb-1 text-stone-700 dark:text-stone-300">
                    Confirm New Password
                  </label>
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat new password"
                    className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl p-2.5"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="pt-3 border-t border-[#e6dfd5] dark:border-[#362e26] flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 text-xs font-bold transition cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 rounded-xl bg-[#064e3b] hover:bg-[#043b2c] text-white text-xs font-black shadow-md transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-[#6ee7b7]" />
                  <span>Saving Profile...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 text-[#6ee7b7]" />
                  <span>Save Profile Changes</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
