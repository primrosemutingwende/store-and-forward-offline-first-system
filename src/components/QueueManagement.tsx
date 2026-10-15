import React, { useState, useEffect } from 'react';
import {
  Clock,
  UserCheck,
  Stethoscope,
  Pill,
  CheckCircle,
  AlertTriangle,
  ArrowRight,
  Plus,
  Thermometer,
  Heart,
  Activity,
  Search,
  Filter
} from 'lucide-react';
import { localDb } from '../offline/db';
import { syncEngine } from '../offline/syncEngine';
import { useClinic } from '../context/ClinicContext';
import { generateUUID } from '../utils/id';
import type { QueueItem, Patient, VitalSigns } from '../types/clinic';

interface QueueManagementProps {
  onStartConsultationForQueueItem: (patientId: string, queueItemId: string) => void;
  onNavigateToRegistry: () => void;
}

export const QueueManagement: React.FC<QueueManagementProps> = ({
  onStartConsultationForQueueItem,
  onNavigateToRegistry
}) => {
  const { currentUser, showToast, facilityId } = useClinic();
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedQueueItem, setSelectedQueueItem] = useState<QueueItem | null>(null);

  // Check-In Modal
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [checkInComplaint, setCheckInComplaint] = useState('');
  const [checkInPriority, setCheckInPriority] = useState<QueueItem['priority']>('Routine');

  // Quick Triage Modal
  const [showTriageModal, setShowTriageModal] = useState(false);
  const [triageItem, setTriageItem] = useState<QueueItem | null>(null);
  const [systolic, setSystolic] = useState(120);
  const [diastolic, setDiastolic] = useState(80);
  const [heartRate, setHeartRate] = useState(76);
  const [respRate, setRespRate] = useState(18);
  const [tempC, setTempC] = useState(36.8);
  const [spo2, setSpo2] = useState(98);
  const [weightKg, setWeightKg] = useState(65);
  const [heightCm, setHeightCm] = useState(168);
  const [painScore, setPainScore] = useState(1);
  const [triageNotes, setTriageNotes] = useState('');

  // Calculate BMI dynamically
  const calculatedBmi = heightCm > 0 ? Number(((weightKg / (heightCm / 100) ** 2)).toFixed(1)) : 22.0;

  // Auto determine Triage Category based on vitals
  const determineTriageCategory = (): 'Green' | 'Yellow' | 'Orange' | 'Red' => {
    if (systolic >= 180 || diastolic >= 110 || spo2 < 90 || tempC >= 39.5 || heartRate > 130) {
      return 'Red'; // Resuscitation / Immediate
    }
    if (systolic >= 160 || diastolic >= 100 || spo2 < 94 || tempC >= 38.5 || heartRate > 110 || painScore >= 7) {
      return 'Orange'; // High Priority
    }
    if (systolic >= 140 || diastolic >= 90 || tempC >= 37.8 || heartRate > 95 || painScore >= 4) {
      return 'Yellow'; // Urgent
    }
    return 'Green'; // Routine
  };

  useEffect(() => {
    loadData();
    const unsub = syncEngine.subscribe(loadData);
    return () => unsub();
  }, []);

  const loadData = async () => {
    const q = await localDb.queue.toArray();
    setQueueItems(q.filter(item => item.status === 'active'));
    const p = await localDb.patients.toArray();
    setPatients(p.filter(item => !item.isDeleted));
  };

  const handleStageMove = async (item: QueueItem, nextStage: QueueItem['stage']) => {
    const updated: QueueItem = {
      ...item,
      stage: nextStage,
      status: nextStage === 'Completed' ? 'completed' : 'active'
    };

    await syncEngine.commitLocalOperation(
      'queue_item',
      item.id,
      'UPDATE',
      updated,
      {
        userId: currentUser.id,
        userName: currentUser.name,
        userRole: currentUser.role,
        action: 'UPDATE_QUEUE_STAGE',
        details: `Moved patient ${item.patientName} to stage ${nextStage}`
      }
    );

    showToast(`${item.patientName} moved to ${nextStage}`, 'info');
    await loadData();
  };

  const handleCreateCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    const patient = patients.find(p => p.id === selectedPatientId);
    if (!patient) return;

    const age = patient.dateOfBirth ? `${new Date().getFullYear() - new Date(patient.dateOfBirth).getFullYear()}y` : 'N/A';
    const newItem: QueueItem = {
      id: generateUUID(),
      patientId: patient.id,
      patientNumber: patient.patientNumber,
      patientName: patient.fullName,
      ageSex: `${age} / ${patient.sex.charAt(0)}`,
      checkInTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      priority: checkInPriority,
      stage: 'Waiting',
      chiefComplaint: checkInComplaint.trim() || 'General visit',
      status: 'active'
    };

    await syncEngine.commitLocalOperation(
      'queue_item',
      newItem.id,
      'CREATE',
      newItem,
      {
        userId: currentUser.id,
        userName: currentUser.name,
        userRole: currentUser.role,
        action: 'CHECKIN_QUEUE',
        details: `Checked in ${patient.fullName} (${patient.patientNumber}) into outpatient queue.`
      }
    );

    showToast(`Checked in ${patient.fullName} to Waiting Room`, 'success');
    setShowCheckInModal(false);
    setSelectedPatientId('');
    setCheckInComplaint('');
    await loadData();
  };

  const openTriage = (item: QueueItem) => {
    setTriageItem(item);
    setShowTriageModal(true);
  };

  const handleSaveTriage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!triageItem) return;

    const cat = determineTriageCategory();
    const vitalsRecord: VitalSigns = {
      systolicBp: Number(systolic),
      diastolicBp: Number(diastolic),
      heartRate: Number(heartRate),
      respRate: Number(respRate),
      tempC: Number(tempC),
      spo2: Number(spo2),
      weightKg: Number(weightKg),
      heightCm: Number(heightCm),
      bmi: calculatedBmi,
      painScore: Number(painScore),
      triageCategory: cat,
      triageNotes: triageNotes.trim(),
      recordedBy: currentUser.name,
      recordedAt: new Date().toISOString()
    };

    // Save vitals into local store temporarily and update queue item
    const updatedQueue: QueueItem = {
      ...triageItem,
      triageCategory: cat,
      stage: 'Doctor', // triage done, move to doctor queue!
      notes: `Vitals recorded: BP ${systolic}/${diastolic}, HR ${heartRate}, T ${tempC}°C. Category: ${cat}`
    };

    // Update patient chronic conditions or vitals cache if needed
    await syncEngine.commitLocalOperation(
      'queue_item',
      triageItem.id,
      'UPDATE',
      updatedQueue,
      {
        userId: currentUser.id,
        userName: currentUser.name,
        userRole: currentUser.role,
        action: 'TRIAGE_VITALS_RECORDED',
        details: `Triage complete for ${triageItem.patientName}: Category ${cat}, BP ${systolic}/${diastolic}`
      }
    );

    showToast(`Triage vitals recorded for ${triageItem.patientName} (Category: ${cat})`, 'success');
    setShowTriageModal(false);
    setTriageItem(null);
    await loadData();
  };

  // Group queue by stages
  const waitingStage = queueItems.filter(i => i.stage === 'Waiting');
  const triageStage = queueItems.filter(i => i.stage === 'Triage');
  const doctorStage = queueItems.filter(i => i.stage === 'Doctor');
  const pharmacyStage = queueItems.filter(i => i.stage === 'Pharmacy');

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Banner and Check-In Action */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white dark:bg-slate-850 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Clock className="w-5 h-5 text-teal-600" />
            <span>Outpatient Queue &amp; Clinical Triage</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Real-time clinic patient flow: Reception → Triage Nurses → Medical Officer → Pharmacy.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowCheckInModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-lg shadow-xs transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Check-in Patient</span>
          </button>
        </div>
      </div>

      {/* 4-Stage Kanban Swimlanes */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Stage 1: Waiting Room */}
        <div className="bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
            <span className="font-bold text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-400"></span>
              <span>1. Waiting Room</span>
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 font-bold text-slate-700 dark:text-slate-300">
              {waitingStage.length}
            </span>
          </div>

          <div className="space-y-2.5 min-h-[300px]">
            {waitingStage.length === 0 ? (
              <div className="text-center py-10 text-xs text-slate-400">No patients waiting</div>
            ) : (
              waitingStage.map((item) => (
                <div
                  key={item.id}
                  className="p-3 bg-white dark:bg-slate-850 rounded-lg border border-slate-200 dark:border-slate-800 shadow-xs space-y-2 text-xs"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-bold text-slate-900 dark:text-white">{item.patientName}</div>
                      <div className="text-[10px] text-teal-600 dark:text-teal-400 font-mono font-semibold">{item.patientNumber}</div>
                    </div>
                    <span className={`px-1.5 py-0.5 rounded-xs text-[10px] font-bold ${
                      item.priority === 'Emergency' ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' :
                      item.priority === 'Urgent' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' :
                      'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                    }`}>
                      {item.priority}
                    </span>
                  </div>

                  <p className="text-slate-600 dark:text-slate-400 text-[11px] leading-tight">
                    {item.chiefComplaint || 'Awaiting clinical triage'}
                  </p>

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">Arrived: {item.checkInTime}</span>
                    <button
                      onClick={() => openTriage(item)}
                      className="px-2 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded-md font-semibold text-[11px] flex items-center gap-1 cursor-pointer"
                    >
                      <Thermometer className="w-3 h-3" />
                      <span>Take Vitals</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Stage 2: Triage */}
        <div className="bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
            <span className="font-bold text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
              <span>2. Nursing Triage</span>
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 font-bold text-slate-700 dark:text-slate-300">
              {triageStage.length}
            </span>
          </div>

          <div className="space-y-2.5 min-h-[300px]">
            {triageStage.length === 0 ? (
              <div className="text-center py-10 text-xs text-slate-400">No patients in triage</div>
            ) : (
              triageStage.map((item) => (
                <div
                  key={item.id}
                  className="p-3 bg-white dark:bg-slate-850 rounded-lg border border-slate-200 dark:border-slate-800 shadow-xs space-y-2 text-xs"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-bold text-slate-900 dark:text-white">{item.patientName}</div>
                      <div className="text-[10px] text-teal-600 dark:text-teal-400 font-mono font-semibold">{item.patientNumber}</div>
                    </div>
                    {item.triageCategory && (
                      <span className={`px-2 py-0.5 rounded-xs text-[10px] font-bold ${
                        item.triageCategory === 'Red' ? 'bg-red-600 text-white' :
                        item.triageCategory === 'Orange' ? 'bg-orange-500 text-white' :
                        item.triageCategory === 'Yellow' ? 'bg-amber-400 text-black' :
                        'bg-emerald-600 text-white'
                      }`}>
                        {item.triageCategory}
                      </span>
                    )}
                  </div>

                  <p className="text-slate-600 dark:text-slate-400 text-[11px]">
                    {item.chiefComplaint}
                  </p>

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <button
                      onClick={() => openTriage(item)}
                      className="text-teal-600 hover:underline text-[11px] font-semibold"
                    >
                      Update Vitals
                    </button>
                    <button
                      onClick={() => handleStageMove(item, 'Doctor')}
                      className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md font-semibold text-[11px] flex items-center gap-1 cursor-pointer"
                    >
                      <span>Send to Doctor</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Stage 3: Doctor Consultation */}
        <div className="bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
            <span className="font-bold text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-teal-500"></span>
              <span>3. Medical Officer</span>
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 font-bold text-slate-700 dark:text-slate-300">
              {doctorStage.length}
            </span>
          </div>

          <div className="space-y-2.5 min-h-[300px]">
            {doctorStage.length === 0 ? (
              <div className="text-center py-10 text-xs text-slate-400">Doctor room available</div>
            ) : (
              doctorStage.map((item) => (
                <div
                  key={item.id}
                  className="p-3 bg-white dark:bg-slate-850 rounded-lg border border-teal-300 dark:border-teal-800 shadow-xs space-y-2 text-xs"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-bold text-slate-900 dark:text-white">{item.patientName}</div>
                      <div className="text-[10px] text-teal-600 dark:text-teal-400 font-mono font-semibold">{item.patientNumber}</div>
                    </div>
                    {item.triageCategory && (
                      <span className={`px-1.5 py-0.5 rounded-xs text-[10px] font-bold ${
                        item.triageCategory === 'Red' ? 'bg-red-600 text-white' :
                        item.triageCategory === 'Orange' ? 'bg-orange-500 text-white' :
                        item.triageCategory === 'Yellow' ? 'bg-amber-400 text-black' :
                        'bg-emerald-600 text-white'
                      }`}>
                        Triage: {item.triageCategory}
                      </span>
                    )}
                  </div>

                  <p className="text-slate-600 dark:text-slate-400 text-[11px]">
                    {item.chiefComplaint}
                  </p>

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <button
                      onClick={() => onStartConsultationForQueueItem(item.patientId, item.id)}
                      className="w-full py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-md font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <Stethoscope className="w-3.5 h-3.5" />
                      <span>Open Consultation</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Stage 4: Pharmacy Dispensing */}
        <div className="bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
            <span className="font-bold text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span>
              <span>4. Dispensary</span>
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 font-bold text-slate-700 dark:text-slate-300">
              {pharmacyStage.length}
            </span>
          </div>

          <div className="space-y-2.5 min-h-[300px]">
            {pharmacyStage.length === 0 ? (
              <div className="text-center py-10 text-xs text-slate-400">No prescriptions waiting</div>
            ) : (
              pharmacyStage.map((item) => (
                <div
                  key={item.id}
                  className="p-3 bg-white dark:bg-slate-850 rounded-lg border border-slate-200 dark:border-slate-800 shadow-xs space-y-2 text-xs"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-bold text-slate-900 dark:text-white">{item.patientName}</div>
                      <div className="text-[10px] text-teal-600 dark:text-teal-400 font-mono font-semibold">{item.patientNumber}</div>
                    </div>
                  </div>

                  <p className="text-slate-600 dark:text-slate-400 text-[11px]">
                    Prescription ready for offline dispensing &amp; batch deduction.
                  </p>

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <button
                      onClick={() => handleStageMove(item, 'Completed')}
                      className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md font-semibold text-xs flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>Dispense &amp; Discharge</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* MODAL: Check In Patient */}
      {showCheckInModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-teal-600" />
                <span>Patient Check-In</span>
              </h3>
              <button onClick={() => setShowCheckInModal(false)} className="text-slate-400 font-bold">✕</button>
            </div>

            <form onSubmit={handleCreateCheckIn} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Select Registered Patient
                </label>
                <select
                  required
                  value={selectedPatientId}
                  onChange={(e) => setSelectedPatientId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                >
                  <option value="">-- Choose patient --</option>
                  {patients.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.fullName} ({p.patientNumber})
                    </option>
                  ))}
                </select>
                <div className="mt-1 text-right">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCheckInModal(false);
                      onNavigateToRegistry();
                    }}
                    className="text-[11px] text-teal-600 hover:underline"
                  >
                    + Register new patient first
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Visit Priority
                </label>
                <select
                  value={checkInPriority}
                  onChange={(e) => setCheckInPriority(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                >
                  <option value="Routine">Routine Outpatient</option>
                  <option value="Urgent">Urgent / Acute Illness</option>
                  <option value="Emergency">Emergency (Immediate)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Chief Complaint / Reason for Visit
                </label>
                <textarea
                  required
                  rows={2}
                  placeholder="e.g. Fever for 3 days, cough, headache..."
                  value={checkInComplaint}
                  onChange={(e) => setCheckInComplaint(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCheckInModal(false)}
                  className="px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-semibold"
                >
                  Admit to Waiting Room
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Clinical Vitals & Triage */}
      {showTriageModal && triageItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Thermometer className="w-5 h-5 text-teal-600" />
                  <span>Nursing Triage &amp; Vital Signs</span>
                </h3>
                <p className="text-xs text-slate-500">
                  {triageItem.patientName} ({triageItem.patientNumber})
                </p>
              </div>
              <button onClick={() => setShowTriageModal(false)} className="text-slate-400 font-bold">✕</button>
            </div>

            <form onSubmit={handleSaveTriage} className="mt-4 space-y-3.5 text-xs">
              {/* Blood Pressure and Heart Rate */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Systolic BP (mmHg)
                  </label>
                  <input
                    type="number"
                    value={systolic}
                    onChange={(e) => setSystolic(Number(e.target.value))}
                    className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg font-bold"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Diastolic BP (mmHg)
                  </label>
                  <input
                    type="number"
                    value={diastolic}
                    onChange={(e) => setDiastolic(Number(e.target.value))}
                    className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg font-bold"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Pulse (bpm)
                  </label>
                  <input
                    type="number"
                    value={heartRate}
                    onChange={(e) => setHeartRate(Number(e.target.value))}
                    className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg font-bold"
                  />
                </div>
              </div>

              {/* Temperature, SpO2, Respiratory Rate */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Body Temp (°C)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={tempC}
                    onChange={(e) => setTempC(Number(e.target.value))}
                    className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg font-bold"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Oxygen SpO2 (%)
                  </label>
                  <input
                    type="number"
                    value={spo2}
                    onChange={(e) => setSpo2(Number(e.target.value))}
                    className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg font-bold"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Resp Rate (/min)
                  </label>
                  <input
                    type="number"
                    value={respRate}
                    onChange={(e) => setRespRate(Number(e.target.value))}
                    className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg font-bold"
                  />
                </div>
              </div>

              {/* Weight, Height, Pain Score, BMI */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Weight (kg)
                  </label>
                  <input
                    type="number"
                    value={weightKg}
                    onChange={(e) => setWeightKg(Number(e.target.value))}
                    className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Height (cm)
                  </label>
                  <input
                    type="number"
                    value={heightCm}
                    onChange={(e) => setHeightCm(Number(e.target.value))}
                    className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Pain Score (0-10)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    value={painScore}
                    onChange={(e) => setPainScore(Number(e.target.value))}
                    className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                  />
                </div>
              </div>

              {/* Real-time Triage Score Banner */}
              <div className={`p-3 rounded-xl border flex items-center justify-between ${
                determineTriageCategory() === 'Red' ? 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300' :
                determineTriageCategory() === 'Orange' ? 'bg-orange-500/10 border-orange-500/30 text-orange-700 dark:text-orange-300' :
                determineTriageCategory() === 'Yellow' ? 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300' :
                'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
              }`}>
                <div>
                  <div className="font-bold">Calculated Triage: {determineTriageCategory()} Category</div>
                  <div className="text-[11px] opacity-80">BMI: {calculatedBmi} kg/m² • Recorded by {currentUser.name}</div>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Triage Nurse Notes
                </label>
                <textarea
                  rows={2}
                  placeholder="Patient appearance, mobility, alertness, hydration..."
                  value={triageNotes}
                  onChange={(e) => setTriageNotes(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowTriageModal(false)}
                  className="px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-semibold"
                >
                  Commit Vitals &amp; Forward to Doctor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
