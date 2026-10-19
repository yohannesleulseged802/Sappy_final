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
  ArrowRight,
  ArrowLeft,
  Trash2,
  Sparkles,
  Info,
  Clock,
  Store,
  Check,
} from 'lucide-react';
import { authService, RegisterStaffPayload } from '../services/authService';
import { storage } from '../services/storage';
import { sound } from '../services/sound';
import { Staff } from '../types';

interface SignupViewProps {
  onSuccess: (staff: Staff, targetSection: string) => void;
  onBackToLogin: () => void;
  isInitialSetup?: boolean;
}

const AVATAR_PRESETS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&h=256&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=256&h=256&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=256&h=256&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=256&h=256&q=80',
  'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=256&h=256&q=80',
  'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=256&h=256&q=80',
];

export const SignupView: React.FC<SignupViewProps> = ({
  onSuccess,
  onBackToLogin,
  isInitialSetup = false,
}) => {
  // Phase 0: Passcode Verification Screen
  // Phase 1: 5-Step Registration Form
  // Phase 2: Completion
  const [passcodeVerified, setPasscodeVerified] = useState(false);
  const [signupToken, setSignupToken] = useState<string>('');
  const [currentStep, setCurrentStep] = useState<number>(1);

  // Passcode Input State
  const [masterPasscode, setMasterPasscode] = useState('');
  const [showPasscode, setShowPasscode] = useState(false);
  const [isVerifyingPasscode, setIsVerifyingPasscode] = useState(false);
  const [passcodeError, setPasscodeError] = useState<string | null>(null);
  const [lockoutSeconds, setLockoutSeconds] = useState<number>(0);

  // Form Fields State
  // Step 1: Profile Picture (Requirement #4.A & #5)
  const [profilePictureUrl, setProfilePictureUrl] = useState<string>(AVATAR_PRESETS[0]);
  const [imageError, setImageError] = useState<string | null>(null);

  // Step 2: Personal Information (Requirement #4.A & #5)
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('Bole Sub-City, Woreda 03');
  const [city, setCity] = useState('Addis Ababa');
  const [addressDetails, setAddressDetails] = useState('');
  const [gender, setGender] = useState('female');
  const [dateOfBirth, setDateOfBirth] = useState('');

  // Step 3: Account Security (Requirement #4.B & #5)
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [pin, setPin] = useState('1234');

  // Step 4: Employment Information (Requirement #4.C & #5)
  const existingStaff = storage.getStaffList();
  const isFirstAccount = isInitialSetup || existingStaff.length === 0 || !storage.hasAdminAccount();
  const autoEmployeeId = `SAP-EMP-${1001 + existingStaff.length}`;
  const [jobTitle, setJobTitle] = useState(isFirstAccount ? 'Store Administrator' : 'Lead POS Cashier');
  const [department, setDepartment] = useState('Retail & Print Operations');
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');
  const [bio, setBio] = useState('');
  const [displayName, setDisplayName] = useState('');

  // Step 5: Submission & Completion
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completedStaff, setCompletedStaff] = useState<Staff | null>(null);
  const [isCompletedAdmin, setIsCompletedAdmin] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Countdown timer for passcode lockout
  useEffect(() => {
    const update = () => {
      const remaining = authService.getPasscodeLockoutRemaining();
      setLockoutSeconds(remaining);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  // Handle Master Passcode Verification
  const handleVerifyPasscode = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasscodeError(null);

    if (lockoutSeconds > 0) {
      setPasscodeError(`Security lockout active. Please wait ${lockoutSeconds} seconds.`);
      return;
    }

    if (!masterPasscode.trim()) {
      setPasscodeError('Please enter the Master Passcode.');
      return;
    }

    setIsVerifyingPasscode(true);

    try {
      const result = await authService.verifyMasterPasscode(masterPasscode.trim());
      setIsVerifyingPasscode(false);

      if (!result.valid) {
        sound.playError();
        setPasscodeError(result.error || 'Incorrect Master Passcode.');
        if (result.lockoutRemaining) {
          setLockoutSeconds(result.lockoutRemaining);
        }
        return;
      }

      sound.playCheckoutSuccess();
      setSignupToken(result.signupToken || 'valid-token');
      setPasscodeVerified(true);
      setCurrentStep(1);
    } catch (err: any) {
      setIsVerifyingPasscode(false);
      sound.playError();
      setPasscodeError(err?.message || 'Verification error. Please retry.');
    }
  };

  // Image Upload Handling
  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImageError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type.toLowerCase())) {
      setImageError('Unsupported format. Please select a JPG, JPEG, PNG, or WebP image.');
      return;
    }

    if (file.size > 3 * 1024 * 1024) {
      setImageError('Image file size must be less than 3MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setProfilePictureUrl(reader.result);
      }
    };
    reader.onerror = () => {
      setImageError('Failed to read image file.');
    };
    reader.readAsDataURL(file);
  };

  // Step Validations
  const validateStep = (step: number): boolean => {
    setFormError(null);

    if (step === 1) {
      if (!profilePictureUrl || profilePictureUrl.trim().length === 0) {
        setFormError('Profile Picture is required. Please upload or choose a photo.');
        return false;
      }
      return true;
    }

    if (step === 2) {
      if (!firstName.trim() || !lastName.trim()) {
        setFormError('First Name and Last Name are required.');
        return false;
      }
      if (!username.trim() || username.trim().length < 3) {
        setFormError('Username must be at least 3 characters.');
        return false;
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!email.trim() || !emailRegex.test(email.trim())) {
        setFormError('Please enter a valid email address.');
        return false;
      }
      if (!phone.trim()) {
        setFormError('Phone number is required.');
        return false;
      }
      if (!address.trim() || !city.trim()) {
        setFormError('Address and City / Town are required.');
        return false;
      }
      return true;
    }

    if (step === 3) {
      if (!password || password.length < 8) {
        setFormError('Password must be at least 8 characters.');
        return false;
      }
      if (password !== confirmPassword) {
        setFormError('Passwords do not match.');
        return false;
      }
      if (!pin || pin.replace(/\D/g, '').length !== 4) {
        setFormError('Please enter a 4-digit numeric quick switcher PIN.');
        return false;
      }
      return true;
    }

    if (step === 4) {
      if (!jobTitle.trim()) {
        setFormError('Job Title is required.');
        return false;
      }
      return true;
    }

    return true;
  };

  const handleNextStep = () => {
    if (validateStep(currentStep)) {
      setFormError(null);
      setCurrentStep((prev) => Math.min(prev + 1, 5));
    } else {
      sound.playError();
    }
  };

  const handlePrevStep = () => {
    setFormError(null);
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  // Final Registration Submission
  const handleFinalSubmit = async () => {
    if (!validateStep(1) || !validateStep(2) || !validateStep(3) || !validateStep(4)) {
      sound.playError();
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const payload: RegisterStaffPayload = {
        signupToken,
        masterPasscode: masterPasscode.trim(),
        profilePictureUrl,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        username: username.trim().toLowerCase(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        address: address.trim(),
        city: city.trim(),
        addressDetails: addressDetails.trim() || undefined,
        gender,
        dateOfBirth: dateOfBirth || undefined,
        password,
        confirmPassword,
        jobTitle: jobTitle.trim(),
        department,
        emergencyContactName: emergencyContactName.trim() || undefined,
        emergencyContactPhone: emergencyContactPhone.trim() || undefined,
        bio: bio.trim() || undefined,
        displayName: displayName.trim() || undefined,
        pin: pin.trim(),
      };

      const result = await authService.registerStaff(payload);
      setIsSubmitting(false);

      if (!result.success || !result.staff) {
        sound.playError();
        setFormError(result.error || 'Failed to complete registration.');
        return;
      }

      sound.playCheckoutSuccess();
      setCompletedStaff(result.staff);
      setIsCompletedAdmin(!!result.isInitialAdmin);
    } catch (err: any) {
      setIsSubmitting(false);
      sound.playError();
      setFormError(err?.message || 'An error occurred during account creation.');
    }
  };

  return (
    <div className="min-h-screen bg-[#fdfbf7] dark:bg-[#12100e] text-[#26201b] dark:text-[#f5f1e8] flex flex-col justify-between font-sans selection:bg-[#6ee7b7] selection:text-[#064e3b]">
      {/* Top Brand Bar */}
      <div className="p-4 sm:p-6 max-w-6xl w-full mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#064e3b] text-[#6ee7b7] flex items-center justify-center font-black text-xl shadow-md">
            S
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight text-stone-900 dark:text-stone-100">
              Sappy Stationary
            </h1>
            <p className="text-[11px] text-[#064e3b] dark:text-[#6ee7b7] font-medium tracking-wide">
              stationery &amp; printing.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onBackToLogin}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-stone-600 dark:text-stone-400 hover:text-[#064e3b] dark:hover:text-[#6ee7b7] transition px-3 py-1.5 rounded-xl border border-stone-200 dark:border-stone-800 hover:bg-white dark:hover:bg-stone-900 cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Sign In</span>
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-2xl bg-white dark:bg-[#1a1715] rounded-3xl shadow-2xl border border-stone-200 dark:border-stone-800 overflow-hidden">
          
          {/* Header Banner */}
          <div className="px-6 py-5 bg-gradient-to-r from-[#064e3b] to-[#043b2c] text-white flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-700/60 text-[#6ee7b7] px-2 py-0.5 rounded-full border border-emerald-500/30">
                  {isFirstAccount ? 'Root Administrator Provisioning' : 'Personnel Onboarding'}
                </span>
                <span className="text-[10px] text-emerald-200/80 font-mono">
                  Fiscal Period 2026/27
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black">
                {isFirstAccount ? 'Initialize Store Administrator' : 'Create Staff Account'}
              </h2>
              <p className="text-xs text-emerald-100/80 mt-0.5">
                {isFirstAccount
                  ? 'Terminal Initialization: Establish primary root administrator'
                  : 'Authorized personnel registration with Master Passcode'}
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-xs flex items-center justify-center text-[#6ee7b7]">
              <ShieldCheck className="w-6 h-6" />
            </div>
          </div>

          {/* ================= STAGE 0: MASTER PASSCODE VERIFICATION ================= */}
          {!passcodeVerified ? (
            <div className="p-6 sm:p-8 space-y-6">
              <div className="space-y-2 text-center max-w-md mx-auto">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 text-[#064e3b] dark:text-[#6ee7b7] flex items-center justify-center border border-emerald-200 dark:border-emerald-800 shadow-sm">
                  <KeyRound className="w-7 h-7" />
                </div>
                <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100">
                  Master Passcode Required
                </h3>
                <p className="text-xs text-stone-500 leading-relaxed">
                  To safeguard store records and prevent unauthorized accounts, enter the store&apos;s Master Authorization Passcode before proceeding to the registration form.
                </p>
              </div>

              {/* Passcode Error Alert */}
              {passcodeError && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/60 rounded-xl text-xs text-rose-800 dark:text-rose-300 flex items-center gap-2 max-w-md mx-auto animate-in fade-in">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{passcodeError}</span>
                </div>
              )}

              <form onSubmit={handleVerifyPasscode} className="space-y-4 max-w-md mx-auto">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-stone-700 dark:text-stone-300">
                      Master Passcode *
                    </label>
                    <span className="text-[11px] text-stone-400 font-mono">
                      Passcode: <code className="bg-emerald-50 dark:bg-stone-800 px-1 py-0.5 rounded text-[#064e3b] dark:text-[#6ee7b7] font-bold">Sappy@1313</code>
                    </span>
                  </div>

                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
                    <input
                      type={showPasscode ? 'text' : 'password'}
                      required
                      disabled={lockoutSeconds > 0 || isVerifyingPasscode}
                      value={masterPasscode}
                      onChange={(e) => setMasterPasscode(e.target.value)}
                      placeholder="Enter Master Passcode"
                      className="w-full bg-[#fdfbf7] dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl pl-10 pr-10 py-3 text-sm focus:outline-hidden focus:border-[#064e3b] focus:ring-2 focus:ring-[#064e3b]/20"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasscode(!showPasscode)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 p-0.5"
                    >
                      {showPasscode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  {lockoutSeconds > 0 ? (
                    <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-2 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Rate limit lockout active: {lockoutSeconds}s remaining.</span>
                    </p>
                  ) : (
                    <p className="text-[11px] text-stone-400 mt-1.5">
                      Protected server verification prevents unauthorized employee onboarding.
                    </p>
                  )}
                </div>

                <div className="pt-2 flex flex-col gap-2">
                  <button
                    type="submit"
                    disabled={lockoutSeconds > 0 || isVerifyingPasscode}
                    className="w-full py-3 bg-[#064e3b] hover:bg-[#043b2c] disabled:opacity-50 text-white font-extrabold text-xs sm:text-sm rounded-xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isVerifyingPasscode ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Verifying Authorization...</span>
                      </>
                    ) : (
                      <>
                        <span>Unlock Registration Form</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={onBackToLogin}
                    className="w-full py-2.5 text-xs text-stone-500 hover:text-stone-900 dark:hover:text-stone-300 font-semibold transition text-center"
                  >
                    Cancel &amp; Return to Sign In
                  </button>
                </div>
              </form>
            </div>
          ) : completedStaff ? (
            /* ================= STAGE 2: REGISTRATION COMPLETION ================= */
            <div className="p-6 sm:p-10 text-center space-y-6">
              <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-[#064e3b] dark:text-[#6ee7b7] flex items-center justify-center shadow-inner">
                <CheckCircle2 className="w-10 h-10" />
              </div>

              <div>
                <h3 className="text-xl sm:text-2xl font-black text-stone-900 dark:text-white">
                  {isCompletedAdmin
                    ? 'Primary Administrator Initialized!'
                    : 'Staff Account Created Successfully!'}
                </h3>
                <p className="text-xs sm:text-sm text-stone-500 mt-1 max-w-md mx-auto">
                  {isCompletedAdmin
                    ? 'Your administrator credentials have been configured with full system access to products, register, and security.'
                    : 'Your staff account has been submitted. In accordance with store policy, it is now awaiting administrator approval.'}
                </p>
              </div>

              {/* Staff ID Badge Card */}
              <div className="max-w-md mx-auto p-5 bg-[#fdfbf7] dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 text-left space-y-3 shadow-xs">
                <div className="flex items-center gap-4">
                  <img
                    src={completedStaff.avatar || profilePictureUrl}
                    alt={completedStaff.name}
                    className="w-16 h-16 rounded-2xl object-cover border-2 border-[#064e3b] shadow-sm"
                  />
                  <div>
                    <h4 className="font-extrabold text-sm sm:text-base text-stone-900 dark:text-white">
                      {completedStaff.name}
                    </h4>
                    <p className="text-xs font-mono font-bold text-[#064e3b] dark:text-[#6ee7b7]">
                      {completedStaff.employeeId}
                    </p>
                    <p className="text-xs text-stone-500">
                      @{completedStaff.username} • {completedStaff.jobTitle}
                    </p>
                  </div>
                </div>

                <div className="pt-3 border-t border-stone-200 dark:border-stone-800 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-stone-400 block">Department</span>
                    <span className="font-semibold text-stone-800 dark:text-stone-200">
                      {completedStaff.department || 'Retail'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-stone-400 block">Status</span>
                    <span
                      className={`font-bold uppercase text-[11px] ${
                        completedStaff.approvalStatus === 'approved'
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      {completedStaff.approvalStatus === 'approved' ? 'Active / Approved' : 'Pending Approval'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-2">
                {isCompletedAdmin ? (
                  <button
                    type="button"
                    onClick={() => onSuccess(completedStaff, 'dashboard')}
                    className="px-8 py-3 bg-[#064e3b] hover:bg-[#043b2c] text-white text-xs sm:text-sm font-extrabold rounded-xl shadow-md transition inline-flex items-center gap-2 cursor-pointer"
                  >
                    <span>Launch POS Terminal</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onBackToLogin}
                    className="px-8 py-3 bg-[#064e3b] hover:bg-[#043b2c] text-white text-xs sm:text-sm font-extrabold rounded-xl shadow-md transition inline-flex items-center gap-2 cursor-pointer"
                  >
                    <span>Return to Sign In</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ) : (
            /* ================= STAGE 1: 5-STEP REGISTRATION FORM ================= */
            <div className="p-6 sm:p-8 space-y-6">
              
              {/* Stepper Navigation Bar */}
              <div>
                <div className="flex items-center justify-between mb-2 text-xs font-bold text-stone-600 dark:text-stone-400">
                  <span className="text-[#064e3b] dark:text-[#6ee7b7]">
                    Step {currentStep} of 5:
                    {currentStep === 1 && ' Profile Photo'}
                    {currentStep === 2 && ' Personal Details'}
                    {currentStep === 3 && ' Security & Credentials'}
                    {currentStep === 4 && ' Employment Information'}
                    {currentStep === 5 && ' Review & Create'}
                  </span>
                  <span className="text-stone-400 text-[11px] font-mono">
                    {Math.round((currentStep / 5) * 100)}% Complete
                  </span>
                </div>

                {/* Progress Bar */}
                <div className="w-full h-2 bg-stone-100 dark:bg-stone-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#064e3b] to-[#6ee7b7] transition-all duration-300"
                    style={{ width: `${(currentStep / 5) * 100}%` }}
                  />
                </div>
              </div>

              {/* Error Alert Box */}
              {formError && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/60 rounded-xl text-xs text-rose-800 dark:text-rose-300 flex items-center gap-2 animate-in fade-in">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* ================= STEP 1: PROFILE PICTURE (Requirement #4.A & #5) ================= */}
              {currentStep === 1 && (
                <div className="space-y-6 animate-in fade-in">
                  <div className="text-center space-y-1">
                    <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">
                      Mandatory Profile Photo
                    </h3>
                    <p className="text-xs text-stone-500">
                      Upload an official employee photograph or choose a staff avatar for terminal identification.
                    </p>
                  </div>

                  {/* Large Circular Image Placeholder (Requirement #5 Step 1) */}
                  <div className="flex flex-col items-center justify-center space-y-4">
                    <div className="relative group">
                      <img
                        src={profilePictureUrl}
                        alt="Profile Preview"
                        className="w-36 h-36 rounded-full object-cover border-4 border-[#064e3b] shadow-xl"
                      />
                      <div className="absolute bottom-1 right-1 p-2 bg-[#064e3b] text-white rounded-full shadow-md">
                        <Camera className="w-4 h-4" />
                      </div>
                    </div>

                    {imageError && (
                      <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">
                        {imageError}
                      </p>
                    )}

                    {/* Action Buttons: Upload, Change, Remove */}
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <input
                        type="file"
                        ref={fileInputRef}
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handleImageFileChange}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-4 py-2 bg-[#064e3b] hover:bg-[#043b2c] text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-sm cursor-pointer"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>Upload Picture</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-3.5 py-2 border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300 text-xs font-bold rounded-xl hover:bg-stone-50 dark:hover:bg-stone-800 transition cursor-pointer"
                      >
                        Change Picture
                      </button>

                      <button
                        type="button"
                        onClick={() => setProfilePictureUrl('')}
                        className="px-3.5 py-2 border border-rose-200 text-rose-600 dark:border-rose-900/60 dark:text-rose-400 text-xs font-bold rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/40 transition flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Remove Picture</span>
                      </button>
                    </div>

                    {/* Avatar Presets */}
                    <div className="pt-2 text-center">
                      <span className="text-[11px] text-stone-400 font-semibold block mb-2">
                        Or select a staff avatar preset:
                      </span>
                      <div className="flex justify-center gap-2">
                        {AVATAR_PRESETS.map((url, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => {
                              setProfilePictureUrl(url);
                              setImageError(null);
                            }}
                            className={`w-9 h-9 rounded-full overflow-hidden border-2 transition ${
                              profilePictureUrl === url
                                ? 'border-[#064e3b] scale-110 shadow-md ring-2 ring-[#064e3b]/30'
                                : 'border-transparent opacity-70 hover:opacity-100'
                            }`}
                          >
                            <img src={url} alt={`Preset ${i}`} className="w-full h-full object-cover" />
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ================= STEP 2: PERSONAL INFORMATION (Requirement #4.A & #5) ================= */}
              {currentStep === 2 && (
                <div className="space-y-4 animate-in fade-in">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold mb-1">First Name *</label>
                      <input
                        type="text"
                        required
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        placeholder="e.g. Samuel"
                        className="w-full bg-[#fdfbf7] dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl px-3 py-2 text-xs focus:outline-hidden focus:border-[#064e3b]"
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
                        className="w-full bg-[#fdfbf7] dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl px-3 py-2 text-xs focus:outline-hidden focus:border-[#064e3b]"
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
                          className="w-full bg-[#fdfbf7] dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl pl-8 pr-3 py-2 text-xs focus:outline-hidden focus:border-[#064e3b]"
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
                          className="w-full bg-[#fdfbf7] dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl pl-8 pr-3 py-2 text-xs focus:outline-hidden focus:border-[#064e3b]"
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
                          placeholder="+251 911 234567"
                          className="w-full bg-[#fdfbf7] dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl pl-8 pr-3 py-2 text-xs focus:outline-hidden focus:border-[#064e3b]"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1">City / Town *</label>
                      <input
                        type="text"
                        required
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder="Addis Ababa"
                        className="w-full bg-[#fdfbf7] dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl px-3 py-2 text-xs focus:outline-hidden focus:border-[#064e3b]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1">Physical Address *</label>
                      <input
                        type="text"
                        required
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        placeholder="Bole Sub-City, Woreda 03"
                        className="w-full bg-[#fdfbf7] dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl px-3 py-2 text-xs focus:outline-hidden focus:border-[#064e3b]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold mb-1">
                        Gender <span className="text-stone-400 font-normal">(Optional)</span>
                      </label>
                      <select
                        value={gender}
                        onChange={(e) => setGender(e.target.value)}
                        className="w-full bg-[#fdfbf7] dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl px-3 py-2 text-xs focus:outline-hidden focus:border-[#064e3b]"
                      >
                        <option value="female">Female</option>
                        <option value="male">Male</option>
                        <option value="other">Other / Rather not say</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1">
                        Date of Birth <span className="text-stone-400 font-normal">(Optional)</span>
                      </label>
                      <input
                        type="date"
                        value={dateOfBirth}
                        onChange={(e) => setDateOfBirth(e.target.value)}
                        className="w-full bg-[#fdfbf7] dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl px-3 py-2 text-xs focus:outline-hidden focus:border-[#064e3b]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1">
                        Address Details <span className="text-stone-400 font-normal">(Optional)</span>
                      </label>
                      <input
                        type="text"
                        value={addressDetails}
                        onChange={(e) => setAddressDetails(e.target.value)}
                        placeholder="House / Unit No."
                        className="w-full bg-[#fdfbf7] dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl px-3 py-2 text-xs focus:outline-hidden focus:border-[#064e3b]"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* ================= STEP 3: ACCOUNT SECURITY (Requirement #4.B & #5) ================= */}
              {currentStep === 3 && (
                <div className="space-y-4 animate-in fade-in">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold mb-1">Account Password *</label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          required
                          minLength={8}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Min 8 characters"
                          className="w-full bg-[#fdfbf7] dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl px-3 py-2 text-xs pr-8 focus:outline-hidden focus:border-[#064e3b]"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                        >
                          {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold mb-1">Confirm Password *</label>
                      <div className="relative">
                        <input
                          type={showConfirmPassword ? 'text' : 'password'}
                          required
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Re-enter password"
                          className="w-full bg-[#fdfbf7] dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl px-3 py-2 text-xs pr-8 focus:outline-hidden focus:border-[#064e3b]"
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                        >
                          {showConfirmPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Password Requirements Checklist */}
                  <div className="p-3 bg-stone-50 dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 space-y-1 text-xs">
                    <span className="font-bold text-stone-700 dark:text-stone-300 block mb-1">
                      Password Requirements:
                    </span>
                    <div className="flex items-center gap-2">
                      <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-white text-[9px] ${password.length >= 8 ? 'bg-emerald-600' : 'bg-stone-300'}`}>
                        {password.length >= 8 && <Check className="w-2.5 h-2.5" />}
                      </div>
                      <span className={password.length >= 8 ? 'text-emerald-700 dark:text-emerald-400 font-medium' : 'text-stone-400'}>
                        At least 8 characters in length
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-white text-[9px] ${password && password === confirmPassword ? 'bg-emerald-600' : 'bg-stone-300'}`}>
                        {password && password === confirmPassword && <Check className="w-2.5 h-2.5" />}
                      </div>
                      <span className={password && password === confirmPassword ? 'text-emerald-700 dark:text-emerald-400 font-medium' : 'text-stone-400'}>
                        Confirm Password matches exactly
                      </span>
                    </div>
                  </div>

                  {/* Quick Terminal Switcher PIN */}
                  <div>
                    <label className="block text-xs font-semibold mb-1">
                      4-Digit Terminal Quick Switcher PIN *
                    </label>
                    <input
                      type="password"
                      maxLength={4}
                      required
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      placeholder="1234"
                      className="w-36 bg-[#fdfbf7] dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl px-3 py-2 text-xs font-mono tracking-widest text-center focus:outline-hidden focus:border-[#064e3b]"
                    />
                    <p className="text-[11px] text-stone-400 mt-1">
                      Used for fast cashier switching on terminal register.
                    </p>
                  </div>
                </div>
              )}

              {/* ================= STEP 4: EMPLOYMENT INFORMATION (Requirement #4.C & #5) ================= */}
              {currentStep === 4 && (
                <div className="space-y-4 animate-in fade-in">
                  {/* Generated Employee ID Badge */}
                  <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 rounded-xl flex items-center justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-emerald-800 dark:text-emerald-300 block">
                        Assigned Employee ID (Auto-Generated)
                      </span>
                      <span className="text-base font-black font-mono text-[#064e3b] dark:text-[#6ee7b7]">
                        {autoEmployeeId}
                      </span>
                    </div>
                    <span className="text-xs bg-emerald-700/60 text-white px-2.5 py-1 rounded-lg font-bold">
                      {isFirstAccount ? 'Admin Level' : 'Staff Level'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold mb-1">Job Title *</label>
                      <input
                        type="text"
                        required
                        value={jobTitle}
                        onChange={(e) => setJobTitle(e.target.value)}
                        placeholder="e.g. Lead Cashier"
                        className="w-full bg-[#fdfbf7] dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl px-3 py-2 text-xs focus:outline-hidden focus:border-[#064e3b]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1">Department *</label>
                      <select
                        value={department}
                        onChange={(e) => setDepartment(e.target.value)}
                        className="w-full bg-[#fdfbf7] dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl px-3 py-2 text-xs focus:outline-hidden focus:border-[#064e3b]"
                      >
                        <option value="Retail & Print Operations">Retail &amp; Print Operations</option>
                        <option value="Inventory & Warehousing">Inventory &amp; Warehousing</option>
                        <option value="Accounts & Financial Audit">Accounts &amp; Financial Audit</option>
                        <option value="Executive Management">Executive Management</option>
                      </select>
                    </div>
                  </div>

                  {/* Optional Employment Fields (Requirement #4.D) */}
                  <div className="pt-2 border-t border-stone-100 dark:border-stone-800 space-y-3">
                    <span className="text-xs font-bold text-stone-600 dark:text-stone-400 block">
                      Optional Profile Information
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold mb-1">
                          Emergency Contact Name <span className="text-stone-400 font-normal">(Optional)</span>
                        </label>
                        <input
                          type="text"
                          value={emergencyContactName}
                          onChange={(e) => setEmergencyContactName(e.target.value)}
                          placeholder="e.g. Martha Bekele"
                          className="w-full bg-[#fdfbf7] dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl px-3 py-2 text-xs focus:outline-hidden focus:border-[#064e3b]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold mb-1">
                          Emergency Contact Phone <span className="text-stone-400 font-normal">(Optional)</span>
                        </label>
                        <input
                          type="tel"
                          value={emergencyContactPhone}
                          onChange={(e) => setEmergencyContactPhone(e.target.value)}
                          placeholder="+251 922 ..."
                          className="w-full bg-[#fdfbf7] dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl px-3 py-2 text-xs focus:outline-hidden focus:border-[#064e3b]"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold mb-1">
                          Preferred Display Name <span className="text-stone-400 font-normal">(Optional)</span>
                        </label>
                        <input
                          type="text"
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          placeholder="e.g. Sam"
                          className="w-full bg-[#fdfbf7] dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl px-3 py-2 text-xs focus:outline-hidden focus:border-[#064e3b]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold mb-1">
                          Short Staff Biography <span className="text-stone-400 font-normal">(Optional)</span>
                        </label>
                        <input
                          type="text"
                          value={bio}
                          onChange={(e) => setBio(e.target.value)}
                          placeholder="Stationery & printing specialist"
                          className="w-full bg-[#fdfbf7] dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl px-3 py-2 text-xs focus:outline-hidden focus:border-[#064e3b]"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ================= STEP 5: REVIEW AND CREATE ACCOUNT (Requirement #5) ================= */}
              {currentStep === 5 && (
                <div className="space-y-4 animate-in fade-in">
                  <div className="text-center space-y-1">
                    <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">
                      Review Staff Profile Summary
                    </h3>
                    <p className="text-xs text-stone-500">
                      Please confirm all details before provisioning account into Sappy Stationary.
                    </p>
                  </div>

                  {/* Summary Card */}
                  <div className="p-4 bg-stone-50 dark:bg-stone-900/60 rounded-2xl border border-stone-200 dark:border-stone-800 space-y-3">
                    <div className="flex items-center gap-4">
                      <img
                        src={profilePictureUrl}
                        alt="Summary Preview"
                        className="w-16 h-16 rounded-2xl object-cover border-2 border-[#064e3b] shadow-sm"
                      />
                      <div>
                        <h4 className="font-black text-base text-stone-900 dark:text-white">
                          {firstName} {lastName}
                        </h4>
                        <p className="text-xs font-mono font-bold text-[#064e3b] dark:text-[#6ee7b7]">
                          ID: {autoEmployeeId}
                        </p>
                        <p className="text-xs text-stone-500">
                          @{username} • {jobTitle} ({department})
                        </p>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-stone-200 dark:border-stone-800 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-stone-400 block">Email Address</span>
                        <span className="font-medium text-stone-800 dark:text-stone-200">{email}</span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-stone-400 block">Phone</span>
                        <span className="font-medium text-stone-800 dark:text-stone-200">{phone}</span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-stone-400 block">Location</span>
                        <span className="font-medium text-stone-800 dark:text-stone-200">{city}, {address}</span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-stone-400 block">Assigned Role</span>
                        <span className="font-bold text-[#064e3b] dark:text-[#6ee7b7] uppercase">
                          {isFirstAccount ? 'Admin (Initial Root)' : 'Cashier (Pending Approval)'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Role & Status Notice */}
                  <div className="p-3 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 rounded-xl text-xs text-stone-600 dark:text-stone-300">
                    {isFirstAccount ? (
                      <p>
                        <strong>Root Initialization:</strong> As the first registered account, this profile will receive unrestricted <strong>Admin</strong> privileges and active session status.
                      </p>
                    ) : (
                      <p>
                        <strong>Approval Protocol:</strong> Subsequent registrations receive <strong>Cashier</strong> role with <em>Pending Approval</em> status. An administrator must approve this account before register access is unlocked.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Step Navigation Controls */}
              <div className="pt-4 border-t border-stone-200 dark:border-stone-800 flex items-center justify-between">
                {currentStep > 1 ? (
                  <button
                    type="button"
                    onClick={handlePrevStep}
                    className="px-4 py-2 border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300 rounded-xl text-xs font-bold hover:bg-stone-50 dark:hover:bg-stone-800 transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Back</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onBackToLogin}
                    className="px-4 py-2 text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 text-xs font-bold transition cursor-pointer"
                  >
                    Cancel
                  </button>
                )}

                {currentStep < 5 ? (
                  <button
                    type="button"
                    onClick={handleNextStep}
                    className="px-5 py-2.5 bg-[#064e3b] hover:bg-[#043b2c] text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer"
                  >
                    <span>Proceed to Step {currentStep + 1}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={handleFinalSubmit}
                    className="px-6 py-2.5 bg-[#064e3b] hover:bg-[#043b2c] disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-md cursor-pointer"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Provisioning Account...</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        <span>Create Account</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer Info */}
      <div className="p-4 sm:p-6 text-center text-xs text-stone-400 border-t border-[#e6dfd5] dark:border-[#362e26]">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="font-bold text-stone-600 dark:text-stone-300">Sappy Stationary</span>
          <span>•</span>
          <span>Point of Sale Terminal &amp; Store Inventory</span>
          <span>•</span>
          <span className="font-mono text-[11px]">Security Engine v2.0</span>
        </div>
      </div>
    </div>
  );
};
