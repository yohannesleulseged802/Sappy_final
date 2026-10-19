import React, {useState} from 'react';
import {Lock, X, Check, Delete} from 'lucide-react';
import {Staff} from '../../types';
import {storage} from '../../services/storage';

interface PinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (authenticatedStaff: Staff) => void;
  title?: string;
  description?: string;
  requiredRole?: 'admin' | 'manager' | 'any';
  targetStaffId?: string; // If specific staff is being verified
}

export const PinModal: React.FC<PinModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  title = 'Enter Staff PIN',
  description = 'Authorize with your 4-digit security PIN',
  requiredRole = 'any',
  targetStaffId,
}) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const staffList = storage.getStaffList().filter((s) => s.active);

  const [selectedStaffId, setSelectedStaffId] = useState<string>(
    targetStaffId || storage.getCurrentStaff().id
  );

  const handleDigit = (digit: string) => {
    if (pin.length < 4) {
      const nextPin = pin + digit;
      setPin(nextPin);
      setError(null);
      if (nextPin.length === 4) {
        verify(nextPin);
      }
    }
  };

  const handleBackspace = () => {
    setPin(pin.slice(0, -1));
    setError(null);
  };

  const verify = (code: string) => {
    const staff = staffList.find((s) => s.id === selectedStaffId);
    if (!staff) {
      setError('Selected staff member not found.');
      setPin('');
      return;
    }

    if (staff.pin !== code) {
      setError('Incorrect PIN. Please try again.');
      setPin('');
      return;
    }

    if (requiredRole === 'admin' && staff.role !== 'admin') {
      setError('Administrator credentials required for this action.');
      setPin('');
      return;
    }

    if (requiredRole === 'manager' && staff.role !== 'admin' && staff.role !== 'manager') {
      setError('Manager or Admin credentials required.');
      setPin('');
      return;
    }

    onSuccess(staff);
    setPin('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-sm bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl shadow-2xl p-5 text-stone-900 dark:text-stone-100">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-400 rounded-lg">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-base">{title}</h3>
              <p className="text-xs text-stone-500 dark:text-stone-400">{description}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Staff Selector */}
        {!targetStaffId && (
          <div className="mb-4">
            <label className="block text-xs font-medium text-stone-500 dark:text-stone-400 mb-1">
              Select Staff Member
            </label>
            <select
              value={selectedStaffId}
              onChange={(e) => {
                setSelectedStaffId(e.target.value);
                setPin('');
                setError(null);
              }}
              className="w-full text-sm bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg px-3 py-2 text-stone-900 dark:text-stone-100 focus:outline-hidden focus:border-emerald-600"
            >
              {staffList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.role.toUpperCase()})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* PIN Indicators */}
        <div className="flex justify-center gap-3 my-4">
          {[0, 1, 2, 3].map((idx) => (
            <div
              key={idx}
              className={`w-3.5 h-3.5 rounded-full border-2 transition-all ${
                pin.length > idx
                  ? 'bg-emerald-600 border-emerald-600 scale-110'
                  : 'border-stone-300 dark:border-stone-700'
              }`}
            />
          ))}
        </div>

        {error && (
          <p className="text-xs text-center text-rose-500 font-medium mb-3">
            {error}
          </p>
        )}

        {/* Numeric Keypad */}
        <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => handleDigit(digit)}
              className="h-12 text-lg font-semibold rounded-xl bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 active:scale-95 transition"
            >
              {digit}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPin('')}
            className="h-12 text-xs font-semibold rounded-xl bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-500 active:scale-95 transition"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => handleDigit('0')}
            className="h-12 text-lg font-semibold rounded-xl bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 active:scale-95 transition"
          >
            0
          </button>
          <button
            type="button"
            onClick={handleBackspace}
            className="h-12 flex items-center justify-center rounded-xl bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-600 dark:text-stone-300 active:scale-95 transition"
          >
            <Delete className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};
