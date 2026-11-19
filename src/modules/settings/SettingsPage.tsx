import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useApp } from '../../context/AppContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
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
} from 'lucide-react';
import { db } from '../../db';
import { DEFAULT_SETTINGS } from '../../db/seedData';

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
  const { settings, updateSettings } = useApp();
  const [successNotice, setSuccessNotice] = useState(false);

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
      await db.settings.put(DEFAULT_SETTINGS);
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
