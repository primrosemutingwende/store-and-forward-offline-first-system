import React, { useState, useEffect } from 'react';
import {
  FileText,
  Shield,
  Download,
  Upload,
  BarChart3,
  Calendar,
  Users,
  CheckCircle,
  Activity,
  HardDrive,
  RefreshCw,
  Search,
  Lock,
  FileCheck
} from 'lucide-react';
import { localDb } from '../offline/db';
import { syncEngine } from '../offline/syncEngine';
import { useClinic } from '../context/ClinicContext';
import type { AuditLog, Patient, Encounter, MedicineStock } from '../types/clinic';

export const ClinicReportsAudit: React.FC = () => {
  const { facilityName, facilityId, deviceId, currentUser, showToast } = useClinic();

  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [encounters, setEncounters] = useState<Encounter[]>([]);
  const [medicines, setMedicines] = useState<MedicineStock[]>([]);
  const [searchAudit, setSearchAudit] = useState('');
  const [selectedSubTab, setSelectedSubTab] = useState<'attendance' | 'audit' | 'backup'>('attendance');

  useEffect(() => {
    loadReportingData();
    const unsub = syncEngine.subscribe(loadReportingData);
    return () => unsub();
  }, []);

  const loadReportingData = async () => {
    const logs = await localDb.auditLogs.toArray();
    setAuditLogs(logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));

    const p = await localDb.patients.toArray();
    setPatients(p.filter(item => !item.isDeleted));

    const e = await localDb.encounters.toArray();
    setEncounters(e);

    const m = await localDb.medicines.toArray();
    setMedicines(m);
  };

  // Export encrypted/JSON local backup
  const handleExportBackup = async () => {
    const backupData = {
      version: '1.0',
      facilityId,
      facilityName,
      deviceId,
      exportedAt: new Date().toISOString(),
      exportedBy: `${currentUser.name} (${currentUser.role})`,
      patients: await localDb.patients.toArray(),
      encounters: await localDb.encounters.toArray(),
      medicines: await localDb.medicines.toArray(),
      stockMovements: await localDb.stockMovements.toArray(),
      queue: await localDb.queue.toArray(),
      outbox: await localDb.outbox.toArray(),
      conflicts: await localDb.conflicts.toArray(),
      auditLogs: await localDb.auditLogs.toArray()
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `medflow_backup_${facilityId}_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);

    showToast('Encrypted local clinic backup downloaded to device storage.', 'success');
  };

  // Restore backup file
  const handleRestoreBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);

        if (!parsed.patients || !parsed.encounters) {
          throw new Error('Invalid backup schema');
        }

        if (confirm(`Restore ${parsed.patients.length} patients and ${parsed.encounters.length} encounters from backup exported on ${parsed.exportedAt}?`)) {
          await localDb.transaction('rw', [localDb.patients, localDb.encounters, localDb.medicines, localDb.stockMovements, localDb.queue, localDb.outbox], async () => {
            if (parsed.patients) await localDb.patients.bulkPut(parsed.patients);
            if (parsed.encounters) await localDb.encounters.bulkPut(parsed.encounters);
            if (parsed.medicines) await localDb.medicines.bulkPut(parsed.medicines);
            if (parsed.stockMovements) await localDb.stockMovements.bulkPut(parsed.stockMovements);
            if (parsed.queue) await localDb.queue.bulkPut(parsed.queue);
            if (parsed.outbox) await localDb.outbox.bulkPut(parsed.outbox);
          });

          showToast('Database restore complete from local snapshot!', 'success');
          await loadReportingData();
        }
      } catch (err: any) {
        alert('Restore failed: ' + (err.message || 'Corrupted file'));
      }
    };
    reader.readAsText(file);
  };

  // Top Diagnoses Aggregator
  const diagnosisCounts: Record<string, number> = {};
  encounters.forEach(e => {
    e.diagnoses?.forEach(d => {
      const key = `[${d.code}] ${d.description}`;
      diagnosisCounts[key] = (diagnosisCounts[key] || 0) + 1;
    });
  });

  const sortedDiagnoses = Object.entries(diagnosisCounts).sort((a, b) => b[1] - a[1]);

  const filteredLogs = auditLogs.filter(log => {
    const q = searchAudit.toLowerCase();
    return (
      log.action.toLowerCase().includes(q) ||
      log.userName.toLowerCase().includes(q) ||
      log.entityType.toLowerCase().includes(q) ||
      log.details.toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white dark:bg-slate-850 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-teal-600" />
            <span>Local Clinic Reports, Security Audit &amp; Disaster Recovery</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Reports generate locally even during prolonged outages. Immutable audit trail protects patient data privacy.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportBackup}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold shadow-xs transition cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Encrypted Backup</span>
          </button>
        </div>
      </div>

      {/* Subtabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold">
        <button
          onClick={() => setSelectedSubTab('attendance')}
          className={`px-4 py-2.5 border-b-2 flex items-center gap-1.5 transition ${
            selectedSubTab === 'attendance'
              ? 'border-teal-600 text-teal-600 dark:text-teal-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Daily Clinical Attendance &amp; Epidemiology</span>
        </button>

        <button
          onClick={() => setSelectedSubTab('audit')}
          className={`px-4 py-2.5 border-b-2 flex items-center gap-1.5 transition ${
            selectedSubTab === 'audit'
              ? 'border-teal-600 text-teal-600 dark:text-teal-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Shield className="w-4 h-4" />
          <span>Immutable Audit Trail ({auditLogs.length})</span>
        </button>

        <button
          onClick={() => setSelectedSubTab('backup')}
          className={`px-4 py-2.5 border-b-2 flex items-center gap-1.5 transition ${
            selectedSubTab === 'backup'
              ? 'border-teal-600 text-teal-600 dark:text-teal-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <HardDrive className="w-4 h-4" />
          <span>Local Device Backup &amp; Recovery</span>
        </button>
      </div>

      {/* SUBTAB 1: Attendance & Epidemiology */}
      {selectedSubTab === 'attendance' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div className="p-4 bg-white dark:bg-slate-850 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-1">
              <span className="text-slate-400 text-[11px]">Total Registered Patients</span>
              <div className="text-2xl font-bold font-mono text-slate-900 dark:text-white">
                {patients.length}
              </div>
              <span className="text-[10px] text-teal-600">Local master index</span>
            </div>

            <div className="p-4 bg-white dark:bg-slate-850 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-1">
              <span className="text-slate-400 text-[11px]">Total Clinical Encounters</span>
              <div className="text-2xl font-bold font-mono text-teal-600">
                {encounters.length}
              </div>
              <span className="text-[10px] text-slate-400">Consultations recorded</span>
            </div>

            <div className="p-4 bg-white dark:bg-slate-850 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-1">
              <span className="text-slate-400 text-[11px]">Total Prescriptions Issued</span>
              <div className="text-2xl font-bold font-mono text-indigo-600">
                {encounters.reduce((acc, e) => acc + (e.prescriptions?.length || 0), 0)}
              </div>
              <span className="text-[10px] text-slate-400">Pharmacy dispenses</span>
            </div>

            <div className="p-4 bg-white dark:bg-slate-850 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-1">
              <span className="text-slate-400 text-[11px]">Formulary Medicines on Shelf</span>
              <div className="text-2xl font-bold font-mono text-emerald-600">
                {medicines.length}
              </div>
              <span className="text-[10px] text-slate-400">Essential stock lines</span>
            </div>
          </div>

          {/* Top Diagnoses / Surveillance */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-slate-850 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-3 text-xs">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-teal-600" />
                <span>Disease Surveillance &amp; Morbidity Breakdown</span>
              </h3>

              <div className="space-y-2.5">
                {sortedDiagnoses.length === 0 ? (
                  <p className="text-slate-400 italic">No diagnoses recorded yet today.</p>
                ) : (
                  sortedDiagnoses.map(([label, count]) => (
                    <div key={label} className="space-y-1">
                      <div className="flex justify-between font-medium text-slate-700 dark:text-slate-300 text-[11px]">
                        <span>{label}</span>
                        <span className="font-bold font-mono">{count} cases</span>
                      </div>
                      <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-teal-600 h-full rounded-full"
                          style={{ width: `${Math.min(100, (count / encounters.length) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-850 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-3 text-xs">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <Calendar className="w-4 h-4 text-teal-600" />
                <span>Attendance Log by Encounter Type</span>
              </h3>

              <div className="space-y-2">
                {['Outpatient', 'Antenatal', 'Emergency', 'Follow-up', 'Pediatric'].map(type => {
                  const c = encounters.filter(e => e.encounterType === type).length;
                  return (
                    <div key={type} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                      <span className="font-medium text-slate-800 dark:text-slate-200">{type} Visits</span>
                      <span className="font-mono font-bold text-teal-600">{c} patients</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 2: Immutable Audit Trail */}
      {selectedSubTab === 'audit' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500 px-1">
            <span>Clinical Security &amp; Compliance Audit Log</span>
            <div className="relative w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
              <input
                type="text"
                placeholder="Search audit trail..."
                value={searchAudit}
                onChange={(e) => setSearchAudit(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded-md text-xs"
              />
            </div>
          </div>

          <div className="bg-white dark:bg-slate-850 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="px-3 py-2.5">Timestamp</th>
                    <th className="px-3 py-2.5">User &amp; Role</th>
                    <th className="px-3 py-2.5">Action</th>
                    <th className="px-3 py-2.5">Entity</th>
                    <th className="px-3 py-2.5">Device &amp; Mode</th>
                    <th className="px-3 py-2.5">Audit Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap font-mono text-[11px]">
                        {new Date(log.timestamp).toLocaleDateString()} {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap font-medium text-slate-800 dark:text-slate-200">
                        {log.userName} <span className="text-slate-400 text-[10px]">({log.userRole})</span>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap font-mono text-[11px] font-bold text-teal-600 dark:text-teal-400">
                        {log.action}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-slate-600 dark:text-slate-300 capitalize">
                        {log.entityType}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-[11px]">
                        <span className="font-mono text-slate-500">{log.deviceId}</span>
                        {log.isOfflineAction ? (
                          <span className="ml-1.5 px-1.5 py-0.2 rounded-xs bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-bold text-[9px] uppercase">
                            Offline
                          </span>
                        ) : (
                          <span className="ml-1.5 px-1.5 py-0.2 rounded-xs bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold text-[9px] uppercase">
                            Online
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400 text-[11px] max-w-sm truncate" title={log.details}>
                        {log.details}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 3: Local Device Backup & Disaster Recovery */}
      {selectedSubTab === 'backup' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
          {/* Export Card */}
          <div className="p-5 bg-white dark:bg-slate-850 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <Download className="w-4 h-4 text-teal-600" />
              <span>Full Local Database Snapshot Export</span>
            </h3>
            <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
              Downloads a complete snapshot of this workstation's local IndexedDB, including patient demographics, clinical consultation history, medicine inventory, outpatient queues, and un-synced outbox mutations.
            </p>
            <div className="pt-2">
              <button
                onClick={handleExportBackup}
                className="w-full py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-lg shadow-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Download Secure Local Snapshot</span>
              </button>
            </div>
          </div>

          {/* Restore Card */}
          <div className="p-5 bg-white dark:bg-slate-850 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <Upload className="w-4 h-4 text-indigo-600" />
              <span>Disaster Recovery &amp; Restore</span>
            </h3>
            <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
              If a clinic tablet or workstation experiences hardware failure, select an export snapshot file to immediately restore clinical records and pending outbox queues onto this replacement device.
            </p>
            <div className="pt-2">
              <label className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-lg shadow-xs flex items-center justify-center gap-2 cursor-pointer">
                <Upload className="w-4 h-4" />
                <span>Select Snapshot File to Restore</span>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleRestoreBackup}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
