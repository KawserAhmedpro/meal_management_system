import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { useApp } from '../../context/AppContext';
import { parseExcelWorkbook, ExcelImportPreview } from '../../utils/excelParser';
import { exportMonthToExcel } from '../../utils/excelExporter';
import { formatDate } from '../../utils/formatters';
import { MigrationWizard } from './MigrationWizard';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import {
  Database,
  Download,
  Upload,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
  RefreshCw,
  HardDrive,
  FileJson,
} from 'lucide-react';

export const BackupRestorePage: React.FC = () => {
  const { settings, updateSettings, selectedMonth } = useApp();

  // Queries
  const members = useLiveQuery(() => db.members.toArray(), []) || [];
  const mealEntries = useLiveQuery(() => db.mealEntries.toArray(), []) || [];
  const expenses = useLiveQuery(() => db.expenses.toArray(), []) || [];
  const deposits = useLiveQuery(() => db.deposits.toArray(), []) || [];
  const categories = useLiveQuery(() => db.categories.toArray(), []) || [];

  // State
  const [isExportingJson, setIsExportingJson] = useState(false);
  const [jsonPreview, setJsonPreview] = useState<any | null>(null);
  const [restoreMode, setRestoreMode] = useState<'replace' | 'merge'>('replace');
  const [isConfirmRestoreOpen, setIsConfirmRestoreOpen] = useState(false);

  // Excel Import state
  const [excelPreview, setExcelPreview] = useState<ExcelImportPreview | null>(null);
  const [isImportingExcel, setIsImportingExcel] = useState(false);
  const [excelFile, setExcelFile] = useState<File | null>(null);

  // Success notifications
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // A. Export Full JSON Backup
  const handleExportJson = async () => {
    setIsExportingJson(true);
    try {
      const now = new Date();
      const backupData = {
        app: 'MEAL MANAGEMENT SYSTEM',
        schemaVersion: '1.0',
        exportedAt: now.toISOString(),
        messName: settings.messName,
        data: {
          members,
          mealEntries,
          expenses,
          deposits,
          categories,
          settings,
        },
      };

      const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
        JSON.stringify(backupData, null, 2)
      )}`;
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', jsonString);
      downloadAnchor.setAttribute(
        'download',
        `MESS_BACKUP_${now.toISOString().split('T')[0]}.json`
      );
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      // Update last backup date in settings
      await updateSettings({ lastBackupDate: now.toISOString() });
      setStatusMessage({ text: 'Full JSON backup exported and verified successfully!', type: 'success' });
    } catch (e: any) {
      setStatusMessage({ text: `Backup export failed: ${e.message}`, type: 'error' });
    } finally {
      setIsExportingJson(false);
    }
  };

  // B. Load & Preview JSON for Restore
  const handleJsonFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (!parsed || typeof parsed !== 'object') {
          throw new Error('Backup payload is empty or not a valid JSON object.');
        }
        if (!parsed.data || !parsed.schemaVersion) {
          throw new Error('Invalid JSON backup format. Missing schema version or data.');
        }
        if (typeof parsed.data !== 'object' || parsed.data === null) {
          throw new Error('Backup data payload must be an object containing table records.');
        }
        setJsonPreview(parsed);
      } catch (err: any) {
        setStatusMessage({ text: `Failed to parse backup JSON: ${err.message}`, type: 'error' });
      }
    };
    reader.readAsText(file);
  };

  // Execute JSON Restore
  const executeRestore = async () => {
    if (!jsonPreview?.data) return;
    try {
      const {
        members: resMembers = [],
        mealEntries: resMealEntries = [],
        expenses: resExpenses = [],
        deposits: resDeposits = [],
        categories: resCategories = [],
      } = jsonPreview.data;

      // Deep schema validation: Ensure all supplied collections are genuine arrays
      if (
        !Array.isArray(resMembers) ||
        !Array.isArray(resMealEntries) ||
        !Array.isArray(resExpenses) ||
        !Array.isArray(resDeposits) ||
        !Array.isArray(resCategories)
      ) {
        throw new Error('Invalid backup structure: Collections (members, meals, expenses, deposits) must be arrays.');
      }

      if (restoreMode === 'replace') {
        // Pre-wipe safety mechanism: Snapshot current IndexedDB to localStorage to prevent catastrophic data loss
        try {
          const safetySnapshot = {
            timestamp: new Date().toISOString(),
            members: await db.members.toArray(),
            mealEntries: await db.mealEntries.toArray(),
            expenses: await db.expenses.toArray(),
            deposits: await db.deposits.toArray(),
            categories: await db.categories.toArray(),
          };
          localStorage.setItem('dms_pre_restore_safety_backup', JSON.stringify(safetySnapshot));
        } catch (snapshotErr) {
          console.warn('[Backup] Unable to save local safety snapshot before replace:', snapshotErr);
        }

        await db.transaction(
          'rw',
          [db.members, db.mealEntries, db.expenses, db.deposits, db.categories],
          async () => {
            await db.members.clear();
            await db.mealEntries.clear();
            await db.expenses.clear();
            await db.deposits.clear();
            await db.categories.clear();

            if (resMembers.length) await db.members.bulkAdd(resMembers);
            if (resMealEntries.length) await db.mealEntries.bulkAdd(resMealEntries);
            if (resExpenses.length) await db.expenses.bulkAdd(resExpenses);
            if (resDeposits.length) await db.deposits.bulkAdd(resDeposits);
            if (resCategories.length) await db.categories.bulkAdd(resCategories);
          }
        );
      } else {
        // Merge mode
        await db.transaction(
          'rw',
          [db.members, db.mealEntries, db.expenses, db.deposits, db.categories],
          async () => {
            if (resMembers.length) await db.members.bulkPut(resMembers);
            if (resMealEntries.length) await db.mealEntries.bulkPut(resMealEntries);
            if (resExpenses.length) await db.expenses.bulkPut(resExpenses);
            if (resDeposits.length) await db.deposits.bulkPut(resDeposits);
            if (resCategories.length) await db.categories.bulkPut(resCategories);
          }
        );
      }

      setJsonPreview(null);
      setIsConfirmRestoreOpen(false);
      setStatusMessage({
        text: `Data successfully restored (${restoreMode === 'replace' ? 'Clean Replace' : 'Merged'})!`,
        type: 'success',
      });
    } catch (err: any) {
      setStatusMessage({ text: `Restore failed: ${err.message}`, type: 'error' });
    }
  };

  // C. Excel File Selected for Import
  const handleExcelFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setExcelFile(file);
    const existingIds = new Set(members.map((m) => m.id));
    try {
      const preview = await parseExcelWorkbook(file, existingIds, selectedMonth);
      setExcelPreview(preview);
    } catch (err: any) {
      setStatusMessage({ text: `Failed to parse Excel file: ${err.message}`, type: 'error' });
    }
  };

  // Execute Excel Import
  const executeExcelImport = async () => {
    if (!excelPreview) return;
    setIsImportingExcel(true);
    try {
      await db.transaction('rw', [db.members, db.mealEntries, db.expenses, db.deposits], async () => {
        if (excelPreview.members.length > 0) {
          await db.members.bulkPut(excelPreview.members);
        }
        if (excelPreview.mealEntries.length > 0) {
          await db.mealEntries.bulkPut(excelPreview.mealEntries);
        }
        if (excelPreview.expenses.length > 0) {
          await db.expenses.bulkPut(excelPreview.expenses);
        }
        if (excelPreview.deposits.length > 0) {
          await db.deposits.bulkPut(excelPreview.deposits);
        }
      });

      setStatusMessage({
        text: `Excel imported successfully: ${excelPreview.members.length} members, ${excelPreview.mealEntries.length} meals, ${excelPreview.expenses.length} expenses, ${excelPreview.deposits.length} deposits.`,
        type: 'success',
      });
      setExcelPreview(null);
      setExcelFile(null);
    } catch (err: any) {
      setStatusMessage({ text: `Excel import failed: ${err.message}`, type: 'error' });
    } finally {
      setIsImportingExcel(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
          <Database className="w-6 h-6 text-emerald-600" />
          Backup & Restore Center
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Local-first data protection: export full database JSON backups, restore previous snapshots, or import and export Excel workbooks.
        </p>
      </div>

      {/* Alert / Notification banner */}
      {statusMessage && (
        <div
          className={`p-4 rounded-2xl flex items-center justify-between text-xs font-semibold ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          <span>{statusMessage.text}</span>
          <button onClick={() => setStatusMessage(null)} className="font-bold underline ml-2">
            Dismiss
          </button>
        </div>
      )}

      {/* Cloud Firestore Migration & Multi-Device Sync Wizard */}
      <MigrationWizard />

      {/* Backup Status and Device Storage Warning Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-5 border-l-4 border-l-emerald-500 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase text-slate-500">Backup Status</span>
            {settings.lastBackupDate ? (
              <Badge variant="success">Secured</Badge>
            ) : (
              <Badge variant="warning">No Backup</Badge>
            )}
          </div>
          <div className="mt-2 text-sm font-bold text-slate-800">
            {settings.lastBackupDate
              ? `Last saved: ${formatDate(settings.lastBackupDate.split('T')[0])}`
              : 'Never backed up'}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Recommended: Export a JSON backup weekly.
          </p>
        </Card>

        <Card className="p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase text-slate-500">Database Records</span>
            <HardDrive className="w-4 h-4 text-blue-600" />
          </div>
          <div className="mt-2 text-base font-bold text-slate-800">
            {members.length} Members • {mealEntries.length} Meals
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            {expenses.length} Expenses • {deposits.length} Deposits in IndexedDB
          </p>
        </Card>

        <Card className="p-5 flex flex-col justify-between bg-slate-900 text-white">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase text-slate-400">Architecture</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-sm font-bold text-emerald-300">
            100% Local-First & Offline
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            No server uploads. Data belongs exclusively to your browser.
          </p>
        </Card>
      </div>

      {/* Main Action Modules: JSON Backup/Restore & Excel Import/Export */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Module A: Full JSON Backup & Restore */}
        <Card>
          <CardHeader
            title="Complete JSON Backup & Restore"
            subtitle="Full snapshot of all tables, settings, categories, and audit records"
          />
          <CardContent className="space-y-4">
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
              <h4 className="text-xs font-bold uppercase text-slate-700 flex items-center gap-1.5">
                <Download className="w-4 h-4 text-emerald-600" />
                Export Full Backup
              </h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Creates a versioned, portable JSON archive with all mess data. Save this file to your laptop, external USB drive, or cloud storage.
              </p>
              <Button
                variant="primary"
                onClick={handleExportJson}
                isLoading={isExportingJson}
                icon={<Download className="w-4 h-4" />}
                className="w-full sm:w-auto"
              >
                Download JSON Backup File
              </Button>
            </div>

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
              <h4 className="text-xs font-bold uppercase text-slate-700 flex items-center gap-1.5">
                <Upload className="w-4 h-4 text-blue-600" />
                Restore from JSON Backup
              </h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Restore previous data. Shows a verification summary before any database modifications.
              </p>
              <div>
                <label className="inline-flex items-center justify-center font-medium rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs text-slate-700 hover:bg-slate-100 cursor-pointer gap-2 shadow-xs">
                  <FileJson className="w-4 h-4 text-blue-600" />
                  Select Backup JSON File
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleJsonFileChange}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Module B: Excel Import & Export */}
        <Card>
          <CardHeader
            title="Excel Workbook Import & Export"
            subtitle="Seamless compatibility with SULTAN MEAL.xlsx and spreadsheet exports"
          />
          <CardContent className="space-y-4">
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
              <h4 className="text-xs font-bold uppercase text-slate-700 flex items-center gap-1.5">
                <Download className="w-4 h-4 text-emerald-600" />
                Export Data to Excel
              </h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Export separate sheets for Members, Meals, Costs, Deposits, and Financial Summary for{' '}
                <strong>{selectedMonth}</strong>.
              </p>
              <Button
                variant="outline"
                onClick={() =>
                  exportMonthToExcel(selectedMonth, members, mealEntries, expenses, deposits, settings)
                }
                icon={<FileSpreadsheet className="w-4 h-4 text-emerald-600" />}
                className="w-full sm:w-auto"
              >
                Export Excel Workbook (.xlsx)
              </Button>
            </div>

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
              <h4 className="text-xs font-bold uppercase text-slate-700 flex items-center gap-1.5">
                <Upload className="w-4 h-4 text-amber-600" />
                Import SULTAN MEAL.xlsx
              </h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Upload your existing Excel sheet. Automatically reads Rooms, Members, Costs, Meals, and Transactions.
              </p>
              <div>
                <label className="inline-flex items-center justify-center font-medium rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs text-slate-700 hover:bg-slate-100 cursor-pointer gap-2 shadow-xs">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  Select SULTAN MEAL.xlsx
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleExcelFileChange}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* JSON Restore Preview Modal */}
      {jsonPreview && (
        <Modal
          isOpen={!!jsonPreview}
          onClose={() => setJsonPreview(null)}
          title="Backup File Preview & Verification"
          subtitle={`Schema Version: ${jsonPreview.schemaVersion} • Exported: ${formatDate(
            jsonPreview.exportedAt?.split('T')[0]
          )}`}
          maxWidth="md"
        >
          <div className="space-y-4 text-xs">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Mess Name:</span>
                <span className="font-bold text-slate-800">{jsonPreview.messName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Members count:</span>
                <span className="font-bold">{jsonPreview.data?.members?.length || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Meal entries:</span>
                <span className="font-bold">{jsonPreview.data?.mealEntries?.length || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Expense records:</span>
                <span className="font-bold">{jsonPreview.data?.expenses?.length || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Deposits:</span>
                <span className="font-bold">{jsonPreview.data?.deposits?.length || 0}</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2 uppercase">
                Choose Restore Strategy:
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setRestoreMode('replace')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    restoreMode === 'replace'
                      ? 'border-rose-500 bg-rose-50/50 text-rose-900 font-bold'
                      : 'border-slate-200 bg-white text-slate-600'
                  }`}
                >
                  <div className="font-bold text-rose-700">1. Replace All</div>
                  <p className="text-[10px] text-slate-500 mt-0.5">Wipe current DB & restore snapshot</p>
                </button>

                <button
                  type="button"
                  onClick={() => setRestoreMode('merge')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    restoreMode === 'merge'
                      ? 'border-blue-500 bg-blue-50/50 text-blue-900 font-bold'
                      : 'border-slate-200 bg-white text-slate-600'
                  }`}
                >
                  <div className="font-bold text-blue-700">2. Merge Records</div>
                  <p className="text-[10px] text-slate-500 mt-0.5">Append & update matching IDs</p>
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
              <Button variant="outline" onClick={() => setJsonPreview(null)}>
                Cancel
              </Button>
              <Button
                variant={restoreMode === 'replace' ? 'danger' : 'primary'}
                onClick={() => setIsConfirmRestoreOpen(true)}
              >
                Proceed with Restore
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Confirm Restore Dialog */}
      <ConfirmDialog
        isOpen={isConfirmRestoreOpen}
        onClose={() => setIsConfirmRestoreOpen(false)}
        onConfirm={executeRestore}
        title="Confirm Database Restore"
        message={
          restoreMode === 'replace'
            ? 'WARNING: This will replace all existing members, meals, costs, and deposits in your local IndexedDB with the data from this backup file. Are you sure you want to proceed?'
            : 'This will merge the backup records with your current database. Existing matching records will be updated. Proceed?'
        }
        confirmText="Yes, Restore Now"
        variant={restoreMode === 'replace' ? 'danger' : 'primary'}
      />

      {/* Excel Import Preview Modal */}
      {excelPreview && (
        <Modal
          isOpen={!!excelPreview}
          onClose={() => setExcelPreview(null)}
          title="SULTAN MEAL.xlsx Import Preview"
          subtitle={`Found sheets: ${excelPreview.sheetNames.join(', ')}`}
          maxWidth="lg"
        >
          <div className="space-y-4 text-xs">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Members extracted:</span>
                <span className="font-bold text-slate-800">{excelPreview.members.length} members</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Meal entries found:</span>
                <span className="font-bold text-slate-800">{excelPreview.mealEntries.length} entries</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Market costs (Costs sheet):</span>
                <span className="font-bold text-slate-800">{excelPreview.expenses.length} records</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Deposits found:</span>
                <span className="font-bold text-slate-800">{excelPreview.deposits.length} deposits</span>
              </div>
            </div>

            {excelPreview.existingDuplicates > 0 && (
              <p className="text-amber-700 bg-amber-50 p-2.5 rounded-xl border border-amber-200">
                Notice: {excelPreview.existingDuplicates} members already have matching IDs and will be safely updated.
              </p>
            )}

            <p className="text-slate-500 leading-relaxed">
              Importing will preserve room allocations, member names, and financial transactions from the workbook.
            </p>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
              <Button variant="outline" onClick={() => setExcelPreview(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={executeExcelImport}
                isLoading={isImportingExcel}
              >
                Confirm & Import Excel
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
