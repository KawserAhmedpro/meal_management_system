import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Utensils, ShieldCheck } from 'lucide-react';

export const AuthGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAdmin, isLoading, isFirebaseConfigured } = useAuth();
  const location = useLocation();

  // If Firebase is not configured yet, require explicit acknowledgement via /login so protected routes aren't silently exposed
  if (!isFirebaseConfigured) {
    const isLocalAcknowledged = typeof sessionStorage !== 'undefined' && sessionStorage.getItem('dms_local_access_granted') === 'true';
    if (!isLocalAcknowledged) {
      return <Navigate to="/login" state={{ from: location }} replace />;
    }
    return <>{children}</>;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 animate-pulse">
            <Utensils className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white tracking-tight">DINING MANAGEMENT SYSTEM</h3>
            <p className="text-xs text-slate-400 mt-1 flex items-center justify-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              Verifying Admin Authentication...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!user || !isAdmin) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};
