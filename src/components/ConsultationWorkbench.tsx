import React, { useState, useEffect } from 'react';
import {
  Stethoscope,
  Save,
  Plus,
  Trash2,
  FileText,
  AlertCircle,
  CheckCircle2,
  Thermometer,
  Pill,
  FlaskConical,
  Receipt,
  User,
  Clock,
  Sparkles,
  ShieldAlert
} from 'lucide-react';
import { localDb } from '../offline/db';
import { syncEngine } from '../offline/syncEngine';
import { useClinic } from '../context/ClinicContext';
import { generateUUID } from '../utils/id';
import type {
  Patient,
  Encounter,
  DiagnosisItem,
  PrescriptionItem,
  LabOrderItem,
  VitalSigns,
  MedicineStock
} from '../types/clinic';

// Standard ICD-10 diagnostic codes common in district rural clinics
const COMMON_ICD10: { code: string; desc: string }[] = [
  { code: 'B54', desc: 'Unspecified malaria (Plasmodium falciparum)' },
  { code: 'J06.9', desc: 'Acute upper respiratory infection, unspecified' },
  { code: 'J20.9', desc: 'Acute bronchitis, unspecified' },
  { code: 'I10', desc: 'Essential (primary) hypertension' },
  { code: 'E11.9', desc: 'Type 2 diabetes mellitus without complications' },
  { code: 'A09', desc: 'Infectious gastroenteritis and colitis, unspecified' },
  { code: 'L03.9', desc: 'Cellulitis, unspecified' },
  { code: 'N39.0', desc: 'Urinary tract infection, site not specified' },
  { code: 'Z34.9', desc: 'Encounter for supervision of normal pregnancy' },
  { code: 'K29.7', desc: 'Gastritis, unspecified' },
  { code: 'B20', desc: 'Human immunodeficiency virus [HIV] disease' },
  { code: 'T14.1', desc: 'Open wound of unspecified body region' }
];

interface ConsultationWorkbenchProps {
  initialPatientId?: string;
  queueItemId?: string;
  onEncounterSaved: () => void;
}

export const ConsultationWorkbench: React.FC<ConsultationWorkbenchProps> = ({
  initialPatientId,
  queueItemId,
  onEncounterSaved
}) => {
  const { currentUser, showToast, facilityId, facilityName } = useClinic();

  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>(initialPatientId || '');
  const [medicines, setMedicines] = useState<MedicineStock[]>([]);

  // Encounter form fields
  const [encounterType, setEncounterType] = useState<Encounter['encounterType']>('Outpatient');
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [symptomsInput, setSymptomsInput] = useState('');
  const [examinationNotes, setExaminationNotes] = useState('');
  const [treatmentPlan, setTreatmentPlan] = useState('');
  const [clinicalNotes, setClinicalNotes] = useState('');

  // Vitals
  const [systolic, setSystolic] = useState(120);
  const [diastolic, setDiastolic] = useState(80);
  const [heartRate, setHeartRate] = useState(74);
  const [respRate, setRespRate] = useState(18);
  const [tempC, setTempC] = useState(36.7);
  const [spo2, setSpo2] = useState(98);
  const [weightKg, setWeightKg] = useState(65);
  const [heightCm, setHeightCm] = useState(170);
  const [painScore, setPainScore] = useState(0);

  // Diagnoses
  const [diagnoses, setDiagnoses] = useState<DiagnosisItem[]>([
    { code: 'B54', description: 'Unspecified malaria (Plasmodium falciparum)', isPrimary: true, confirmed: true }
  ]);

  // Prescriptions
  const [prescriptions, setPrescriptions] = useState<PrescriptionItem[]>([]);
  const [selectedMedId, setSelectedMedId] = useState('');
  const [dosage, setDosage] = useState('1 tablet');
  const [frequency, setFrequency] = useState('TDS (3x daily)');
  const [durationDays, setDurationDays] = useState(5);
  const [rxQuantity, setRxQuantity] = useState(15);
  const [instructions, setInstructions] = useState('Take after food with plenty of water');

  // Lab Orders
  const [labOrders, setLabOrders] = useState<LabOrderItem[]>([]);
  const [newLabTest, setNewLabTest] = useState('Malaria Rapid Test (RDT)');
  const [newSpecimen, setNewSpecimen] = useState('Capillary Blood');

  // Billing summary
  const [consultationFee, setConsultationFee] = useState(2.00);
  const [paymentStatus, setPaymentStatus] = useState<'paid' | 'exempt' | 'pending'>('paid');

  // Draft auto-save indicator
  const [draftSavedTime, setDraftSavedTime] = useState<string | null>(null);

  useEffect(() => {
    loadPrerequisites();
  }, [initialPatientId]);

  const loadPrerequisites = async () => {
    const p = await localDb.patients.toArray();
    setPatients(p.filter(item => !item.isDeleted));
    if (initialPatientId) setSelectedPatientId(initialPatientId);
    else if (p.length > 0 && !selectedPatientId) setSelectedPatientId(p[0].id);

    const m = await localDb.medicines.toArray();
    setMedicines(m);
    if (m.length > 0) setSelectedMedId(m[0].id);

    // Check for existing local draft
    const savedDraft = localStorage.getItem('medflow_active_consultation_draft');
    if (savedDraft) {
      try {
        const parsed = JSON.parse(savedDraft);
        if (parsed.chiefComplaint) setChiefComplaint(parsed.chiefComplaint);
        if (parsed.examinationNotes) setExaminationNotes(parsed.examinationNotes);
        if (parsed.treatmentPlan) setTreatmentPlan(parsed.treatmentPlan);
        setDraftSavedTime('Restored from offline draft cache');
      } catch {
        // Safe fallback
      }
    }
  };

  // Auto-save draft locally on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => {
      const draft = {
        selectedPatientId,
        chiefComplaint,
        examinationNotes,
        treatmentPlan,
        clinicalNotes,
        updatedAt: new Date().toISOString()
      };
      localStorage.setItem('medflow_active_consultation_draft', JSON.stringify(draft));
      setDraftSavedTime(`Draft saved locally at ${new Date().toLocaleTimeString()}`);
    }, 1200);

    return () => clearTimeout(timer);
  }, [selectedPatientId, chiefComplaint, examinationNotes, treatmentPlan, clinicalNotes]);

  const currentPatient = patients.find(p => p.id === selectedPatientId);

  // Add ICD-10 diagnosis
  const handleAddDiagnosis = (code: string, desc: string) => {
    if (diagnoses.some(d => d.code === code)) return;
    setDiagnoses([...diagnoses, { code, description: desc, isPrimary: diagnoses.length === 0, confirmed: true }]);
  };

  const handleRemoveDiagnosis = (index: number) => {
    setDiagnoses(diagnoses.filter((_, i) => i !== index));
  };

  // Add Prescription
  const handleAddPrescription = () => {
    const med = medicines.find(m => m.id === selectedMedId);
    if (!med) return;

    // Allergy check warning!
    if (currentPatient?.allergies && currentPatient.allergies.length > 0) {
      const hasAllergy = currentPatient.allergies.some(a =>
        med.genericName.toLowerCase().includes(a.allergen.toLowerCase()) ||
        med.brandName.toLowerCase().includes(a.allergen.toLowerCase())
      );
      if (hasAllergy) {
        if (!confirm(`CONTRAINDICATION WARNING: Patient is documented allergic to ${currentPatient.allergies[0].allergen}! Do you still want to prescribe this medication?`)) {
          return;
        }
      }
    }

    const newRx: PrescriptionItem = {
      id: generateUUID(),
      medicineId: med.id,
      medicineName: `${med.brandName} (${med.genericName})`,
      dosage,
      frequency,
      durationDays: Number(durationDays),
      quantity: Number(rxQuantity),
      instructions,
      dispensedStatus: 'pending'
    };

    setPrescriptions([...prescriptions, newRx]);
    showToast(`Added ${med.brandName} to prescription plan`, 'info');
  };

  const handleRemovePrescription = (id: string) => {
    setPrescriptions(prescriptions.filter(p => p.id !== id));
  };

  // Add Lab Order
  const handleAddLab = () => {
    const order: LabOrderItem = {
      id: generateUUID(),
      testName: newLabTest,
      specimen: newSpecimen,
      status: 'ordered',
      urgency: 'routine',
      orderedAt: new Date().toISOString(),
      orderedBy: currentUser.name
    };
    setLabOrders([...labOrders, order]);
  };

  const handleRemoveLab = (id: string) => {
    setLabOrders(labOrders.filter(l => l.id !== id));
  };

  // Save Complete Encounter to IndexedDB + Outbox
  const handleSaveEncounter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPatient) {
      showToast('Please select a patient first', 'warning');
      return;
    }

    const newEncounterId = generateUUID();
    const now = new Date().toISOString();

    const bmi = heightCm > 0 ? Number(((weightKg / (heightCm / 100) ** 2)).toFixed(1)) : 22.0;
    const triageCategory: VitalSigns['triageCategory'] =
      systolic >= 160 || tempC >= 39.0 ? 'Orange' : systolic >= 140 || tempC >= 38.0 ? 'Yellow' : 'Green';

    const vitals: VitalSigns = {
      systolicBp: Number(systolic),
      diastolicBp: Number(diastolic),
      heartRate: Number(heartRate),
      respRate: Number(respRate),
      tempC: Number(tempC),
      spo2: Number(spo2),
      weightKg: Number(weightKg),
      heightCm: Number(heightCm),
      bmi,
      painScore: Number(painScore),
      triageCategory,
      recordedBy: currentUser.name,
      recordedAt: now
    };

    const newEncounter: Encounter = {
      id: newEncounterId,
      patientId: currentPatient.id,
      patientNumber: currentPatient.patientNumber,
      patientName: currentPatient.fullName,
      facilityId,
      facilityName,
      clinicianId: currentUser.id,
      clinicianName: currentUser.name,
      encounterType,
      chiefComplaint: chiefComplaint.trim() || 'Clinical evaluation',
      symptoms: symptomsInput.split(',').map(s => s.trim()).filter(Boolean),
      vitals,
      examinationNotes: examinationNotes.trim(),
      diagnoses,
      treatmentPlan: treatmentPlan.trim(),
      clinicalNotes: clinicalNotes.trim(),
      prescriptions,
      labOrders,
      billingSummary: {
        consultationFee,
        medicationFee: prescriptions.reduce((acc, rx) => acc + (rx.quantity * 0.1), 0),
        totalAmount: consultationFee + prescriptions.reduce((acc, rx) => acc + (rx.quantity * 0.1), 0),
        paymentStatus,
        receiptNumber: `REC-${Date.now().toString(36).toUpperCase()}`
      },
      version: 1,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending'
    };

    // Transactional write: encounter + outbox
    await syncEngine.commitLocalOperation(
      'encounter',
      newEncounterId,
      'CREATE',
      newEncounter,
      {
        userId: currentUser.id,
        userName: currentUser.name,
        userRole: currentUser.role,
        action: 'CREATE_CLINICAL_ENCOUNTER',
        details: `Recorded ${encounterType} consultation for ${currentPatient.fullName} (${currentPatient.patientNumber}) with ${diagnoses.length} diagnoses.`
      }
    );

    // If queue item provided, move it to Pharmacy or Completed
    if (queueItemId) {
      const q = await localDb.queue.get(queueItemId);
      if (q) {
        q.stage = prescriptions.length > 0 ? 'Pharmacy' : 'Completed';
        q.status = prescriptions.length > 0 ? 'active' : 'completed';
        await localDb.queue.put(q);
      }
    }

    // Clear local draft cache
    localStorage.removeItem('medflow_active_consultation_draft');

    showToast(`Consultation saved locally in IndexedDB! Outbox will sync when online.`, 'success');
    onEncounterSaved();
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Header Card */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white dark:bg-slate-850 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Stethoscope className="w-5 h-5 text-teal-600" />
            <span>Clinical Consultation &amp; Prescriptions</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Author: <strong className="text-slate-700 dark:text-slate-200">{currentUser.name} ({currentUser.title})</strong> • Facility: {facilityName}
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs">
          {draftSavedTime && (
            <span className="text-slate-400 font-mono text-[11px] hidden md:inline">
              {draftSavedTime}
            </span>
          )}
        </div>
      </div>

      <form onSubmit={handleSaveEncounter} className="space-y-6">
        {/* Patient Selection & Allergy Banner */}
        <div className="bg-white dark:bg-slate-850 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-xs space-y-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="w-full sm:w-1/2">
              <label className="block font-semibold text-xs text-slate-700 dark:text-slate-300 mb-1">
                Select Patient for Consultation
              </label>
              <select
                required
                value={selectedPatientId}
                onChange={(e) => setSelectedPatientId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-900 dark:text-white"
              >
                {patients.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.fullName} ({p.patientNumber}) - Born {p.dateOfBirth} - {p.sex}
                  </option>
                ))}
              </select>
            </div>

            <div className="w-full sm:w-1/3">
              <label className="block font-semibold text-xs text-slate-700 dark:text-slate-300 mb-1">
                Encounter Type
              </label>
              <select
                value={encounterType}
                onChange={(e) => setEncounterType(e.target.value as any)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-medium"
              >
                <option value="Outpatient">Outpatient Consultation</option>
                <option value="Antenatal">Antenatal Care (ANC)</option>
                <option value="Emergency">Emergency Evaluation</option>
                <option value="Follow-up">Chronic Care Follow-Up</option>
                <option value="Pediatric">Pediatric Evaluation</option>
              </select>
            </div>
          </div>

          {/* Active Allergy Alert */}
          {currentPatient && currentPatient.allergies && currentPatient.allergies.length > 0 && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 rounded-lg border border-rose-200 dark:border-rose-900 flex items-start gap-2.5 text-xs text-rose-900 dark:text-rose-200">
              <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">ALLERGY WARNING: </span>
                {currentPatient.allergies.map((a, i) => (
                  <span key={i} className="font-semibold underline mr-2">
                    {a.allergen} ({a.severity}): {a.reaction}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Section 1: Chief Complaint & Symptoms */}
        <div className="bg-white dark:bg-slate-850 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-xs space-y-3">
          <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
            <FileText className="w-4 h-4 text-teal-600" />
            <span>Chief Complaint &amp; Presenting Symptoms</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Chief Complaint <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. High fever for 4 days, shivering, joint pains"
                value={chiefComplaint}
                onChange={(e) => setChiefComplaint(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Associated Symptoms (comma separated)
              </label>
              <input
                type="text"
                placeholder="e.g. Nausea, headache, anorexia, chills"
                value={symptomsInput}
                onChange={(e) => setSymptomsInput(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Vital Signs Grid */}
        <div className="bg-white dark:bg-slate-850 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <Thermometer className="w-4 h-4 text-teal-600" />
              <span>Vital Signs &amp; Anthropometrics</span>
            </h3>
            <span className="text-xs text-slate-400">
              BMI: <strong>{heightCm > 0 ? ((weightKg / (heightCm / 100) ** 2)).toFixed(1) : '22.0'}</strong> kg/m²
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5 text-xs">
            <div>
              <label className="block text-slate-500 text-[11px] mb-0.5">BP Systolic</label>
              <input
                type="number"
                value={systolic}
                onChange={(e) => setSystolic(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md font-bold text-center"
              />
            </div>
            <div>
              <label className="block text-slate-500 text-[11px] mb-0.5">BP Diastolic</label>
              <input
                type="number"
                value={diastolic}
                onChange={(e) => setDiastolic(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md font-bold text-center"
              />
            </div>
            <div>
              <label className="block text-slate-500 text-[11px] mb-0.5">Heart Rate</label>
              <input
                type="number"
                value={heartRate}
                onChange={(e) => setHeartRate(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md font-bold text-center"
              />
            </div>
            <div>
              <label className="block text-slate-500 text-[11px] mb-0.5">Resp Rate</label>
              <input
                type="number"
                value={respRate}
                onChange={(e) => setRespRate(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md font-bold text-center"
              />
            </div>
            <div>
              <label className="block text-slate-500 text-[11px] mb-0.5">Temp (°C)</label>
              <input
                type="number"
                step="0.1"
                value={tempC}
                onChange={(e) => setTempC(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md font-bold text-center text-teal-600"
              />
            </div>
            <div>
              <label className="block text-slate-500 text-[11px] mb-0.5">SpO2 (%)</label>
              <input
                type="number"
                value={spo2}
                onChange={(e) => setSpo2(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md font-bold text-center text-emerald-600"
              />
            </div>
            <div>
              <label className="block text-slate-500 text-[11px] mb-0.5">Weight (kg)</label>
              <input
                type="number"
                value={weightKg}
                onChange={(e) => setWeightKg(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md font-bold text-center"
              />
            </div>
            <div>
              <label className="block text-slate-500 text-[11px] mb-0.5">Height (cm)</label>
              <input
                type="number"
                value={heightCm}
                onChange={(e) => setHeightCm(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md font-bold text-center"
              />
            </div>
          </div>
        </div>

        {/* Section 3: Physical Examination & ICD-10 Diagnoses */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Physical Examination */}
          <div className="bg-white dark:bg-slate-850 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-xs space-y-3">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">Physical Examination Findings</h3>
            <textarea
              rows={4}
              placeholder="General appearance: Pale, febrile, no dehydration. Chest: Clear vesicular breath sounds. Abdomen: Soft, non-tender, mild splenomegaly..."
              value={examinationNotes}
              onChange={(e) => setExaminationNotes(e.target.value)}
              className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs leading-relaxed"
            />
          </div>

          {/* ICD-10 Diagnoses */}
          <div className="bg-white dark:bg-slate-850 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">ICD-10 Diagnoses</h3>
              <span className="text-[11px] text-slate-400">Quick-select district codes</span>
            </div>

            {/* Quick picker pills */}
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
              {COMMON_ICD10.map((d) => (
                <button
                  key={d.code}
                  type="button"
                  onClick={() => handleAddDiagnosis(d.code, d.desc)}
                  className="px-2 py-1 rounded-md bg-slate-100 hover:bg-teal-50 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-[10px] text-left transition cursor-pointer"
                >
                  <strong className="text-teal-700 dark:text-teal-400 font-mono">[{d.code}]</strong> {d.desc.slice(0, 24)}...
                </button>
              ))}
            </div>

            {/* Selected Diagnoses */}
            <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
              {diagnoses.map((d, index) => (
                <div key={index} className="flex items-center justify-between p-2 rounded-md bg-teal-50/60 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-900 text-xs">
                  <div>
                    <span className="font-mono font-bold text-teal-800 dark:text-teal-300 mr-2">[{d.code}]</span>
                    <span className="text-slate-800 dark:text-slate-200">{d.description}</span>
                    {d.isPrimary && <span className="ml-2 text-[10px] font-bold text-teal-600">(Primary)</span>}
                  </div>
                  <button type="button" onClick={() => handleRemoveDiagnosis(index)} className="text-rose-500 hover:text-rose-700">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Section 4: Pharmacy Prescriptions Builder */}
        <div className="bg-white dark:bg-slate-850 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <Pill className="w-4 h-4 text-teal-600" />
              <span>Offline Prescription Order (Linked to Clinic Formulary)</span>
            </h3>
            <span className="text-xs text-slate-500">
              Dispensed at Clinic Pharmacy with inventory deduction
            </span>
          </div>

          {/* Add Prescription Form */}
          <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 space-y-3 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-semibold mb-1">Medicine from Stock</label>
                <select
                  value={selectedMedId}
                  onChange={(e) => setSelectedMedId(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-medium"
                >
                  {medicines.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.brandName} - {m.genericName} (Stock: {m.currentQuantity} {m.unit})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold mb-1">Dosage &amp; Frequency</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={dosage}
                    onChange={(e) => setDosage(e.target.value)}
                    placeholder="Dosage"
                    className="w-1/2 px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
                  />
                  <input
                    type="text"
                    value={frequency}
                    onChange={(e) => setFrequency(e.target.value)}
                    placeholder="Frequency"
                    className="w-1/2 px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1">Duration &amp; Total Quantity</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={durationDays}
                    onChange={(e) => setDurationDays(Number(e.target.value))}
                    className="w-1/2 px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
                    placeholder="Days"
                  />
                  <input
                    type="number"
                    value={rxQuantity}
                    onChange={(e) => setRxQuantity(Number(e.target.value))}
                    className="w-1/2 px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md font-bold"
                    placeholder="Qty"
                  />
                  <button
                    type="button"
                    onClick={handleAddPrescription}
                    className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-md font-semibold shrink-0 cursor-pointer"
                  >
                    Add Rx
                  </button>
                </div>
              </div>
            </div>

            <div>
              <label className="block font-semibold mb-1">Patient Instructions</label>
              <input
                type="text"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="e.g. Complete 3-day course, finish all tablets even if feeling better"
                className="w-full px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
              />
            </div>
          </div>

          {/* Prescriptions List */}
          {prescriptions.length > 0 && (
            <div className="space-y-2">
              {prescriptions.map((p) => (
                <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-xs">
                  <div>
                    <div className="font-bold text-slate-900 dark:text-white">{p.medicineName}</div>
                    <div className="text-slate-600 dark:text-slate-400">
                      {p.dosage} • {p.frequency} • {p.durationDays} days • Qty: <strong>{p.quantity}</strong>
                    </div>
                    <div className="text-[11px] text-teal-600 dark:text-teal-400 italic">{p.instructions}</div>
                  </div>
                  <button type="button" onClick={() => handleRemovePrescription(p.id)} className="text-rose-500 hover:text-rose-700">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Section 5: Treatment Plan & Diagnostic Lab Tests */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-slate-850 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-xs space-y-3">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">Management &amp; Treatment Plan</h3>
            <textarea
              rows={3}
              placeholder="e.g. Oral antimalarial ACT commenced. Advised bed rest, hydration with ORS. Return immediately if persistent vomiting or dark urine..."
              value={treatmentPlan}
              onChange={(e) => setTreatmentPlan(e.target.value)}
              className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs leading-relaxed"
            />
          </div>

          <div className="bg-white dark:bg-slate-850 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                <FlaskConical className="w-4 h-4 text-teal-600" />
                <span>Laboratory Investigations</span>
              </h3>
            </div>

            <div className="flex gap-2 text-xs">
              <select
                value={newLabTest}
                onChange={(e) => setNewLabTest(e.target.value)}
                className="w-2/3 px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md"
              >
                <option value="Malaria Rapid Test (RDT)">Malaria Rapid Test (RDT)</option>
                <option value="Urinalysis Dipstick">Urinalysis Dipstick 10-Para</option>
                <option value="Blood Glucose (Capillary)">Random Blood Glucose</option>
                <option value="Hemoglobin (Hb)">Hemoglobin Point-of-Care</option>
                <option value="HIV 1/2 Rapid Antibody">HIV 1/2 Rapid Antibody</option>
                <option value="Syphilis RPR/VDRL">Syphilis RPR/VDRL</option>
              </select>

              <button
                type="button"
                onClick={handleAddLab}
                className="w-1/3 px-2 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-md font-semibold text-xs cursor-pointer"
              >
                Order Test
              </button>
            </div>

            {labOrders.length > 0 && (
              <div className="space-y-1.5 pt-1">
                {labOrders.map(l => (
                  <div key={l.id} className="flex items-center justify-between p-2 rounded-md bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs">
                    <span>{l.testName} ({l.specimen})</span>
                    <button type="button" onClick={() => handleRemoveLab(l.id)} className="text-rose-500 hover:text-rose-700">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Submit Bar with Store-and-Forward Outbox Guarantee */}
        <div className="p-4 bg-white dark:bg-slate-850 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-xs text-slate-500 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              <strong>Guaranteed Local Commit:</strong> Consultation will write atomically to IndexedDB on this device and await synchronization safely in Outbox.
            </span>
          </div>

          <button
            type="submit"
            className="w-full sm:w-auto px-6 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-bold text-sm rounded-xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>Save Consultation to Local Database</span>
          </button>
        </div>
      </form>
    </div>
  );
};
