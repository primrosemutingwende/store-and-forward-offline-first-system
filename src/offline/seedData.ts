import { localDb } from './db';
import type {
  ClinicUser,
  Patient,
  Encounter,
  MedicineStock,
  QueueItem
} from '../types/clinic';

export const INITIAL_STAFF: ClinicUser[] = [
  {
    id: 'USR-DOC-01',
    name: 'Dr. Tendai Moyo',
    role: 'clinician',
    title: 'Medical Officer',
    facilityId: 'FAC-CHIPINGE-RURAL-01',
    facilityName: 'Chipinge Rural Health Center',
    pin: '1234',
    avatarColor: 'bg-emerald-600'
  },
  {
    id: 'USR-NURSE-01',
    name: 'Sister Chipo Sithole',
    role: 'nurse',
    title: 'Senior Triage Nurse',
    facilityId: 'FAC-CHIPINGE-RURAL-01',
    facilityName: 'Chipinge Rural Health Center',
    pin: '1234',
    avatarColor: 'bg-teal-600'
  },
  {
    id: 'USR-PHARM-01',
    name: 'Farai Ndlovu',
    role: 'pharmacist',
    title: 'Dispensary Officer',
    facilityId: 'FAC-CHIPINGE-RURAL-01',
    facilityName: 'Chipinge Rural Health Center',
    pin: '1234',
    avatarColor: 'bg-indigo-600'
  },
  {
    id: 'USR-REC-01',
    name: 'Blessing Dube',
    role: 'receptionist',
    title: 'Admissions & Records Officer',
    facilityId: 'FAC-CHIPINGE-RURAL-01',
    facilityName: 'Chipinge Rural Health Center',
    pin: '1234',
    avatarColor: 'bg-amber-600'
  },
  {
    id: 'USR-ADMIN-01',
    name: 'Dr. Rudo Hove',
    role: 'admin',
    title: 'District Clinical Supervisor',
    facilityId: 'FAC-CHIPINGE-RURAL-01',
    facilityName: 'Chipinge Rural Health Center',
    pin: '1234',
    avatarColor: 'bg-purple-600'
  }
];

export const INITIAL_MEDICINES: MedicineStock[] = [
  {
    id: 'MED-ACT-01',
    medicineCode: 'ACT-20120',
    brandName: 'Coartem',
    genericName: 'Artemether / Lumefantrine 20/120mg',
    category: 'Antimalarial',
    dosageForm: 'Tablet',
    strength: '20mg/120mg',
    currentQuantity: 184,
    unit: 'strips',
    batches: [
      { batchNumber: 'BAT-2025-A1', expiryDate: '2027-06-30', quantity: 104 },
      { batchNumber: 'BAT-2025-B2', expiryDate: '2027-11-30', quantity: 80 }
    ],
    minReorderLevel: 50,
    unitCost: 1.50,
    version: 1,
    updatedAt: new Date().toISOString(),
    syncStatus: 'synced'
  },
  {
    id: 'MED-AMX-01',
    medicineCode: 'AMX-500',
    brandName: 'Amoxil',
    genericName: 'Amoxicillin 500mg',
    category: 'Antibiotic',
    dosageForm: 'Capsule',
    strength: '500mg',
    currentQuantity: 340,
    unit: 'tablets',
    batches: [
      { batchNumber: 'AMX-2025-09', expiryDate: '2027-04-15', quantity: 340 }
    ],
    minReorderLevel: 100,
    unitCost: 0.20,
    version: 1,
    updatedAt: new Date().toISOString(),
    syncStatus: 'synced'
  },
  {
    id: 'MED-PCM-01',
    medicineCode: 'PCM-500',
    brandName: 'Panado',
    genericName: 'Paracetamol 500mg',
    category: 'Analgesic',
    dosageForm: 'Tablet',
    strength: '500mg',
    currentQuantity: 820,
    unit: 'tablets',
    batches: [
      { batchNumber: 'PCM-2026-X1', expiryDate: '2028-02-28', quantity: 820 }
    ],
    minReorderLevel: 200,
    unitCost: 0.05,
    version: 1,
    updatedAt: new Date().toISOString(),
    syncStatus: 'synced'
  },
  {
    id: 'MED-MET-01',
    medicineCode: 'MET-500',
    brandName: 'Glucophage',
    genericName: 'Metformin Hydrochloride 500mg',
    category: 'Antidiabetic',
    dosageForm: 'Tablet',
    strength: '500mg',
    currentQuantity: 95,
    unit: 'tablets',
    batches: [
      { batchNumber: 'MET-2025-04', expiryDate: '2026-12-31', quantity: 95 }
    ],
    minReorderLevel: 120, // Low stock flagged!
    unitCost: 0.15,
    version: 1,
    updatedAt: new Date().toISOString(),
    syncStatus: 'synced'
  },
  {
    id: 'MED-ORS-01',
    medicineCode: 'ORS-WHO',
    brandName: 'Hydrasal',
    genericName: 'Oral Rehydration Salts (WHO Formula)',
    category: 'Rehydration',
    dosageForm: 'Sachet',
    strength: '20.5g powder',
    currentQuantity: 210,
    unit: 'sachets',
    batches: [
      { batchNumber: 'ORS-2026-11', expiryDate: '2028-08-31', quantity: 210 }
    ],
    minReorderLevel: 60,
    unitCost: 0.35,
    version: 1,
    updatedAt: new Date().toISOString(),
    syncStatus: 'synced'
  },
  {
    id: 'MED-CEF-01',
    medicineCode: 'CEF-1G',
    brandName: 'Rocephin',
    genericName: 'Ceftriaxone 1g Powder for Injection',
    category: 'Antibiotic',
    dosageForm: 'Injection',
    strength: '1g vial',
    currentQuantity: 28,
    unit: 'vials',
    batches: [
      { batchNumber: 'CEF-2025-02', expiryDate: '2026-11-15', quantity: 28 }
    ],
    minReorderLevel: 20,
    unitCost: 3.20,
    version: 1,
    updatedAt: new Date().toISOString(),
    syncStatus: 'synced'
  }
];

export const INITIAL_PATIENTS: Patient[] = [
  {
    id: 'pt-001-tatenda',
    facilityId: 'FAC-CHIPINGE-RURAL-01',
    patientNumber: 'CLN-2026-0012',
    fullName: 'Tatenda Mutasa',
    nationalId: '63-2049182-W-42',
    dateOfBirth: '1989-05-14',
    sex: 'Male',
    phone: '+263 77 234 8901',
    address: 'Stand 44, Ward 6, Chipinge Rural',
    bloodGroup: 'O+',
    allergies: [
      { allergen: 'Penicillin', severity: 'severe', reaction: 'Urticaria & facial angioedema' }
    ],
    chronicConditions: ['Hypertension'],
    medicalHistory: 'Diagnosed with essential hypertension in 2021. Managed on Enalapril 10mg daily.',
    emergencyContact: {
      name: 'Grace Mutasa',
      relationship: 'Spouse',
      phone: '+263 77 889 0012'
    },
    version: 1,
    updatedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    createdAt: new Date(Date.now() - 86400000 * 45).toISOString(),
    syncStatus: 'synced'
  },
  {
    id: 'pt-002-nokuthula',
    facilityId: 'FAC-CHIPINGE-RURAL-01',
    patientNumber: 'CLN-2026-0034',
    fullName: 'Nokuthula Sibanda',
    nationalId: '29-1882941-K-19',
    dateOfBirth: '1998-11-23',
    sex: 'Female',
    phone: '+263 71 445 6782',
    address: 'Village 3, Kondo Farm, Chipinge',
    bloodGroup: 'A+',
    allergies: [],
    chronicConditions: [],
    medicalHistory: 'Gravida 2 Para 1. 28 weeks gestation. Antenatal visit routine.',
    emergencyContact: {
      name: 'Brian Sibanda',
      relationship: 'Brother',
      phone: '+263 71 992 1104'
    },
    version: 1,
    updatedAt: new Date(Date.now() - 86400000 * 1).toISOString(),
    createdAt: new Date(Date.now() - 86400000 * 20).toISOString(),
    syncStatus: 'synced'
  },
  {
    id: 'pt-003-kudzai',
    facilityId: 'FAC-CHIPINGE-RURAL-01',
    patientNumber: 'CLN-2026-0056',
    fullName: 'Kudzai Munetsi',
    nationalId: '75-0091823-M-08',
    dateOfBirth: '2019-03-08',
    sex: 'Male',
    phone: '+263 78 512 3490',
    address: 'Mutema Growth Point, Chipinge',
    bloodGroup: 'B+',
    allergies: [
      { allergen: 'Cotrimoxazole (Septrin)', severity: 'moderate', reaction: 'Maculopapular rash' }
    ],
    chronicConditions: ['Asthma (mild intermittent)'],
    medicalHistory: 'Pediatric patient. Recurrent chest infections in winter.',
    emergencyContact: {
      name: 'Ruvimbo Munetsi',
      relationship: 'Mother',
      phone: '+263 78 512 3490'
    },
    version: 1,
    updatedAt: new Date(Date.now() - 3600000 * 5).toISOString(),
    createdAt: new Date(Date.now() - 86400000 * 10).toISOString(),
    syncStatus: 'synced'
  }
];

export const INITIAL_QUEUE: QueueItem[] = [
  {
    id: 'Q-01',
    patientId: 'pt-001-tatenda',
    patientNumber: 'CLN-2026-0012',
    patientName: 'Tatenda Mutasa',
    ageSex: '37y / M',
    checkInTime: new Date(Date.now() - 1000 * 60 * 45).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    priority: 'Urgent',
    stage: 'Doctor',
    triageCategory: 'Yellow',
    chiefComplaint: 'Severe frontal headache, BP elevated at triage 165/102',
    status: 'active'
  },
  {
    id: 'Q-02',
    patientId: 'pt-002-nokuthula',
    patientNumber: 'CLN-2026-0034',
    patientName: 'Nokuthula Sibanda',
    ageSex: '27y / F',
    checkInTime: new Date(Date.now() - 1000 * 60 * 30).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    priority: 'Routine',
    stage: 'Triage',
    triageCategory: 'Green',
    chiefComplaint: 'ANC 28-week routine follow-up, mild pedal edema',
    status: 'active'
  },
  {
    id: 'Q-03',
    patientId: 'pt-003-kudzai',
    patientNumber: 'CLN-2026-0056',
    patientName: 'Kudzai Munetsi',
    ageSex: '7y / M',
    checkInTime: new Date(Date.now() - 1000 * 60 * 15).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    priority: 'Emergency',
    stage: 'Waiting',
    triageCategory: 'Orange',
    chiefComplaint: 'High fever 39.1°C, chills, positive RDT for Plasmodium falciparum malaria',
    status: 'active'
  }
];

export async function seedClinicDatabaseIfEmpty(): Promise<void> {
  const patientCount = await localDb.patients.count();
  if (patientCount === 0) {
    await localDb.patients.bulkPut(INITIAL_PATIENTS);
    await localDb.medicines.bulkPut(INITIAL_MEDICINES);
    await localDb.queue.bulkPut(INITIAL_QUEUE);

    // Initial encounter for Tatenda
    const initialEncounter: Encounter = {
      id: 'enc-001-tatenda-prev',
      patientId: 'pt-001-tatenda',
      patientNumber: 'CLN-2026-0012',
      patientName: 'Tatenda Mutasa',
      facilityId: 'FAC-CHIPINGE-RURAL-01',
      facilityName: 'Chipinge Rural Health Center',
      clinicianId: 'USR-DOC-01',
      clinicianName: 'Dr. Tendai Moyo',
      encounterType: 'Outpatient',
      chiefComplaint: 'Follow-up for chronic hypertension and refill',
      symptoms: ['Mild occipital morning headache', 'No dizziness', 'No visual blurring'],
      vitals: {
        systolicBp: 148,
        diastolicBp: 92,
        heartRate: 74,
        respRate: 18,
        tempC: 36.6,
        spo2: 98,
        weightKg: 82,
        heightCm: 174,
        bmi: 27.1,
        painScore: 2,
        triageCategory: 'Yellow',
        recordedBy: 'Sister Chipo Sithole',
        recordedAt: new Date(Date.now() - 86400000 * 14).toISOString()
      },
      examinationNotes: 'Chest clear bilaterally. Heart sounds S1+S2, no murmurs. JVP not elevated. No pedal edema.',
      diagnoses: [
        { code: 'I10', description: 'Essential (primary) hypertension', isPrimary: true, confirmed: true }
      ],
      treatmentPlan: 'Continue Enalapril 10mg daily. Low salt diet re-emphasized. Return in 1 month for BP check.',
      clinicalNotes: 'Adherence reported good. Advised on avoidance of NSAIDs.',
      prescriptions: [
        {
          id: 'rx-prev-01',
          medicineId: 'MED-PCM-01',
          medicineName: 'Paracetamol 500mg',
          dosage: '1g (2 tablets)',
          frequency: 'TDS PRN',
          durationDays: 5,
          quantity: 30,
          instructions: 'Take 2 tablets three times a day when having headache',
          dispensedStatus: 'dispensed',
          dispensedBatch: 'PCM-2026-X1',
          dispensedBy: 'Farai Ndlovu',
          dispensedAt: new Date(Date.now() - 86400000 * 14).toISOString()
        }
      ],
      labOrders: [],
      version: 1,
      createdAt: new Date(Date.now() - 86400000 * 14).toISOString(),
      updatedAt: new Date(Date.now() - 86400000 * 14).toISOString(),
      syncStatus: 'synced'
    };

    await localDb.encounters.put(initialEncounter);
  }
}
