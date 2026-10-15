// Types for Equator MedFlow Offline-First Clinic Management System

export type UserRole = 'receptionist' | 'nurse' | 'clinician' | 'pharmacist' | 'admin';

export interface ClinicUser {
  id: string;
  name: string;
  role: UserRole;
  title: string;
  facilityId: string;
  facilityName: string;
  pin: string;
  avatarColor: string;
}

export type SyncStatus = 'local_only' | 'pending' | 'synced' | 'conflict' | 'failed';

export interface AllergyItem {
  allergen: string;
  severity: 'mild' | 'moderate' | 'severe' | 'life-threatening';
  reaction: string;
}

export interface Patient {
  id: string; // UUID
  facilityId: string;
  patientNumber: string; // e.g. CLN-2026-0042
  fullName: string;
  nationalId?: string;
  dateOfBirth: string; // YYYY-MM-DD
  sex: 'Male' | 'Female' | 'Other';
  phone: string;
  address: string;
  bloodGroup: 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-' | 'Unknown';
  allergies: AllergyItem[];
  chronicConditions: string[];
  medicalHistory: string;
  emergencyContact: {
    name: string;
    relationship: string;
    phone: string;
  };
  version: number;
  updatedAt: string;
  createdAt: string;
  syncStatus: SyncStatus;
  isDeleted?: boolean;
}

export interface VitalSigns {
  systolicBp: number;
  diastolicBp: number;
  heartRate: number;
  respRate: number;
  tempC: number;
  spo2: number;
  weightKg: number;
  heightCm: number;
  bmi: number;
  painScore: number; // 0 - 10
  triageCategory: 'Green' | 'Yellow' | 'Orange' | 'Red';
  triageNotes?: string;
  recordedBy: string;
  recordedAt: string;
}

export interface DiagnosisItem {
  code: string; // e.g. ICD-10 'B54'
  description: string;
  isPrimary: boolean;
  confirmed: boolean;
}

export interface PrescriptionItem {
  id: string;
  medicineId: string;
  medicineName: string;
  dosage: string;
  frequency: string;
  durationDays: number;
  quantity: number;
  instructions: string;
  dispensedStatus: 'pending' | 'dispensed' | 'cancelled';
  dispensedBatch?: string;
  dispensedBy?: string;
  dispensedAt?: string;
}

export interface LabOrderItem {
  id: string;
  testName: string;
  specimen: string;
  status: 'ordered' | 'sample_collected' | 'completed' | 'cancelled';
  urgency: 'routine' | 'urgent' | 'stat';
  resultNotes?: string;
  completedAt?: string;
  orderedAt: string;
  orderedBy: string;
}

export interface Encounter {
  id: string; // UUID
  patientId: string;
  patientNumber: string;
  patientName: string;
  facilityId: string;
  facilityName: string;
  clinicianId: string;
  clinicianName: string;
  encounterType: 'Outpatient' | 'Antenatal' | 'Emergency' | 'Follow-up' | 'Pediatric' | 'Chronic Care';
  chiefComplaint: string;
  symptoms: string[];
  vitals?: VitalSigns;
  examinationNotes: string;
  diagnoses: DiagnosisItem[];
  treatmentPlan: string;
  clinicalNotes: string;
  prescriptions: PrescriptionItem[];
  labOrders: LabOrderItem[];
  billingSummary?: {
    consultationFee: number;
    medicationFee: number;
    totalAmount: number;
    paymentStatus: 'paid' | 'exempt' | 'pending';
    receiptNumber?: string;
  };
  version: number;
  createdAt: string;
  updatedAt: string;
  syncStatus: SyncStatus;
}

export interface StockBatch {
  batchNumber: string;
  expiryDate: string;
  quantity: number;
}

export interface MedicineStock {
  id: string;
  medicineCode: string;
  brandName: string;
  genericName: string;
  category: 'Antibiotic' | 'Antimalarial' | 'Analgesic' | 'Antihypertensive' | 'IV Fluid' | 'Vaccine' | 'Antidiabetic' | 'Consumable' | 'Rehydration';
  dosageForm: 'Tablet' | 'Syrup' | 'Injection' | 'Suspension' | 'Sachet' | 'Capsule';
  strength: string;
  currentQuantity: number;
  unit: 'tablets' | 'vials' | 'bottles' | 'strips' | 'sachets';
  batches: StockBatch[];
  minReorderLevel: number;
  unitCost: number;
  version: number;
  updatedAt: string;
  syncStatus: SyncStatus;
}

export interface StockMovement {
  id: string;
  medicineId: string;
  medicineName: string;
  batchNumber: string;
  movementType: 'dispense' | 'receive' | 'adjustment' | 'reconciliation_loss';
  quantityDelta: number; // negative for dispensing, positive for restock
  balanceAfter: number;
  referenceEncounterId?: string;
  performedBy: string;
  performedByName: string;
  notes?: string;
  createdAt: string;
  syncStatus: SyncStatus;
}

export interface QueueItem {
  id: string;
  patientId: string;
  patientNumber: string;
  patientName: string;
  ageSex: string;
  checkInTime: string;
  priority: 'Routine' | 'Urgent' | 'Emergency';
  stage: 'Waiting' | 'Triage' | 'Doctor' | 'Pharmacy' | 'Billing' | 'Completed';
  triageCategory?: 'Green' | 'Yellow' | 'Orange' | 'Red';
  assignedTo?: string;
  chiefComplaint?: string;
  status: 'active' | 'completed' | 'abandoned';
  notes?: string;
}

export type OutboxStatus = 'pending' | 'in_progress' | 'synced' | 'failed' | 'conflict';
export type EntityType = 'patient' | 'encounter' | 'stock_movement' | 'medicine_stock' | 'queue_item';
export type OperationType = 'CREATE' | 'UPDATE' | 'DELETE';

export interface OutboxOperation {
  operation_id: string; // UUID
  facility_id: string;
  entity_type: EntityType;
  entity_id: string;
  operation_type: OperationType;
  payload: any;
  created_at: string;
  attempt_count: number;
  last_attempt_at?: string;
  status: OutboxStatus;
  error_message?: string;
  server_ack_id?: string;
}

export interface SyncConflict {
  id: string;
  entity_type: EntityType;
  entity_id: string;
  entity_name: string;
  base_version: number;
  client_version: number;
  server_version: number;
  client_payload: any;
  server_payload: any;
  client_author: string;
  server_author: string;
  client_time: string;
  server_time: string;
  conflict_fields: string[];
  detected_at: string;
  resolved: boolean;
  resolution_type?: 'keep_local' | 'keep_server' | 'custom_merge' | 'append_notes';
  resolved_by?: string;
  resolved_at?: string;
  resolved_payload?: any;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  action: string;
  entityType: string;
  entityId: string;
  facilityId: string;
  deviceId: string;
  details: string;
  isOfflineAction: boolean;
}

export type NetworkCondition = 'online' | 'unstable_2g' | 'offline' | 'server_down';

export interface SyncMetrics {
  totalLocalOperationsSaved: number;
  totalSyncedAcks: number;
  idempotentDeduplicatedCount: number;
  conflictCount: number;
  resolvedConflictCount: number;
  lastSyncTimestamp: string | null;
  lastSyncDurationMs: number;
  dataLossIncidents: number;
  pendingOutboxCount: number;
  syncedOutboxCount: number;
  failedOutboxCount: number;
  bandwidthBytesTransferred: number;
}
