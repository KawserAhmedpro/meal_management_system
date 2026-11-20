import React, { useState, useEffect } from 'react';
import { db } from '../../db';
import { firestore, isFirebaseConfigured } from '../../services/firebase';
import { COLLECTIONS, batchWriteDocs, upsertFirestoreDoc } from '../../services/firestore';
import { collection, getDocs, doc, setDoc } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import {
  CloudUpload,
  Download,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  HardDrive,
  Cloud,
  ArrowRight,
  ShieldCheck,
  Database,
  FileCheck,
} from 'lucide-react';
import {
  Member,
  MealEntry,
  Expense,
  Deposit,
  Category,
  SystemSettings,
  ManagerPeriod,
  DailyMealClosure,
} from '../../types';

interface LocalCounts {
  members: number;
  mealEntries: number;
  expenses: number;
  deposits: number;
  managers: number;
  dailyClosures: number;
  categories: number;
  settings: number;
}

interface CloudCounts {
  members: number;
  mealEntries: number;
  expenses: number;
  deposits: number;
  managers: number;
  dailyClosures: number;
  categories: number;
  settings: number;
}

export const MigrationWizard: React.FC = () => {
  const { user, isAdmin } = useAuth();

  const [localCounts, setLocalCounts] = useState<LocalCounts | null>(null);
  const [cloudCounts, setCloudCounts] = useState<CloudCounts | null>(null);
  const [isLoadingCounts, setIsLoadingCounts] = useState(true);

  const [hasDownloadedBackup, setHasDownloadedBackup] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationProgress, setMigrationProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('');
  const [migrationSummary, setMigrationSummary] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Scan counts
  const refreshCounts = async () => {
    setIsLoadingCounts(true);
    setErrorMessage(null);
    try {
      // 1. Local IndexedDB counts
      const [
        memberCount,
        mealCount,
        expenseCount,
        depositCount,
        managerCount,
        closureCount,
        categoryCount,
        settingsObj,
      ] = await Promise.all([
        db.members.count(),
        db.mealEntries.count(),
        db.expenses.count(),
        db.deposits.count(),
        db.managers.count(),
        db.dailyClosures.count(),
        db.categories.count(),
        db.settings.get('app_settings'),
      ]);

      const local: LocalCounts = {
        members: memberCount,
        mealEntries: mealCount,
        expenses: expenseCount,
        deposits: depositCount,
        managers: managerCount,
        dailyClosures: closureCount,
        categories: categoryCount,
        settings: settingsObj ? 1 : 0,
      };
      setLocalCounts(local);

      // 2. Cloud Firestore counts if connected
      if (isFirebaseConfigured && firestore && user && isAdmin) {
        try {
          const [
            cMembers,
            cMeals,
            cExpenses,
            cDeposits,
            cManagers,
            cClosures,
            cCategories,
          ] = await Promise.all([
            getDocs(collection(firestore, COLLECTIONS.MEMBERS)),
            getDocs(collection(firestore, COLLECTIONS.MEAL_ENTRIES)),
            getDocs(collection(firestore, COLLECTIONS.EXPENSES)),
            getDocs(collection(firestore, COLLECTIONS.DEPOSITS)),
            getDocs(collection(firestore, COLLECTIONS.MANAGERS)),
            getDocs(collection(firestore, COLLECTIONS.DAILY_CLOSURES)),
            getDocs(collection(firestore, COLLECTIONS.CATEGORIES)),
          ]);

          setCloudCounts({
            members: cMembers.size,
            mealEntries: cMeals.size,
            expenses: cExpenses.size,
            deposits: cDeposits.size,
            managers: cManagers.size,
            dailyClosures: cClosures.size,
            categories: cCategories.size,
            settings: 1,
          });
        } catch (err: any) {
          console.warn('Failed to fetch cloud counts:', err);
        }
      }
    } catch (err: any) {
      console.error('Error scanning counts:', err);
      setErrorMessage(err.message || 'Failed to scan database counts.');
    } finally {
      setIsLoadingCounts(false);
    }
  };

  useEffect(() => {
    refreshCounts();
  }, [user, isAdmin]);

  // Step A: Safety Backup Download
  const handleDownloadSafetyBackup = async () => {
    try {
      const [
        members,
        mealEntries,
        expenses,
        deposits,
        categories,
        settings,
        managers,
        dailyClosures,
      ] = await Promise.all([
        db.members.toArray(),
        db.mealEntries.toArray(),
        db.expenses.toArray(),
        db.deposits.toArray(),
        db.categories.toArray(),
        db.settings.toArray(),
        db.managers.toArray(),
        db.dailyClosures.toArray(),
      ]);

      const backupObject = {
        app: 'MEAL MANAGEMENT SYSTEM',
        type: 'PRE_FIREBASE_MIGRATION_SAFETY_BACKUP',
        timestamp: new Date().toISOString(),
        version: '1.0',
        data: {
          members,
          mealEntries,
          expenses,
          deposits,
          categories,
          settings,
          managers,
          dailyClosures,
        },
      };

      const jsonStr = JSON.stringify(backupObject, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dining_mess_pre_migration_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setHasDownloadedBackup(true);
    } catch (err: any) {
      alert('Failed to generate local backup: ' + err.message);
    }
  };

  // Step B: Start Migration
  const handleStartMigration = async () => {
    if (!isFirebaseConfigured || !firestore || !user || !isAdmin) {
      alert('Please configure Firebase and sign in as Admin before migrating.');
      return;
    }

    setIsMigrating(true);
    setErrorMessage(null);
    setMigrationProgress(5);
    setCurrentStep('Reading all records from local IndexedDB...');

    try {
      // 1. Fetch all local tables
      const [
        members,
        mealEntries,
        expenses,
        deposits,
        categories,
        settings,
        managers,
        dailyClosures,
      ] = await Promise.all([
        db.members.toArray(),
        db.mealEntries.toArray(),
        db.expenses.toArray(),
        db.deposits.toArray(),
        db.categories.toArray(),
        db.settings.get('app_settings'),
        db.managers.toArray(),
        db.dailyClosures.toArray(),
      ]);

      const totalItems =
        members.length +
        mealEntries.length +
        expenses.length +
        deposits.length +
        categories.length +
        managers.length +
        dailyClosures.length +
        (settings ? 1 : 0);

      let processed = 0;
      const updateProgress = (completed: number, stepName: string) => {
        processed += completed;
        const pct = Math.min(95, Math.round((processed / Math.max(1, totalItems)) * 90) + 5);
        setMigrationProgress(pct);
        setCurrentStep(stepName);
      };

      // 2. Upload Members
      setCurrentStep(`Migrating ${members.length} members to Cloud Firestore...`);
      await batchWriteDocs<Member>(COLLECTIONS.MEMBERS, members, (m) => m.id);
      updateProgress(members.length, 'Members migrated.');

      // 3. Upload Meal Entries
      setCurrentStep(`Migrating ${mealEntries.length} daily meal records...`);
      await batchWriteDocs<MealEntry>(COLLECTIONS.MEAL_ENTRIES, mealEntries, (m) => m.id);
      updateProgress(mealEntries.length, 'Meal entries migrated.');

      // 4. Upload Expenses
      setCurrentStep(`Migrating ${expenses.length} expense records...`);
      await batchWriteDocs<Expense>(COLLECTIONS.EXPENSES, expenses, (e) => e.id);
      updateProgress(expenses.length, 'Expenses migrated.');

      // 5. Upload Deposits
      setCurrentStep(`Migrating ${deposits.length} deposit records...`);
      await batchWriteDocs<Deposit>(COLLECTIONS.DEPOSITS, deposits, (d) => d.id);
      updateProgress(deposits.length, 'Deposits migrated.');

      // 6. Upload Managers
      setCurrentStep(`Migrating ${managers.length} manager assignment records...`);
      await batchWriteDocs<ManagerPeriod>(COLLECTIONS.MANAGERS, managers, (m) => m.id);
      updateProgress(managers.length, 'Managers migrated.');

      // 7. Upload Closures
      setCurrentStep(`Migrating ${dailyClosures.length} daily meal closures...`);
      await batchWriteDocs<DailyMealClosure>(COLLECTIONS.DAILY_CLOSURES, dailyClosures, (c) => c.date);
      updateProgress(dailyClosures.length, 'Closures migrated.');

      // 8. Upload Categories
      setCurrentStep(`Migrating ${categories.length} expense categories...`);
      await batchWriteDocs<Category>(COLLECTIONS.CATEGORIES, categories, (c) => c.id);
      updateProgress(categories.length, 'Categories migrated.');

      // 9. Upload Settings
      if (settings) {
        setCurrentStep('Migrating mess settings...');
        await upsertFirestoreDoc(COLLECTIONS.SETTINGS, 'app_settings', settings);
        updateProgress(1, 'Settings migrated.');
      }

      // 10. Record Migration Metadata
      const metaRef = doc(firestore, COLLECTIONS.APP_METADATA, 'migration');
      await setDoc(
        metaRef,
        {
          migratedAt: new Date().toISOString(),
          migratedBy: user.uid,
          totalRecordsMigrated: totalItems,
          membersCount: members.length,
          mealsCount: mealEntries.length,
          expensesCount: expenses.length,
          depositsCount: deposits.length,
        },
        { merge: true }
      );

      setMigrationProgress(100);
      setCurrentStep('Migration successfully completed!');
      setMigrationSummary(
        `Successfully migrated ${totalItems} total records (${members.length} members, ${mealEntries.length} meal entries, ${expenses.length} expenses, ${deposits.length} deposits) to Cloud Firestore. Your original IndexedDB records remain 100% intact.`
      );

      await refreshCounts();
    } catch (err: any) {
      console.error('Migration failed:', err);
      setErrorMessage(err.message || 'Migration error occurred.');
    } finally {
      setIsMigrating(false);
    }
  };

  const totalLocal = localCounts
    ? Object.values(localCounts).reduce((a, b) => a + b, 0)
    : 0;
  const totalCloud = cloudCounts
    ? Object.values(cloudCounts).reduce((a, b) => a + b, 0)
    : 0;

  return (
    <Card className="border-emerald-200/80 shadow-md">
      <CardHeader className="bg-gradient-to-r from-emerald-50 to-teal-50/50 border-b border-emerald-100 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-600 text-white shadow-sm">
              <CloudUpload className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 tracking-tight">
                IndexedDB to Cloud Firestore Migration Tool
              </h3>
              <p className="text-xs text-slate-500">
                Safely copy your local mess data to Cloud Firestore for multi-device sync without touching existing local records.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={refreshCounts}
            disabled={isLoadingCounts}
            icon={<RefreshCw className={`w-3.5 h-3.5 ${isLoadingCounts ? 'animate-spin' : ''}`} />}
          >
            Scan Counts
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-5 space-y-6">
        {/* Status Banners */}
        {errorMessage && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1">{errorMessage}</div>
          </div>
        )}

        {migrationSummary && (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-start gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="flex-1 leading-relaxed">
              <h4 className="font-bold text-emerald-800 text-sm mb-1">Migration Completed Successfully</h4>
              <p>{migrationSummary}</p>
            </div>
          </div>
        )}

        {/* Database Counts Comparison Table */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Local IndexedDB Card */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-slate-700" />
                <span className="text-xs font-bold text-slate-800">Local Browser IndexedDB</span>
              </div>
              <Badge variant="outline" className="font-mono text-xs">
                {totalLocal} Total Records
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-white p-2.5 rounded-xl border border-slate-200/80 flex items-center justify-between">
                <span className="text-slate-500">Members</span>
                <span className="font-bold text-slate-800 font-mono">{localCounts?.members ?? '...'}</span>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-slate-200/80 flex items-center justify-between">
                <span className="text-slate-500">Meal Entries</span>
                <span className="font-bold text-slate-800 font-mono">{localCounts?.mealEntries ?? '...'}</span>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-slate-200/80 flex items-center justify-between">
                <span className="text-slate-500">Expenses</span>
                <span className="font-bold text-slate-800 font-mono">{localCounts?.expenses ?? '...'}</span>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-slate-200/80 flex items-center justify-between">
                <span className="text-slate-500">Deposits</span>
                <span className="font-bold text-slate-800 font-mono">{localCounts?.deposits ?? '...'}</span>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-slate-200/80 flex items-center justify-between">
                <span className="text-slate-500">Managers</span>
                <span className="font-bold text-slate-800 font-mono">{localCounts?.managers ?? '...'}</span>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-slate-200/80 flex items-center justify-between">
                <span className="text-slate-500">Closures</span>
                <span className="font-bold text-slate-800 font-mono">{localCounts?.dailyClosures ?? '...'}</span>
              </div>
            </div>
          </div>

          {/* Cloud Firestore Card */}
          <div className="p-4 rounded-2xl bg-emerald-50/50 border border-emerald-200 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cloud className="w-4 h-4 text-emerald-700" />
                <span className="text-xs font-bold text-emerald-900">Cloud Firestore (Multi-Device)</span>
              </div>
              <Badge variant="success" className="font-mono text-xs">
                {totalCloud} Total Records
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-white p-2.5 rounded-xl border border-emerald-200/80 flex items-center justify-between">
                <span className="text-slate-500">Members</span>
                <span className="font-bold text-slate-800 font-mono">{cloudCounts?.members ?? (isFirebaseConfigured ? '0' : 'N/A')}</span>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-emerald-200/80 flex items-center justify-between">
                <span className="text-slate-500">Meal Entries</span>
                <span className="font-bold text-slate-800 font-mono">{cloudCounts?.mealEntries ?? (isFirebaseConfigured ? '0' : 'N/A')}</span>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-emerald-200/80 flex items-center justify-between">
                <span className="text-slate-500">Expenses</span>
                <span className="font-bold text-slate-800 font-mono">{cloudCounts?.expenses ?? (isFirebaseConfigured ? '0' : 'N/A')}</span>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-emerald-200/80 flex items-center justify-between">
                <span className="text-slate-500">Deposits</span>
                <span className="font-bold text-slate-800 font-mono">{cloudCounts?.deposits ?? (isFirebaseConfigured ? '0' : 'N/A')}</span>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-emerald-200/80 flex items-center justify-between">
                <span className="text-slate-500">Managers</span>
                <span className="font-bold text-slate-800 font-mono">{cloudCounts?.managers ?? (isFirebaseConfigured ? '0' : 'N/A')}</span>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-emerald-200/80 flex items-center justify-between">
                <span className="text-slate-500">Closures</span>
                <span className="font-bold text-slate-800 font-mono">{cloudCounts?.dailyClosures ?? (isFirebaseConfigured ? '0' : 'N/A')}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Progress Bar during Migration */}
        {isMigrating && (
          <div className="p-4 rounded-2xl bg-slate-900 text-white space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-emerald-400 flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                {currentStep}
              </span>
              <span className="font-mono font-bold">{migrationProgress}%</span>
            </div>
            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
              <div
                className="bg-emerald-500 h-full transition-all duration-300 rounded-full"
                style={{ width: `${migrationProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Action Controls */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-slate-100">
          <Button
            variant="outline"
            onClick={handleDownloadSafetyBackup}
            icon={<Download className="w-4 h-4 text-slate-600" />}
            className="w-full sm:w-auto"
          >
            {hasDownloadedBackup ? '✓ Safety Backup Downloaded' : '1. Download Pre-Migration Backup (JSON)'}
          </Button>

          <Button
            variant="primary"
            onClick={handleStartMigration}
            disabled={isMigrating || !isFirebaseConfigured || totalLocal === 0}
            isLoading={isMigrating}
            icon={<CloudUpload className="w-4 h-4" />}
            className="w-full sm:w-auto"
          >
            2. Migrate to Cloud Firestore
          </Button>
        </div>

        {/* Safety Guarantee Footnote */}
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-[11px] text-slate-600 flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong>Data Safety Guarantee:</strong> Migration uses non-destructive batched writes. Your local browser IndexedDB data will <strong>never</strong> be deleted, modified, or overwritten during migration.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
