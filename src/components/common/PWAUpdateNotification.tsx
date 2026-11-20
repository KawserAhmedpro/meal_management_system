import React, { useEffect, useState } from 'react';
import { RefreshCw, Sparkles, X } from 'lucide-react';
import {
  onServiceWorkerUpdate,
  applyServiceWorkerUpdate,
} from '../../utils/serviceWorkerRegistration';

export const PWAUpdateNotification: React.FC = () => {
  const [waitingRegistration, setWaitingRegistration] =
    useState<ServiceWorkerRegistration | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    const unsubscribe = onServiceWorkerUpdate((reg) => {
      setWaitingRegistration(reg);
      setDismissed(false);
    });
    return unsubscribe;
  }, []);

  if (!waitingRegistration || dismissed) {
    return null;
  }

  const handleUpdate = () => {
    setIsUpdating(true);
    applyServiceWorkerUpdate(waitingRegistration);
  };

  return (
    <aside
      aria-label="App update available"
      className="fixed bottom-4 right-4 z-50 max-w-sm w-[calc(100vw-2rem)] sm:w-auto bg-slate-900 text-white rounded-2xl shadow-2xl border border-slate-700/80 p-4 transition-all duration-300 animate-in fade-in slide-in-from-bottom-5"
    >
      <div className="flex items-start gap-3">
        <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-xl shrink-0 mt-0.5">
          <Sparkles className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0 pr-1">
          <h4 className="text-sm font-bold text-white tracking-tight flex items-center gap-1.5">
            New Version Available
          </h4>
          <p className="text-xs text-slate-300 mt-1 leading-relaxed">
            An updated version of Dining Management System is ready with the latest fixes.
          </p>

          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={handleUpdate}
              disabled={isUpdating}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg shadow-sm transition active:scale-95 disabled:opacity-75 disabled:pointer-events-none"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isUpdating ? 'animate-spin' : ''}`} />
              {isUpdating ? 'Updating...' : 'Update Now'}
            </button>
            <button
              onClick={() => setDismissed(true)}
              className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-white transition rounded-lg hover:bg-slate-800"
            >
              Later
            </button>
          </div>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition -mr-1 -mt-1"
          aria-label="Dismiss notification"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
};
