import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Lock, KeyRound } from 'lucide-react';
import { Button } from '../ui/Button';

export const PinModal: React.FC = () => {
  const { isPinLocked, unlockWithPin, settings } = useApp();
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  if (!isPinLocked) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const success = unlockWithPin(pin);
    if (success) {
      setError(false);
      setPin('');
    } else {
      setError(true);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-md">
      <div className="w-full max-w-md bg-white rounded-3xl p-8 shadow-2xl border border-slate-100 text-center">
        <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-5 shadow-sm">
          <Lock className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-slate-800">{settings.messName}</h2>
        <p className="text-sm text-slate-500 mt-1 mb-6">
          Admin PIN Lock is active. Please enter your 4 to 6 digit PIN to unlock.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <input
              type="password"
              maxLength={8}
              value={pin}
              autoFocus
              onChange={(e) => {
                setPin(e.target.value);
                setError(false);
              }}
              placeholder="••••"
              className={`w-full text-center text-3xl tracking-[0.5em] font-mono py-3 rounded-2xl border ${
                error
                  ? 'border-rose-400 bg-rose-50/50 text-rose-700'
                  : 'border-slate-200 bg-slate-50 text-slate-800'
              } focus:outline-none focus:ring-4 focus:ring-emerald-100 focus:border-emerald-500`}
            />
          </div>

          {error && (
            <p className="text-xs font-semibold text-rose-600 animate-shake">
              Incorrect PIN. Please try again.
            </p>
          )}

          <Button type="submit" variant="primary" size="lg" className="w-full" icon={<KeyRound className="w-5 h-5" />}>
            Unlock System
          </Button>
        </form>

        <p className="text-[11px] text-slate-400 mt-6">
          Local device security only. Data is stored safely on this browser.
        </p>
      </div>
    </div>
  );
};
