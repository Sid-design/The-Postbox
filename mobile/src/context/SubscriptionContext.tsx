import React, { createContext, useContext, useState, useCallback } from 'react';

type SubscriptionChange = {
  senderId: number;
  isActive: boolean;
};

type SubscriptionContextType = {
  pendingChanges: SubscriptionChange[];
  addChange: (senderId: number, isActive: boolean) => void;
  clearChanges: () => void;
  getChanges: () => SubscriptionChange[];
};

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export const SubscriptionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [pendingChanges, setPendingChanges] = useState<SubscriptionChange[]>([]);

  const addChange = useCallback((senderId: number, isActive: boolean) => {
    setPendingChanges(prev => {
      // Remove any existing change for this senderId
      const filtered = prev.filter(change => change.senderId !== senderId);
      // Add the new change
      return [...filtered, { senderId, isActive }];
    });
  }, []);

  const clearChanges = useCallback(() => {
    setPendingChanges([]);
  }, []);

  const getChanges = useCallback(() => {
    return pendingChanges;
  }, [pendingChanges]);

  return (
    <SubscriptionContext.Provider value={{
      pendingChanges,
      addChange,
      clearChanges,
      getChanges,
    }}>
      {children}
    </SubscriptionContext.Provider>
  );
};

export const useSubscriptionChanges = () => {
  const context = useContext(SubscriptionContext);
  if (context === undefined) {
    throw new Error('useSubscriptionChanges must be used within a SubscriptionProvider');
  }
  return context;
}; 