import React, { useState } from 'react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { Cloud, CloudOff, RefreshCw, CheckCircle2, AlertCircle, HardDrive, Shield } from 'lucide-react';
import { Link } from 'react-router-dom';

export const SyncStatusIndicator: React.FC = () => {
  const { syncState, lastSyncedAt, isCloudConnected } = useData();
  const { user } = useAuth();
  const [showPopover, setShowPopover] = useState(false);

  const getStatusConfig = () => {
    switch (syncState) {
      case 'ONLINE_SYNCED':
        return {
          label: 'Cloud Synced',
          dotClass: 'bg-emerald-500',
          badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
          icon: <Cloud className="w-3.5 h-3.5 text-emerald-600" />,
          description: 'All records are synchronized with Cloud Firestore in real time.',
        };
      case 'ONLINE_SYNCING':
        return {
          label: 'Syncing...',
          dotClass: 'bg-amber-500 animate-ping',
          badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
          icon: <RefreshCw className="w-3.5 h-3.5 text-amber-600 animate-spin" />,
          description: 'Writing changes to Cloud Firestore...',
        };
      case 'OFFLINE_WORKING':
        return {
          label: 'Offline (Local Cache)',
          dotClass: 'bg-amber-500',
          badgeClass: 'bg-amber-50 text-amber-800 border-amber-300',
          icon: <CloudOff className="w-3.5 h-3.5 text-amber-600" />,
          description: 'Working offline. Edits are saved locally and will sync when internet returns.',
        };
      case 'SYNC_CONFLICT':
        return {
          label: 'Version Conflict',
          dotClass: 'bg-purple-500 animate-pulse',
          badgeClass: 'bg-purple-50 text-purple-800 border-purple-200',
          icon: <AlertCircle className="w-3.5 h-3.5 text-purple-600" />,
          description: 'A version conflict was detected and quarantined safely for administrator review.',
        };
      case 'SYNC_ERROR':
        return {
          label: 'Sync Issue',
          dotClass: 'bg-rose-500',
          badgeClass: 'bg-rose-50 text-rose-800 border-rose-200',
          icon: <AlertCircle className="w-3.5 h-3.5 text-rose-600" />,
          description: 'Database synchronization issue. Check your connection or security rules.',
        };
      case 'LOCAL_ONLY':
      default:
        return {
          label: 'Local IndexedDB',
          dotClass: 'bg-slate-400',
          badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
          icon: <HardDrive className="w-3.5 h-3.5 text-slate-500" />,
          description: 'Operating in local browser storage mode.',
        };
    }
  };

  const status = getStatusConfig();

  return (
    <div className="relative">
      <button
        onClick={() => setShowPopover(!showPopover)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition ${status.badgeClass} hover:opacity-90`}
        title={status.description}
      >
        <span className={`w-2 h-2 rounded-full ${status.dotClass} shrink-0`} />
        {status.icon}
        <span className="hidden sm:inline">{status.label}</span>
      </button>

      {showPopover && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowPopover(false)}
          />
          <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-xl border border-slate-200 p-4 z-50 text-xs text-slate-700 space-y-3 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="font-bold text-slate-900 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-emerald-600" />
                Backend Status
              </span>
              <span className="font-mono text-[10px] text-slate-500 uppercase px-2 py-0.5 rounded bg-slate-100">
                {syncState}
              </span>
            </div>

            <p className="text-slate-600 leading-relaxed">{status.description}</p>

            <div className="space-y-1 bg-slate-50 p-2.5 rounded-xl border border-slate-100 font-mono text-[11px]">
              <div className="flex justify-between">
                <span className="text-slate-500">Cloud Mode:</span>
                <span className="font-semibold text-slate-800">
                  {isCloudConnected ? 'Active (Firestore)' : 'Inactive'}
                </span>
              </div>
              {user && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Admin Account:</span>
                  <span className="font-semibold text-slate-800 truncate max-w-[140px]" title={user.email || ''}>
                    {user.email}
                  </span>
                </div>
              )}
              {lastSyncedAt && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Last Synced:</span>
                  <span className="font-semibold text-slate-800">
                    {lastSyncedAt.toLocaleTimeString()}
                  </span>
                </div>
              )}
            </div>

            <div className="pt-1 flex items-center justify-between">
              <Link
                to="/backup"
                onClick={() => setShowPopover(false)}
                className="text-emerald-700 hover:text-emerald-900 font-semibold underline text-xs"
              >
                Migration & Backup
              </Link>
              <button
                onClick={() => setShowPopover(false)}
                className="text-slate-400 hover:text-slate-700 text-xs px-2 py-1 rounded-lg hover:bg-slate-100"
              >
                Close
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
