import React, {useState, useEffect, useRef} from 'react';
import {
  Eye,
  EyeOff,
  Lock,
  User,
  ShieldCheck,
  Wifi,
  WifiOff,
  Sparkles,
  ArrowRight,
  AlertCircle,
  Clock,
  KeyRound,
  CheckCircle2,
  Delete,
  Store,
  HelpCircle,
  UserPlus,
  Upload,
  Loader2,
  Check,
  Mail,
  Phone,
  MapPin,
  Briefcase,
  ShieldAlert,
  AlertTriangle,
  Trash2,
  Download,
  Smartphone,
} from 'lucide-react';
import {Staff, StaffRole} from '../types';
import {storage} from '../services/storage';
import {sound} from '../services/sound';
import {authService, RegisterStaffPayload} from '../services/authService';
import {ForgotPasswordModal} from '../components/common/ForgotPasswordModal';
import {MasterPasscodeSignupModal} from '../components/common/MasterPasscodeSignupModal';
import {SappyBrandLogo} from '../components/common/SappyBrandLogo';

const AVATAR_PRESETS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&h=256&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=256&h=256&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=256&h=256&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=256&h=256&q=80',
  'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=256&h=256&q=80',
  'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=256&h=256&q=80',
];

interface LoginViewProps {
  onLoginSuccess: (staff: Staff, defaultSection: any) => void;
  isOnline: boolean;
}

export const LoginView: React.FC<LoginViewProps> = ({onLoginSuccess, isOnline}) => {
  // Mode: 'password' (Email/Username + Password) vs 'pin' (Fast Cashier PIN)
  const [authMode, setAuthMode] = useState<'password' | 'pin'>('password');

  // Username/Password Form State
  const initialStaff = storage.getStaffList().find((s) => s.active);
  const [username, setUsername] = useState(initialStaff ? initialStaff.email || initialStaff.username || '' : '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberSession, setRememberSession] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fast Cashier PIN State
  const [staffList, setStaffList] = useState<Staff[]>(() =>
    storage.getStaffList().filter((s) => s.active && s.approvalStatus !== 'pending')
  );
  const [selectedStaffId, setSelectedStaffId] = useState<string>(() => staffList[0]?.id || '');
  const [pin, setPin] = useState('');

  // Lockout & Error State (Requirement #37 Failed Login Protection)
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutSeconds, setLockoutSeconds] = useState(0);

  // Modals
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [showSignupModal, setShowSignupModal] = useState(false);
  const [showEmergencyResetModal, setShowEmergencyResetModal] = useState(false);
  const [emergencyPasscode, setEmergencyPasscode] = useState('');
  const [showEmergencyPasscode, setShowEmergencyPasscode] = useState(false);
  const [isExecutingEmergencyReset, setIsExecutingEmergencyReset] = useState(false);
  const [emergencyResetError, setEmergencyResetError] = useState<string | null>(null);

  const handleEmergencyFactoryReset = async () => {
    if (!emergencyPasscode.trim()) {
      setEmergencyResetError('Please enter the Master Passcode.');
      sound.playError();
      return;
    }
    setIsExecutingEmergencyReset(true);
    setEmergencyResetError(null);
    try {
      await storage.factoryResetEverything(emergencyPasscode.trim());
      setIsExecutingEmergencyReset(false);
      setShowEmergencyResetModal(false);
      sound.playCheckoutSuccess();
      setActiveAuthTab('signup');
      setUsername('');
      setPassword('');
      setPin('');
      setSuccessMessage('System factory reset complete. All users and data have been wiped clean across all devices. Create an account below.');
    } catch (err: any) {
      setIsExecutingEmergencyReset(false);
      sound.playError();
      setEmergencyResetError(err?.message || 'Incorrect Master Passcode.');
    }
  };

  const [activeAuthTab, setActiveAuthTab] = useState<'signin' | 'signup'>('signin');

  // Inline Signup Form State (Requirement: standard login/Signup page)
  const [signupPasscode, setSignupPasscode] = useState('');
  const [showSignupPasscode, setShowSignupPasscode] = useState(false);
  const [isPasscodeVerified, setIsPasscodeVerified] = useState(false);
  const [isVerifyingPasscode, setIsVerifyingPasscode] = useState(false);
  const [signupToken, setSignupToken] = useState<string | null>(null);

  const [signupAvatar, setSignupAvatar] = useState<string>(AVATAR_PRESETS[0]);
  const [signupFirstName, setSignupFirstName] = useState('');
  const [signupLastName, setSignupLastName] = useState('');
  const [signupUsername, setSignupUsername] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPhone, setSignupPhone] = useState('');
  const [signupCity, setSignupCity] = useState('Addis Ababa');
  const [signupAddress, setSignupAddress] = useState('Main Store Terminal');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupConfirmPassword, setSignupConfirmPassword] = useState('');
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showSignupConfirmPassword, setShowSignupConfirmPassword] = useState(false);
  const [signupPin, setSignupPin] = useState('1234');
  const [signupRole, setSignupRole] = useState<StaffRole>('admin');
  const [signupJobTitle, setSignupJobTitle] = useState('POS Cashier');
  const [signupDepartment, setSignupDepartment] = useState('Retail & Print Operations');
  const [isSubmittingSignup, setIsSubmittingSignup] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync staff list across all devices via Firebase Database
  useEffect(() => {
    let isMounted = true;

    // 1. Live synchronization with Cloud Firestore users collection
    const unsubscribeFirestore = storage.syncStaffWithFirestore((syncedList) => {
      if (!isMounted) return;
      const activeStaff = syncedList.filter((s) => s.active && s.approvalStatus !== 'pending');
      setStaffList(activeStaff);
      if (activeStaff.length > 0) {
        setSelectedStaffId((prev) => (prev && activeStaff.some((s) => s.id === prev) ? prev : activeStaff[0].id));
        setUsername((prev) => prev || activeStaff[0].email || activeStaff[0].username || '');
      } else {
        setSelectedStaffId('');
      }
    });

    // 2. Backend sync fallback
    storage.syncStaffFromBackend().then((res) => {
      if (!isMounted) return;
      if (res.staffList.length > 0) {
        const activeStaff = res.staffList.filter((s) => s.active && s.approvalStatus !== 'pending');
        setStaffList(activeStaff);
        setSelectedStaffId((prev) => (prev && activeStaff.some((s) => s.id === prev) ? prev : activeStaff[0].id));
        setUsername((prev) => prev || activeStaff[0].email || activeStaff[0].username || '');
      }
    });

    return () => {
      isMounted = false;
      unsubscribeFirestore();
    };
  }, []);

  // Lockout Countdown Timer
  useEffect(() => {
    if (lockoutSeconds <= 0) return;
    const interval = setInterval(() => {
      setLockoutSeconds((prev) => {
        if (prev <= 1) {
          setFailedAttempts(0);
          setErrorMessage(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [lockoutSeconds]);

  // Physical keyboard listener for PIN when PIN mode is active
  useEffect(() => {
    if (authMode !== 'pin' || lockoutSeconds > 0) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(e.key)) {
        if (pin.length < 4) {
          const nextPin = pin + e.key;
          setPin(nextPin);
          if (nextPin.length === 4) {
            handlePinSubmit(nextPin);
          }
        }
      } else if (e.key === 'Backspace') {
        setPin((prev) => prev.slice(0, -1));
        setErrorMessage(null);
      } else if (e.key === 'Escape') {
        setPin('');
        setErrorMessage(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [authMode, pin, lockoutSeconds, selectedStaffId]);

  // Determine redirection based on Staff Role (Requirement #37)
  const getDestinationForRole = (role: StaffRole): string => {
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

  // Record failed attempt and trigger lockout if >= 5 attempts
  const registerFailedAttempt = (msg: string) => {
    sound.playError();
    const nextAttempts = failedAttempts + 1;
    setFailedAttempts(nextAttempts);

    if (nextAttempts >= 5) {
      setLockoutSeconds(30);
      setErrorMessage('Too many failed attempts. Security lockout active for 30 seconds.');
    } else {
      setErrorMessage(`${msg} (${5 - nextAttempts} attempt${5 - nextAttempts === 1 ? '' : 's'} remaining).`);
    }
  };

  // --- Submit Username & Password ---
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lockoutSeconds > 0) return;

    setErrorMessage(null);
    setSuccessMessage(null);
    setIsSubmitting(true);

    try {
      const result = await storage.authenticateWithPasswordAsync(username, password, rememberSession);
      setIsSubmitting(false);

      if (!result.success || !result.staff) {
        registerFailedAttempt(result.error || 'The username or password is incorrect.');
        return;
      }

      sound.playCheckoutSuccess();
      const dest = getDestinationForRole(result.staff.role);
      onLoginSuccess(result.staff, dest);
    } catch (err: any) {
      setIsSubmitting(false);
      registerFailedAttempt(err?.message || 'The username or password is incorrect.');
    }
  };

  // --- Submit Cashier PIN ---
  const handlePinSubmit = async (pinToVerify: string) => {
    if (lockoutSeconds > 0) return;
    const targetId = selectedStaffId || staffList[0]?.id;
    if (!targetId) {
      registerFailedAttempt('No staff account selected. Please select a staff profile.');
      return;
    }

    setErrorMessage(null);
    setSuccessMessage(null);
    const result = await storage.authenticateWithPinAsync(targetId, pinToVerify);

    if (!result.success || !result.staff) {
      setPin('');
      registerFailedAttempt(result.error || 'Incorrect PIN. Please try again.');
      return;
    }

    sound.playCheckoutSuccess();
    const dest = getDestinationForRole(result.staff.role);
    onLoginSuccess(result.staff, dest);
  };

  // --- PIN Keypad Button Click ---
  const handlePinDigit = (digit: string) => {
    if (lockoutSeconds > 0) return;
    if (pin.length < 4) {
      const nextPin = pin + digit;
      setPin(nextPin);
      setErrorMessage(null);
      if (nextPin.length === 4) {
        handlePinSubmit(nextPin);
      }
    }
  };

  const handleSignupSuccess = (newStaff: Staff, isApprovedByPasscode: boolean) => {
    storage.setStoreInitialized(true);
    localStorage.setItem('sappy_initial_signup_completed', 'true');
    setStaffList(storage.getStaffList().filter((s) => s.active && s.approvalStatus !== 'pending'));
    setActiveAuthTab('signin');
    if (isApprovedByPasscode || newStaff.approvalStatus === 'approved') {
      const dest = getDestinationForRole(newStaff.role);
      onLoginSuccess(newStaff, dest);
    } else {
      setUsername(newStaff.email || newStaff.username || '');
      setSelectedStaffId(newStaff.id);
      setErrorMessage(null);
      setSuccessMessage(
        `Account created for ${newStaff.name}! Because the Master Passcode was not provided, your account is awaiting Administrator approval before you can sign in.`
      );
    }
  };

  const handleVerifyInlinePasscode = async () => {
    if (!signupPasscode.trim()) {
      setErrorMessage('Please enter the Master Passcode.');
      sound.playError();
      return;
    }
    setIsVerifyingPasscode(true);
    setErrorMessage(null);
    try {
      const result = await authService.verifyMasterPasscode(signupPasscode.trim());
      setIsVerifyingPasscode(false);
      if (!result.valid) {
        sound.playError();
        setErrorMessage(result.error || 'Incorrect Master Passcode.');
        return;
      }
      sound.playCheckoutSuccess();
      setIsPasscodeVerified(true);
      setSignupToken(result.signupToken || 'authorized-token');
      setSuccessMessage('Master Passcode authorized! Please complete your registration details below.');
    } catch (err: any) {
      setIsVerifyingPasscode(false);
      sound.playError();
      setErrorMessage(err?.message || 'Passcode verification failed.');
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      setErrorMessage('Image file size must be less than 3MB.');
      sound.playError();
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setSignupAvatar(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleInlineSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!signupFirstName.trim() || !signupLastName.trim()) {
      setErrorMessage('First Name and Last Name are required.');
      sound.playError();
      return;
    }
    if (!signupUsername.trim() || signupUsername.trim().length < 3) {
      setErrorMessage('Username must be at least 3 characters.');
      sound.playError();
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!signupEmail.trim() || !emailRegex.test(signupEmail.trim())) {
      setErrorMessage('A valid email address is required.');
      sound.playError();
      return;
    }
    if (!signupPhone.trim()) {
      setErrorMessage('Contact phone number is required.');
      sound.playError();
      return;
    }
    if (!signupAddress.trim() || !signupCity.trim()) {
      setErrorMessage('Address and City / Town are required.');
      sound.playError();
      return;
    }
    if (!signupPassword || signupPassword.length < 8) {
      setErrorMessage('Password must be at least 8 characters long.');
      sound.playError();
      return;
    }
    if (signupPassword !== signupConfirmPassword) {
      setErrorMessage('Passwords do not match.');
      sound.playError();
      return;
    }

    setIsSubmittingSignup(true);
    try {
      let token = signupToken;
      if (!token && signupPasscode.trim()) {
        const verifyRes = await authService.verifyMasterPasscode(signupPasscode.trim());
        if (!verifyRes.valid) {
          setIsSubmittingSignup(false);
          sound.playError();
          setErrorMessage(verifyRes.error || 'Incorrect Master Passcode.');
          return;
        }
        token = verifyRes.signupToken || 'authorized-token';
        setSignupToken(token);
        setIsPasscodeVerified(true);
      }

      const effectiveRole: StaffRole = (token || isPasscodeVerified) ? signupRole : 'cashier';
      const payload: RegisterStaffPayload = {
        signupToken: token || undefined,
        masterPasscode: signupPasscode.trim() || undefined,
        profilePictureUrl: signupAvatar || AVATAR_PRESETS[0],
        firstName: signupFirstName.trim(),
        lastName: signupLastName.trim(),
        username: signupUsername.trim().toLowerCase(),
        email: signupEmail.trim().toLowerCase(),
        phone: signupPhone.trim(),
        city: signupCity.trim(),
        address: signupAddress.trim(),
        password: signupPassword,
        confirmPassword: signupConfirmPassword,
        jobTitle: signupJobTitle.trim() || (effectiveRole === 'admin' ? 'System Administrator' : 'POS Cashier'),
        department: signupDepartment.trim() || 'Retail & Print Operations',
        role: effectiveRole,
        pin: signupPin.trim() || '1234',
        displayName: `${signupFirstName.trim()} ${signupLastName.trim()}`,
      };

      const result = await authService.registerStaff(payload);
      setIsSubmittingSignup(false);

      if (!result.success || !result.staff) {
        sound.playError();
        setErrorMessage(result.error || 'Failed to complete registration.');
        return;
      }

      sound.playCheckoutSuccess();
      handleSignupSuccess(result.staff, !!(result.approvedByMasterPasscode || result.isInitialAdmin));
    } catch (err: any) {
      setIsSubmittingSignup(false);
      sound.playError();
      setErrorMessage(err?.message || 'Registration failed. Please check details and try again.');
    }
  };

  return (
    <div className="h-full h-[100dvh] overflow-y-auto overscroll-contain touch-scroll bg-[#fdfbf7] dark:bg-[#12100e] text-[#26201b] dark:text-[#f5f1e8] flex flex-col justify-between font-sans selection:bg-[#6ee7b7] selection:text-[#064e3b] safe-area-bottom">
      {/* Main Container */}
      <div className="flex-1 flex items-center justify-center p-3 sm:p-6 lg:p-8">
        <div className="w-full max-w-5xl bg-white dark:bg-[#1c1815] border border-[#e6dfd5] dark:border-[#362e26] rounded-3xl shadow-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 min-h-[580px]">
          
          {/* ================= LEFT SIDE: SAPPY STATIONARY BRANDING ================= */}
          <div className="lg:col-span-5 bg-gradient-to-br from-[#064e3b] via-[#043b2c] to-[#02231a] text-white p-5 sm:p-6 lg:p-10 flex flex-col justify-between relative overflow-hidden">
            {/* Background Geometric Paper/Ink Motif */}
            <div className="absolute -top-16 -right-16 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-emerald-400/10 rounded-full blur-3xl pointer-events-none" />

            <div>
              {/* Brand Logo & Wordmark */}
              <div className="flex items-center justify-between lg:justify-start gap-3.5 mb-2 lg:mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 lg:w-14 lg:h-14 rounded-2xl bg-[#fbf9f4] text-[#244834] flex items-center justify-center shadow-xl border border-white/20 p-1.5 shrink-0">
                    <SappyBrandLogo size="lg" className="text-[#244834]" />
                  </div>
                  <div>
                    <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-widest leading-none font-sans">
                      SAPPY
                    </h1>
                    <p className="text-xs sm:text-sm text-[#a7f3d0] font-serif italic tracking-wide mt-0.5 lg:mt-1">
                      stationery &amp; printing.
                    </p>
                  </div>
                </div>

                {/* Mobile Online Badge in header */}
                <div className="lg:hidden">
                  {isOnline ? (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/80 border border-emerald-700/60 text-[#6ee7b7] font-bold text-[10px]">
                      <Wifi className="w-3 h-3 text-emerald-400" />
                      <span>ONLINE</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-950/80 border border-amber-700/60 text-amber-300 font-bold text-[10px]">
                      <WifiOff className="w-3 h-3 text-amber-400" />
                      <span>OFFLINE</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Tagline & Store Identity (Hidden on small mobile to give instant access to inputs, visible on lg) */}
              <div className="hidden lg:block space-y-4 my-8">
                <h2 className="text-xl sm:text-2xl font-bold leading-tight">
                  Point of Sale &amp; Inventory Terminal
                </h2>
                <p className="text-xs sm:text-sm text-stone-300 leading-relaxed">
                  High-speed checkout for paper reams, fine drafting pens, ink toner cartridges, and digital printing services.
                </p>
              </div>

              {/* Feature Trust Badges */}
              <div className="hidden lg:block space-y-3 pt-2">
                <div className="flex items-center gap-2.5 text-xs text-stone-200">
                  <ShieldCheck className="w-4 h-4 text-[#6ee7b7] shrink-0" />
                  <span>100% Offline-First Data Safeguard</span>
                </div>
                <div className="flex items-center gap-2.5 text-xs text-stone-200">
                  <KeyRound className="w-4 h-4 text-[#6ee7b7] shrink-0" />
                  <span>Role-Based Permissions &amp; Audit Logs</span>
                </div>
                <div className="flex items-center gap-2.5 text-xs text-stone-200">
                  <Sparkles className="w-4 h-4 text-[#6ee7b7] shrink-0" />
                  <span>USB/Bluetooth Barcode &amp; Camera QR Scanners</span>
                </div>
              </div>
            </div>

            {/* Universal Android APK Download & Offline/Online Network Indicator Banner */}
            <div className="mt-4 lg:mt-8 space-y-3 hidden lg:block">
              <a
                href="/api/download/apk"
                download="Sappy-Stationary-POS-Universal.apk"
                className="w-full py-2.5 px-3.5 rounded-xl bg-emerald-950/90 hover:bg-emerald-900 border border-emerald-600/50 text-white text-xs font-bold flex items-center justify-between transition shadow-sm cursor-pointer"
                title="Download Universal Android APK compatible with all Android phones & tablets"
              >
                <span className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-[#6ee7b7] shrink-0" />
                  <span>Download Android App (.APK)</span>
                </span>
                <span className="flex items-center gap-1 text-[10px] text-[#6ee7b7] font-mono">
                  <Download className="w-3.5 h-3.5" />
                  <span>Universal</span>
                </span>
              </a>

              <div className="pt-3 border-t border-emerald-900/60 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  {isOnline ? (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/80 border border-emerald-700/60 text-[#6ee7b7] font-bold text-[11px]">
                      <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                      <span>● ONLINE</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-950/80 border border-amber-700/60 text-amber-300 font-bold text-[11px]">
                      <WifiOff className="w-3.5 h-3.5 text-amber-400" />
                      <span>● OFFLINE MODE</span>
                    </div>
                  )}
                </div>
                <span className="text-[11px] text-emerald-200/70 font-mono">Terminal 01</span>
              </div>
            </div>
          </div>

          {/* ================= RIGHT SIDE: AUTHENTICATION FORM ================= */}
          <div className="lg:col-span-7 p-6 sm:p-10 flex flex-col justify-between">
            {/* --- STANDARD LOGIN & SIGNUP INTERFACE --- */}
            <div className="space-y-4">
              {/* Standard Auth Tabs: Login vs Sign Up */}
              <div className="grid grid-cols-2 p-1.5 bg-[#f5f1e8] dark:bg-[#25201b] rounded-2xl border border-stone-200 dark:border-stone-700 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveAuthTab('signin');
                      setErrorMessage(null);
                      setSuccessMessage(null);
                    }}
                    className={`py-2.5 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer ${
                      activeAuthTab === 'signin'
                        ? 'bg-white dark:bg-stone-900 text-[#064e3b] dark:text-[#6ee7b7] shadow-sm font-extrabold'
                        : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100'
                    }`}
                  >
                    <KeyRound className="w-4 h-4" />
                    <span>Sign In</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setActiveAuthTab('signup');
                      setErrorMessage(null);
                      setSuccessMessage(null);
                    }}
                    className={`py-2.5 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer ${
                      activeAuthTab === 'signup'
                        ? 'bg-white dark:bg-stone-900 text-[#064e3b] dark:text-[#6ee7b7] shadow-sm font-extrabold'
                        : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100'
                    }`}
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Create Account</span>
                  </button>
                </div>

                {/* Success Alert Banner */}
                {successMessage && (
                  <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs text-[#064e3b] dark:text-[#6ee7b7] flex items-center gap-2 animate-in fade-in">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{successMessage}</span>
                  </div>
                )}

                {/* Error / Lockout Alert Banner */}
                {errorMessage && (
                  <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/60 rounded-xl text-xs text-rose-800 dark:text-rose-300 flex items-center gap-2 animate-in fade-in">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                {/* Offline Mode Session Notification */}
                {!isOnline && (
                  <div className="p-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-xl text-[11px] text-amber-800 dark:text-amber-300 leading-tight">
                    <strong>OFFLINE SESSION:</strong> Internet connection unavailable. You can continue using the POS with your authorized offline credentials.
                  </div>
                )}

                {/* ================= MODE A: SIGN IN ================= */}
                {activeAuthTab === 'signin' && (
                  <div className="space-y-4 animate-in fade-in">
                    {/* Header Welcome */}
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <h3 className="text-xl sm:text-2xl font-black text-stone-900 dark:text-stone-100">
                          Sign In to Register
                        </h3>
                        <p className="text-xs text-stone-500 mt-0.5">
                          Enter credentials or select your cashier profile
                        </p>
                      </div>
                    </div>

                    {/* Authentication Method Tabs */}
                    <div className="grid grid-cols-2 p-1 bg-[#f5f1e8] dark:bg-[#25201b] rounded-xl border border-stone-200 dark:border-stone-700 text-xs font-bold">
                      <button
                        type="button"
                        onClick={() => {
                          setAuthMode('password');
                          setErrorMessage(null);
                        }}
                        className={`py-2 rounded-lg transition ${
                          authMode === 'password'
                            ? 'bg-white dark:bg-stone-900 text-[#064e3b] dark:text-[#6ee7b7] shadow-xs'
                            : 'text-stone-600 dark:text-stone-400 hover:text-stone-900'
                        }`}
                      >
                        Email / Password
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setAuthMode('pin');
                          setErrorMessage(null);
                        }}
                        className={`py-2 rounded-lg transition flex items-center justify-center gap-1.5 ${
                          authMode === 'pin'
                            ? 'bg-white dark:bg-stone-900 text-[#064e3b] dark:text-[#6ee7b7] shadow-xs'
                            : 'text-stone-600 dark:text-stone-400 hover:text-stone-900'
                        }`}
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                        <span>Fast Cashier PIN</span>
                      </button>
                    </div>

                    {/* --- TAB 1: USERNAME / EMAIL + PASSWORD --- */}
                    {authMode === 'password' && (
                      <form onSubmit={handlePasswordSubmit} className="space-y-3.5">
                        <div>
                          <label className="block text-xs font-semibold mb-1 text-stone-700 dark:text-stone-300">
                            Username or Email
                          </label>
                          <div className="relative">
                            <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                            <input
                              type="text"
                              required
                              disabled={lockoutSeconds > 0 || isSubmitting}
                              value={username}
                              onChange={(e) => setUsername(e.target.value)}
                              placeholder="Username or email address"
                              className="w-full bg-[#fdfbf7] dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl pl-9 pr-3 py-2.5 text-xs sm:text-sm text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-hidden focus:border-[#064e3b]"
                            />
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-xs font-semibold text-stone-700 dark:text-stone-300">
                              Password
                            </label>
                            <button
                              type="button"
                              onClick={() => setShowForgotPassword(true)}
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-[#064e3b] dark:text-[#6ee7b7] hover:text-[#043b2c] dark:hover:text-[#a7f3d0] hover:underline focus:outline-hidden focus:ring-1 focus:ring-[#064e3b] rounded-sm transition cursor-pointer"
                            >
                              <KeyRound className="w-3 h-3 text-[#064e3b] dark:text-[#6ee7b7]" />
                              <span>Forgot Password?</span>
                            </button>
                          </div>
                          <div className="relative">
                            <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                            <input
                              type={showPassword ? 'text' : 'password'}
                              required
                              disabled={lockoutSeconds > 0 || isSubmitting}
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              placeholder="Enter your account password"
                              className="w-full bg-[#fdfbf7] dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl pl-9 pr-10 py-2.5 text-xs sm:text-sm text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-hidden focus:border-[#064e3b]"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 p-0.5 cursor-pointer"
                            >
                              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-1">
                          <label className="flex items-center gap-2 text-xs text-stone-600 dark:text-stone-400 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={rememberSession}
                              onChange={(e) => setRememberSession(e.target.checked)}
                              className="rounded text-[#064e3b]"
                            />
                            <span>Remember device session</span>
                          </label>
                        </div>

                        <button
                          type="submit"
                          disabled={lockoutSeconds > 0 || isSubmitting}
                          className="w-full py-3 bg-[#064e3b] hover:bg-[#043b2c] disabled:opacity-50 text-white font-extrabold text-xs sm:text-sm rounded-xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer mt-2"
                        >
                          {isSubmitting ? (
                            <span>Signing In...</span>
                          ) : lockoutSeconds > 0 ? (
                            <span>Locked ({lockoutSeconds}s)</span>
                          ) : (
                            <>
                              <span>Sign In to POS Register</span>
                              <ArrowRight className="w-4 h-4" />
                            </>
                          )}
                        </button>

                        {/* Registration CTA footer */}
                        <div className="pt-3 border-t border-stone-200 dark:border-stone-800 flex items-center justify-between text-xs">
                          <span className="text-[11px] text-stone-500">Need a staff account?</span>
                          <button
                            type="button"
                            onClick={() => {
                              setActiveAuthTab('signup');
                              setErrorMessage(null);
                              setSuccessMessage(null);
                            }}
                            className="text-xs font-bold text-[#064e3b] dark:text-[#6ee7b7] hover:underline flex items-center gap-1.5 cursor-pointer"
                          >
                            <UserPlus className="w-3.5 h-3.5" />
                            <span>Create Account / Sign Up</span>
                          </button>
                        </div>
                      </form>
                    )}

                    {/* --- TAB 2: CASHIER FAST PIN LOGIN (Requirement #37) --- */}
                    {authMode === 'pin' && (
                      <div className="space-y-4">
                        {/* Cashier Selector Cards */}
                        <div>
                          <label className="block text-xs font-semibold mb-1.5 text-stone-700 dark:text-stone-300">
                            Select Staff Member
                          </label>
                          {staffList.length === 0 ? (
                            <div className="p-3 bg-stone-100 dark:bg-stone-800/80 rounded-xl text-center text-xs text-stone-500">
                              No staff profiles found. Please switch to Password login or click <button type="button" onClick={() => setActiveAuthTab('signup')} className="font-bold underline text-[#064e3b] dark:text-[#6ee7b7] cursor-pointer">Create Account</button>.
                            </div>
                          ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                              {staffList.map((s) => {
                                const isSelected = selectedStaffId === s.id;
                                return (
                                  <button
                                    key={s.id}
                                    type="button"
                                    onClick={() => {
                                      setSelectedStaffId(s.id);
                                      setPin('');
                                      setErrorMessage(null);
                                    }}
                                    className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                                      isSelected
                                        ? 'border-[#064e3b] bg-emerald-50 dark:bg-emerald-950/60 shadow-xs ring-2 ring-[#064e3b]/20'
                                        : 'border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800'
                                    }`}
                                  >
                                    <div className="flex items-center gap-1.5 mb-1">
                                      <div className="w-5 h-5 rounded-full bg-[#064e3b] text-white text-[10px] font-bold flex items-center justify-center">
                                        {s.name.charAt(0)}
                                      </div>
                                      <span className="font-bold text-xs truncate">
                                        {s.name.split(' ')[0]}
                                      </span>
                                    </div>
                                    <span className="text-[9px] uppercase font-bold text-stone-400 block font-mono">
                                      {s.role}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* Masked PIN Indicators (● ● ● ●) */}
                        <div className="flex flex-col items-center justify-center py-2">
                          <span className="text-xs font-medium text-stone-400 mb-2">
                            Enter 4-Digit Security PIN
                          </span>
                          <div className="flex gap-4">
                            {[0, 1, 2, 3].map((idx) => (
                              <div
                                key={idx}
                                className={`w-4 h-4 rounded-full border-2 transition-all ${
                                  pin.length > idx
                                    ? 'bg-[#064e3b] border-[#064e3b] scale-125 dark:bg-[#6ee7b7] dark:border-[#6ee7b7]'
                                    : 'border-stone-300 dark:border-stone-700'
                                }`}
                              />
                            ))}
                          </div>
                        </div>

                        {/* Touch Numeric Keypad */}
                        <div className="grid grid-cols-3 gap-2 max-w-[280px] mx-auto">
                          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                            <button
                              key={digit}
                              type="button"
                              disabled={lockoutSeconds > 0}
                              onClick={() => handlePinDigit(digit)}
                              className="h-11 text-base font-bold rounded-xl bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-900 dark:text-stone-100 active:scale-95 transition cursor-pointer"
                            >
                              {digit}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => {
                              setPin('');
                              setErrorMessage(null);
                            }}
                            className="h-11 text-xs font-bold rounded-xl bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-500 active:scale-95 transition cursor-pointer"
                          >
                            Clear
                          </button>
                          <button
                            type="button"
                            disabled={lockoutSeconds > 0}
                            onClick={() => handlePinDigit('0')}
                            className="h-11 text-base font-bold rounded-xl bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-900 dark:text-stone-100 active:scale-95 transition cursor-pointer"
                          >
                            0
                          </button>
                          <button
                            type="button"
                            onClick={() => setPin((prev) => prev.slice(0, -1))}
                            className="h-11 flex items-center justify-center rounded-xl bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-600 dark:text-stone-300 active:scale-95 transition cursor-pointer"
                          >
                            <Delete className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="text-center space-y-1.5 pt-1">
                          <span className="text-[11px] text-stone-400 font-mono block">
                            Enter your assigned 4-digit personal terminal PIN
                          </span>
                          <div>
                            <button
                              type="button"
                              onClick={() => setShowForgotPassword(true)}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#064e3b] dark:text-[#6ee7b7] hover:underline cursor-pointer"
                            >
                              <KeyRound className="w-3 h-3" />
                              <span>Forgot Staff Credentials or PIN?</span>
                            </button>
                          </div>
                        </div>

                        {/* Switch to Signup */}
                        <div className="pt-3 border-t border-stone-200 dark:border-stone-800 flex items-center justify-between text-xs">
                          <span className="text-[11px] text-stone-500">New cashier onboarding?</span>
                          <button
                            type="button"
                            onClick={() => {
                              setActiveAuthTab('signup');
                              setErrorMessage(null);
                              setSuccessMessage(null);
                            }}
                            className="text-xs font-bold text-[#064e3b] dark:text-[#6ee7b7] hover:underline flex items-center gap-1.5 cursor-pointer"
                          >
                            <UserPlus className="w-3.5 h-3.5" />
                            <span>Create Account / Sign Up</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ================= MODE B: SIGN UP (Standard Registration Page) ================= */}
                {activeAuthTab === 'signup' && (
                  <div className="space-y-4 animate-in fade-in">
                    {/* Header */}
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <h3 className="text-xl sm:text-2xl font-black text-stone-900 dark:text-stone-100">
                          Sign Up / Create Account
                        </h3>
                        <p className="text-xs text-stone-500 mt-0.5">
                          Enter the Master Passcode for instant approval, or leave it blank to request admin approval
                        </p>
                      </div>
                    </div>

                    {/* Step 1: Master Passcode Authorization Bar (Optional for Instant Approval) */}
                    <div className="p-3 bg-stone-50 dark:bg-stone-900/60 rounded-2xl border border-stone-200 dark:border-stone-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-stone-800 dark:text-stone-200 flex items-center gap-1.5">
                          <ShieldCheck className="w-3.5 h-3.5 text-[#064e3b] dark:text-[#6ee7b7]" />
                          <span>Master Passcode (Optional)</span>
                        </label>
                        {isPasscodeVerified ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold">
                            <Check className="w-3 h-3 text-emerald-600" />
                            <span>Instant Approval Active</span>
                          </span>
                        ) : (
                          <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold">
                            No Passcode = Pending Admin Approval
                          </span>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Lock className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                          <input
                            type={showSignupPasscode ? 'text' : 'password'}
                            value={signupPasscode}
                            onChange={(e) => {
                              setSignupPasscode(e.target.value);
                              setIsPasscodeVerified(false);
                              setSignupToken(null);
                            }}
                            placeholder="Enter Master Passcode for instant approval (or leave blank)"
                            className="w-full bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl pl-8 pr-8 py-2 text-xs text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-hidden focus:border-[#064e3b]"
                          />
                          <button
                            type="button"
                            onClick={() => setShowSignupPasscode(!showSignupPasscode)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 p-0.5 cursor-pointer"
                          >
                            {showSignupPasscode ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                        {!isPasscodeVerified && signupPasscode.trim().length > 0 && (
                          <button
                            type="button"
                            onClick={handleVerifyInlinePasscode}
                            disabled={isVerifyingPasscode}
                            className="px-3 py-2 bg-[#064e3b] hover:bg-[#043b2c] text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
                          >
                            {isVerifyingPasscode ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Check className="w-3.5 h-3.5" />
                            )}
                            <span>Verify</span>
                          </button>
                        )}
                      </div>

                      <p className="text-[10px] text-stone-500 dark:text-stone-400 leading-relaxed">
                        {isPasscodeVerified
                          ? 'Master Passcode verified! Your account will be approved immediately upon creation.'
                          : 'Enter the Master Passcode to approve your account immediately. If left blank, your account will wait for Administrator approval.'}
                      </p>

                      {(isPasscodeVerified || signupPasscode.trim().length > 0) && (
                        <div className="pt-1">
                          <label className="block text-[11px] font-bold text-stone-700 dark:text-stone-300 mb-1">
                            Account Role (Master Passcode Authorized)
                          </label>
                          <select
                            value={signupRole}
                            onChange={(e) => {
                              const r = e.target.value as StaffRole;
                              setSignupRole(r);
                              if (r === 'admin') setSignupJobTitle('System Administrator');
                              else if (r === 'manager') setSignupJobTitle('Store Manager');
                              else if (r === 'auditor') setSignupJobTitle('Financial Auditor');
                              else setSignupJobTitle('POS Cashier');
                            }}
                            className="w-full bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl px-2.5 py-1.5 text-xs font-bold text-stone-900 dark:text-stone-100 focus:outline-hidden focus:border-[#064e3b]"
                          >
                            <option value="admin">Administrator (Full Access)</option>
                            <option value="manager">Store Manager</option>
                            <option value="cashier">POS Cashier</option>
                            <option value="auditor">Auditor</option>
                          </select>
                        </div>
                      )}
                    </div>

                    {/* Registration Form */}
                    <form onSubmit={handleInlineSignup} className="space-y-3">
                      {/* Avatar Selection */}
                      <div>
                        <label className="block text-xs font-semibold mb-1 text-stone-700 dark:text-stone-300">
                          Profile Avatar
                        </label>
                        <div className="flex items-center gap-2 overflow-x-auto pb-1">
                          {AVATAR_PRESETS.map((preset, idx) => {
                            const isSelected = signupAvatar === preset;
                            return (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => setSignupAvatar(preset)}
                                className={`w-10 h-10 rounded-full overflow-hidden border-2 transition shrink-0 cursor-pointer ${
                                  isSelected
                                    ? 'border-[#064e3b] dark:border-[#6ee7b7] ring-2 ring-[#064e3b]/30 scale-105'
                                    : 'border-stone-200 dark:border-stone-700 opacity-70 hover:opacity-100'
                                }`}
                              >
                                <img src={preset} alt={`Avatar ${idx + 1}`} className="w-full h-full object-cover" />
                              </button>
                            );
                          })}
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="w-10 h-10 rounded-full border border-dashed border-stone-300 dark:border-stone-700 hover:border-[#064e3b] flex items-center justify-center text-stone-400 hover:text-stone-600 transition shrink-0 cursor-pointer"
                            title="Upload custom photo"
                          >
                            <Upload className="w-4 h-4" />
                          </button>
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={handleImageUpload}
                            className="hidden"
                          />
                        </div>
                      </div>

                      {/* Name Fields */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-xs font-semibold mb-1 text-stone-700 dark:text-stone-300">
                            First Name
                          </label>
                          <input
                            type="text"
                            required
                            value={signupFirstName}
                            onChange={(e) => setSignupFirstName(e.target.value)}
                            placeholder="e.g. Sam"
                            className="w-full bg-[#fdfbf7] dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl px-3 py-2 text-xs text-stone-900 dark:text-stone-100 focus:outline-hidden focus:border-[#064e3b]"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold mb-1 text-stone-700 dark:text-stone-300">
                            Last Name
                          </label>
                          <input
                            type="text"
                            required
                            value={signupLastName}
                            onChange={(e) => setSignupLastName(e.target.value)}
                            placeholder="e.g. Wilson"
                            className="w-full bg-[#fdfbf7] dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl px-3 py-2 text-xs text-stone-900 dark:text-stone-100 focus:outline-hidden focus:border-[#064e3b]"
                          />
                        </div>
                      </div>

                      {/* Username & Email */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-xs font-semibold mb-1 text-stone-700 dark:text-stone-300">
                            Username
                          </label>
                          <div className="relative">
                            <User className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                            <input
                              type="text"
                              required
                              value={signupUsername}
                              onChange={(e) => setSignupUsername(e.target.value)}
                              placeholder="e.g. samwilson"
                              className="w-full bg-[#fdfbf7] dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl pl-8 pr-3 py-2 text-xs text-stone-900 dark:text-stone-100 focus:outline-hidden focus:border-[#064e3b]"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold mb-1 text-stone-700 dark:text-stone-300">
                            Email Address
                          </label>
                          <div className="relative">
                            <Mail className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                            <input
                              type="email"
                              required
                              value={signupEmail}
                              onChange={(e) => setSignupEmail(e.target.value)}
                              placeholder="sam@sappystationary.com"
                              className="w-full bg-[#fdfbf7] dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl pl-8 pr-3 py-2 text-xs text-stone-900 dark:text-stone-100 focus:outline-hidden focus:border-[#064e3b]"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Phone & City */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-xs font-semibold mb-1 text-stone-700 dark:text-stone-300">
                            Phone Number
                          </label>
                          <div className="relative">
                            <Phone className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                            <input
                              type="tel"
                              required
                              value={signupPhone}
                              onChange={(e) => setSignupPhone(e.target.value)}
                              placeholder="+251 911 ..."
                              className="w-full bg-[#fdfbf7] dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl pl-8 pr-3 py-2 text-xs text-stone-900 dark:text-stone-100 focus:outline-hidden focus:border-[#064e3b]"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold mb-1 text-stone-700 dark:text-stone-300">
                            City / Town
                          </label>
                          <div className="relative">
                            <MapPin className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                            <input
                              type="text"
                              required
                              value={signupCity}
                              onChange={(e) => setSignupCity(e.target.value)}
                              placeholder="Addis Ababa"
                              className="w-full bg-[#fdfbf7] dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl pl-8 pr-3 py-2 text-xs text-stone-900 dark:text-stone-100 focus:outline-hidden focus:border-[#064e3b]"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Physical Address */}
                      <div>
                        <label className="block text-xs font-semibold mb-1 text-stone-700 dark:text-stone-300">
                          Physical Address / Sub-City
                        </label>
                        <input
                          type="text"
                          required
                          value={signupAddress}
                          onChange={(e) => setSignupAddress(e.target.value)}
                          placeholder="e.g. Bole Sub-City, Woreda 03"
                          className="w-full bg-[#fdfbf7] dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl px-3 py-2 text-xs text-stone-900 dark:text-stone-100 focus:outline-hidden focus:border-[#064e3b]"
                        />
                      </div>

                      {/* Password & Confirm */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-xs font-semibold mb-1 text-stone-700 dark:text-stone-300">
                            Password (Min 8 chars)
                          </label>
                          <div className="relative">
                            <Lock className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                            <input
                              type={showSignupPassword ? 'text' : 'password'}
                              required
                              value={signupPassword}
                              onChange={(e) => setSignupPassword(e.target.value)}
                              placeholder="Create strong password"
                              className="w-full bg-[#fdfbf7] dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl pl-8 pr-8 py-2 text-xs text-stone-900 dark:text-stone-100 focus:outline-hidden focus:border-[#064e3b]"
                            />
                            <button
                              type="button"
                              onClick={() => setShowSignupPassword(!showSignupPassword)}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 p-0.5 cursor-pointer"
                            >
                              {showSignupPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold mb-1 text-stone-700 dark:text-stone-300">
                            Confirm Password
                          </label>
                          <div className="relative">
                            <Lock className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                            <input
                              type={showSignupConfirmPassword ? 'text' : 'password'}
                              required
                              value={signupConfirmPassword}
                              onChange={(e) => setSignupConfirmPassword(e.target.value)}
                              placeholder="Repeat password"
                              className="w-full bg-[#fdfbf7] dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl pl-8 pr-8 py-2 text-xs text-stone-900 dark:text-stone-100 focus:outline-hidden focus:border-[#064e3b]"
                            />
                            <button
                              type="button"
                              onClick={() => setShowSignupConfirmPassword(!showSignupConfirmPassword)}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 p-0.5 cursor-pointer"
                            >
                              {showSignupConfirmPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* 4-digit PIN & Job Title */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-xs font-semibold mb-1 text-stone-700 dark:text-stone-300">
                            Fast Switcher PIN (4 digits)
                          </label>
                          <div className="relative">
                            <KeyRound className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                            <input
                              type="text"
                              maxLength={4}
                              required
                              value={signupPin}
                              onChange={(e) => setSignupPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                              placeholder="1234"
                              className="w-full bg-[#fdfbf7] dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl pl-8 pr-3 py-2 text-xs font-mono text-stone-900 dark:text-stone-100 focus:outline-hidden focus:border-[#064e3b]"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold mb-1 text-stone-700 dark:text-stone-300">
                            Job Title
                          </label>
                          <div className="relative">
                            <Briefcase className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                            <input
                              type="text"
                              required
                              value={signupJobTitle}
                              onChange={(e) => setSignupJobTitle(e.target.value)}
                              placeholder="POS Cashier"
                              className="w-full bg-[#fdfbf7] dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl pl-8 pr-3 py-2 text-xs text-stone-900 dark:text-stone-100 focus:outline-hidden focus:border-[#064e3b]"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Submit Button */}
                      <button
                        type="submit"
                        disabled={isSubmittingSignup}
                        className="w-full py-3 bg-[#064e3b] hover:bg-[#043b2c] disabled:opacity-50 text-white font-extrabold text-xs sm:text-sm rounded-xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer mt-3"
                      >
                        {isSubmittingSignup ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Creating Staff Account...</span>
                          </>
                        ) : (
                          <>
                            <ShieldCheck className="w-4 h-4 text-[#6ee7b7]" />
                            <span>Create Staff Account</span>
                            <ArrowRight className="w-4 h-4" />
                          </>
                        )}
                      </button>

                      {/* Switch back to Sign In */}
                      <div className="pt-3 border-t border-stone-200 dark:border-stone-800 flex items-center justify-between text-xs">
                        <span className="text-[11px] text-stone-500">Already registered?</span>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveAuthTab('signin');
                            setErrorMessage(null);
                            setSuccessMessage(null);
                          }}
                          className="text-xs font-bold text-[#064e3b] dark:text-[#6ee7b7] hover:underline flex items-center gap-1.5 cursor-pointer"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                          <span>Sign In to Terminal</span>
                        </button>
                      </div>
                    </form>
                  </div>
                )}
              </div>

            {/* Emergency Factory Reset Link */}
            {/* Universal APK Download & Emergency Reset Actions */}
            <div className="pt-2 flex flex-wrap items-center justify-center gap-4">
              <a
                href="/api/download/apk"
                download="Sappy-Stationary-POS-Universal.apk"
                className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 hover:underline inline-flex items-center gap-1.5 py-1"
                title="Download Standalone Universal Android APK (All Androids, 100% Offline)"
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>Download Android APK (Offline Kiosk)</span>
              </a>

              <span className="text-stone-300 dark:text-stone-700">•</span>

              <button
                type="button"
                onClick={() => {
                  setEmergencyPasscode('');
                  setEmergencyResetError(null);
                  setShowEmergencyResetModal(true);
                }}
                className="text-[11px] font-semibold text-stone-400 hover:text-rose-600 dark:hover:text-rose-400 transition inline-flex items-center gap-1.5 cursor-pointer py-1"
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>Emergency Terminal Reset</span>
              </button>
            </div>

            {/* App / Store Information Footer (Requirement #37) */}
            <div className="pt-4 border-t border-[#e6dfd5] dark:border-[#362e26] text-[11px] text-stone-400 flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="font-extrabold text-stone-600 dark:text-stone-300">Sappy Stationary</span>
                <span className="mx-1">•</span>
                <span>stationery &amp; printing.</span>
              </div>
              <div className="font-mono">
                POS System v1.0.0 • Fiscal Period 2026/27
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ================= SECURE FORGOT PASSWORD MODAL (FIREBASE AUTH) ================= */}
      <ForgotPasswordModal
        isOpen={showForgotPassword}
        onClose={() => setShowForgotPassword(false)}
        defaultEmail={username.includes('@') ? username : ''}
        isOnline={isOnline}
      />

      {/* ================= MASTER PASSCODE SIGNUP MODAL ================= */}
      <MasterPasscodeSignupModal
        isOpen={showSignupModal}
        onClose={() => setShowSignupModal(false)}
        onSuccess={handleSignupSuccess}
      />

      {/* ================= EMERGENCY FACTORY RESET MODAL ================= */}
      {showEmergencyResetModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-stone-900 border-2 border-rose-300 dark:border-rose-800 rounded-3xl p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-2xl bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-300 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-rose-950 dark:text-rose-100">
                  Emergency Factory Reset
                </h3>
                <p className="text-xs text-rose-700 dark:text-rose-300 mt-0.5">
                  Wipe all users, credentials, and data across all devices
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl text-xs text-rose-800 dark:text-rose-300 space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>Destructive Action</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                This will immediately delete all staff accounts (including Admin), products, sales orders, and settings. The terminal will revert to the clean initial administrator setup.
              </p>
            </div>

            {emergencyResetError && (
              <div className="p-3 bg-rose-100 dark:bg-rose-900/60 border border-rose-300 dark:border-rose-700 rounded-xl text-xs text-rose-900 dark:text-rose-100 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{emergencyResetError}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1.5 flex items-center justify-between">
                <span>Enter Master Passcode to Authorize:</span>
                <span className="text-[10px] text-stone-400 font-mono">Default: Sappy#1313</span>
              </label>
              <div className="relative">
                <input
                  type={showEmergencyPasscode ? 'text' : 'password'}
                  value={emergencyPasscode}
                  onChange={(e) => setEmergencyPasscode(e.target.value)}
                  placeholder="Master Passcode (Sappy#1313)"
                  disabled={isExecutingEmergencyReset}
                  className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-xl p-2.5 text-xs font-mono font-bold pr-10 focus:ring-2 focus:ring-rose-500 focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={() => setShowEmergencyPasscode(!showEmergencyPasscode)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 cursor-pointer"
                >
                  {showEmergencyPasscode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-stone-200 dark:border-stone-800">
              <button
                type="button"
                disabled={isExecutingEmergencyReset}
                onClick={() => setShowEmergencyResetModal(false)}
                className="px-4 py-2 rounded-xl border border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 text-xs font-bold transition cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={isExecutingEmergencyReset}
                onClick={handleEmergencyFactoryReset}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black shadow-md transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {isExecutingEmergencyReset ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Wiping System Everywhere...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Wipe All Users &amp; Reset</span>
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
