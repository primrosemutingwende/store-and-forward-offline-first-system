import React, { useState } from 'react';
import { ClinicProvider, useClinic } from './context/ClinicContext';
import { Navbar } from './components/Navbar';
import { NetworkSimulatorBar } from './components/NetworkSimulatorBar';
import { QueueManagement } from './components/QueueManagement';
import { PatientRegistry } from './components/PatientRegistry';
import { ConsultationWorkbench } from './components/ConsultationWorkbench';
import { PharmacyInventory } from './components/PharmacyInventory';
import { SyncOutboxDashboard } from './components/SyncOutboxDashboard';
import { ClinicReportsAudit } from './components/ClinicReportsAudit';
import { CheckCircle, AlertTriangle, Info, AlertCircle, X } from 'lucide-react';
import type { Patient } from './types/clinic';

const ClinicAppContent: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('queue');
  const [consultationPatientId, setConsultationPatientId] = useState<string | undefined>(undefined);
  const [consultationQueueId, setConsultationQueueId] = useState<string | undefined>(undefined);

  const { toastMessage } = useClinic();

  const handleStartConsultationFromQueue = (patientId: string, queueItemId: string) => {
    setConsultationPatientId(patientId);
    setConsultationQueueId(queueItemId);
    setActiveTab('consultation');
  };

  const handleSelectPatientForConsultation = (patient: Patient) => {
    setConsultationPatientId(patient.id);
    setConsultationQueueId(undefined);
    setActiveTab('consultation');
  };

  const handleCheckInPatient = (patient: Patient) => {
    setActiveTab('queue');
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-slate-100 flex flex-col font-sans selection:bg-teal-500 selection:text-white">
      {/* Primary Clinic Navigation Bar */}
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Network Simulator Notification Bar */}
      <NetworkSimulatorBar />

      {/* Main Clinical Workspace */}
      <main className="flex-1 pb-16">
        {activeTab === 'queue' && (
          <QueueManagement
            onStartConsultationForQueueItem={handleStartConsultationFromQueue}
            onNavigateToRegistry={() => setActiveTab('patients')}
          />
        )}

        {activeTab === 'patients' && (
          <PatientRegistry
            onSelectPatientForConsultation={handleSelectPatientForConsultation}
            onCheckInPatient={handleCheckInPatient}
          />
        )}

        {activeTab === 'consultation' && (
          <ConsultationWorkbench
            initialPatientId={consultationPatientId}
            queueItemId={consultationQueueId}
            onEncounterSaved={() => {
              setActiveTab('queue');
              setConsultationPatientId(undefined);
              setConsultationQueueId(undefined);
            }}
          />
        )}

        {activeTab === 'pharmacy' && (
          <PharmacyInventory />
        )}

        {activeTab === 'sync' && (
          <SyncOutboxDashboard />
        )}

        {activeTab === 'reports' && (
          <ClinicReportsAudit />
        )}
      </main>

      {/* Persistent Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-4 right-4 z-50 max-w-md w-full p-1 animate-in fade-in slide-in-from-bottom-5 duration-300">
          <div className={`p-3.5 rounded-xl shadow-xl border flex items-start gap-3 text-xs ${
            toastMessage.type === 'success'
              ? 'bg-emerald-950/90 text-emerald-100 border-emerald-500/50'
              : toastMessage.type === 'warning'
              ? 'bg-amber-950/90 text-amber-100 border-amber-500/50'
              : toastMessage.type === 'error'
              ? 'bg-rose-950/90 text-rose-100 border-rose-500/50'
              : 'bg-slate-900/95 text-slate-100 border-slate-700'
          }`}>
            {toastMessage.type === 'success' && <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />}
            {toastMessage.type === 'warning' && <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />}
            {toastMessage.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />}
            {toastMessage.type === 'info' && <Info className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />}
            <div className="flex-1 font-medium leading-relaxed">{toastMessage.text}</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default function App() {
  return (
    <ClinicProvider>
      <ClinicAppContent />
    </ClinicProvider>
  );
}
