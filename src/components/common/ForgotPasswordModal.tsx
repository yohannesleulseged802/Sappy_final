import React, { useState, useEffect, useRef } from 'react';
import {
  Mail,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShieldCheck,
  KeyRound,
  X,
  HelpCircle,
  ExternalLink,
} from 'lucide-react';
import { sendStaffPasswordReset, PasswordResetResult } from '../../services/firebaseAuth';
import { storage } from '../../services/storage';
import { sound } from '../../services/sound';

interface ForgotPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultEmail?: string;
  isOnline?: boolean;
}

export const ForgotPasswordModal: React.FC<ForgotPasswordModalProps> = ({
  isOpen,
  onClose,
  defaultEmail = '',
  isOnline = true,
}) => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<PasswordResetResult | null>(null);
  const [showAdminContact, setShowAdminContact] = useState(false);
  const emailInputRef = useRef<HTMLInputElement>(null);

  // Auto-fill default email and focus on open
  useEffect(() => {
    if (isOpen) {
      setEmail(defaultEmail);
      setError(null);
      setSuccessResult(null);
      setShowAdminContact(false);
      setTimeout(() => {
        emailInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen, defaultEmail]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Please enter your registered staff email address.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccessResult(null);

    try {
      const result = await sendStaffPasswordReset(email.trim());

      if (result.success) {
        sound.playCheckoutSuccess();
        setSuccessResult(result);
        storage.addAuditLog(
          'PASSWORD_RESET_REQUESTED',
          'AUTH',
          `Password reset link requested for email: ${email.trim()}`
        );
      } else {
        sound.playError();
        setError(result.message);
        storage.addAuditLog(
          'PASSWORD_RESET_FAILED',
          'AUTH',
          `Failed password reset request for email: ${email.trim()} - ${result.message}`
        );
      }
    } catch (err: any) {
      sound.playError();
      setError('An unexpected error occurred while processing the request. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetAnother = () => {
    setSuccessResult(null);
    setError(null);
    setTimeout(() => {
      emailInputRef.current?.focus();
    }, 50);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="forgot-password-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div className="w-full max-w-md bg-white dark:bg-[#1a1714] border border-[#e6dfd5] dark:border-[#383129] rounded-3xl shadow-2xl overflow-hidden transition-all">
        {/* Header Bar */}
        <div className="bg-gradient-to-r from-[#064e3b] to-[#043b2c] text-white p-5 px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#6ee7b7]/20 border border-[#6ee7b7]/30 text-[#6ee7b7] flex items-center justify-center">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h3 id="forgot-password-title" className="text-base font-bold text-white tracking-tight">
                Reset Account Password
              </h3>
              <p className="text-[11px] text-[#6ee7b7] font-medium">
                Firebase Authentication Security
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4">
          {/* Offline warning if network is offline */}
          {!isOnline && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-xl text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                <strong>Offline Notice:</strong> You are currently offline. Password reset links will queue once network connectivity is re-established.
              </span>
            </div>
          )}

          {/* Success Feedback View */}
          {successResult ? (
            <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200 text-center py-2">
              <div className="w-14 h-14 bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 rounded-2xl flex items-center justify-center mx-auto shadow-xs">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div className="space-y-1">
                <h4 className="text-base font-bold text-stone-900 dark:text-stone-100">
                  Password Reset Dispatched
                </h4>
                <p className="text-xs text-stone-600 dark:text-stone-300 px-2 leading-relaxed">
                  {successResult.message}
                </p>
              </div>

              <div className="bg-stone-50 dark:bg-stone-800/80 border border-stone-200 dark:border-stone-700/80 rounded-2xl p-4 text-left text-xs space-y-2">
                <div className="flex items-center gap-2 font-bold text-stone-800 dark:text-stone-200">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>Next Steps:</span>
                </div>
                <ol className="list-decimal list-inside text-stone-600 dark:text-stone-400 space-y-1 pl-1">
                  <li>Check the inbox for <strong>{email}</strong>.</li>
                  <li>Click the secure link from Firebase Authentication.</li>
                  <li>Set your new secure password and return here to sign in.</li>
                </ol>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2.5 bg-[#064e3b] hover:bg-[#043b2c] text-white font-bold text-xs sm:text-sm rounded-xl shadow-md transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back to Login</span>
                </button>
                <button
                  type="button"
                  onClick={handleResetAnother}
                  className="py-2.5 px-4 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300 font-semibold text-xs rounded-xl transition cursor-pointer"
                >
                  Send Another
                </button>
              </div>
            </div>
          ) : (
            /* Input Form View */
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="text-xs text-stone-600 dark:text-stone-400 leading-relaxed">
                Enter your registered staff email address. Firebase Authentication will send you an official password recovery link with instructions.
              </div>

              {/* Error Message */}
              {error && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/60 rounded-xl text-xs text-rose-800 dark:text-rose-300 flex items-start gap-2 animate-in fade-in">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold mb-1.5 text-stone-700 dark:text-stone-300">
                  Staff Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                  <input
                    ref={emailInputRef}
                    type="email"
                    required
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder="e.g. cashier@sappystationary.com"
                    disabled={isLoading}
                    className="w-full bg-[#fdfbf7] dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl pl-9 pr-3 py-2.5 text-xs sm:text-sm text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-hidden focus:border-[#064e3b] dark:focus:border-[#6ee7b7]"
                  />
                </div>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row gap-2">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 py-2.5 bg-[#064e3b] hover:bg-[#043b2c] disabled:opacity-50 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Sending Reset Link...</span>
                    </>
                  ) : (
                    <>
                      <Mail className="w-4 h-4" />
                      <span>Send Recovery Email</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  disabled={isLoading}
                  className="py-2.5 px-4 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300 font-semibold text-xs rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Login</span>
                </button>
              </div>

              {/* Cashier PIN Recovery / Physical Store Manager Help */}
              <div className="pt-3 border-t border-stone-200 dark:border-stone-800">
                <button
                  type="button"
                  onClick={() => setShowAdminContact(!showAdminContact)}
                  className="w-full flex items-center justify-between text-[11px] text-stone-500 hover:text-stone-800 dark:hover:text-stone-300 font-medium py-1 transition"
                >
                  <span className="flex items-center gap-1.5">
                    <HelpCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>Forgotten your Cashier PIN or need in-store assistance?</span>
                  </span>
                  <span className="text-[10px] font-bold text-[#064e3b] dark:text-[#6ee7b7]">
                    {showAdminContact ? 'Hide' : 'View'}
                  </span>
                </button>

                {showAdminContact && (
                  <div className="mt-2 p-3 bg-stone-50 dark:bg-stone-800/60 border border-stone-200 dark:border-stone-700 rounded-xl text-[11px] text-stone-600 dark:text-stone-400 space-y-1 animate-in fade-in">
                    <p className="font-semibold text-stone-800 dark:text-stone-200">
                      Physical Register PIN Recovery:
                    </p>
                    <p>
                      Cashier PINs cannot be reset via email for on-site security compliance. Please contact your Store Manager or Administrator to issue a temporary PIN.
                    </p>
                    <div className="pt-1 font-mono text-[10px] text-stone-500 dark:text-stone-400">
                      Store Manager: Sara Tadesse (ext. 104) • admin@sappystationary.com
                    </div>
                  </div>
                )}
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
