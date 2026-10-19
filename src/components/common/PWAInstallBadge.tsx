import React, {useState} from 'react';
import {Download, ShieldCheck, Monitor, Zap, CheckCircle2, X, Smartphone} from 'lucide-react';
import {usePWAInstall} from '../../hooks/usePWAInstall';

export const PWAInstallBadge: React.FC = () => {
  const {isInstallable, isInstalled, isIOS, install} = usePWAInstall();
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-800/10 hover:bg-emerald-800/20 text-[#064e3b] dark:text-[#6ee7b7] border border-emerald-700/20 text-xs font-semibold transition cursor-pointer"
        title="Download Sappy Stationary POS Android APK & Kiosk App"
      >
        <Download className="w-3.5 h-3.5 animate-bounce" />
        <span className="hidden sm:inline">{isInstalled ? 'Download APK' : 'Install / APK'}</span>
        <span className="sm:hidden">APK</span>
      </button>

      {showModal && (
        <div className="fixed inset-0 w-screen h-screen z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150">
          <div className="w-full max-w-md my-auto max-h-[90vh] overflow-y-auto bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-2xl shadow-2xl p-6 text-stone-900 dark:text-stone-100">
            <div className="flex items-center justify-between pb-3 border-b border-stone-200 dark:border-stone-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-100 dark:bg-emerald-950 text-[#064e3b] dark:text-[#6ee7b7] rounded-xl">
                  <Download className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-stone-900 dark:text-stone-100">Install Sappy POS Kiosk</h3>
                  <p className="text-xs text-stone-600 dark:text-stone-400">
                    Universal Android APK &amp; Standalone Desktop App
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-1.5 text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Universal Android APK Direct Download Box */}
            <div className="mt-4 p-4 rounded-2xl bg-emerald-50/90 dark:bg-emerald-950/50 border-2 border-[#064e3b]/30 dark:border-[#6ee7b7]/30 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#064e3b] text-[#6ee7b7] flex items-center justify-center shrink-0 shadow-xs">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-xs sm:text-sm font-extrabold text-stone-900 dark:text-stone-100">
                      Universal Android APK
                    </h4>
                    <span className="text-[10px] font-mono text-emerald-800 dark:text-[#6ee7b7] font-bold">
                      v1.0.0 • All Androids
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-600 dark:text-stone-300 mt-0.5 leading-relaxed">
                    Compatible with all Android phones &amp; tablets (Android 5.0 Lollipop through Android 15, arm64-v8a, armeabi-v7a, x86_64, V1+V2 signed).
                  </p>
                </div>
              </div>

              <a
                href="/api/download/apk"
                download="Sappy-Stationary-POS-Universal.apk"
                className="w-full py-2.5 px-4 bg-[#064e3b] hover:bg-[#043b2c] text-white font-extrabold text-xs sm:text-sm rounded-xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4 text-[#6ee7b7]" />
                <span>Download Android APK (Sappy-POS.apk)</span>
              </a>
            </div>

            <div className="my-4 space-y-2.5">
              <div className="flex items-start gap-3 p-2.5 rounded-xl bg-stone-50 dark:bg-stone-800/50 border border-stone-200 dark:border-stone-800">
                <ShieldCheck className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
                <div>
                  <h4 className="text-xs font-bold text-stone-800 dark:text-stone-200">
                    1. 100% Offline Protection
                  </h4>
                  <p className="text-xs text-stone-500 dark:text-stone-400">
                    Never lose sales when store Wi-Fi drops. Barcode scanning and checkout run locally.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-2.5 rounded-xl bg-stone-50 dark:bg-stone-800/50 border border-stone-200 dark:border-stone-800">
                <Monitor className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
                <div>
                  <h4 className="text-xs font-bold text-stone-800 dark:text-stone-200">
                    2. Dedicated Kiosk Workspace
                  </h4>
                  <p className="text-xs text-stone-500 dark:text-stone-400">
                    Distraction-free fullscreen register without browser URL bars or back buttons.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-2.5 rounded-xl bg-stone-50 dark:bg-stone-800/50 border border-stone-200 dark:border-stone-800">
                <Zap className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
                <div>
                  <h4 className="text-xs font-bold text-stone-800 dark:text-stone-200">
                    3. Hardware Acceleration &amp; Scanner Compatibility
                  </h4>
                  <p className="text-xs text-stone-500 dark:text-stone-400">
                    Instant response for USB/Bluetooth barcode guns, camera scans, and thermal printing.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-2.5 rounded-xl bg-stone-50 dark:bg-stone-800/50 border border-stone-200 dark:border-stone-800">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
                <div>
                  <h4 className="text-xs font-bold text-stone-800 dark:text-stone-200">
                    4. 1-Click Fast Launch
                  </h4>
                  <p className="text-xs text-stone-500 dark:text-stone-400">
                    Launch directly from your Android app drawer, desktop dock, or Windows taskbar.
                  </p>
                </div>
              </div>
            </div>

            {isIOS && (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-800 dark:text-amber-300 mb-4">
                <strong>On iPad or iPhone:</strong> Tap the Safari <strong>Share</strong> button, then select <strong>Add to Home Screen</strong>.
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-stone-200 dark:border-stone-800">
              <button
                onClick={() => setShowModal(false)}
                className="px-3 py-2 text-xs font-semibold text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg transition cursor-pointer"
              >
                Close
              </button>

              <div className="flex items-center gap-2">
                <a
                  href="/api/download/apk"
                  download="Sappy-Stationary-POS-Universal.apk"
                  className="px-4 py-2 bg-[#064e3b] hover:bg-[#043b2c] text-white font-bold text-xs rounded-lg transition flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <Download className="w-4 h-4 text-[#6ee7b7]" />
                  <span>Download APK</span>
                </a>

                {isInstallable && (
                  <button
                    onClick={async () => {
                      await install();
                      setShowModal(false);
                    }}
                    className="px-4 py-2 bg-stone-900 hover:bg-stone-800 dark:bg-stone-100 dark:hover:bg-stone-200 text-white dark:text-stone-900 font-bold text-xs rounded-lg transition flex items-center gap-1.5 shadow-sm cursor-pointer"
                  >
                    <Monitor className="w-4 h-4" />
                    <span>Install Desktop PWA</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
