import React, { createContext, useContext, useEffect, useState } from 'react';
import { initializeDatabase, requestPersistentStorage } from '../db';
import { DataProvider, useData, DataContextType } from './DataContext';

interface AppContextType extends DataContextType {
  isDbReady: boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const AppInnerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const data = useData();
  const [isDbReady, setIsDbReady] = useState<boolean>(false);

  useEffect(() => {
    async function init() {
      await initializeDatabase();
      await requestPersistentStorage();
      setIsDbReady(true);
    }
    init();
  }, []);

  return (
    <AppContext.Provider
      value={{
        ...data,
        isDbReady,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <DataProvider>
      <AppInnerProvider>{children}</AppInnerProvider>
    </DataProvider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
