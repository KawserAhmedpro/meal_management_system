import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  Utensils,
  Calendar,
  ShoppingCart,
  Users,
  Info,
  Share2,
  Check,
  Search,
  Wifi,
  WifiOff,
  Lock,
  ChevronRight,
  Shield,
  HelpCircle,
  ExternalLink,
  Building,
  AlertTriangle,
  FileText,
  UserCheck,
} from 'lucide-react';
import {
  subscribeToPublicMonth,
  subscribeToPublicMeta,
  getPublicPortalUrl,
} from '../../services/publicPortal';
import {
  PublicMonthData,
  PublicPortalMeta,
  PublicDailyMealSummary,
  PublicExpenseItem,
  PublicMemberInfo,
} from '../../types/publicPortal';
import {
  formatCurrency,
  formatNumber,
  formatDate,
  formatMonthName,
} from '../../utils/formatters';

const getCurrentYearMonth = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

export const PublicPortalPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlMonth = searchParams.get('month');
  const urlManager = searchParams.get('manager');

  // Metadata & Month Data states
  const [meta, setMeta] = useState<PublicPortalMeta | null>(null);
  const [monthData, setMonthData] = useState<PublicMonthData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [selectedMonth, setSelectedMonth] = useState<string>(urlMonth || getCurrentYearMonth());
  const [selectedManagerId, setSelectedManagerId] = useState<string | null>(urlManager || null);

  // UI state
  const [activeTab, setActiveTab] = useState<'meals' | 'expenses' | 'members' | 'breakdown'>('meals');
  const [copied, setCopied] = useState<boolean>(false);
  const [expenseSearch, setExpenseSearch] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [memberSearch, setMemberSearch] = useState<string>('');
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  // Online / Offline listener
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Subscribe to Public Portal Metadata (available months, mess name, manager list)
  useEffect(() => {
    const unsubscribe = subscribeToPublicMeta((data) => {
      if (data) {
        setMeta(data);
        if (!urlMonth && data.activeMonth) {
          setSelectedMonth(data.activeMonth);
        }
      }
    });
    return () => unsubscribe();
  }, [urlMonth]);

  // Synchronize URL manager parameter with local state
  useEffect(() => {
    if (urlManager) {
      setSelectedManagerId(urlManager);
    }
  }, [urlManager]);

  // Subscribe to selected month's sanitized public data
  useEffect(() => {
    setIsLoading(true);
    const unsubscribe = subscribeToPublicMonth(
      selectedMonth,
      (data) => {
        setMonthData(data);
        setIsLoading(false);
      },
      (err) => {
        console.warn('Error loading public month data:', err);
        setIsLoading(false);
      }
    );
    return () => unsubscribe();
  }, [selectedMonth]);

  // Available managers list from meta
  const availableManagers = useMemo<PublicCurrentManagerSummary[]>(() => {
    if (meta?.availableManagers && meta.availableManagers.length > 0) {
      return meta.availableManagers;
    }
    if (meta?.currentManager) {
      return [meta.currentManager];
    }
    return [];
  }, [meta]);

  const activeManager = useMemo(() => {
    return availableManagers.find((m) => m.status === 'active') || availableManagers[0] || null;
  }, [availableManagers]);

  // Selected manager resolution
  const selectedManager = useMemo(() => {
    if (selectedManagerId === 'month') return null;
    if (selectedManagerId) {
      const found = availableManagers.find(
        (m) => (m.id && m.id === selectedManagerId) || m.managerName === selectedManagerId
      );
      if (found) return found;
    }
    return activeManager;
  }, [availableManagers, selectedManagerId, activeManager]);

  // Available months list
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    if (meta?.availableMonths) {
      meta.availableMonths.forEach((m) => set.add(m));
    }
    set.add(selectedMonth);
    set.add('2026-03');
    return Array.from(set).sort().reverse();
  }, [meta, selectedMonth]);

  // Today's date string (YYYY-MM-DD)
  const todayStr = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, []);

  // Update URL search param on month change
  const handleMonthChange = (newMonth: string) => {
    setSelectedMonth(newMonth);
    const params: Record<string, string> = { month: newMonth };
    if (selectedManagerId) {
      params.manager = selectedManagerId;
    }
    setSearchParams(params);
  };

  // Update URL search param on manager change
  const handleManagerChange = (managerKey: string) => {
    setSelectedManagerId(managerKey);
    const params: Record<string, string> = {};
    if (managerKey !== 'month') {
      params.manager = managerKey;
      const targetMgr = availableManagers.find(
        (m) => (m.id && m.id === managerKey) || m.managerName === managerKey
      );
      if (targetMgr && targetMgr.assignmentDate) {
        const mgrMonth = targetMgr.assignmentDate.slice(0, 7);
        if (availableMonths.includes(mgrMonth) && selectedMonth !== mgrMonth) {
          setSelectedMonth(mgrMonth);
          params.month = mgrMonth;
        } else {
          params.month = selectedMonth;
        }
      } else {
        params.month = selectedMonth;
      }
    } else {
      params.month = selectedMonth;
    }
    setSearchParams(params);
  };

  const handleCopyLink = () => {
    const base = getPublicPortalUrl();
    const url = new URL(base);
    if (selectedMonth) url.searchParams.set('month', selectedMonth);
    if (selectedManagerId && selectedManagerId !== 'month') {
      url.searchParams.set('manager', selectedManagerId);
    }
    navigator.clipboard.writeText(url.toString()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  // Displayed Daily Meal Summaries (filtered to selected manager's period if active)
  const displayedDailyMealSummaries = useMemo(() => {
    if (!monthData?.dailyMealSummaries) return [];
    if (!selectedManager) return monthData.dailyMealSummaries;
    const start = selectedManager.assignmentDate;
    const end = selectedManager.status === 'active' ? todayStr : (selectedManager.resignationDate || todayStr);
    return monthData.dailyMealSummaries.filter(
      (d) => d.date >= start && d.date <= end
    );
  }, [monthData?.dailyMealSummaries, selectedManager, todayStr]);

  // Filtered expenses (filtered by category, search, and manager's assignment period)
  const filteredExpenses = useMemo(() => {
    if (!monthData?.expenses) return [];
    let list = monthData.expenses;
    if (selectedManager) {
      const start = selectedManager.assignmentDate;
      const end = selectedManager.status === 'active' ? todayStr : (selectedManager.resignationDate || todayStr);
      list = list.filter((exp) => exp.date >= start && exp.date <= end);
    }
    return list.filter((exp) => {
      const matchesSearch =
        !expenseSearch.trim() ||
        exp.title.toLowerCase().includes(expenseSearch.toLowerCase()) ||
        (exp.notes && exp.notes.toLowerCase().includes(expenseSearch.toLowerCase())) ||
        exp.category.toLowerCase().includes(expenseSearch.toLowerCase());

      const matchesCat =
        selectedCategory === 'All' ||
        exp.category.toLowerCase() === selectedCategory.toLowerCase();

      return matchesSearch && matchesCat;
    });
  }, [monthData?.expenses, selectedManager, todayStr, expenseSearch, selectedCategory]);

  // Distinct expense categories
  const expenseCategories = useMemo(() => {
    const cats = new Set<string>();
    cats.add('All');
    monthData?.expenses?.forEach((e) => {
      if (e.category) cats.add(e.category);
    });
    return Array.from(cats);
  }, [monthData?.expenses]);

  // Member meal counts scoped to selected manager's assignment period within this month
  const memberPeriodMealsMap = useMemo(() => {
    const map = new Map<string, number>();
    if (!monthData?.members) return map;
    if (!selectedManager) {
      monthData.members.forEach((m) => map.set(m.id, m.totalMeals));
      return map;
    }
    const start = selectedManager.assignmentDate;
    const end = selectedManager.status === 'active' ? todayStr : (selectedManager.resignationDate || todayStr);

    const validDays = (monthData.dailyMealSummaries || []).filter(
      (d) => d.date >= start && d.date <= end && d.status !== 'FULL_OFF'
    );

    for (const member of monthData.members) {
      let count = 0;
      for (const day of validDays) {
        const entry = monthData.memberDailyMeals[`${member.id}_${day.day}`];
        if (entry && entry.count) {
          count += entry.count;
        }
      }
      map.set(member.id, count);
    }
    return map;
  }, [monthData, selectedManager, todayStr]);

  // Filtered members
  const filteredMembers = useMemo(() => {
    if (!monthData?.members) return [];
    if (!memberSearch.trim()) return monthData.members;
    const q = memberSearch.toLowerCase();
    return monthData.members.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.room.toLowerCase().includes(q) ||
        m.floor.toLowerCase().includes(q)
    );
  }, [monthData?.members, memberSearch]);

  const todayMealSummary = useMemo(() => {
    if (!monthData?.dailyMealSummaries) return null;
    return monthData.dailyMealSummaries.find((d) => d.date === todayStr);
  }, [monthData?.dailyMealSummaries, todayStr]);

  const currency = meta?.currencySymbol || '৳';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col antialiased selection:bg-emerald-500 selection:text-white">
      {/* =========================================================================
          TOP NAV / PORTAL HEADER
         ========================================================================= */}
      <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 sm:h-20 gap-3">
            {/* Logo & Portal Title */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20">
                <Utensils className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-base sm:text-lg tracking-tight text-white">
                    {meta?.messName || 'DINING MANAGEMENT SYSTEM'}
                  </span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    PUBLIC
                  </span>
                </div>
                <p className="text-xs text-slate-400 hidden sm:block">
                  {meta?.institutionName ? `${meta.institutionName} • ` : ''}
                  {meta?.hallName ? `${meta.hallName} • ` : ''}
                  Member Dining Portal
                </p>
              </div>
            </div>

            {/* Right Controls: Status & Month & Copy Link & Admin Login */}
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Online / Offline badge */}
              <div
                className={`hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                  isOnline
                    ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60'
                    : 'bg-amber-950/60 text-amber-400 border-amber-800/60'
                }`}
              >
                {isOnline ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span>Live Updates</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="w-3 h-3" />
                    <span>Cached Offline</span>
                  </>
                )}
              </div>

              {/* Month Selector Dropdown */}
              <select
                aria-label="Select Billing Month"
                value={selectedMonth}
                onChange={(e) => handleMonthChange(e.target.value)}
                className="bg-slate-800 border border-slate-700 text-slate-200 text-xs sm:text-sm font-semibold rounded-xl px-3 py-2 outline-none focus:border-emerald-500 transition-colors"
              >
                {availableMonths.map((m) => (
                  <option key={m} value={m}>
                    {formatMonthName(m)}
                  </option>
                ))}
              </select>

              {/* Share / Copy Public Link Button */}
              <button
                onClick={handleCopyLink}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
                title="Copy shareable Public Link"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span className="text-emerald-400 font-semibold">Copied!</span>
                  </>
                ) : (
                  <>
                    <Share2 className="w-4 h-4 text-slate-400" />
                    <span className="hidden sm:inline">Share</span>
                  </>
                )}
              </button>

              {/* Subtle Admin Login Link */}
              <Link
                to="/login"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-medium bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 transition-colors"
              >
                <Lock className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Admin</span>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* =========================================================================
          MAIN CONTAINER
         ========================================================================= */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Privacy & Transparency Assurance Banner */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-300">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <span className="font-semibold text-white">Public Dining Transparency Portal</span>
              <p className="text-slate-400">
                Official read-only dining attendance, market expenses, and meal rates. Individual deposits, dues, and payment histories are strictly private.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-slate-400 shrink-0">
            <Calendar className="w-3.5 h-3.5 text-emerald-400" />
            <span>Viewing: <strong className="text-emerald-300">{formatMonthName(selectedMonth)}</strong></span>
          </div>
        </div>

        {/* Manager Assignment-Period Public Operational Summary */}
        {(() => {
          const displayManager = selectedManager;
          const currencySymbol = meta?.currencySymbol || '৳';

          if (selectedManagerId === 'month') {
            return (
              <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-4 sm:p-5 text-white shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-white">Month-Wide Operational View ({formatMonthName(selectedMonth)})</span>
                    <p className="text-xs text-slate-400 mt-0.5">Showing general dining summary for the full calendar month.</p>
                  </div>
                </div>
                {availableManagers.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 hidden sm:inline">Manager:</span>
                    <select
                      aria-label="Select Manager Assignment Period"
                      value="month"
                      onChange={(e) => handleManagerChange(e.target.value)}
                      className="bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold rounded-xl px-3 py-1.5 outline-none focus:border-emerald-500"
                    >
                      <option value="month">Month-Wide View ({formatMonthName(selectedMonth)})</option>
                      {availableManagers.map((m) => {
                        const val = m.id || m.managerName;
                        const statusText = m.status === 'active' ? 'Active' : 'Resigned';
                        const endLabel = m.status === 'active' ? 'Today' : (m.resignationDate || 'End');
                        return (
                          <option key={val} value={val}>
                            {m.managerName} ({statusText} • {m.assignmentDate} → {endLabel})
                          </option>
                        );
                      })}
                    </select>
                  </div>
                )}
              </div>
            );
          }

          if (!displayManager) return null;
          const isActive = displayManager.status === 'active';

          return (
            <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-4 sm:p-5 text-white shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                    <UserCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-white">
                        {displayManager.managerName}
                      </span>
                      {isActive ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          Active Manager
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                          Resigned
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Period: <strong className="text-slate-300">{displayManager.assignmentDate}</strong> →{' '}
                      <strong className="text-slate-300">
                        {isActive ? 'Today' : (displayManager.resignationDate || 'Completed')}
                      </strong>
                    </p>
                  </div>
                </div>

                {/* Manager Dropdown Selector in header */}
                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <select
                    id="public-manager-select"
                    aria-label="Select Manager Assignment Period"
                    value={displayManager.id || displayManager.managerName}
                    onChange={(e) => handleManagerChange(e.target.value)}
                    className="bg-slate-800 border border-slate-700 hover:border-emerald-500/50 text-slate-200 text-xs font-semibold rounded-xl px-3 py-1.5 outline-none focus:border-emerald-500 transition-colors cursor-pointer"
                  >
                    {availableManagers.map((m) => {
                      const val = m.id || m.managerName;
                      const statusText = m.status === 'active' ? 'Active' : 'Resigned';
                      const endLabel = m.status === 'active' ? 'Today' : (m.resignationDate || 'End');
                      return (
                        <option key={val} value={val}>
                          {m.managerName} ({statusText} • {m.assignmentDate} → {endLabel})
                        </option>
                      );
                    })}
                    <option value="month">Month-Wide View ({formatMonthName(selectedMonth)})</option>
                  </select>

                  <div className="text-[11px] text-slate-400 hidden md:block bg-slate-950/60 px-2.5 py-1 rounded-lg border border-slate-800 whitespace-nowrap">
                    {isActive ? 'Running Period (Live)' : 'Final Tenure Summary'}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 pt-3">
                {/* 1. Meals */}
                <div className="bg-slate-950/50 rounded-xl p-3 border border-slate-800/80">
                  <span className="text-[11px] text-slate-400 font-medium block">
                    {isActive ? 'Meals (To Today)' : 'Period Meals'}
                  </span>
                  <span className="text-lg sm:text-xl font-bold text-white block mt-0.5">
                    {formatNumber(displayManager.totalMeals)}
                  </span>
                  <span className="text-[10px] text-slate-500 block">Total counted meals</span>
                </div>

                {/* 2. Market Expenses */}
                <div className="bg-slate-950/50 rounded-xl p-3 border border-slate-800/80">
                  <span className="text-[11px] text-slate-400 font-medium block">Market Expenses</span>
                  <span className="text-lg sm:text-xl font-bold text-white block mt-0.5">
                    {currencySymbol}{formatNumber(displayManager.totalMarketExpenses)}
                  </span>
                  <span className="text-[10px] text-slate-500 block">Bazaar purchases</span>
                </div>

                {/* 3. Meal Rate */}
                <div className="bg-emerald-950/20 rounded-xl p-3 border border-emerald-500/20">
                  <span className="text-[11px] text-emerald-400 font-medium block">
                    {isActive ? 'Running Meal Rate' : 'Final Meal Rate'}
                  </span>
                  <span className="text-lg sm:text-xl font-bold text-emerald-300 block mt-0.5">
                    {currencySymbol}{displayManager.mealRate.toFixed(2)}
                    <span className="text-xs text-emerald-500/80 font-normal"> / meal</span>
                  </span>
                  <span className="text-[10px] text-emerald-400/80 block">Market ÷ Meals</span>
                </div>

                {/* 4. Manager Fee */}
                <div className="bg-amber-950/15 rounded-xl p-3 border border-amber-500/20">
                  <span className="text-[11px] text-amber-400 font-medium block">Manager Fee</span>
                  <span className="text-lg sm:text-xl font-bold text-amber-300 block mt-0.5">
                    {currencySymbol}{formatNumber(displayManager.totalManagerFee)}
                  </span>
                  <span className="text-[10px] text-amber-400/80 block">
                    @{currencySymbol}{displayManager.managerFeePerMeal}/meal • Separate
                  </span>
                </div>
              </div>
            </div>
          );
        })()}

        {/* =====================================================================
            TOP METRIC STAT CARDS (SCOPED TO SELECTED MANAGER)
           ===================================================================== */}
        {isLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-28 bg-slate-900 border border-slate-800 rounded-2xl" />
            ))}
          </div>
        ) : monthData?.summary ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {/* 1. Meal Rate */}
            <div className="bg-gradient-to-br from-emerald-950/40 via-slate-900 to-slate-900 border border-emerald-500/30 rounded-2xl p-4 sm:p-5 relative overflow-hidden shadow-lg">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                  {selectedManager ? (selectedManager.status === 'active' ? 'Running Meal Rate' : 'Tenure Meal Rate') : 'Current Meal Rate'}
                </span>
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                  <Utensils className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                  {formatCurrency(selectedManager ? selectedManager.mealRate : monthData.summary.mealRate, currency)}
                </span>
                <span className="text-xs text-slate-400">/ meal</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                {selectedManager ? `${selectedManager.managerName} • Market ÷ Meals` : 'Expenses ÷ Total Meals'}
              </p>
            </div>

            {/* 2. Total Mess Meals */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  {selectedManager ? 'Manager Period Meals' : 'Total Mess Meals'}
                </span>
                <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center">
                  <Calendar className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                  {formatNumber(selectedManager ? selectedManager.totalMeals : monthData.summary.totalMeals, 0)}
                </span>
                <span className="text-xs text-slate-400">meals</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                {selectedManager
                  ? `From ${selectedManager.assignmentDate} to ${selectedManager.status === 'active' ? 'Today' : (selectedManager.resignationDate || 'End')}`
                  : (monthData.summary.fullOffDatesCount > 0
                    ? `${monthData.summary.fullOffDatesCount} Full Off day(s)`
                    : 'All calendar days active')}
              </p>
            </div>

            {/* 3. Total Dining Expenses */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  {selectedManager ? 'Manager Market Expenses' : 'Dining Expenses'}
                </span>
                <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
                  <ShoppingCart className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                  {formatCurrency(selectedManager ? selectedManager.totalMarketExpenses : monthData.summary.totalExpenses, currency)}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                {selectedManager ? `Bazaar Purchases (${selectedManager.managerName})` : `${monthData.expenses.length} recorded market item(s)`}
              </p>
            </div>

            {/* 4. Active Dining Members */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Mess Attendance
                </span>
                <div className="w-7 h-7 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center">
                  <Users className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                  {monthData.summary.activeMembersCount}
                </span>
                <span className="text-xs text-slate-400">/ {monthData.summary.totalMembersCount} members</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Active resident members
              </p>
            </div>
          </div>
        ) : null}

        {/* Today's Quick Status Highlight (if available for selected month) */}
        {todayMealSummary && (
          <div className="bg-gradient-to-r from-emerald-950/30 via-slate-900 to-slate-900 border border-emerald-500/20 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white text-sm">Today's Dining Status ({formatDate(todayStr)})</span>
                  {todayMealSummary.status === 'FULL_OFF' ? (
                    <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                      FULL MEAL OFF
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      DINING ACTIVE
                    </span>
                  )}
                </div>
                {todayMealSummary.closureReason && (
                  <p className="text-xs text-rose-300 mt-0.5">Reason: {todayMealSummary.closureReason}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <div className="text-center px-3 py-1.5 bg-slate-800/80 rounded-xl border border-slate-700">
                <span className="text-slate-400 block text-[10px] uppercase">Today's Meals</span>
                <strong className="text-white text-sm">{todayMealSummary.totalMeals}</strong>
              </div>
              <div className="text-center px-3 py-1.5 bg-slate-800/80 rounded-xl border border-slate-700">
                <span className="text-slate-400 block text-[10px] uppercase">ON (1)</span>
                <strong className="text-emerald-400 text-sm">{todayMealSummary.onCount}</strong>
              </div>
              <div className="text-center px-3 py-1.5 bg-slate-800/80 rounded-xl border border-slate-700">
                <span className="text-slate-400 block text-[10px] uppercase">Double (2)</span>
                <strong className="text-blue-400 text-sm">{todayMealSummary.doubleCount}</strong>
              </div>
              <div className="text-center px-3 py-1.5 bg-slate-800/80 rounded-xl border border-slate-700">
                <span className="text-slate-400 block text-[10px] uppercase">OFF (0)</span>
                <strong className="text-slate-400 text-sm">{todayMealSummary.offCount}</strong>
              </div>
            </div>
          </div>
        )}

        {/* =====================================================================
            PORTAL NAVIGATION TABS
           ===================================================================== */}
        <div className="border-b border-slate-800 flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => setActiveTab('meals')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all ${
              activeTab === 'meals'
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>Daily Meals & Attendance</span>
          </button>

          <button
            onClick={() => setActiveTab('expenses')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all ${
              activeTab === 'expenses'
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <ShoppingCart className="w-4 h-4" />
            <span>Market Expenses ({monthData?.expenses?.length || 0})</span>
          </button>

          <button
            onClick={() => setActiveTab('members')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all ${
              activeTab === 'members'
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Member Meal Counts ({monthData?.members?.length || 0})</span>
          </button>

          <button
            onClick={() => setActiveTab('breakdown')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all ${
              activeTab === 'breakdown'
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Info className="w-4 h-4" />
            <span>Meal Rate Breakdown</span>
          </button>
        </div>

        {/* =====================================================================
            TAB CONTENTS
           ===================================================================== */}

        {/* NO DATA PUBLISHED YET STATE */}
        {!isLoading && !monthData && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-10 text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">No Public Records for {formatMonthName(selectedMonth)}</h3>
              <p className="text-sm text-slate-400 mt-1 max-w-md mx-auto">
                The Mess Administrator has not published dining records for this month yet. Please check back soon or select a different month.
              </p>
            </div>
            {availableMonths.length > 1 && (
              <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                <span className="text-xs text-slate-500">Available months:</span>
                {availableMonths.map((m) => (
                  <button
                    key={m}
                    onClick={() => handleMonthChange(m)}
                    className="px-3 py-1 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
                  >
                    {formatMonthName(m)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 1: DAILY MEALS & ATTENDANCE */}
        {monthData && activeTab === 'meals' && (
          <div className="space-y-6">
            {/* Daily Roll Inspector Modal / Accordion */}
            {selectedMemberId && (
              <div className="bg-slate-900 border border-emerald-500/30 rounded-2xl p-5 shadow-2xl relative animate-in fade-in">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div>
                    <span className="text-xs text-emerald-400 font-semibold uppercase tracking-wider">
                      Individual Attendance Breakdown
                    </span>
                    <h3 className="text-lg font-bold text-white">
                      {monthData.members.find((m) => m.id === selectedMemberId)?.name} (
                      {monthData.members.find((m) => m.id === selectedMemberId)?.room})
                    </h3>
                  </div>
                  <button
                    onClick={() => setSelectedMemberId(null)}
                    className="px-3 py-1 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300"
                  >
                    Close ✕
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-4 sm:grid-cols-7 md:grid-cols-10 gap-2">
                  {monthData.dailyMealSummaries.map((day) => {
                    const entry = monthData.memberDailyMeals[`${selectedMemberId}_${day.day}`];
                    const isFullOff = day.status === 'FULL_OFF';
                    const isInsideTenure = selectedManager
                      ? day.date >= selectedManager.assignmentDate &&
                        day.date <= (selectedManager.status === 'active' ? todayStr : (selectedManager.resignationDate || todayStr))
                      : true;
                    const count = entry?.count ?? 0;
                    const type = entry?.type ?? 'OFF';

                    return (
                      <div
                        key={day.day}
                        className={`p-2 rounded-xl border text-center text-xs ${
                          !isInsideTenure
                            ? 'bg-slate-900/40 border-slate-800/40 text-slate-600 opacity-60'
                            : isFullOff
                            ? 'bg-rose-950/20 border-rose-900/40 text-rose-300'
                            : count === 1
                            ? 'bg-emerald-950/30 border-emerald-800/40 text-emerald-300'
                            : count === 2
                            ? 'bg-blue-950/30 border-blue-800/40 text-blue-300'
                            : 'bg-slate-800/40 border-slate-800 text-slate-500'
                        }`}
                      >
                        <div className="text-[10px] text-slate-400 font-mono">Day {day.day}</div>
                        <div className="font-extrabold text-sm mt-0.5">
                          {!isInsideTenure ? '—' : isFullOff ? 'OFF' : count > 0 ? count : '-'}
                        </div>
                        <div className="text-[9px] uppercase tracking-wider mt-0.5 font-semibold">
                          {!isInsideTenure ? 'OTHER MGR' : isFullOff ? 'CLOSURE' : type}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Daily Meals Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              <div className="p-4 sm:p-5 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span>Daily Dining Attendance Table</span>
                    {selectedManager && (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {selectedManager.managerName}'s Tenure
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {selectedManager
                      ? `Showing attendance records from ${selectedManager.assignmentDate} to ${selectedManager.status === 'active' ? 'Today' : (selectedManager.resignationDate || 'End')} within ${formatMonthName(selectedMonth)}.`
                      : `Day-by-day mess meal counts, active statuses, and closures for ${formatMonthName(selectedMonth)}.`}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-400">
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded bg-emerald-500" /> ON (1)
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded bg-blue-500" /> Double (2)
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded bg-slate-600" /> OFF (0)
                  </span>
                </div>
              </div>

              {displayedDailyMealSummaries.length === 0 ? (
                <div className="p-8 text-center space-y-3">
                  <p className="text-xs text-slate-400">
                    No attendance records for {selectedManager?.managerName} in {formatMonthName(selectedMonth)}.
                  </p>
                  {selectedManager && (
                    <button
                      onClick={() => handleMonthChange(selectedManager.assignmentDate.slice(0, 7))}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-600/30"
                    >
                      Go to {formatMonthName(selectedManager.assignmentDate.slice(0, 7))} →
                    </button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs sm:text-sm">
                    <thead>
                      <tr className="bg-slate-800/50 text-slate-400 border-b border-slate-800 font-semibold">
                        <th className="py-3 px-4">Date</th>
                        <th className="py-3 px-4">Day</th>
                        <th className="py-3 px-4">Dining Status</th>
                        <th className="py-3 px-4 text-center">ON (1)</th>
                        <th className="py-3 px-4 text-center">Double (2)</th>
                        <th className="py-3 px-4 text-center">OFF (0)</th>
                        <th className="py-3 px-4 text-right font-bold text-slate-200">Total Meals</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {displayedDailyMealSummaries.map((day) => {
                        const dateObj = new Date(day.date);
                        const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
                        const isFullOff = day.status === 'FULL_OFF';

                        return (
                          <tr
                            key={day.day}
                            className={`hover:bg-slate-800/30 transition-colors ${
                              isFullOff ? 'bg-rose-950/10' : ''
                            }`}
                          >
                            <td className="py-3 px-4 font-sans text-slate-200 font-medium">
                              {formatDate(day.date)}
                            </td>
                            <td className="py-3 px-4 font-sans text-slate-400">
                              {dayName} (Day {day.day})
                            </td>
                            <td className="py-3 px-4 font-sans">
                              {isFullOff ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                                  FULL MEAL OFF {day.closureReason ? `(${day.closureReason})` : ''}
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                  NORMAL
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-center text-emerald-400">
                              {isFullOff ? '0' : day.onCount}
                            </td>
                            <td className="py-3 px-4 text-center text-blue-400">
                              {isFullOff ? '0' : day.doubleCount}
                            </td>
                            <td className="py-3 px-4 text-center text-slate-400">
                              {day.offCount}
                            </td>
                            <td className="py-3 px-4 text-right font-bold text-white">
                              <span className="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700">
                                {day.totalMeals}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-800/80 font-bold text-white border-t border-slate-700">
                        <td colSpan={3} className="py-3 px-4 font-sans">
                          {selectedManager
                            ? `${selectedManager.managerName} Period Total (${displayedDailyMealSummaries.length} Days in ${formatMonthName(selectedMonth)})`
                            : `Month Total (${monthData.summary.daysInMonth} Days)`}
                        </td>
                        <td className="py-3 px-4 text-center text-emerald-400 font-mono">
                          {displayedDailyMealSummaries.reduce((s, d) => s + (d.status === 'FULL_OFF' ? 0 : d.onCount), 0)}
                        </td>
                        <td className="py-3 px-4 text-center text-blue-400 font-mono">
                          {displayedDailyMealSummaries.reduce((s, d) => s + (d.status === 'FULL_OFF' ? 0 : d.doubleCount), 0)}
                        </td>
                        <td className="py-3 px-4 text-center text-slate-400 font-mono">
                          {displayedDailyMealSummaries.reduce((s, d) => s + d.offCount, 0)}
                        </td>
                        <td className="py-3 px-4 text-right text-emerald-300 font-mono text-base">
                          {displayedDailyMealSummaries.reduce((s, d) => s + d.totalMeals, 0)} meals
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: MARKET & DINING EXPENSES */}
        {monthData && activeTab === 'expenses' && (
          <div className="space-y-4">
            {/* Search and Category Filter Toolbar */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
              {/* Category selector */}
              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1 md:pb-0">
                {expenseCategories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                      selectedCategory === cat
                        ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Search bar */}
              <div className="relative min-w-[220px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search expense description..."
                  value={expenseSearch}
                  onChange={(e) => setExpenseSearch(e.target.value)}
                  className="w-full bg-slate-800/80 border border-slate-700 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            {/* Expenses List / Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              {selectedManager && (
                <div className="px-4 py-2.5 bg-slate-800/40 border-b border-slate-800 flex items-center justify-between text-xs text-slate-300">
                  <span>
                    Scoped to <strong>{selectedManager.managerName}</strong>'s tenure ({selectedManager.assignmentDate} → {selectedManager.status === 'active' ? 'Today' : (selectedManager.resignationDate || 'End')})
                  </span>
                  <span className="text-emerald-400 font-semibold">{filteredExpenses.length} expense(s) found</span>
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs sm:text-sm">
                  <thead>
                    <tr className="bg-slate-800/50 text-slate-400 border-b border-slate-800 font-semibold">
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Description / Market Item</th>
                      <th className="py-3 px-4">Category</th>
                      <th className="py-3 px-4">Notes</th>
                      <th className="py-3 px-4 text-right font-bold text-slate-200">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-sans">
                    {filteredExpenses.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-500 text-xs">
                          No expenses matching filter criteria in this tenure.
                        </td>
                      </tr>
                    ) : (
                      filteredExpenses.map((exp) => (
                        <tr key={exp.id} className="hover:bg-slate-800/30 transition-colors">
                          <td className="py-3 px-4 font-mono text-slate-300 whitespace-nowrap">
                            {formatDate(exp.date)}
                          </td>
                          <td className="py-3 px-4 font-semibold text-white">
                            {exp.title}
                          </td>
                          <td className="py-3 px-4">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800 text-slate-300 border border-slate-700">
                              {exp.category}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-400 text-xs">
                            {exp.notes || '—'}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400 whitespace-nowrap">
                            {formatCurrency(exp.amount, currency)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-800/80 font-bold text-white border-t border-slate-700">
                      <td colSpan={4} className="py-3 px-4">
                        {selectedManager ? `${selectedManager.managerName}'s Filtered Expenses (${filteredExpenses.length} items)` : `Total Filtered Dining Expenses (${filteredExpenses.length} items)`}
                      </td>
                      <td className="py-3 px-4 text-right text-emerald-300 font-mono text-base">
                        {formatCurrency(
                          filteredExpenses.reduce((sum, e) => sum + (e.amount || 0), 0),
                          currency
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: MEMBER MEAL COUNTS */}
        {monthData && activeTab === 'members' && (
          <div className="space-y-4">
            {/* Search Toolbar */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search member name, room number, or floor..."
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  className="w-full bg-slate-800/80 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs sm:text-sm text-white placeholder-slate-500 outline-none focus:border-emerald-500"
                />
              </div>

              <div className="text-xs text-slate-400 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-emerald-400" />
                <span>Showing meal counts only. Personal financial records remain private.</span>
              </div>
            </div>

            {/* Members Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              {selectedManager && (
                <div className="px-4 py-2.5 bg-slate-800/40 border-b border-slate-800 text-xs text-slate-300">
                  Showing member meal counts during <strong>{selectedManager.managerName}</strong>'s tenure ({selectedManager.assignmentDate} → {selectedManager.status === 'active' ? 'Today' : (selectedManager.resignationDate || 'End')}) in {formatMonthName(selectedMonth)}.
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs sm:text-sm">
                  <thead>
                    <tr className="bg-slate-800/50 text-slate-400 border-b border-slate-800 font-semibold">
                      <th className="py-3 px-4">#</th>
                      <th className="py-3 px-4">Member Name</th>
                      <th className="py-3 px-4">Room & Floor</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-center font-bold text-slate-200">
                        {selectedManager ? `${selectedManager.managerName}'s Meals` : 'Total Month Meals'}
                      </th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-sans">
                    {filteredMembers.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-500 text-xs">
                          No members matching search query.
                        </td>
                      </tr>
                    ) : (
                      filteredMembers.map((member, idx) => {
                        const memberMealsCount = selectedManager
                          ? (memberPeriodMealsMap.get(member.id) ?? 0)
                          : member.totalMeals;

                        return (
                          <tr key={member.id} className="hover:bg-slate-800/30 transition-colors">
                            <td className="py-3 px-4 font-mono text-slate-500">{idx + 1}</td>
                            <td className="py-3 px-4 font-bold text-white">{member.name}</td>
                            <td className="py-3 px-4 text-slate-300">
                              {member.room} {member.floor ? `(${member.floor})` : ''}
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${
                                  member.status === 'Active'
                                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                    : 'bg-slate-700 text-slate-400'
                                }`}
                              >
                                {member.status}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center font-mono font-bold text-emerald-400">
                              <span className="px-2.5 py-1 rounded-lg bg-emerald-950/40 border border-emerald-800/40">
                                {memberMealsCount} meals
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <button
                                onClick={() => {
                                  setSelectedMemberId(member.id);
                                  window.scrollTo({ top: 300, behavior: 'smooth' });
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
                              >
                                <span>Daily Breakdown</span>
                                <ChevronRight className="w-3 h-3 text-slate-400" />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: MEAL RATE BREAKDOWN & TRANSPARENCY */}
        {monthData && activeTab === 'breakdown' && (
          <div className="space-y-6">
            {/* Mathematical Formula Card */}
            <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 border border-emerald-500/30 rounded-3xl p-6 sm:p-8 space-y-4">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 uppercase tracking-widest">
                <HelpCircle className="w-4 h-4" />
                <span>
                  {selectedManager
                    ? `${selectedManager.managerName}'s Assignment Calculation Rule`
                    : 'Mess Dining Calculation Rule'}
                </span>
              </div>
              <h3 className="text-xl sm:text-2xl font-black text-white">
                {selectedManager
                  ? `How is ${selectedManager.managerName}'s Meal Rate Calculated?`
                  : 'How is the Mess Meal Rate Calculated?'}
              </h3>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-2xl">
                The meal rate is determined strictly by dividing the eligible bazaar/market purchases by the total number of meals served across all resident members during this assignment period:
              </p>

              {/* Formula visualization */}
              <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 sm:p-6 flex flex-col md:flex-row items-center justify-center gap-4 text-center">
                <div className="space-y-1">
                  <span className="text-xs text-slate-400 font-semibold uppercase">
                    {selectedManager ? 'Market Expenses' : 'Total Dining Expenses'}
                  </span>
                  <div className="text-xl sm:text-2xl font-black text-amber-400 font-mono">
                    {formatCurrency(
                      selectedManager ? selectedManager.totalMarketExpenses : monthData.summary.totalExpenses,
                      currency
                    )}
                  </div>
                </div>

                <div className="text-2xl font-black text-emerald-400 font-mono px-2">÷</div>

                <div className="space-y-1">
                  <span className="text-xs text-slate-400 font-semibold uppercase">
                    {selectedManager ? 'Assignment Meals' : 'Total Effective Meals'}
                  </span>
                  <div className="text-xl sm:text-2xl font-black text-blue-400 font-mono">
                    {formatNumber(
                      selectedManager ? selectedManager.totalMeals : monthData.summary.totalMeals,
                      0
                    )} meals
                  </div>
                </div>

                <div className="text-2xl font-black text-emerald-400 font-mono px-2">=</div>

                <div className="space-y-1 bg-emerald-950/40 border border-emerald-500/40 rounded-xl px-5 py-2">
                  <span className="text-xs text-emerald-400 font-semibold uppercase">
                    {selectedManager
                      ? `${selectedManager.status === 'active' ? 'Running' : 'Tenure'} Meal Rate`
                      : 'Monthly Meal Rate'}
                  </span>
                  <div className="text-2xl sm:text-3xl font-black text-white font-mono">
                    {formatCurrency(
                      selectedManager ? selectedManager.mealRate : monthData.summary.mealRate,
                      currency
                    )}
                    <span className="text-xs text-slate-400 font-sans ml-1">/ meal</span>
                  </div>
                </div>
              </div>

              {/* Manager Fee Transparency Box (When Manager is Selected) */}
              {selectedManager && (
                <div className="bg-amber-950/20 border border-amber-500/30 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mt-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                      <UserCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="font-bold text-white text-sm">
                        Manager Fee ({selectedManager.managerName}): {currency}{formatNumber(selectedManager.totalManagerFee)}
                      </span>
                      <p className="text-xs text-amber-300 mt-0.5">
                        Calculated as {formatNumber(selectedManager.totalMeals, 0)} meals × {currency}{selectedManager.managerFeePerMeal}/meal.
                      </p>
                    </div>
                  </div>
                  <span className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-amber-950/40 text-amber-400 border border-amber-500/30">
                    Separate from Meal Rate
                  </span>
                </div>
              )}
            </div>

            {/* Closures & Full Off Log */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <Calendar className="w-4 h-4 text-emerald-400" />
                <span>Full Meal Off Days in {formatMonthName(selectedMonth)}</span>
              </h4>
              <p className="text-xs text-slate-400">
                On declared FULL MEAL OFF days (e.g. college holidays, semester breaks), meal counts are waived so members are not charged.
              </p>

              {monthData.dailyMealSummaries.filter((d) => d.status === 'FULL_OFF').length === 0 ? (
                <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-800 text-xs text-slate-400 text-center">
                  No Full Meal Off days declared for this month.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-2">
                  {monthData.dailyMealSummaries
                    .filter((d) => d.status === 'FULL_OFF')
                    .map((d) => (
                      <div
                        key={d.date}
                        className="bg-rose-950/20 border border-rose-900/40 rounded-xl p-3 flex items-center justify-between"
                      >
                        <div>
                          <span className="font-bold text-white text-xs">{formatDate(d.date)}</span>
                          <p className="text-[11px] text-rose-300">
                            {d.closureReason || 'Declared Full Off'}
                          </p>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                          OFF
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* =========================================================================
          FOOTER
         ========================================================================= */}
      <footer className="bg-slate-900/60 border-t border-slate-800 py-6 mt-12 text-xs text-slate-500 text-center">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Utensils className="w-4 h-4 text-emerald-500" />
            <span className="font-semibold text-slate-400">
              {meta?.messName || 'DINING MANAGEMENT SYSTEM'}
            </span>
            <span>— Public Member Portal</span>
          </div>

          <div className="flex items-center gap-4 text-slate-400">
            <span>Read-Only Access</span>
            <span>•</span>
            <span>Cloud Synchronized</span>
            <span>•</span>
            <Link to="/login" className="text-emerald-400 hover:underline">
              Admin Login →
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default PublicPortalPage;
