import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldCheck,
  Lock,
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
  ArrowRight,
  ArrowLeft,
  Trash2,
  Sparkles,
  Building,
  Calendar,
  Clock,
  Check,
} from 'lucide-react';
import { authService, RegisterStaffPayload } from '../../services/authService';
import { storage } from '../../services/storage';
import { sound } from '../../services/sound';
import { Staff, StaffRole } from '../../types';

interface MasterPasscodeSignupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (staff: Staff, isInitialAdmin: boolean) => void;
}

const AVATAR_PRESETS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&h=256&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=256&h=256&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=256&h=256&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=256&h=256&q=80',
  'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=256&h=256&q=80',
  'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=256&h=256&q=80',
];

export const MasterPasscodeSignupModal: React.FC<MasterPasscodeSignupModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const isFirstSetup = !storage.hasAdminAccount();

  // Wizard Stage: 0 = Master Passcode Verification (or Skip), 1..5 = 5-Step Registration Form
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [signupToken, setSignupToken] = useState<string | null>(null);
  const [hasVerifiedPasscode, setHasVerifiedPasscode] = useState<boolean>(false);

  // Stage 0: Master Passcode Input
  const [passcode, setPasscode] = useState('');
  const [showPasscode, setShowPasscode] = useState(false);
  const [isVerifyingPasscode, setIsVerifyingPasscode] = useState(false);
  const [passcodeError, setPasscodeError] = useState<string | null>(null);
  const [lockoutRemaining, setLockoutRemaining] = useState<number>(0);

  // Step 1: Profile Picture
  const [profilePictureUrl, setProfilePictureUrl] = useState<string>('');
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 2: Personal Information
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  // Optional Personal Info
  const [gender, setGender] = useState('prefer_not_to_say');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [addressDetails, setAddressDetails] = useState('');

  // Step 3: Account Credentials
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Step 4: Employment Information
  const [selectedRole, setSelectedRole] = useState<StaffRole>('admin');
  const [jobTitle, setJobTitle] = useState('');
  const [department, setDepartment] = useState('Retail & Print Operations');
  const [pin, setPin] = useState('1234');
  // Optional Employment Info
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');
  const [bio, setBio] = useState('');
  const [displayName, setDisplayName] = useState('');

  // Auto-calculated preview Employee ID
  const [previewEmployeeId, setPreviewEmployeeId] = useState('SAP-EMP-1001');

  // Submission & Flow State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<{
    staff: Staff;
    isInitialAdmin: boolean;
  } | null>(null);

  // Sync lockout countdown
  useEffect(() => {
    const updateLockout = () => {
      const remaining = authService.getPasscodeLockoutRemaining();
      setLockoutRemaining(remaining);
    };
    updateLockout();
    const interval = setInterval(updateLockout, 1000);
    return () => clearInterval(interval);
  }, []);

  // Initialize defaults when modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(0);
      setSignupToken(null);
      setHasVerifiedPasscode(false);
      setPasscode('');
      setPasscodeError(null);
      setPhotoError(null);
      setSubmissionError(null);
      setSuccessInfo(null);
      setProfilePictureUrl('');
      setFirstName('');
      setLastName('');
      setUsername('');
      setEmail('');
      setPhone('');
      setAddress('');
      setCity('');
      setGender('prefer_not_to_say');
      setDateOfBirth('');
      setAddressDetails('');
      setPassword('');
      setConfirmPassword('');
      const defaultTitle = !storage.hasAdminAccount() ? 'Store Administrator' : 'POS Cashier';
      setSelectedRole(!storage.hasAdminAccount() ? 'admin' : 'admin');
      setJobTitle(defaultTitle);
      setDepartment('Retail & Print Operations');
      setPin('1234');
      setEmergencyContactName('');
      setEmergencyContactPhone('');
      setBio('');
      setDisplayName('');

      const staffCount = storage.getStaffList().length;
      setPreviewEmployeeId(`SAP-EMP-${1001 + staffCount}`);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // --- Handlers ---

  // Verify Master Passcode (Stage 0 -> Instant Approval)
  const handleVerifyPasscode = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasscodeError(null);

    if (lockoutRemaining > 0) {
      setPasscodeError(`Security lockout active. Please wait ${lockoutRemaining}s.`);
      return;
    }

    if (!passcode.trim()) {
      setPasscodeError('Please enter the store Master Passcode, or click "Skip & Wait for Admin Approval" below.');
      return;
    }

    setIsVerifyingPasscode(true);

    try {
      const result = await authService.verifyMasterPasscode(passcode.trim());
      setIsVerifyingPasscode(false);

      if (!result.valid || !result.signupToken) {
        sound.playError();
        setPasscodeError(result.error || 'Incorrect Master Passcode.');
        if (result.lockoutRemaining) {
          setLockoutRemaining(result.lockoutRemaining);
        }
        return;
      }

      sound.playSuccess();
      setSignupToken(result.signupToken);
      setHasVerifiedPasscode(true);
      setSelectedRole('admin');
      setJobTitle((prev) => (prev === 'POS Cashier' ? 'Store Administrator' : prev));
      // Reveal complete registration form starting at Step 1
      setCurrentStep(1);
    } catch (err: any) {
      setIsVerifyingPasscode(false);
      sound.playError();
      setPasscodeError(err?.message || 'Verification failed. Please try again.');
    }
  };

  // Skip Master Passcode (Stage 0 -> Wait for Admin Approval)
  const handleSkipPasscode = () => {
    setPasscodeError(null);
    setSignupToken(null);
    setHasVerifiedPasscode(false);
    setPasscode('');
    setSelectedRole('cashier');
    setJobTitle('POS Cashier');
    setCurrentStep(1);
  };

  // Profile Picture File Upload (Step 1)
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate type: JPG, JPEG, PNG, WebP
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type.toLowerCase())) {
      setPhotoError('Invalid file format. Please upload JPG, PNG, or WebP.');
      return;
    }

    // Validate size: max 2MB
    if (file.size > 2 * 1024 * 1024) {
      setPhotoError('Image file is too large. Maximum size is 2MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setProfilePictureUrl(reader.result);
        setPhotoError(null);
      }
    };
    reader.onerror = () => {
      setPhotoError('Failed to read image file. Please try again.');
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = () => {
    setProfilePictureUrl('');
    setPhotoError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Step 1 Validation & Next
  const handleStep1Next = () => {
    if (!profilePictureUrl) {
      setPhotoError('Profile picture is mandatory. Please upload or select a picture.');
      return;
    }
    setPhotoError(null);
    setCurrentStep(2);
  };

  // Step 2 Validation & Next
  const handleStep2Next = () => {
    if (!firstName.trim() || !lastName.trim()) {
      setSubmissionError('First Name and Last Name are required.');
      return;
    }
    if (!username.trim() || username.trim().length < 3) {
      setSubmissionError('Username must be at least 3 characters.');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim() || !emailRegex.test(email.trim())) {
      setSubmissionError('A valid email address is required.');
      return;
    }
    if (!phone.trim()) {
      setSubmissionError('Phone number is required.');
      return;
    }
    if (!address.trim() || !city.trim()) {
      setSubmissionError('Physical Address and City / Town are required.');
      return;
    }

    setSubmissionError(null);
    setCurrentStep(3);
  };

  // Step 3 Validation & Next
  const handleStep3Next = () => {
    if (!password || password.length < 8) {
      setSubmissionError('Password must be at least 8 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setSubmissionError('Passwords do not match.');
      return;
    }
    setSubmissionError(null);
    setCurrentStep(4);
  };

  // Step 4 Validation & Next
  const handleStep4Next = () => {
    if (!jobTitle.trim()) {
      setSubmissionError('Job Title is required.');
      return;
    }
    if (!department.trim()) {
      setSubmissionError('Department is required.');
      return;
    }
    setSubmissionError(null);
    setCurrentStep(5);
  };

  // Step 5: Final Submission
  const handleFinalSubmit = async () => {
    setSubmissionError(null);
    setIsSubmitting(true);

    try {
      const payload: RegisterStaffPayload = {
        signupToken: hasVerifiedPasscode ? signupToken || undefined : undefined,
        masterPasscode: hasVerifiedPasscode ? passcode.trim() || undefined : undefined,
        role: hasVerifiedPasscode ? selectedRole : 'cashier',
        profilePictureUrl,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        username: username.trim().toLowerCase(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        address: address.trim(),
        city: city.trim(),
        addressDetails: addressDetails.trim() || undefined,
        gender: gender !== 'prefer_not_to_say' ? gender : undefined,
        dateOfBirth: dateOfBirth || undefined,
        password,
        confirmPassword,
        jobTitle: jobTitle.trim(),
        department: department.trim(),
        pin: pin.trim() || '1234',
        emergencyContactName: emergencyContactName.trim() || undefined,
        emergencyContactPhone: emergencyContactPhone.trim() || undefined,
        bio: bio.trim() || undefined,
        displayName: displayName.trim() || `${firstName.trim()} ${lastName.trim()}`,
      };

      const result = await authService.registerStaff(payload);
      setIsSubmitting(false);

      if (!result.success || !result.staff) {
        sound.playError();
        setSubmissionError(result.error || 'Account creation failed. Please try again.');
        return;
      }

      sound.playCheckoutSuccess();

      const isApproved =
        result.approvedByMasterPasscode ||
        result.isInitialAdmin ||
        result.staff.approvalStatus === 'approved';

      if (isApproved) {
        onSuccess(result.staff, true);
        onClose();
      } else {
        setSuccessInfo({
          staff: result.staff,
          isInitialAdmin: false,
        });
      }
    } catch (err: any) {
      setIsSubmitting(false);
      sound.playError();
      setSubmissionError(err?.message || 'An unexpected error occurred during account creation.');
    }
  };

  const stepsList = [
    { num: 1, title: 'Profile Photo' },
    { num: 2, title: 'Personal Info' },
    { num: 3, title: 'Credentials' },
    { num: 4, title: 'Employment' },
    { num: 5, title: 'Review' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs animate-in fade-in overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-[#fdfbf7] dark:bg-[#1a1715] rounded-3xl shadow-2xl border border-stone-200 dark:border-stone-800 overflow-hidden my-auto max-h-[94vh] flex flex-col">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-[#064e3b] to-[#043b2c] text-white flex items-center justify-between shrink-0 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#6ee7b7] text-[#064e3b] flex items-center justify-center font-black text-lg shadow-inner">
              S
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold tracking-tight">
                  {isFirstSetup ? 'Primary Administrator Setup' : 'Create Staff Account'}
                </h2>
                <span className="text-[10px] bg-emerald-700/70 text-[#6ee7b7] px-2 py-0.5 rounded-full border border-emerald-500/30 uppercase tracking-wider font-semibold">
                  Sappy Stationary
                </span>
              </div>
              <p className="text-xs text-emerald-100/80">
                stationery & printing • Authorized Retail Terminal Registration
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-emerald-200 hover:text-white hover:bg-emerald-800/60 rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Wizard Step Indicator Bar (Visible when in Registration Steps 1-5) */}
        {currentStep >= 1 && !successInfo && (
          <div className="bg-stone-100 dark:bg-stone-900 px-6 py-3 border-b border-stone-200 dark:border-stone-800">
            <div className="flex items-center justify-between max-w-lg mx-auto">
              {stepsList.map((st) => (
                <div key={st.num} className="flex items-center gap-1.5">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition ${
                      currentStep === st.num
                        ? 'bg-[#064e3b] text-white shadow-xs'
                        : currentStep > st.num
                        ? 'bg-[#6ee7b7] text-[#064e3b]'
                        : 'bg-stone-200 dark:bg-stone-800 text-stone-500'
                    }`}
                  >
                    {currentStep > st.num ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : st.num}
                  </div>
                  <span
                    className={`text-[11px] hidden sm:inline font-semibold ${
                      currentStep === st.num
                        ? 'text-[#064e3b] dark:text-[#6ee7b7]'
                        : 'text-stone-500 dark:text-stone-400'
                    }`}
                  >
                    {st.title}
                  </span>
                  {st.num < 5 && (
                    <div className="w-4 sm:w-8 h-0.5 bg-stone-300 dark:bg-stone-700 mx-1"></div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 text-stone-800 dark:text-stone-200">
          {/* ============================================================== */}
          {/* SUCCESS SCREEN FOR PENDING STAFF ACCOUNTS                      */}
          {/* ============================================================== */}
          {successInfo ? (
            <div className="text-center py-6 space-y-4">
              <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-[#6ee7b7] flex items-center justify-center shadow-inner">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-stone-900 dark:text-white">
                  Registration Submitted Successfully!
                </h3>
                <p className="text-xs text-stone-600 dark:text-stone-400 mt-1 max-w-md mx-auto">
                  Staff account for <strong>{successInfo.staff.name}</strong> has been registered. In accordance with security protocol, new staff accounts require administrator approval before logging in to the POS terminal.
                </p>
              </div>

              {/* Summary Badge Card */}
              <div className="max-w-sm mx-auto p-4 bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 text-left space-y-2 shadow-xs">
                <div className="flex items-center gap-3">
                  <img
                    src={successInfo.staff.avatar || AVATAR_PRESETS[0]}
                    alt={successInfo.staff.name}
                    className="w-12 h-12 rounded-full object-cover border-2 border-[#064e3b]"
                  />
                  <div>
                    <h4 className="font-bold text-sm text-stone-900 dark:text-white">
                      {successInfo.staff.name}
                    </h4>
                    <p className="text-xs font-mono text-[#064e3b] dark:text-[#6ee7b7] font-semibold">
                      ID: {successInfo.staff.employeeId}
                    </p>
                    <p className="text-[11px] text-stone-500">
                      @{successInfo.staff.username} • {successInfo.staff.jobTitle}
                    </p>
                  </div>
                </div>
                <div className="pt-2 border-t border-stone-200 dark:border-stone-800 text-[11px] flex justify-between text-stone-600 dark:text-stone-400">
                  <span>Account Status:</span>
                  <span className="font-bold uppercase text-amber-600 dark:text-amber-400">
                    Pending Administrator Approval
                  </span>
                </div>
              </div>

              <div className="pt-3">
                <button
                  type="button"
                  onClick={() => {
                    onSuccess(successInfo.staff, false);
                    onClose();
                  }}
                  className="px-6 py-2.5 bg-[#064e3b] hover:bg-[#043b2c] text-white rounded-xl text-xs font-bold transition shadow-md cursor-pointer"
                >
                  Return to Sign In
                </button>
              </div>
            </div>
          ) : currentStep === 0 ? (
            /* ============================================================== */
            /* STAGE 0: MASTER PASSCODE FOR INSTANT APPROVAL OR SKIP         */
            /* ============================================================== */
            <form onSubmit={handleVerifyPasscode} className="space-y-5 max-w-md mx-auto py-4">
              <div className="text-center space-y-2">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-[#064e3b] dark:text-[#6ee7b7] flex items-center justify-center shadow-inner">
                  <ShieldCheck className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100">
                  Master Passcode Authorization
                </h3>
                <p className="text-xs text-stone-600 dark:text-stone-400">
                  Enter the store <strong>Master Passcode</strong> for <strong>instant account approval</strong>. If you do not know the Master Passcode, you can skip it and your account will wait for administrator approval.
                </p>
              </div>

              {passcodeError && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/60 rounded-xl text-xs text-rose-800 dark:text-rose-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{passcodeError}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300">
                  Master Passcode (For Instant Approval)
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                  <input
                    type={showPasscode ? 'text' : 'password'}
                    disabled={lockoutRemaining > 0 || isVerifyingPasscode}
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                    placeholder="Enter store Master Passcode"
                    className="w-full bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-xl pl-9 pr-10 py-2.5 text-xs text-stone-900 dark:text-white placeholder-stone-400 focus:outline-hidden focus:border-[#064e3b] focus:ring-1 focus:ring-[#064e3b]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasscode(!showPasscode)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 cursor-pointer"
                  >
                    {showPasscode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {lockoutRemaining > 0 ? (
                  <p className="text-[11px] text-rose-600 dark:text-rose-400 flex items-center gap-1 font-semibold">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Rate limit active: {lockoutRemaining}s remaining.</span>
                  </p>
                ) : (
                  <p className="text-[11px] text-stone-500">
                    Anyone who verifies the Master Passcode is approved immediately without waiting.
                  </p>
                )}
              </div>

              <div className="pt-2 space-y-2.5">
                <button
                  type="submit"
                  disabled={isVerifyingPasscode || lockoutRemaining > 0}
                  className="w-full py-2.5 bg-[#064e3b] hover:bg-[#043b2c] disabled:opacity-50 text-white rounded-xl text-xs font-bold transition shadow-md flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isVerifyingPasscode ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Verifying Passcode...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      <span>Verify Passcode &amp; Approve Instantly</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleSkipPasscode}
                  className="w-full py-2.5 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-700 rounded-xl text-xs font-semibold transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <span>Don&apos;t know Master Passcode? Continue &amp; Wait for Approval</span>
                </button>
              </div>
            </form>
          ) : (
            /* ============================================================== */
            /* STAGE 1..5: 5-STEP REGISTRATION WIZARD (Requirements #4 & #5) */
            /* ============================================================== */
            <div className="space-y-5">
              {submissionError && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/60 rounded-xl text-xs text-rose-800 dark:text-rose-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{submissionError}</span>
                </div>
              )}

              {/* ----------------------------------------------------------- */}
              {/* STEP 1: PROFILE PICTURE                                     */}
              {/* ----------------------------------------------------------- */}
              {currentStep === 1 && (
                <div className="space-y-5 py-2">
                  <div className="text-center space-y-1">
                    <h3 className="text-base font-bold text-stone-900 dark:text-white">
                      Step 1 — Profile Picture
                    </h3>
                    <p className="text-xs text-stone-500">
                      A clear profile picture is required for staff identification on the register.
                    </p>
                  </div>

                  {photoError && (
                    <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/60 rounded-xl text-xs text-rose-800 dark:text-rose-300 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>{photoError}</span>
                    </div>
                  )}

                  {/* Large Circular Image Placeholder */}
                  <div className="flex flex-col items-center justify-center space-y-4">
                    <div className="relative group">
                      <div className="w-36 h-36 rounded-full overflow-hidden border-4 border-[#064e3b] dark:border-[#6ee7b7] bg-stone-100 dark:bg-stone-800 shadow-md flex items-center justify-center">
                        {profilePictureUrl ? (
                          <img
                            src={profilePictureUrl}
                            alt="Profile Preview"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="flex flex-col items-center text-stone-400">
                            <Camera className="w-12 h-12 mb-1" />
                            <span className="text-[10px] font-semibold uppercase tracking-wider">
                              No Photo
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Photo Action Buttons */}
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <input
                        type="file"
                        ref={fileInputRef}
                        accept="image/jpeg,image/jpg,image/png,image/webp"
                        onChange={handlePhotoUpload}
                        className="hidden"
                      />
                      {!profilePictureUrl ? (
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="px-4 py-2 bg-[#064e3b] hover:bg-[#043b2c] text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>Upload Picture</span>
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="px-3.5 py-1.5 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer border border-stone-300 dark:border-stone-700"
                          >
                            <Upload className="w-3.5 h-3.5" />
                            <span>Change Picture</span>
                          </button>
                          <button
                            type="button"
                            onClick={handleRemovePhoto}
                            className="px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer border border-rose-200 dark:border-rose-900"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Remove Picture</span>
                          </button>
                        </>
                      )}
                    </div>

                    {/* Preset Avatars Option */}
                    <div className="text-center pt-2">
                      <span className="text-[11px] text-stone-500 block mb-2 font-medium">
                        Or select an authorized staff preset avatar:
                      </span>
                      <div className="flex justify-center gap-2">
                        {AVATAR_PRESETS.map((url, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              setProfilePictureUrl(url);
                              setPhotoError(null);
                            }}
                            className={`w-9 h-9 rounded-full overflow-hidden border-2 transition cursor-pointer ${
                              profilePictureUrl === url
                                ? 'border-[#064e3b] dark:border-[#6ee7b7] scale-110 shadow-md'
                                : 'border-stone-300 dark:border-stone-700 opacity-70 hover:opacity-100'
                            }`}
                          >
                            <img src={url} alt={`Preset ${idx}`} className="w-full h-full object-cover" />
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Navigation Buttons */}
                  <div className="flex justify-end pt-4 border-t border-stone-200 dark:border-stone-800">
                    <button
                      type="button"
                      onClick={handleStep1Next}
                      className="px-5 py-2.5 bg-[#064e3b] hover:bg-[#043b2c] text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>Proceed to Personal Information</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* ----------------------------------------------------------- */}
              {/* STEP 2: PERSONAL INFORMATION                                */}
              {/* ----------------------------------------------------------- */}
              {currentStep === 2 && (
                <div className="space-y-4 py-1">
                  <div className="space-y-1">
                    <h3 className="text-base font-bold text-stone-900 dark:text-white">
                      Step 2 — Personal Information
                    </h3>
                    <p className="text-xs text-stone-500">
                      Enter contact details and employee profile information.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold mb-1">First Name *</label>
                      <input
                        type="text"
                        required
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        placeholder="e.g. Samuel"
                        className="w-full bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-xl px-3 py-2 text-xs focus:outline-hidden focus:border-[#064e3b]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1">Last Name *</label>
                      <input
                        type="text"
                        required
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        placeholder="e.g. Alemayehu"
                        className="w-full bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-xl px-3 py-2 text-xs focus:outline-hidden focus:border-[#064e3b]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold mb-1">Unique Username *</label>
                      <div className="relative">
                        <User className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                        <input
                          type="text"
                          required
                          value={username}
                          onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s+/g, ''))}
                          placeholder="e.g. samuel.a"
                          className="w-full bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-xl pl-8 pr-3 py-2 text-xs focus:outline-hidden focus:border-[#064e3b]"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1">Email Address *</label>
                      <div className="relative">
                        <Mail className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                        <input
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="samuel@sappystationary.com"
                          className="w-full bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-xl pl-8 pr-3 py-2 text-xs focus:outline-hidden focus:border-[#064e3b]"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold mb-1">Phone Number *</label>
                      <div className="relative">
                        <Phone className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                        <input
                          type="tel"
                          required
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="+251 911 234 567"
                          className="w-full bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-xl pl-8 pr-3 py-2 text-xs focus:outline-hidden focus:border-[#064e3b]"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1">City / Town *</label>
                      <div className="relative">
                        <Building className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                        <input
                          type="text"
                          required
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                          placeholder="Addis Ababa"
                          className="w-full bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-xl pl-8 pr-3 py-2 text-xs focus:outline-hidden focus:border-[#064e3b]"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1">Physical Address *</label>
                      <div className="relative">
                        <MapPin className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                        <input
                          type="text"
                          required
                          value={address}
                          onChange={(e) => setAddress(e.target.value)}
                          placeholder="Bole Sub-City, Kebele 03"
                          className="w-full bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-xl pl-8 pr-3 py-2 text-xs focus:outline-hidden focus:border-[#064e3b]"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Optional Personal Information Accordion / Fields */}
                  <div className="p-3 bg-stone-50 dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 space-y-2">
                    <span className="text-[11px] font-bold text-stone-500 uppercase tracking-wider block">
                      Optional Personal Details
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[11px] text-stone-500 mb-0.5">Gender (Optional)</label>
                        <select
                          value={gender}
                          onChange={(e) => setGender(e.target.value)}
                          className="w-full bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl px-2.5 py-1.5 text-xs focus:outline-hidden"
                        >
                          <option value="prefer_not_to_say">Prefer not to say</option>
                          <option value="female">Female</option>
                          <option value="male">Male</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] text-stone-500 mb-0.5">Date of Birth (Optional)</label>
                        <input
                          type="date"
                          value={dateOfBirth}
                          onChange={(e) => setDateOfBirth(e.target.value)}
                          className="w-full bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl px-2.5 py-1.5 text-xs focus:outline-hidden"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-stone-500 mb-0.5">Additional Address Details</label>
                        <input
                          type="text"
                          value={addressDetails}
                          onChange={(e) => setAddressDetails(e.target.value)}
                          placeholder="Building, Floor, Suite"
                          className="w-full bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl px-2.5 py-1.5 text-xs focus:outline-hidden"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Navigation Buttons */}
                  <div className="flex justify-between pt-3 border-t border-stone-200 dark:border-stone-800">
                    <button
                      type="button"
                      onClick={() => setCurrentStep(1)}
                      className="px-4 py-2 border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-300 rounded-xl text-xs font-semibold hover:bg-stone-100 dark:hover:bg-stone-800 transition flex items-center gap-1 cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Back</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleStep2Next}
                      className="px-5 py-2.5 bg-[#064e3b] hover:bg-[#043b2c] text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>Proceed to Account Security</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* ----------------------------------------------------------- */}
              {/* STEP 3: ACCOUNT SECURITY                                    */}
              {/* ----------------------------------------------------------- */}
              {currentStep === 3 && (
                <div className="space-y-4 py-1">
                  <div className="space-y-1">
                    <h3 className="text-base font-bold text-stone-900 dark:text-white">
                      Step 3 — Account Credentials & Security
                    </h3>
                    <p className="text-xs text-stone-500">
                      Configure your secure login password (minimum 8 characters).
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold mb-1">Password *</label>
                      <div className="relative">
                        <Lock className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                        <input
                          type={showPassword ? 'text' : 'password'}
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••••••"
                          className="w-full bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-xl pl-8 pr-9 py-2 text-xs focus:outline-hidden focus:border-[#064e3b]"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 cursor-pointer"
                        >
                          {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1">Confirm Password *</label>
                      <div className="relative">
                        <Lock className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                        <input
                          type={showConfirmPassword ? 'text' : 'password'}
                          required
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="••••••••••••"
                          className="w-full bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-xl pl-8 pr-9 py-2 text-xs focus:outline-hidden focus:border-[#064e3b]"
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 cursor-pointer"
                        >
                          {showConfirmPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Password Requirements Checklist */}
                  <div className="p-3 bg-stone-50 dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 space-y-1.5">
                    <span className="text-[11px] font-bold text-stone-500 uppercase tracking-wider block">
                      Password Requirements
                    </span>
                    <div className="space-y-1 text-xs">
                      <div className={`flex items-center gap-2 ${password.length >= 8 ? 'text-emerald-700 dark:text-emerald-400' : 'text-stone-400'}`}>
                        <Check className="w-3.5 h-3.5" />
                        <span>At least 8 characters long ({password.length}/8)</span>
                      </div>
                      <div className={`flex items-center gap-2 ${password.length > 0 && password === confirmPassword ? 'text-emerald-700 dark:text-emerald-400' : 'text-stone-400'}`}>
                        <Check className="w-3.5 h-3.5" />
                        <span>Passwords match exactly</span>
                      </div>
                    </div>
                  </div>

                  {/* Navigation Buttons */}
                  <div className="flex justify-between pt-3 border-t border-stone-200 dark:border-stone-800">
                    <button
                      type="button"
                      onClick={() => setCurrentStep(2)}
                      className="px-4 py-2 border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-300 rounded-xl text-xs font-semibold hover:bg-stone-100 dark:hover:bg-stone-800 transition flex items-center gap-1 cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Back</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleStep3Next}
                      className="px-5 py-2.5 bg-[#064e3b] hover:bg-[#043b2c] text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>Proceed to Employment Info</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* ----------------------------------------------------------- */}
              {/* STEP 4: EMPLOYMENT INFORMATION                              */}
              {/* ----------------------------------------------------------- */}
              {currentStep === 4 && (
                <div className="space-y-4 py-1">
                  <div className="space-y-1">
                    <h3 className="text-base font-bold text-stone-900 dark:text-white">
                      Step 4 — Employment Information
                    </h3>
                    <p className="text-xs text-stone-500">
                      Store designation, department, and terminal quick PIN.
                    </p>
                  </div>

                  {/* Employee ID & Role Info Banner */}
                  <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 rounded-2xl flex items-center justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-emerald-800 dark:text-emerald-400 tracking-wider">
                        Generated Employee ID
                      </span>
                      <p className="text-sm font-mono font-bold text-[#064e3b] dark:text-[#6ee7b7]">
                        {previewEmployeeId}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] uppercase font-bold text-emerald-800 dark:text-emerald-400 tracking-wider">
                        Approval Status
                      </span>
                      <p className={`text-xs font-bold ${hasVerifiedPasscode ? 'text-[#064e3b] dark:text-[#6ee7b7]' : 'text-amber-600 dark:text-amber-400'}`}>
                        {hasVerifiedPasscode
                          ? `Instant Approval (${selectedRole.toUpperCase()})`
                          : 'POS Cashier (Pending Approval)'}
                      </p>
                    </div>
                  </div>

                  {hasVerifiedPasscode && (
                    <div>
                      <label className="block text-xs font-semibold mb-1">
                        System Role (Authorized by Master Passcode) *
                      </label>
                      <select
                        value={selectedRole}
                        onChange={(e) => setSelectedRole(e.target.value as StaffRole)}
                        className="w-full bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-hidden focus:border-[#064e3b]"
                      >
                        <option value="admin">Administrator (Full System &amp; Store Control)</option>
                        <option value="manager">Store Manager (Operations, Stock &amp; Refunds)</option>
                        <option value="cashier">POS Cashier (Register Checkout &amp; Sales)</option>
                        <option value="auditor">Inventory Auditor (Read-Only Reports &amp; Logs)</option>
                      </select>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold mb-1">Job Title *</label>
                      <div className="relative">
                        <Briefcase className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                        <input
                          type="text"
                          required
                          value={jobTitle}
                          onChange={(e) => setJobTitle(e.target.value)}
                          placeholder="e.g. Store Administrator"
                          className="w-full bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-xl pl-8 pr-3 py-2 text-xs focus:outline-hidden focus:border-[#064e3b]"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1">Department *</label>
                      <div className="relative">
                        <Building className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                        <input
                          type="text"
                          required
                          value={department}
                          onChange={(e) => setDepartment(e.target.value)}
                          placeholder="Retail & Print Operations"
                          className="w-full bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-xl pl-8 pr-3 py-2 text-xs focus:outline-hidden focus:border-[#064e3b]"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1">
                      Terminal Quick PIN (4 Digits) *
                    </label>
                    <div className="relative max-w-xs">
                      <KeyRound className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                      <input
                        type="password"
                        maxLength={4}
                        required
                        value={pin}
                        onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                        placeholder="1234"
                        className="w-full bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-xl pl-8 pr-3 py-2 text-xs font-mono tracking-widest focus:outline-hidden focus:border-[#064e3b]"
                      />
                    </div>
                    <span className="text-[10px] text-stone-500 mt-1 block">
                      Used for rapid user switching on the POS terminal register.
                    </span>
                  </div>

                  {/* Optional Employment Information */}
                  <div className="p-3 bg-stone-50 dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 space-y-2">
                    <span className="text-[11px] font-bold text-stone-500 uppercase tracking-wider block">
                      Optional Contact & Profile Info
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] text-stone-500 mb-0.5">Emergency Contact Name</label>
                        <input
                          type="text"
                          value={emergencyContactName}
                          onChange={(e) => setEmergencyContactName(e.target.value)}
                          placeholder="e.g. Almaz Bekele"
                          className="w-full bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl px-2.5 py-1.5 text-xs focus:outline-hidden"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-stone-500 mb-0.5">Emergency Contact Phone</label>
                        <input
                          type="tel"
                          value={emergencyContactPhone}
                          onChange={(e) => setEmergencyContactPhone(e.target.value)}
                          placeholder="+251 911 000 000"
                          className="w-full bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl px-2.5 py-1.5 text-xs focus:outline-hidden"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] text-stone-500 mb-0.5">Preferred Display Name</label>
                      <input
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="e.g. Samuel A."
                        className="w-full bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl px-2.5 py-1.5 text-xs focus:outline-hidden"
                      />
                    </div>
                  </div>

                  {/* Navigation Buttons */}
                  <div className="flex justify-between pt-3 border-t border-stone-200 dark:border-stone-800">
                    <button
                      type="button"
                      onClick={() => setCurrentStep(3)}
                      className="px-4 py-2 border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-300 rounded-xl text-xs font-semibold hover:bg-stone-100 dark:hover:bg-stone-800 transition flex items-center gap-1 cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Back</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleStep4Next}
                      className="px-5 py-2.5 bg-[#064e3b] hover:bg-[#043b2c] text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>Proceed to Review</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* ----------------------------------------------------------- */}
              {/* STEP 5: REVIEW AND CREATE ACCOUNT                           */}
              {/* ----------------------------------------------------------- */}
              {currentStep === 5 && (
                <div className="space-y-4 py-1">
                  <div className="space-y-1">
                    <h3 className="text-base font-bold text-stone-900 dark:text-white">
                      Step 5 — Review and Create Account
                    </h3>
                    <p className="text-xs text-stone-500">
                      Review all profile information before submitting. You may go back to edit any section.
                    </p>
                  </div>

                  {/* Profile Summary Card */}
                  <div className="p-4 bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-xs space-y-4">
                    <div className="flex items-center gap-4">
                      <img
                        src={profilePictureUrl || AVATAR_PRESETS[0]}
                        alt="Profile"
                        className="w-16 h-16 rounded-full object-cover border-2 border-[#064e3b] dark:border-[#6ee7b7] shadow-sm"
                      />
                      <div>
                        <h4 className="text-base font-bold text-stone-900 dark:text-white">
                          {firstName} {lastName}
                        </h4>
                        <p className="text-xs font-mono font-semibold text-[#064e3b] dark:text-[#6ee7b7]">
                          ID: {previewEmployeeId}
                        </p>
                        <p className="text-xs text-stone-500">
                          @{username} • {jobTitle} ({department})
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-2 border-t border-stone-100 dark:border-stone-800">
                      <div>
                        <span className="text-stone-400 block text-[11px]">Email Address</span>
                        <span className="font-semibold text-stone-800 dark:text-stone-200">{email}</span>
                      </div>
                      <div>
                        <span className="text-stone-400 block text-[11px]">Contact Phone</span>
                        <span className="font-semibold text-stone-800 dark:text-stone-200">{phone}</span>
                      </div>
                      <div>
                        <span className="text-stone-400 block text-[11px]">Location</span>
                        <span className="font-semibold text-stone-800 dark:text-stone-200">{address}, {city}</span>
                      </div>
                      <div>
                        <span className="text-stone-400 block text-[11px]">Account Authorization</span>
                        <span className={`font-bold uppercase text-[11px] ${hasVerifiedPasscode ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                          {hasVerifiedPasscode
                            ? `${selectedRole.toUpperCase()} — Instant Approval (Active)`
                            : 'Cashier (Pending Admin Approval)'}
                        </span>
                      </div>
                    </div>

                    <div className="p-3 bg-stone-50 dark:bg-stone-800/60 rounded-xl text-xs text-stone-600 dark:text-stone-400 flex items-start gap-2">
                      <Sparkles className="w-4 h-4 text-[#064e3b] dark:text-[#6ee7b7] shrink-0 mt-0.5" />
                      <span>
                        {hasVerifiedPasscode
                          ? 'Master Passcode verified! This account will be automatically approved and activated immediately upon creation.'
                          : 'No Master Passcode was entered. This account will be created and placed in the Pending Approval queue until a Store Administrator approves it.'}
                      </span>
                    </div>
                  </div>

                  {/* Submission Buttons */}
                  <div className="flex justify-between pt-3 border-t border-stone-200 dark:border-stone-800">
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => setCurrentStep(4)}
                      className="px-4 py-2 border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-300 rounded-xl text-xs font-semibold hover:bg-stone-100 dark:hover:bg-stone-800 transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Back to Edit</span>
                    </button>
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={handleFinalSubmit}
                      className="px-6 py-2.5 bg-[#064e3b] hover:bg-[#043b2c] text-white rounded-xl text-xs font-bold transition shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Creating Account...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Create Account</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
