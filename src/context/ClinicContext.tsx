import React, { createContext, useContext, useState, useEffect } from 'react';
import type { ClinicUser, NetworkCondition, SyncMetrics, Patient } from '../types/clinic';
import { INITIAL_STAFF, seedClinicDatabaseIfEmpty } from '../offline/seedData';
import { syncEngine } from '../offline/syncEngine';

interface ClinicContextType {
  currentUser: ClinicUser;
  setCurrentUser: (user: ClinicUser) => void;
  staffList: ClinicUser[];
  networkCondition: NetworkCondition;
  setNetworkCondition: (condition: NetworkCondition) => void;
  syncMetrics: SyncMetrics;
  isSyncing: boolean;
  triggerManualSync: () => Promise<void>;
  selectedPatient: Patient | null;
  setSelectedPatient: (patient: Patient | null) => void;
  toastMessage: { text: string; type: 'success' | 'info' | 'warning' | 'error' } | null;
  showToast: (text: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
  facilityName: string;
  facilityId: string;
  deviceId: string;
}

const ClinicContext = createContext<ClinicContextType | undefined>(undefined);

export const ClinicProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<ClinicUser>(INITIAL_STAFF[0]); // Dr. Tendai Moyo
  const [networkCondition, setNetworkState] = useState<NetworkCondition>(syncEngine.getNetworkCondition());
  const [syncMetrics, setSyncMetrics] = useState<SyncMetrics>(syncEngine.getMetrics());
  const [isSyncing, setIsSyncing] = useState<boolean>(syncEngine.getIsSyncing());
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'info' | 'warning' | 'error' } | null>(null);

  useEffect(() => {
    // Seed initial database
    seedClinicDatabaseIfEmpty().catch(console.error);

    // Subscribe to sync engine events
    const unsubscribe = syncEngine.subscribe(() => {
      setNetworkState(syncEngine.getNetworkCondition());
      setSyncMetrics(syncEngine.getMetrics());
      setIsSyncing(syncEngine.getIsSyncing());
    });

    return () => unsubscribe();
  }, []);

  const setNetworkCondition = (condition: NetworkCondition) => {
    syncEngine.setNetworkCondition(condition);
    setNetworkState(condition);
    if (condition === 'offline') {
      showToast('Offline Mode Engaged. All records are safe in local IndexedDB outbox.', 'warning');
    } else if (condition === 'online') {
      showToast('Connected to Central MoH Server. Background sync active.', 'success');
    } else if (condition === 'unstable_2g') {
      showToast('Weak 2G Cellular Tower connection simulated (latency + jitter).', 'info');
    } else if (condition === 'server_down') {
      showToast('Central MoH Server 503 Outage simulated. Local clinic runs unaffected.', 'error');
    }
  };

  const triggerManualSync = async () => {
    const res = await syncEngine.triggerSync();
    if (res.success) {
      showToast(`Sync completed: ${res.pushed} uploaded, ${res.pulled} downloaded.`, 'success');
    } else {
      showToast(`Sync warning: ${res.error || 'Check network condition'}`, 'warning');
    }
  };

  const showToast = (text: string, type: 'success' | 'info' | 'warning' | 'error' = 'info') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage((current) => (current?.text === text ? null : current));
    }, 4500);
  };

  return (
    <ClinicContext.Provider
      value={{
        currentUser,
        setCurrentUser,
        staffList: INITIAL_STAFF,
        networkCondition,
        setNetworkCondition,
        syncMetrics,
        isSyncing,
        triggerManualSync,
        selectedPatient,
        setSelectedPatient,
        toastMessage,
        showToast,
        facilityName: 'Chipinge Rural Health Center (District Health)',
        facilityId: syncEngine.getFacilityId(),
        deviceId: syncEngine.getDeviceId()
      }}
    >
      {children}
    </ClinicContext.Provider>
  );
};

export const useClinic = () => {
  const context = useContext(ClinicContext);
  if (!context) {
    throw new Error('useClinic must be used within ClinicProvider');
  }
  return context;
};
