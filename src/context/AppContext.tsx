import React, { createContext, useContext, useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, initializeDatabase, requestPersistentStorage } from '../db';
import { SystemSettings } from '../types';
import { DEFAULT_SETTINGS } from '../db/seedData';

interface AppContextType {
  selectedMonth: string;
  setSelectedMonth: (month: string) => void;
  settings: SystemSettings;
  updateSettings: (newSettings: Partial<SystemSettings>) => Promise<void>;
  isPinLocked: boolean;
  unlockWithPin: (pin: string) => boolean;
  lockApp: () => void;
  globalSearch: string;
  setGlobalSearch: (q: string) => void;
  activeQuickModal: 'meal' | 'expense' | 'deposit' | 'member' | null;
  setActiveQuickModal: (modal: 'meal' | 'expense' | 'deposit' | 'member' | null) => void;
  isDbReady: boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [selectedMonth, setSelectedMonthState] = useState<string>('2026-03');
  const [isPinLocked, setIsPinLocked] = useState<boolean>(false);
  const [globalSearch, setGlobalSearch] = useState<string>('');
  const [activeQuickModal, setActiveQuickModal] = useState<'meal' | 'expense' | 'deposit' | 'member' | null>(null);
  const [isDbReady, setIsDbReady] = useState<boolean>(false);

  // Initialize DB and request persistent storage on mount
  useEffect(() => {
    async function init() {
      await initializeDatabase();
      await requestPersistentStorage();
      setIsDbReady(true);
    }
    init();
  }, []);

  // Live query for settings
  const liveSettings = useLiveQuery(() => db.settings.get('app_settings'), []);
  const settings: SystemSettings = liveSettings || DEFAULT_SETTINGS;

  // Initialize selectedMonth and lock state from settings
  useEffect(() => {
    if (settings.selectedMonth && selectedMonth === '2026-03' && settings.selectedMonth !== '2026-03') {
      setSelectedMonthState(settings.selectedMonth);
    }
    if (settings.pinLockEnabled && settings.pinCode) {
      setIsPinLocked(true);
    }
  }, [settings.selectedMonth, settings.pinLockEnabled, settings.pinCode]);

  const setSelectedMonth = async (month: string) => {
    setSelectedMonthState(month);
    await db.settings.update('app_settings', { selectedMonth: month });
  };

  const updateSettings = async (newSettings: Partial<SystemSettings>) => {
    await db.settings.update('app_settings', newSettings);
  };

  const unlockWithPin = (enteredPin: string): boolean => {
    if (!settings.pinLockEnabled) {
      setIsPinLocked(false);
      return true;
    }
    if (enteredPin === settings.pinCode) {
      setIsPinLocked(false);
      return true;
    }
    return false;
  };

  const lockApp = () => {
    if (settings.pinLockEnabled) {
      setIsPinLocked(true);
    }
  };

  return (
    <AppContext.Provider
      value={{
        selectedMonth,
        setSelectedMonth,
        settings,
        updateSettings,
        isPinLocked,
        unlockWithPin,
        lockApp,
        globalSearch,
        setGlobalSearch,
        activeQuickModal,
        setActiveQuickModal,
        isDbReady,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
