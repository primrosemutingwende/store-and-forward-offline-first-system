import React, { useState, useEffect } from 'react';
import {
  Search,
  UserPlus,
  Users,
  AlertCircle,
  CheckCircle,
  FileText,
  Clock,
  Phone,
  MapPin,
  Calendar,
  Heart,
  GitMerge,
  Filter,
  ArrowRight,
  ShieldAlert,
  Plus,
  Trash2,
  Inbox
} from 'lucide-react';
import { localDb } from '../offline/db';
import { syncEngine } from '../offline/syncEngine';
import { useClinic } from '../context/ClinicContext';
import { generateUUID, generatePatientNumber, getSoundex, levenshteinDistance } from '../utils/id';
import type { Patient, AllergyItem, Encounter } from '../types/clinic';

interface PatientRegistryProps {
  onSelectPatientForConsultation: (patient: Patient) => void;
  onCheckInPatient: (patient: Patient) => void;
}

export const PatientRegistry: React.FC<PatientRegistryProps> = ({
  onSelectPatientForConsultation,
  onCheckInPatient
}) => {
  const { currentUser, showToast, facilityId } = useClinic();

  const [patients, setPatients] = useState<Patient[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [patientEncounters, setPatientEncounters] = useState<Encounter[]>([]);
  const [loading, setLoading] = useState(true);

  // Registration Modal State
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [fullName, setFullName] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [sex, setSex] = useState<'Male' | 'Female' | 'Other'>('Female');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [bloodGroup, setBloodGroup] = useState<Patient['bloodGroup']>('Unknown');
  const [chronicConditions, setChronicConditions] = useState<string>('');
  const [medicalHistory, setMedicalHistory] = useState<string>('');
  const [allergies, setAllergies] = useState<AllergyItem[]>([]);
  const [newAllergen, setNewAllergen] = useState('');
  const [newSeverity, setNewSeverity] = useState<'mild' | 'moderate' | 'severe' | 'life-threatening'>('moderate');
  const [newReaction, setNewReaction] = useState('');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyRelation, setEmergencyRelation] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');

  // Duplicate Detection warnings
  const [duplicateWarning, setDuplicateWarning] = useState<Patient | null>(null);

  // Merge Modal State
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [secondaryPatient, setSecondaryPatient] = useState<Patient | null>(null);

  useEffect(() => {
    loadPatients();
    const unsub = syncEngine.subscribe(loadPatients);
    return () => unsub();
  }, []);

  const loadPatients = async () => {
    try {
      const all = await localDb.patients.toArray();
      setPatients(all.filter(p => !p.isDeleted));
      if (selectedPatient) {
        const refreshed = all.find(p => p.id === selectedPatient.id);
        if (refreshed) setSelectedPatient(refreshed);
      }
    } finally {
      setLoading(false);
    }
  };

  const loadEncounters = async (patientId: string) => {
    const encs = await localDb.encounters.where('patientId').equals(patientId).toArray();
    setPatientEncounters(encs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
  };

  const handleSelectPatient = (patient: Patient) => {
    setSelectedPatient(patient);
    loadEncounters(patient.id);
  };

  // Real-time duplicate check during new patient registration
  const checkForDuplicates = (nameInput: string, dobInput: string, phoneInput: string) => {
    if (!nameInput || nameInput.trim().length < 3) {
      setDuplicateWarning(null);
      return;
    }

    const inputSoundex = getSoundex(nameInput);
    const found = patients.find(p => {
      // 1. Exact phone match
      if (phoneInput && p.phone && p.phone.replace(/\D/g, '') === phoneInput.replace(/\D/g, '')) {
        return true;
      }
      // 2. Soundex match on name + same DOB
      if (dobInput && p.dateOfBirth === dobInput && getSoundex(p.fullName) === inputSoundex) {
        return true;
      }
      // 3. Very low Levenshtein distance (e.g. typo in name)
      if (levenshteinDistance(p.fullName, nameInput) <= 2) {
        return true;
      }
      return false;
    });

    setDuplicateWarning(found || null);
  };

  const handleAddAllergy = () => {
    if (!newAllergen.trim()) return;
    setAllergies([...allergies, { allergen: newAllergen.trim(), severity: newSeverity, reaction: newReaction.trim() }]);
    setNewAllergen('');
    setNewReaction('');
  };

  const handleRemoveAllergy = (index: number) => {
    setAllergies(allergies.filter((_, i) => i !== index));
  };

  const handleRegisterPatient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) return;

    const newId = generateUUID();
    const patientNumber = generatePatientNumber('CLN');
    const now = new Date().toISOString();

    const newPatient: Patient = {
      id: newId,
      facilityId,
      patientNumber,
      fullName: fullName.trim(),
      nationalId: nationalId.trim() || undefined,
      dateOfBirth,
      sex,
      phone: phone.trim(),
      address: address.trim(),
      bloodGroup,
      allergies,
      chronicConditions: chronicConditions.split(',').map(s => s.trim()).filter(Boolean),
      medicalHistory: medicalHistory.trim(),
      emergencyContact: {
        name: emergencyName.trim(),
        relationship: emergencyRelation.trim(),
        phone: emergencyPhone.trim()
      },
      version: 1,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending'
    };

    // Commit to IndexedDB + Outbox transactionally!
    await syncEngine.commitLocalOperation(
      'patient',
      newId,
      'CREATE',
      newPatient,
      {
        userId: currentUser.id,
        userName: currentUser.name,
        userRole: currentUser.role,
        action: 'REGISTER_PATIENT',
        details: `Registered new patient ${newPatient.fullName} (${patientNumber}) offline.`
      }
    );

    showToast(`Patient ${newPatient.fullName} saved locally in IndexedDB (Outbox: queued)`, 'success');

    // Reset Form
    setShowRegisterModal(false);
    resetForm();
    await loadPatients();
    handleSelectPatient(newPatient);
  };

  const resetForm = () => {
    setFullName('');
    setNationalId('');
    setDateOfBirth('');
    setSex('Female');
    setPhone('');
    setAddress('');
    setBloodGroup('Unknown');
    setChronicConditions('');
    setMedicalHistory('');
    setAllergies([]);
    setDuplicateWarning(null);
  };

  // Merge Duplicate Patients Workflow
  const handleMergePatients = async () => {
    if (!selectedPatient || !secondaryPatient) return;

    // Combine allergies uniquely
    const mergedAllergies = [...selectedPatient.allergies];
    for (const a of secondaryPatient.allergies) {
      if (!mergedAllergies.some(m => m.allergen.toLowerCase() === a.allergen.toLowerCase())) {
        mergedAllergies.push(a);
      }
    }

    const mergedPatient: Patient = {
      ...selectedPatient,
      allergies: mergedAllergies,
      medicalHistory: `${selectedPatient.medicalHistory || ''}\n[Merged Record from ${secondaryPatient.patientNumber}]: ${secondaryPatient.medicalHistory || 'None'}`,
      version: (selectedPatient.version || 1) + 1,
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending'
    };

    // Update primary patient
    await syncEngine.commitLocalOperation(
      'patient',
      selectedPatient.id,
      'UPDATE',
      mergedPatient,
      {
        userId: currentUser.id,
        userName: currentUser.name,
        userRole: currentUser.role,
        action: 'MERGE_PATIENTS_PRIMARY',
        details: `Merged patient ${secondaryPatient.patientNumber} into primary ${selectedPatient.patientNumber}`
      }
    );

    // Mark secondary patient as deleted/merged
    const secondaryDeleted: Patient = {
      ...secondaryPatient,
      isDeleted: true,
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending'
    };
    await syncEngine.commitLocalOperation(
      'patient',
      secondaryPatient.id,
      'UPDATE',
      secondaryDeleted,
      {
        userId: currentUser.id,
        userName: currentUser.name,
        userRole: currentUser.role,
        action: 'MERGE_PATIENTS_SECONDARY_ARCHIVED',
        details: `Archived duplicate patient ${secondaryPatient.patientNumber} merged into ${selectedPatient.patientNumber}`
      }
    );

    // Re-point any encounters from secondary to primary
    const secondaryEncs = await localDb.encounters.where('patientId').equals(secondaryPatient.id).toArray();
    for (const enc of secondaryEncs) {
      enc.patientId = selectedPatient.id;
      enc.patientNumber = selectedPatient.patientNumber;
      enc.patientName = selectedPatient.fullName;
      await localDb.encounters.put(enc);
    }

    showToast(`Successfully merged ${secondaryPatient.fullName} into ${selectedPatient.fullName}.`, 'success');
    setShowMergeModal(false);
    setSecondaryPatient(null);
    await loadPatients();
  };

  // Filtered patients
  const filteredPatients = patients.filter(p => {
    const q = searchTerm.toLowerCase();
    return (
      p.fullName.toLowerCase().includes(q) ||
      p.patientNumber.toLowerCase().includes(q) ||
      (p.phone && p.phone.includes(q)) ||
      (p.nationalId && p.nationalId.toLowerCase().includes(q))
    );
  });

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Banner and Search Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white dark:bg-slate-850 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-teal-600" />
            <span>Patient Registry &amp; Identity Matching</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {patients.length} patients registered locally in offline IndexedDB. Zero central server dependency for lookups.
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by name, ID, phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs focus:outline-hidden focus:ring-2 focus:ring-teal-500 text-slate-800 dark:text-slate-200"
            />
          </div>

          <button
            onClick={() => {
              resetForm();
              setShowRegisterModal(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-lg shadow-xs transition shrink-0 cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Register Offline</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Patients List + Detailed Patient Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Patient List */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 px-1">
            <span>Showing {filteredPatients.length} Patients</span>
            <span>Sorted by Recent Activity</span>
          </div>

          <div className="space-y-2.5 max-h-[calc(100vh-270px)] overflow-y-auto pr-1">
            {filteredPatients.length === 0 ? (
              <div className="text-center py-12 bg-white dark:bg-slate-850 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-6">
                <Users className="w-10 h-10 text-slate-400 mx-auto mb-2 opacity-50" />
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No patients matched search</p>
                <p className="text-xs text-slate-400 mt-1">Register a new patient even while offline</p>
              </div>
            ) : (
              filteredPatients.map((patient) => {
                const isSelected = selectedPatient?.id === patient.id;
                return (
                  <div
                    key={patient.id}
                    onClick={() => handleSelectPatient(patient)}
                    className={`p-3.5 rounded-xl border text-xs cursor-pointer transition ${
                      isSelected
                        ? 'bg-teal-50/70 dark:bg-teal-950/40 border-teal-500 shadow-xs'
                        : 'bg-white dark:bg-slate-850 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-xs'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div>
                        <div className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                          {patient.fullName}
                          {patient.syncStatus === 'synced' && (
                            <span className="w-2 h-2 rounded-full bg-emerald-500" title="Synchronized with Central Cloud" />
                          )}
                          {patient.syncStatus === 'pending' && (
                            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" title="Saved locally, pending synchronization" />
                          )}
                          {patient.syncStatus === 'conflict' && (
                            <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" title="Concurrent edit conflict" />
                          )}
                        </div>
                        <div className="text-[11px] font-mono text-teal-600 dark:text-teal-400 font-semibold">
                          {patient.patientNumber}
                        </div>
                      </div>

                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        {patient.sex}, {patient.dateOfBirth ? `${new Date().getFullYear() - new Date(patient.dateOfBirth).getFullYear()}y` : 'Age N/A'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-1 text-[11px] text-slate-500 dark:text-slate-400 mt-2">
                      <div className="flex items-center gap-1 truncate">
                        <Phone className="w-3 h-3 text-slate-400" />
                        <span>{patient.phone || 'No phone'}</span>
                      </div>
                      <div className="flex items-center gap-1 truncate">
                        <MapPin className="w-3 h-3 text-slate-400" />
                        <span className="truncate">{patient.address || 'Rural Area'}</span>
                      </div>
                    </div>

                    {/* Allergies tag preview */}
                    {patient.allergies && patient.allergies.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {patient.allergies.map((a, i) => (
                          <span
                            key={i}
                            className="px-1.5 py-0.5 rounded-xs bg-rose-100 dark:bg-rose-950/70 text-rose-800 dark:text-rose-300 text-[10px] font-semibold border border-rose-200 dark:border-rose-900 flex items-center gap-1"
                          >
                            <ShieldAlert className="w-2.5 h-2.5" />
                            {a.allergen} ({a.severity})
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Detailed Patient Record & Encounter History */}
        <div className="lg:col-span-7">
          {selectedPatient ? (
            <div className="bg-white dark:bg-slate-850 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-5">
              {/* Top Header Card */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                      {selectedPatient.fullName}
                    </h3>
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-mono bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 font-semibold">
                      {selectedPatient.patientNumber}
                    </span>
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider ${
                      selectedPatient.syncStatus === 'synced'
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                        : selectedPatient.syncStatus === 'pending'
                        ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                        : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                    }`}>
                      {selectedPatient.syncStatus === 'synced' ? '✓ Synced Central' : '⏳ Outbox Pending'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    National ID: {selectedPatient.nationalId || 'Not provided'} • Blood Group: <strong className="text-slate-700 dark:text-slate-200">{selectedPatient.bloodGroup}</strong> • Revision: v{selectedPatient.version}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => onCheckInPatient(selectedPatient)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-semibold shadow-xs transition cursor-pointer"
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>Check-In to Queue</span>
                  </button>

                  <button
                    onClick={() => onSelectPatientForConsultation(selectedPatient)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-semibold shadow-xs transition cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Start Consultation</span>
                  </button>
                </div>
              </div>

              {/* Patient Core Summary Tabs / Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                {/* Demographics & Contact */}
                <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
                  <h4 className="font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-teal-600" />
                    <span>Demographics &amp; Contact</span>
                  </h4>
                  <div className="space-y-1 text-slate-600 dark:text-slate-400">
                    <div><strong>Date of Birth:</strong> {selectedPatient.dateOfBirth} ({new Date().getFullYear() - new Date(selectedPatient.dateOfBirth).getFullYear()} years old)</div>
                    <div><strong>Sex:</strong> {selectedPatient.sex}</div>
                    <div><strong>Phone:</strong> {selectedPatient.phone || 'None'}</div>
                    <div><strong>Address:</strong> {selectedPatient.address || 'Rural stand'}</div>
                    <div><strong>Emergency Contact:</strong> {selectedPatient.emergencyContact?.name} ({selectedPatient.emergencyContact?.relationship}) - {selectedPatient.emergencyContact?.phone}</div>
                  </div>
                </div>

                {/* Allergies & Conditions */}
                <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                      <ShieldAlert className="w-3.5 h-3.5 text-rose-500" />
                      <span>Known Allergies &amp; Chronic Illness</span>
                    </h4>
                    <button
                      onClick={() => setShowMergeModal(true)}
                      className="text-[10px] text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-1 font-medium cursor-pointer"
                    >
                      <GitMerge className="w-3 h-3" />
                      <span>Merge Duplicate</span>
                    </button>
                  </div>

                  {selectedPatient.allergies && selectedPatient.allergies.length > 0 ? (
                    <div className="space-y-1">
                      {selectedPatient.allergies.map((allg, idx) => (
                        <div key={idx} className="p-1.5 rounded-sm bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-900 dark:text-rose-200">
                          <span className="font-bold">{allg.allergen}</span> ({allg.severity}): {allg.reaction}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-500 dark:text-slate-400 italic">No known drug allergies recorded.</p>
                  )}

                  {selectedPatient.chronicConditions && selectedPatient.chronicConditions.length > 0 && (
                    <div className="pt-1">
                      <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">Chronic Conditions: </span>
                      <span className="text-slate-600 dark:text-slate-400">{selectedPatient.chronicConditions.join(', ')}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Medical History Narrative */}
              {selectedPatient.medicalHistory && (
                <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs">
                  <h4 className="font-semibold text-slate-700 dark:text-slate-200 mb-1">Baseline Medical History</h4>
                  <p className="text-slate-600 dark:text-slate-300 whitespace-pre-line leading-relaxed">
                    {selectedPatient.medicalHistory}
                  </p>
                </div>
              )}

              {/* Past Encounters & Consultations Timeline */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <FileText className="w-4 h-4 text-teal-600" />
                    <span>Clinical Encounter History ({patientEncounters.length})</span>
                  </h4>
                  <span className="text-xs text-slate-400">Offline-available electronic record</span>
                </div>

                {patientEncounters.length === 0 ? (
                  <div className="text-center py-6 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg p-4">
                    <p className="text-xs text-slate-500">No previous consultations recorded for this patient yet.</p>
                    <button
                      onClick={() => onSelectPatientForConsultation(selectedPatient)}
                      className="mt-2 text-xs font-semibold text-teal-600 hover:underline"
                    >
                      Record First Clinical Consultation →
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {patientEncounters.map((enc) => (
                      <div
                        key={enc.id}
                        className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 text-xs space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-800 dark:text-slate-200">
                              {enc.encounterType} Encounter
                            </span>
                            <span className="text-slate-500">•</span>
                            <span className="text-slate-500 font-mono">
                              {new Date(enc.createdAt).toLocaleDateString()} {new Date(enc.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <span className="text-slate-600 dark:text-slate-400 font-medium">
                            {enc.clinicianName}
                          </span>
                        </div>

                        {/* Chief Complaint */}
                        <div className="text-slate-700 dark:text-slate-300">
                          <strong className="text-slate-900 dark:text-white">Chief Complaint: </strong>
                          {enc.chiefComplaint}
                        </div>

                        {/* Vitals Summary Pill */}
                        {enc.vitals && (
                          <div className="flex flex-wrap gap-2 text-[11px] bg-white dark:bg-slate-800 p-2 rounded-md border border-slate-200 dark:border-slate-700">
                            <span>BP: <strong>{enc.vitals.systolicBp}/{enc.vitals.diastolicBp}</strong> mmHg</span>
                            <span>HR: <strong>{enc.vitals.heartRate}</strong> bpm</span>
                            <span>Temp: <strong>{enc.vitals.tempC}</strong> °C</span>
                            <span>SpO2: <strong>{enc.vitals.spo2}</strong>%</span>
                            <span>BMI: <strong>{enc.vitals.bmi}</strong></span>
                            <span className="ml-auto font-bold text-teal-600">Triage: {enc.vitals.triageCategory}</span>
                          </div>
                        )}

                        {/* Diagnoses */}
                        {enc.diagnoses && enc.diagnoses.length > 0 && (
                          <div>
                            <strong className="text-slate-900 dark:text-white">Diagnoses: </strong>
                            {enc.diagnoses.map((d, i) => (
                              <span key={i} className="inline-block bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-300 px-1.5 py-0.5 rounded-sm text-[10px] mr-1 font-mono font-semibold">
                                [{d.code}] {d.description}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Prescriptions */}
                        {enc.prescriptions && enc.prescriptions.length > 0 && (
                          <div>
                            <strong className="text-slate-900 dark:text-white">Prescriptions: </strong>
                            <span className="text-slate-600 dark:text-slate-400">
                              {enc.prescriptions.map(p => `${p.medicineName} (${p.dosage} - ${p.frequency})`).join(', ')}
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-12 bg-white dark:bg-slate-850 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center">
              <Users className="w-12 h-12 text-slate-300 dark:text-slate-600 mb-3" />
              <h3 className="text-base font-semibold text-slate-700 dark:text-slate-300">No Patient Selected</h3>
              <p className="text-xs text-slate-400 max-w-sm mt-1">
                Select a patient from the list on the left to review demographics, allergies, and complete consultation history.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* MODAL: Offline Registration */}
      {showRegisterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-teal-600" />
                  <span>Register Patient Offline</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Assigns client-side UUID &amp; local patient number. Writes to IndexedDB outbox.
                </p>
              </div>
              <button
                onClick={() => setShowRegisterModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {/* DUPLICATE WARNING BANNER */}
            {duplicateWarning && (
              <div className="mt-4 p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs space-y-1">
                <div className="flex items-center gap-2 font-bold text-amber-800 dark:text-amber-300">
                  <AlertCircle className="w-4 h-4" />
                  <span>Potential Duplicate Patient Detected!</span>
                </div>
                <p>
                  A registered patient exists matching this identity: <strong>{duplicateWarning.fullName}</strong> ({duplicateWarning.patientNumber}), born {duplicateWarning.dateOfBirth}, Phone: {duplicateWarning.phone || 'None'}.
                </p>
                <div className="pt-1 flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowRegisterModal(false);
                      handleSelectPatient(duplicateWarning);
                    }}
                    className="px-2.5 py-1 bg-amber-600 text-white rounded-md text-[11px] font-semibold hover:bg-amber-700"
                  >
                    Open Existing Patient Record
                  </button>
                  <span className="text-[11px] text-amber-700 dark:text-amber-400 self-center">
                    or continue typing if this is a different individual.
                  </span>
                </div>
              </div>
            )}

            <form onSubmit={handleRegisterPatient} className="mt-4 space-y-4 text-xs">
              {/* Demographics Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Full Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Tendai Chikore"
                    value={fullName}
                    onChange={(e) => {
                      setFullName(e.target.value);
                      checkForDuplicates(e.target.value, dateOfBirth, phone);
                    }}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    National ID / Clinic Card No.
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 63-1284910-K-09"
                    value={nationalId}
                    onChange={(e) => setNationalId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {/* DOB, Sex, Blood Group */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Date of Birth <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={dateOfBirth}
                    onChange={(e) => {
                      setDateOfBirth(e.target.value);
                      checkForDuplicates(fullName, e.target.value, phone);
                    }}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Sex <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={sex}
                    onChange={(e) => setSex(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  >
                    <option value="Female">Female</option>
                    <option value="Male">Male</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Blood Group
                  </label>
                  <select
                    value={bloodGroup}
                    onChange={(e) => setBloodGroup(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  >
                    <option value="Unknown">Unknown</option>
                    <option value="O+">O+</option>
                    <option value="O-">O-</option>
                    <option value="A+">A+</option>
                    <option value="A-">A-</option>
                    <option value="B+">B+</option>
                    <option value="B-">B-</option>
                    <option value="AB+">AB+</option>
                    <option value="AB-">AB-</option>
                  </select>
                </div>
              </div>

              {/* Phone and Address */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    placeholder="e.g. +263 77 123 4567"
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value);
                      checkForDuplicates(fullName, dateOfBirth, e.target.value);
                    }}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Village / Residential Address
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Stand 12, Ward 4, Chipinge"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Allergies Builder */}
              <div className="p-3 bg-slate-50 dark:bg-slate-850 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="font-semibold text-slate-700 dark:text-slate-200 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 text-rose-500" />
                    <span>Allergies &amp; Drug Reactions</span>
                  </span>
                  <span className="text-[10px] text-slate-400">Critical for medication safety</span>
                </div>

                <div className="flex flex-wrap gap-2 items-center">
                  <input
                    type="text"
                    placeholder="Allergen (e.g. Penicillin)"
                    value={newAllergen}
                    onChange={(e) => setNewAllergen(e.target.value)}
                    className="px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md text-xs flex-1 min-w-[120px]"
                  />
                  <select
                    value={newSeverity}
                    onChange={(e) => setNewSeverity(e.target.value as any)}
                    className="px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md text-xs"
                  >
                    <option value="mild">Mild</option>
                    <option value="moderate">Moderate</option>
                    <option value="severe">Severe</option>
                    <option value="life-threatening">Life-threatening</option>
                  </select>
                  <input
                    type="text"
                    placeholder="Reaction (e.g. Rash / Shock)"
                    value={newReaction}
                    onChange={(e) => setNewReaction(e.target.value)}
                    className="px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md text-xs flex-1 min-w-[120px]"
                  />
                  <button
                    type="button"
                    onClick={handleAddAllergy}
                    className="px-2.5 py-1.5 bg-slate-800 dark:bg-slate-700 hover:bg-slate-700 text-white rounded-md text-xs font-semibold shrink-0 cursor-pointer"
                  >
                    Add
                  </button>
                </div>

                {allergies.length > 0 && (
                  <div className="space-y-1 pt-1">
                    {allergies.map((a, i) => (
                      <div key={i} className="flex items-center justify-between p-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md">
                        <span><strong>{a.allergen}</strong> ({a.severity}) - {a.reaction || 'No reaction notes'}</span>
                        <button type="button" onClick={() => handleRemoveAllergy(i)} className="text-rose-500 hover:text-rose-700">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Chronic Conditions & Baseline History */}
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Chronic Conditions (comma separated)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Hypertension, Type 2 Diabetes, Epilepsy"
                  value={chronicConditions}
                  onChange={(e) => setChronicConditions(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Medical History &amp; Baseline Notes
                </label>
                <textarea
                  rows={2}
                  placeholder="Prior surgeries, relevant family history, routine medications..."
                  value={medicalHistory}
                  onChange={(e) => setMedicalHistory(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>

              {/* Emergency Contact */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Emergency Contact Name
                  </label>
                  <input
                    type="text"
                    placeholder="Next of kin"
                    value={emergencyName}
                    onChange={(e) => setEmergencyName(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Relationship
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Spouse / Mother"
                    value={emergencyRelation}
                    onChange={(e) => setEmergencyRelation(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Contact Phone
                  </label>
                  <input
                    type="tel"
                    placeholder="Emergency Phone"
                    value={emergencyPhone}
                    onChange={(e) => setEmergencyPhone(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowRegisterModal(false)}
                  className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-semibold shadow-xs transition"
                >
                  Save Patient to Device Outbox
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Authorized Duplicate Merge Workflow */}
      {showMergeModal && selectedPatient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <GitMerge className="w-5 h-5 text-teal-600" />
                <span>Authorized Duplicate Patient Merge</span>
              </h3>
              <button onClick={() => setShowMergeModal(false)} className="text-slate-400 font-bold">✕</button>
            </div>

            <div className="mt-3 text-xs space-y-3">
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                You are merging another record into primary master record: <strong>{selectedPatient.fullName} ({selectedPatient.patientNumber})</strong>.
                All allergies will be combined and past clinical encounters will be safely reassigned.
              </p>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Select Duplicate Record to Merge In:
                </label>
                <select
                  value={secondaryPatient?.id || ''}
                  onChange={(e) => {
                    const found = patients.find(p => p.id === e.target.value);
                    setSecondaryPatient(found || null);
                  }}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                >
                  <option value="">-- Choose duplicate patient --</option>
                  {patients.filter(p => p.id !== selectedPatient.id).map(p => (
                    <option key={p.id} value={p.id}>
                      {p.fullName} ({p.patientNumber}) - Born {p.dateOfBirth} - Phone {p.phone || 'N/A'}
                    </option>
                  ))}
                </select>
              </div>

              {secondaryPatient && (
                <div className="p-3 bg-teal-50 dark:bg-teal-950/40 rounded-lg border border-teal-200 dark:border-teal-900 text-teal-900 dark:text-teal-200 space-y-1">
                  <div className="font-bold">Merge Preview:</div>
                  <div>• Primary: {selectedPatient.fullName} ({selectedPatient.patientNumber}) [Retained]</div>
                  <div>• Duplicate: {secondaryPatient.fullName} ({secondaryPatient.patientNumber}) [Archived]</div>
                  <div>• Combined Allergies count: {selectedPatient.allergies.length + secondaryPatient.allergies.length}</div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  onClick={() => setShowMergeModal(false)}
                  className="px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  disabled={!secondaryPatient}
                  onClick={handleMergePatients}
                  className="px-4 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-semibold disabled:opacity-50"
                >
                  Confirm &amp; Commit Merge
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
