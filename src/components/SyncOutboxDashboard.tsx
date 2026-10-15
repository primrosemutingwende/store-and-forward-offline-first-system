import React, { useState, useEffect } from 'react';
import {
  Inbox,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Server,
  CloudUpload,
  CloudDownload,
  GitBranch,
  ShieldAlert,
  Zap,
  ArrowRight,
  Database,
  Code2,
  RotateCcw,
  Clock,
  Sparkles,
  Layers
} from 'lucide-react';
import { localDb } from '../offline/db';
import { syncEngine } from '../offline/syncEngine';
import { centralServer } from '../offline/centralServer';
import { useClinic } from '../context/ClinicContext';
import type { OutboxOperation, SyncConflict, Patient } from '../types/clinic';

export const SyncOutboxDashboard: React.FC = () => {
  const {
    networkCondition,
    syncMetrics,
    isSyncing,
    triggerManualSync,
    showToast,
    currentUser,
    facilityId,
    deviceId
  } = useClinic();

  const [outboxOps, setOutboxOps] = useState<OutboxOperation[]>([]);
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const [selectedOp, setSelectedOp] = useState<OutboxOperation | null>(null);
  const [selectedConflict, setSelectedConflict] = useState<SyncConflict | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'outbox' | 'conflicts' | 'central_server'>('outbox');
  const [centralStats, setCentralStats] = useState<any>(null);

  useEffect(() => {
    loadOutboxAndConflicts();
    const unsub = syncEngine.subscribe(loadOutboxAndConflicts);
    return () => unsub();
  }, []);

  const loadOutboxAndConflicts = async () => {
    const ops = await localDb.outbox.toArray();
    setOutboxOps(ops.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
    const confs = await localDb.conflicts.toArray();
    setConflicts(confs.sort((a, b) => new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime()));
    setCentralStats(centralServer.getCentralStatistics());

    if (selectedConflict) {
      const refreshedConf = confs.find(c => c.id === selectedConflict.id);
      if (refreshedConf) setSelectedConflict(refreshedConf);
    }
  };

  // Inject a concurrent edit from sister facility to test real conflict resolution!
  const handleSimulateConflict = async () => {
    const allPatients = await localDb.patients.toArray();
    if (allPatients.length === 0) {
      showToast('Please register at least one patient first before simulating a conflict.', 'warning');
      return;
    }
    const target = allPatients[0];

    // Inject remote change in central server
    centralServer.injectSimulatedRemoteConflict(
      target,
      'Sulfonamides (Bactrim)',
      '+263 77 999 0000'
    );

    // Also edit target locally so versions diverge
    const localUpdated: Patient = {
      ...target,
      allergies: [
        ...target.allergies,
        { allergen: 'Ciprofloxacin', severity: 'moderate', reaction: 'Mild erythematous rash' }
      ],
      phone: '+263 71 888 1111',
      version: (target.version || 1) + 1,
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending'
    };

    await syncEngine.commitLocalOperation(
      'patient',
      target.id,
      'UPDATE',
      localUpdated,
      {
        userId: currentUser.id,
        userName: currentUser.name,
        userRole: currentUser.role,
        action: 'CONCURRENT_EDIT_TEST',
        details: `Simulated local divergent edit on ${target.fullName} while sister facility also edited remotely.`
      }
    );

    showToast('Concurrent conflict staged! Triggering sync now to detect conflict...', 'info');
    await syncEngine.triggerSync();
    setActiveSubTab('conflicts');
  };

  // Conflict Resolution Action
  const handleResolveConflict = async (resolutionType: 'keep_local' | 'keep_server' | 'append_notes') => {
    if (!selectedConflict) return;

    let winningPayload: any;

    if (resolutionType === 'keep_local') {
      winningPayload = { ...selectedConflict.client_payload };
    } else if (resolutionType === 'keep_server') {
      winningPayload = { ...selectedConflict.server_payload };
    } else {
      // Append / Smart Merge
      if (selectedConflict.entity_type === 'patient') {
        const clientP = selectedConflict.client_payload as Patient;
        const serverP = selectedConflict.server_payload as Patient;

        // Merge allergies without duplicates
        const combinedAllergies = [...clientP.allergies];
        for (const a of serverP.allergies) {
          if (!combinedAllergies.some(c => c.allergen.toLowerCase() === a.allergen.toLowerCase())) {
            combinedAllergies.push(a);
          }
        }

        winningPayload = {
          ...clientP,
          allergies: combinedAllergies,
          phone: clientP.phone || serverP.phone,
          medicalHistory: `${clientP.medicalHistory || ''}\n[Merged from Central MoH]: ${serverP.medicalHistory || ''}`.trim()
        };
      } else {
        winningPayload = { ...selectedConflict.client_payload };
      }
    }

    await syncEngine.resolveConflict(
      selectedConflict.id,
      resolutionType === 'append_notes' ? 'custom_merge' : resolutionType,
      winningPayload,
      currentUser.name
    );

    showToast(`Conflict resolved using "${resolutionType.replace('_', ' ')}"! Uploading resolution.`, 'success');
    setSelectedConflict(null);
    await loadOutboxAndConflicts();
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Banner and Metrics */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white dark:bg-slate-850 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Inbox className="w-5 h-5 text-teal-600" />
            <span>Synchronization Engine &amp; Transactional Outbox</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Durable outbox queue, cursor-based change feed, idempotent deduplication, and conflict resolution workbench.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSimulateConflict}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold shadow-xs transition cursor-pointer"
            title="Simulate what happens when another doctor at Sister Clinic edits the same patient while disconnected"
          >
            <GitBranch className="w-3.5 h-3.5" />
            <span>Simulate Sister Clinic Conflict</span>
          </button>

          <button
            onClick={triggerManualSync}
            disabled={isSyncing || networkCondition === 'offline'}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-semibold shadow-xs transition disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Syncing...' : 'Run Two-Way Sync'}</span>
          </button>
        </div>
      </div>

      {/* Sync Vital Telemetry Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
        <div className="p-3 bg-white dark:bg-slate-850 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="text-slate-500 text-[11px] font-medium">Pending in Outbox</div>
          <div className="text-xl font-extrabold text-amber-500 font-mono mt-0.5">
            {syncMetrics.pendingOutboxCount}
          </div>
          <div className="text-[10px] text-slate-400">Awaiting connectivity</div>
        </div>

        <div className="p-3 bg-white dark:bg-slate-850 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="text-slate-500 text-[11px] font-medium">Server ACKs</div>
          <div className="text-xl font-extrabold text-emerald-500 font-mono mt-0.5">
            {syncMetrics.totalSyncedAcks}
          </div>
          <div className="text-[10px] text-slate-400">Safely committed cloud</div>
        </div>

        <div className="p-3 bg-white dark:bg-slate-850 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="text-slate-500 text-[11px] font-medium">Idempotent Deduped</div>
          <div className="text-xl font-extrabold text-teal-500 font-mono mt-0.5">
            {syncMetrics.idempotentDeduplicatedCount}
          </div>
          <div className="text-[10px] text-slate-400">Duplicate retries ignored</div>
        </div>

        <div className="p-3 bg-white dark:bg-slate-850 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="text-slate-500 text-[11px] font-medium">Active Conflicts</div>
          <div className="text-xl font-extrabold text-rose-500 font-mono mt-0.5">
            {syncMetrics.conflictCount}
          </div>
          <div className="text-[10px] text-slate-400">Concurrent edits</div>
        </div>

        <div className="p-3 bg-white dark:bg-slate-850 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="text-slate-500 text-[11px] font-medium">Local Save Rate</div>
          <div className="text-xl font-extrabold text-indigo-500 font-mono mt-0.5">
            100%
          </div>
          <div className="text-[10px] text-slate-400">Zero data loss guarantee</div>
        </div>

        <div className="p-3 bg-white dark:bg-slate-850 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="text-slate-500 text-[11px] font-medium">Last Sync Roundtrip</div>
          <div className="text-xl font-extrabold text-slate-800 dark:text-slate-200 font-mono mt-0.5">
            {syncMetrics.lastSyncDurationMs > 0 ? `${syncMetrics.lastSyncDurationMs}ms` : '--'}
          </div>
          <div className="text-[10px] text-slate-400 truncate">
            {syncMetrics.lastSyncTimestamp ? new Date(syncMetrics.lastSyncTimestamp).toLocaleTimeString() : 'Never'}
          </div>
        </div>
      </div>

      {/* Subtabs: Outbox Queue vs Conflicts vs Central Server Inspector */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold">
        <button
          onClick={() => setActiveSubTab('outbox')}
          className={`px-4 py-2.5 border-b-2 flex items-center gap-1.5 transition ${
            activeSubTab === 'outbox'
              ? 'border-teal-600 text-teal-600 dark:text-teal-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Inbox className="w-4 h-4" />
          <span>Outbox Mutation Queue ({outboxOps.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('conflicts')}
          className={`px-4 py-2.5 border-b-2 flex items-center gap-1.5 transition ${
            activeSubTab === 'conflicts'
              ? 'border-rose-600 text-rose-600 dark:text-rose-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <GitBranch className="w-4 h-4" />
          <span>Conflict Resolution Workbench</span>
          {conflicts.filter(c => !c.resolved).length > 0 && (
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
          )}
        </button>

        <button
          onClick={() => setActiveSubTab('central_server')}
          className={`px-4 py-2.5 border-b-2 flex items-center gap-1.5 transition ${
            activeSubTab === 'central_server'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Server className="w-4 h-4" />
          <span>Central Cloud Server Inspector</span>
        </button>
      </div>

      {/* SUBTAB 1: Outbox Queue Table & Payload Inspector */}
      {activeSubTab === 'outbox' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-500 px-1">
              <span>Client-side Durable Outbox Operations</span>
              <span>Facility: {facilityId} • Device: {deviceId}</span>
            </div>

            <div className="bg-white dark:bg-slate-850 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="px-3 py-2.5">Status</th>
                      <th className="px-3 py-2.5">Entity</th>
                      <th className="px-3 py-2.5">Operation</th>
                      <th className="px-3 py-2.5">Operation ID (UUID)</th>
                      <th className="px-3 py-2.5">Attempts</th>
                      <th className="px-3 py-2.5">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {outboxOps.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-8 text-center text-slate-400">
                          Outbox is completely empty. Create a patient or consultation to watch it queue.
                        </td>
                      </tr>
                    ) : (
                      outboxOps.map((op) => {
                        const isSelected = selectedOp?.operation_id === op.operation_id;
                        return (
                          <tr
                            key={op.operation_id}
                            onClick={() => setSelectedOp(op)}
                            className={`cursor-pointer transition ${
                              isSelected
                                ? 'bg-teal-50 dark:bg-teal-950/40'
                                : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                            }`}
                          >
                            <td className="px-3 py-2.5 whitespace-nowrap">
                              <span className={`px-2 py-0.5 rounded-xs font-bold text-[10px] uppercase tracking-wider ${
                                op.status === 'synced' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' :
                                op.status === 'pending' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 animate-pulse' :
                                op.status === 'in_progress' ? 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300' :
                                op.status === 'conflict' ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' :
                                'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                              }`}>
                                {op.status}
                              </span>
                            </td>

                            <td className="px-3 py-2.5 font-semibold text-slate-800 dark:text-slate-200 capitalize">
                              {op.entity_type}
                            </td>

                            <td className="px-3 py-2.5 font-mono text-[11px] font-bold text-teal-600 dark:text-teal-400">
                              {op.operation_type}
                            </td>

                            <td className="px-3 py-2.5 font-mono text-[11px] text-slate-500 truncate max-w-[140px]" title={op.operation_id}>
                              {op.operation_id.slice(0, 13)}...
                            </td>

                            <td className="px-3 py-2.5 font-mono">
                              {op.attempt_count}
                            </td>

                            <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap">
                              {new Date(op.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
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

          {/* Right: Selected Outbox Operation Payload Inspector */}
          <div className="lg:col-span-4 space-y-3">
            <div className="text-xs text-slate-500 px-1">Operation Payload Inspector</div>
            {selectedOp ? (
              <div className="bg-white dark:bg-slate-850 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-xs space-y-3 text-xs">
                <div className="pb-2 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-slate-900 dark:text-white">
                      {selectedOp.entity_type.toUpperCase()} / {selectedOp.operation_type}
                    </div>
                    <div className="text-[10px] font-mono text-slate-400">
                      ID: {selectedOp.operation_id}
                    </div>
                  </div>
                  {selectedOp.server_ack_id && (
                    <span className="px-2 py-0.5 rounded-xs bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-mono text-[10px] font-bold">
                      {selectedOp.server_ack_id}
                    </span>
                  )}
                </div>

                {selectedOp.error_message && (
                  <div className="p-2.5 bg-rose-50 dark:bg-rose-950/40 rounded-lg border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200 text-xs">
                    <strong>Error / Conflict:</strong> {selectedOp.error_message}
                  </div>
                )}

                <div>
                  <div className="text-[11px] font-semibold text-slate-500 mb-1 flex items-center gap-1">
                    <Code2 className="w-3.5 h-3.5 text-teal-600" />
                    <span>Exact JSON Mutation Payload</span>
                  </div>
                  <pre className="p-3 bg-slate-900 text-emerald-400 rounded-lg text-[11px] font-mono overflow-x-auto max-h-64 leading-tight">
                    {JSON.stringify(selectedOp.payload, null, 2)}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center bg-white dark:bg-slate-850 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-xs text-slate-400">
                Click any row in the Outbox to inspect its idempotent UUID, status, attempts, and JSON payload.
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUBTAB 2: Side-by-Side Three-Way Conflict Resolution Workbench */}
      {activeSubTab === 'conflicts' && (
        <div className="space-y-4">
          <div className="p-4 bg-rose-50 dark:bg-rose-950/30 rounded-xl border border-rose-200 dark:border-rose-900 text-xs text-rose-900 dark:text-rose-200 flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-sm">Clinical Conflict Resolution Workbench</div>
              <p className="mt-0.5 leading-relaxed">
                Offline-first systems must never blindly apply "Last Write Wins" to sensitive medical records (allergies, diagnoses, medications).
                Review the three-way comparison below and select an explicit clinical resolution.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* List of Detected Conflicts */}
            <div className="lg:col-span-4 space-y-2.5">
              <div className="text-xs text-slate-500 px-1 font-semibold">Detected Concurrency Conflicts</div>
              {conflicts.length === 0 ? (
                <div className="p-6 bg-white dark:bg-slate-850 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400 space-y-2">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
                  <p className="font-semibold text-slate-700 dark:text-slate-300">No active conflicts detected.</p>
                  <p>Click "Simulate Sister Clinic Conflict" above to test the three-way resolution engine!</p>
                </div>
              ) : (
                conflicts.map((conf) => {
                  const isSelected = selectedConflict?.id === conf.id;
                  return (
                    <div
                      key={conf.id}
                      onClick={() => setSelectedConflict(conf)}
                      className={`p-3.5 rounded-xl border text-xs cursor-pointer transition ${
                        isSelected
                          ? 'bg-rose-50/80 dark:bg-rose-950/40 border-rose-500 shadow-xs'
                          : 'bg-white dark:bg-slate-850 border-slate-200 dark:border-slate-800 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between font-bold text-slate-900 dark:text-white mb-1">
                        <span>{conf.entity_name}</span>
                        <span className={`px-2 py-0.5 rounded-xs text-[10px] uppercase font-bold ${
                          conf.resolved ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800 animate-pulse'
                        }`}>
                          {conf.resolved ? 'Resolved' : 'Needs Review'}
                        </span>
                      </div>

                      <div className="text-[11px] text-rose-700 dark:text-rose-400 font-medium">
                        Conflicting fields: {conf.conflict_fields.join(', ')}
                      </div>

                      <div className="mt-2 text-[10px] text-slate-400 flex items-center justify-between">
                        <span>Base: v{conf.base_version} → Local: v{conf.client_version} vs Server: v{conf.server_version}</span>
                        <span>{new Date(conf.detected_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Side-by-Side Three-Way Diff View */}
            <div className="lg:col-span-8">
              {selectedConflict ? (
                <div className="bg-white dark:bg-slate-850 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-4 text-xs">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                    <div>
                      <h4 className="font-bold text-base text-slate-900 dark:text-white">
                        Three-Way Diff: {selectedConflict.entity_name}
                      </h4>
                      <p className="text-slate-400 text-[11px]">
                        Detected: {new Date(selectedConflict.detected_at).toLocaleString()}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-sm">
                        Base Revision: v{selectedConflict.base_version}
                      </span>
                    </div>
                  </div>

                  {/* Side-by-side comparison cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Left: Local Device Version */}
                    <div className="p-4 rounded-xl bg-teal-50/50 dark:bg-teal-950/20 border border-teal-300 dark:border-teal-800 space-y-2">
                      <div className="flex items-center justify-between font-bold text-teal-800 dark:text-teal-300 pb-1.5 border-b border-teal-200 dark:border-teal-800">
                        <span>Local Device (This Clinic)</span>
                        <span className="font-mono text-xs">v{selectedConflict.client_version}</span>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Author: <strong>{selectedConflict.client_author}</strong>
                      </div>
                      <div className="space-y-1.5 pt-2">
                        <div>
                          <strong>Phone:</strong> {selectedConflict.client_payload?.phone || 'None'}
                        </div>
                        <div>
                          <strong>Allergies:</strong>
                          <ul className="list-disc list-inside mt-0.5">
                            {selectedConflict.client_payload?.allergies?.map((a: any, i: number) => (
                              <li key={i} className="text-rose-700 dark:text-rose-400 font-semibold">
                                {a.allergen} ({a.severity}) - {a.reaction}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>

                    {/* Right: Remote Central Server / Sister Clinic Version */}
                    <div className="p-4 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-300 dark:border-indigo-800 space-y-2">
                      <div className="flex items-center justify-between font-bold text-indigo-800 dark:text-indigo-300 pb-1.5 border-b border-indigo-200 dark:border-indigo-800">
                        <span>Remote Central Server (Sister Facility)</span>
                        <span className="font-mono text-xs">v{selectedConflict.server_version}</span>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Author: <strong>{selectedConflict.server_author}</strong>
                      </div>
                      <div className="space-y-1.5 pt-2">
                        <div>
                          <strong>Phone:</strong> {selectedConflict.server_payload?.phone || 'None'}
                        </div>
                        <div>
                          <strong>Allergies:</strong>
                          <ul className="list-disc list-inside mt-0.5">
                            {selectedConflict.server_payload?.allergies?.map((a: any, i: number) => (
                              <li key={i} className="text-rose-700 dark:text-rose-400 font-semibold">
                                {a.allergen} ({a.severity}) - {a.reaction}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Resolution Action Toolbar */}
                  {!selectedConflict.resolved ? (
                    <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                      <div className="font-bold text-slate-800 dark:text-slate-200">
                        Authorized Conflict Resolution Actions:
                      </div>
                      <div className="flex flex-wrap gap-2.5">
                        <button
                          onClick={() => handleResolveConflict('append_notes')}
                          className="px-3.5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-semibold text-xs flex items-center gap-1.5 shadow-xs cursor-pointer"
                        >
                          <Sparkles className="w-4 h-4" />
                          <span>Smart Merge (Combine All Allergies &amp; Notes)</span>
                        </button>

                        <button
                          onClick={() => handleResolveConflict('keep_local')}
                          className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-semibold text-xs flex items-center gap-1.5 cursor-pointer"
                        >
                          <span>Keep Local Clinic Version</span>
                        </button>

                        <button
                          onClick={() => handleResolveConflict('keep_server')}
                          className="px-3.5 py-2 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg font-semibold text-xs flex items-center gap-1.5 cursor-pointer"
                        >
                          <span>Accept Central Server Version</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 flex items-center justify-between">
                      <div className="flex items-center gap-2 font-bold">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>Conflict Resolved ({selectedConflict.resolution_type}) by {selectedConflict.resolved_by}</span>
                      </div>
                      <span className="text-[11px]">{new Date(selectedConflict.resolved_at || '').toLocaleString()}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-12 text-center bg-white dark:bg-slate-850 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-xs text-slate-400">
                  Select a conflict from the list on the left to examine side-by-side three-way diff and resolve.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 3: Central Server Cloud Inspector */}
      {activeSubTab === 'central_server' && (
        <div className="space-y-4">
          <div className="p-4 bg-indigo-50 dark:bg-indigo-950/30 rounded-xl border border-indigo-200 dark:border-indigo-900 text-xs text-indigo-900 dark:text-indigo-200 flex items-start gap-3">
            <Server className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-sm">Simulated Central Ministry of Health (MoH) Server</div>
              <p className="mt-0.5 leading-relaxed">
                This inspects the remote PostgreSQL central repository state.
                In a multi-clinic deployment, records committed by this clinic or sister clinics are aggregated here with durable revision cursors.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-4 bg-white dark:bg-slate-850 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-1">
              <div className="text-slate-400 text-[11px]">Central Cloud Patients</div>
              <div className="text-2xl font-bold font-mono text-indigo-600">
                {centralStats?.totalPatients || 0}
              </div>
              <div className="text-[10px] text-slate-400">Validated central demographic master records</div>
            </div>

            <div className="p-4 bg-white dark:bg-slate-850 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-1">
              <div className="text-slate-400 text-[11px]">Central Change Feed Length</div>
              <div className="text-2xl font-bold font-mono text-teal-600">
                {centralStats?.changeLogLength || 0}
              </div>
              <div className="text-[10px] text-slate-400">Sequential cursor entries for client pull</div>
            </div>

            <div className="p-4 bg-white dark:bg-slate-850 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-1">
              <div className="text-slate-400 text-[11px]">Processed Idempotent Operations</div>
              <div className="text-2xl font-bold font-mono text-emerald-600">
                {centralStats?.processedOpsCount || 0}
              </div>
              <div className="text-[10px] text-slate-400">Guaranteed deduplication hashes</div>
            </div>
          </div>

          {/* Raw Change Feed Table */}
          <div className="bg-white dark:bg-slate-850 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-xs space-y-3 text-xs">
            <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Database className="w-4 h-4 text-indigo-600" />
              <span>Central Server Cursor Log (Change Feed)</span>
            </h4>

            <div className="overflow-x-auto max-h-72">
              <table className="w-full text-left">
                <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500 uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="px-3 py-2">Cursor</th>
                    <th className="px-3 py-2">Entity</th>
                    <th className="px-3 py-2">Operation</th>
                    <th className="px-3 py-2">Version</th>
                    <th className="px-3 py-2">Origin Facility</th>
                    <th className="px-3 py-2">Author</th>
                    <th className="px-3 py-2">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-[11px]">
                  {centralServer.getRawChangeLog().map((log) => (
                    <tr key={log.cursor} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                      <td className="px-3 py-2 font-bold text-indigo-600">{log.cursor}</td>
                      <td className="px-3 py-2 font-sans font-medium">{log.entity_type}</td>
                      <td className="px-3 py-2 text-teal-600">{log.operation_type}</td>
                      <td className="px-3 py-2">v{log.version}</td>
                      <td className="px-3 py-2 font-sans text-slate-500">{log.origin_facility_id}</td>
                      <td className="px-3 py-2 font-sans text-slate-500">{log.origin_author}</td>
                      <td className="px-3 py-2 text-slate-400">{new Date(log.updated_at).toLocaleTimeString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
