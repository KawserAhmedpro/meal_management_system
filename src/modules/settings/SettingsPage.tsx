import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import {
  Settings,
  Shield,
  Building,
  Coins,
  CheckCircle2,
  Lock,
  Unlock,
  BellRing,
  RotateCcw,
  Cloud,
  LogOut,
  Database,
  ShieldCheck,
  Server,
  Share2,
  ExternalLink,
  Globe,
  RefreshCw,
} from 'lucide-react';
import { DEFAULT_SETTINGS } from '../../db/seedData';
import { formatMonthName } from '../../utils/formatters';

interface SettingsFormValues {
  managerName: string;
  messName: string;
  institutionName: string;
  hallName: string;
  currency: string;
  currencySymbol: string;
  managerFeePerMeal: number;
  theme: 'light' | 'dark';
  dateFormat: string;
  pinLockEnabled: boolean;
  pinCode: string;
  reminderDays: number;
}

export const SettingsPage: React.FC = () => {
  const {
    settings,
    updateSettings,
    publicPortalUrl,
    syncPublicPortal,
    syncAllPublicPortalMonths,
    isPublicSyncing,
    lastPublicSyncedAt,
    selectedMonth,
  } = useApp();
  const { user, logout, isFirebaseConfigured } = useAuth();
  const [successNotice, setSuccessNotice] = useState(false);
  const [portalCopied, setPortalCopied] = useState(false);
  const [publishFeedback, setPublishFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const handleSyncCurrentMonth = async () => {
    setPublishFeedback(null);
    try {
      const ok = await syncPublicPortal(selectedMonth);
      if (ok) {
        setPublishFeedback({
          type: 'success',
          msg: `Successfully published ${formatMonthName(selectedMonth)} records to the Public Member Portal!`,
        });
      } else {
        setPublishFeedback({
          type: 'error',
          msg: 'Could not sync. Ensure you are signed in as Admin with an active cloud connection.',
        });
      }
    } catch (err: any) {
      setPublishFeedback({
        type: 'error',
        msg: `Publish failed: ${err.message || 'Unknown error'}`,
      });
    }
  };

  const handleSyncAllMonths = async () => {
    setPublishFeedback(null);
    try {
      const count = await syncAllPublicPortalMonths();
      if (count > 0) {
        setPublishFeedback({
          type: 'success',
          msg: `Successfully published all ${count} available month(s) to the Public Member Portal!`,
        });
      } else {
        setPublishFeedback({
          type: 'error',
          msg: 'No records found to publish.',
        });
      }
    } catch (err: any) {
      setPublishFeedback({
        type: 'error',
        msg: `Publish failed: ${err.message || 'Unknown error'}`,
      });
    }
  };

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { isSubmitting },
  } = useForm<SettingsFormValues>({
    defaultValues: {
      managerName: settings.managerName || 'Ratul',
      messName: settings.messName || 'Omar Ekushe Hall Mess',
      institutionName: settings.institutionName || 'Mymensingh Engineering College',
      hallName: settings.hallName || 'Omar Ekushe Hall',
      currency: settings.currency || 'BDT',
      currencySymbol: settings.currencySymbol || '৳',
      managerFeePerMeal: settings.managerFeePerMeal || 5,
      theme: settings.theme || 'light',
      dateFormat: settings.dateFormat || 'yyyy-MM-dd',
      pinLockEnabled: settings.pinLockEnabled || false,
      pinCode: settings.pinCode || '',
      reminderDays: settings.reminderDays || 7,
    },
  });

  const hasInitialized = React.useRef(false);

  // Sync form values on initial load when settings load from IndexedDB
  React.useEffect(() => {
    if (settings && !hasInitialized.current) {
      reset({
        managerName: settings.managerName || 'Ratul',
        messName: settings.messName || 'Omar Ekushe Hall Mess',
        institutionName: settings.institutionName || 'Mymensingh Engineering College',
        hallName: settings.hallName || 'Omar Ekushe Hall',
        currency: settings.currency || 'BDT',
        currencySymbol: settings.currencySymbol || '৳',
        managerFeePerMeal: settings.managerFeePerMeal || 5,
        theme: settings.theme || 'light',
        dateFormat: settings.dateFormat || 'yyyy-MM-dd',
        pinLockEnabled: settings.pinLockEnabled || false,
        pinCode: settings.pinCode || '',
        reminderDays: settings.reminderDays || 7,
      });
      hasInitialized.current = true;
    }
  }, [settings, reset]);

  const isPinEnabled = watch('pinLockEnabled');

  const onSubmit = async (data: SettingsFormValues) => {
    try {
      await updateSettings({
        ...data,
        managerFeePerMeal: Number(data.managerFeePerMeal) || 5,
        reminderDays: Number(data.reminderDays) || 7,
      });
      setSuccessNotice(true);
      setTimeout(() => setSuccessNotice(false), 3000);
    } catch (err) {
      console.error('Failed to save settings:', err);
    }
  };

  const handleResetDefaults = async () => {
    if (confirm('Reset system settings back to original defaults?')) {
      await updateSettings(DEFAULT_SETTINGS);
      reset({
        ...DEFAULT_SETTINGS,
      });
      setSuccessNotice(true);
      setTimeout(() => setSuccessNotice(false), 3000);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl animate-in fade-in duration-300">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
          <Settings className="w-6 h-6 text-slate-700" />
          System Settings & Preferences
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Customize institution names, default manager fee rates, currency display, and local device security.
        </p>
      </div>

      {successNotice ? (
        <div key="success-notice" className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Settings successfully saved and applied!</span>
        </div>
      ) : null}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Section 1: Mess & Institution Details */}
        <Card>
          <CardHeader
            title="Mess & Manager Profile"
            subtitle="Details displayed on printable meal sheets, headers, and reports"
          />
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Manager Name *"
                placeholder="e.g. Ratul"
                {...register('managerName', { required: 'Manager name is required' })}
              />
              <Input
                label="Hall Name *"
                placeholder="e.g. Omar Ekushe Hall"
                {...register('hallName')}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Institution Name"
                placeholder="e.g. Mymensingh Engineering College"
                {...register('institutionName')}
              />
              <Input
                label="Mess / Batch Name"
                placeholder="e.g. Omar Ekushe Hall Mess"
                {...register('messName')}
              />
            </div>
          </CardContent>
        </Card>

        {/* Section 2: Financial Calculation Preferences */}
        <Card>
          <CardHeader
            title="Financial & Fee Calculations"
            subtitle="Manager fee per meal and currency symbols"
          />
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input
                label="Manager Fee Per Meal (BDT ৳)"
                type="number"
                step="0.5"
                placeholder="5"
                helperText="Default: 5৳ per meal"
                {...register('managerFeePerMeal')}
              />

              <Input
                label="Currency Code"
                placeholder="BDT"
                {...register('currency')}
              />

              <Input
                label="Currency Symbol"
                placeholder="৳"
                {...register('currencySymbol')}
              />
            </div>
          </CardContent>
        </Card>

        {/* Section 3: Device Security & Admin PIN */}
        <Card>
          <CardHeader
            title="Local Admin PIN Lock"
            subtitle="Client-side privacy lock for this browser session"
          />
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-slate-200 text-slate-700 flex items-center justify-center">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-800">
                    Enable Local PIN Screen Lock
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Require entering a 4-digit PIN when loading the app.
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                {...register('pinLockEnabled')}
                className="w-5 h-5 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
              />
            </div>

            {isPinEnabled && (
              <div className="max-w-xs">
                <Input
                  label="Enter 4-Digit PIN Code"
                  type="password"
                  maxLength={6}
                  placeholder="••••"
                  {...register('pinCode')}
                  helperText="Keep this PIN safe. Stored locally on this browser."
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Section 4: Backup Reminders */}
        <Card>
          <CardHeader
            title="Backup Reminders"
            subtitle="Remind admin to download database copies periodically"
          />
          <CardContent>
            <div className="max-w-xs">
              <Input
                label="Reminder Frequency (Days)"
                type="number"
                min={1}
                max={30}
                {...register('reminderDays')}
                helperText="Show reminder banner if no backup made within this period"
              />
            </div>
          </CardContent>
        </Card>

        {/* Section 5: Firebase Backend & Cloud Synchronization Status */}
        <Card className="border-emerald-200/80 bg-gradient-to-b from-white to-emerald-50/20">
          <CardHeader
            title="Firebase Backend & Multi-Device Cloud Sync"
            subtitle="Cloud Firestore integration status, Admin authentication, and offline synchronization"
          />
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
              <div className="p-3 bg-white rounded-xl border border-slate-200">
                <span className="text-slate-500 block mb-1">Firebase Configuration</span>
                {isFirebaseConfigured ? (
                  <Badge variant="success">Configured & Active</Badge>
                ) : (
                  <Badge variant="warning">Local-Only Mode</Badge>
                )}
              </div>

              <div className="p-3 bg-white rounded-xl border border-slate-200">
                <span className="text-slate-500 block mb-1">Backend Database</span>
                <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                  <Cloud className="w-3.5 h-3.5 text-emerald-600" />
                  Cloud Firestore + Offline Cache
                </span>
              </div>

              <div className="p-3 bg-white rounded-xl border border-slate-200">
                <span className="text-slate-500 block mb-1">Admin Session</span>
                {user ? (
                  <span className="font-semibold text-emerald-700 truncate block" title={user.email || ''}>
                    {user.email}
                  </span>
                ) : (
                  <span className="text-slate-500">Not Signed In</span>
                )}
              </div>
            </div>

            {user && (
              <div className="pt-2 flex items-center justify-between border-t border-slate-100">
                <p className="text-xs text-slate-500">
                  Signed in with authorized Admin UID: <code className="bg-slate-100 px-1.5 py-0.5 rounded text-[11px] font-mono text-slate-800">{user.uid}</code>
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={logout}
                  icon={<LogOut className="w-3.5 h-3.5 text-rose-600" />}
                >
                  Sign Out Admin
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Section 6: Public Member Portal & Sharing */}
        <Card className="border-teal-200/80 bg-gradient-to-b from-white to-teal-50/20">
          <CardHeader
            title="Public Member Portal & Sharing"
            subtitle="Shareable read-only portal for mess members to check daily meals, market expenses, and meal rates without login"
          />
          <CardContent className="space-y-4">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <span className="text-xs font-semibold text-slate-500 block mb-1">
                  Shareable Public Link
                </span>
                <input
                  type="text"
                  readOnly
                  value={publicPortalUrl}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 font-mono outline-none select-all"
                />
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(publicPortalUrl);
                    setPortalCopied(true);
                    setTimeout(() => setPortalCopied(false), 2000);
                  }}
                  icon={portalCopied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <Share2 className="w-3.5 h-3.5" />}
                >
                  {portalCopied ? 'Copied!' : 'Copy Link'}
                </Button>

                <a
                  href={`${import.meta.env.BASE_URL}public`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition"
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>Open Portal</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>

            {publishFeedback && (
              <div
                className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                  publishFeedback.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}
              >
                {publishFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <ShieldCheck className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span>{publishFeedback.msg}</span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-200/60 text-xs">
              <div>
                <p className="text-slate-600 font-medium flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  Strict Privacy Enforcement Active
                </p>
                <p className="text-slate-500 text-[11px] mt-0.5">
                  Public portal contains meal attendance and market expenses only. Deposits, personal dues, advances, and phone numbers are strictly blocked by Firestore Security Rules.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={isPublicSyncing}
                  onClick={handleSyncCurrentMonth}
                  icon={<RefreshCw className={`w-3.5 h-3.5 text-white ${isPublicSyncing ? 'animate-spin' : ''}`} />}
                >
                  {isPublicSyncing ? 'Publishing...' : `Publish ${formatMonthName(selectedMonth)}`}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isPublicSyncing}
                  onClick={handleSyncAllMonths}
                  icon={<RefreshCw className={`w-3.5 h-3.5 text-slate-600 ${isPublicSyncing ? 'animate-spin' : ''}`} />}
                >
                  Publish All Months
                </Button>
              </div>
            </div>

            {lastPublicSyncedAt && (
              <p className="text-[11px] text-emerald-600 font-medium">
                Last published to public portal: {lastPublicSyncedAt.toLocaleTimeString()} ({lastPublicSyncedAt.toLocaleDateString()})
              </p>
            )}
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-200">
          <Button
            type="button"
            variant="outline"
            icon={<RotateCcw className="w-4 h-4 text-slate-500" />}
            onClick={handleResetDefaults}
          >
            Reset Defaults
          </Button>

          <Button type="submit" variant="primary" size="lg" isLoading={isSubmitting}>
            Save All Settings
          </Button>
        </div>
      </form>
    </div>
  );
};
