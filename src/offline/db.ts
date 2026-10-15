import Dexie, { type Table } from 'dexie';
import type {
  Patient,
  Encounter,
  MedicineStock,
  StockMovement,
  QueueItem,
  OutboxOperation,
  SyncConflict,
  AuditLog
} from '../types/clinic';

export interface SystemMeta {
  key: string;
  value: any;
}

export class ClinicLocalDatabase extends Dexie {
  patients!: Table<Patient, string>;
  encounters!: Table<Encounter, string>;
  medicines!: Table<MedicineStock, string>;
  stockMovements!: Table<StockMovement, string>;
  queue!: Table<QueueItem, string>;
  outbox!: Table<OutboxOperation, string>;
  conflicts!: Table<SyncConflict, string>;
  auditLogs!: Table<AuditLog, string>;
  systemState!: Table<SystemMeta, string>;

  constructor() {
    super('EquatorMedFlowLocalDB');
    this.version(1).stores({
      patients: 'id, facilityId, patientNumber, fullName, phone, updatedAt, syncStatus',
      encounters: 'id, patientId, facilityId, clinicianId, createdAt, syncStatus',
      medicines: 'id, medicineCode, genericName, category, syncStatus',
      stockMovements: 'id, medicineId, movementType, createdAt, syncStatus',
      queue: 'id, patientId, stage, priority, status',
      outbox: 'operation_id, facility_id, entity_type, entity_id, status, created_at',
      conflicts: 'id, entity_type, entity_id, resolved, detected_at',
      auditLogs: 'id, timestamp, userId, action, entityType',
      systemState: 'key'
    });
  }
}

export const localDb = new ClinicLocalDatabase();
