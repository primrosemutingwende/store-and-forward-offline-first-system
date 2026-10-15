// Central Server Mock / Remote Gateway simulator for Two-Way Synchronization
import type {
  OutboxOperation,
  SyncConflict,
  NetworkCondition,
  Patient,
  Encounter,
  MedicineStock
} from '../types/clinic';
import { generateUUID } from '../utils/id';

export interface CentralChangeRecord {
  cursor: number;
  entity_type: string;
  entity_id: string;
  operation_type: 'CREATE' | 'UPDATE' | 'DELETE';
  payload: any;
  version: number;
  updated_at: string;
  origin_facility_id: string;
  origin_author: string;
}

export interface PushResult {
  committedOperationIds: string[];
  idempotentDeduplicatedIds: string[];
  conflicts: SyncConflict[];
  serverReceiptTime: string;
}

export interface PullResult {
  changes: CentralChangeRecord[];
  newCursor: number;
  serverTime: string;
}

const STORAGE_KEY_CENTRAL_DB = 'medflow_central_cloud_records_v1';
const STORAGE_KEY_PROCESSED_OPS = 'medflow_central_processed_operations_v1';
const STORAGE_KEY_CHANGE_LOG = 'medflow_central_change_cursor_log_v1';

class CentralServerSimulator {
  private processedOperationIds: Set<string> = new Set();
  private changeLog: CentralChangeRecord[] = [];
  private remotePatients: Map<string, Patient> = new Map();
  private remoteEncounters: Map<string, Encounter> = new Map();
  private remoteMedicines: Map<string, MedicineStock> = new Map();

  constructor() {
    this.loadState();
  }

  private loadState() {
    try {
      const ops = localStorage.getItem(STORAGE_KEY_PROCESSED_OPS);
      if (ops) {
        this.processedOperationIds = new Set(JSON.parse(ops));
      }
      const logs = localStorage.getItem(STORAGE_KEY_CHANGE_LOG);
      if (logs) {
        this.changeLog = JSON.parse(logs);
      }
      const data = localStorage.getItem(STORAGE_KEY_CENTRAL_DB);
      if (data) {
        const parsed = JSON.parse(data);
        if (parsed.patients) this.remotePatients = new Map(Object.entries(parsed.patients));
        if (parsed.encounters) this.remoteEncounters = new Map(Object.entries(parsed.encounters));
        if (parsed.medicines) this.remoteMedicines = new Map(Object.entries(parsed.medicines));
      }
    } catch {
      // Fallback empty
    }
  }

  private saveState() {
    try {
      localStorage.setItem(STORAGE_KEY_PROCESSED_OPS, JSON.stringify(Array.from(this.processedOperationIds)));
      localStorage.setItem(STORAGE_KEY_CHANGE_LOG, JSON.stringify(this.changeLog));
      const serialized = {
        patients: Object.fromEntries(this.remotePatients),
        encounters: Object.fromEntries(this.remoteEncounters),
        medicines: Object.fromEntries(this.remoteMedicines)
      };
      localStorage.setItem(STORAGE_KEY_CENTRAL_DB, JSON.stringify(serialized));
    } catch {
      // Storage quota or error safe fallback
    }
  }

  // Simulate network latency and failure based on condition
  private async simulateNetworkTrip(condition: NetworkCondition): Promise<void> {
    if (condition === 'offline') {
      throw new Error('ERR_INTERNET_DISCONNECTED: Clinic is operating offline. Server unreachable.');
    }
    if (condition === 'server_down') {
      await new Promise(r => setTimeout(r, 400));
      throw new Error('HTTP 503: Central MoH Health Information Server maintenance in progress.');
    }
    if (condition === 'unstable_2g') {
      // Slow 2G delay between 800ms and 1800ms
      const delay = Math.floor(800 + Math.random() * 1000);
      await new Promise(r => setTimeout(r, delay));
      // 35% random packet drop simulation
      if (Math.random() < 0.35) {
        throw new Error('ERR_CONNECTION_RESET: Weak cellular tower connection dropped during transfer.');
      }
      return;
    }
    // Normal online condition: crisp 180ms roundtrip
    await new Promise(r => setTimeout(r, 180));
  }

  // Push batch from client outbox with Idempotency enforcement and Conflict Detection
  public async pushBatch(
    operations: OutboxOperation[],
    facilityId: string,
    networkCondition: NetworkCondition
  ): Promise<PushResult> {
    await this.simulateNetworkTrip(networkCondition);

    const committedOperationIds: string[] = [];
    const idempotentDeduplicatedIds: string[] = [];
    const conflicts: SyncConflict[] = [];

    for (const op of operations) {
      // 1. Idempotency Check:
      // If the server has already processed this exact operation_id, do not duplicate!
      if (this.processedOperationIds.has(op.operation_id)) {
        idempotentDeduplicatedIds.push(op.operation_id);
        committedOperationIds.push(op.operation_id);
        continue;
      }

      // 2. Conflict Detection based on entity revision / version
      if (op.entity_type === 'patient') {
        const clientPatient = op.payload as Patient;
        const existingServerPatient = this.remotePatients.get(op.entity_id);

        if (existingServerPatient && op.operation_type === 'UPDATE') {
          // If server version is greater than client's base version, concurrent edit conflict!
          const clientBaseVersion = (clientPatient.version || 1) - 1;
          if (existingServerPatient.version > clientBaseVersion) {
            // Find conflicting fields
            const conflictFields: string[] = [];
            if (JSON.stringify(existingServerPatient.allergies) !== JSON.stringify(clientPatient.allergies)) {
              conflictFields.push('allergies');
            }
            if (existingServerPatient.phone !== clientPatient.phone) {
              conflictFields.push('phone');
            }
            if (existingServerPatient.address !== clientPatient.address) {
              conflictFields.push('address');
            }
            if (existingServerPatient.fullName !== clientPatient.fullName) {
              conflictFields.push('fullName');
            }

            if (conflictFields.length > 0) {
              conflicts.push({
                id: generateUUID(),
                entity_type: 'patient',
                entity_id: op.entity_id,
                entity_name: clientPatient.fullName || existingServerPatient.fullName,
                base_version: clientBaseVersion,
                client_version: clientPatient.version,
                server_version: existingServerPatient.version,
                client_payload: clientPatient,
                server_payload: existingServerPatient,
                client_author: 'Local Clinic Staff',
                server_author: 'Sister Facility / Central MoH Staff',
                client_time: clientPatient.updatedAt || new Date().toISOString(),
                server_time: existingServerPatient.updatedAt,
                conflict_fields: conflictFields,
                detected_at: new Date().toISOString(),
                resolved: false
              });
              // Do not commit conflicting record until user resolves
              continue;
            }
          }
        }

        // Apply mutation to central DB
        const updatedVersion = Math.max((existingServerPatient?.version || 0) + 1, clientPatient.version || 1);
        const serverPatient: Patient = {
          ...clientPatient,
          version: updatedVersion,
          syncStatus: 'synced',
          updatedAt: new Date().toISOString()
        };
        this.remotePatients.set(op.entity_id, serverPatient);

        // Add to central change log
        this.appendChangeLog('patient', op.entity_id, op.operation_type, serverPatient, updatedVersion, facilityId, 'Local Clinic Device');
      } else if (op.entity_type === 'encounter') {
        const clientEncounter = op.payload as Encounter;
        const existingServerEncounter = this.remoteEncounters.get(op.entity_id);

        const updatedVersion = Math.max((existingServerEncounter?.version || 0) + 1, clientEncounter.version || 1);
        const serverEncounter: Encounter = {
          ...clientEncounter,
          version: updatedVersion,
          syncStatus: 'synced',
          updatedAt: new Date().toISOString()
        };
        this.remoteEncounters.set(op.entity_id, serverEncounter);
        this.appendChangeLog('encounter', op.entity_id, op.operation_type, serverEncounter, updatedVersion, facilityId, clientEncounter.clinicianName || 'Clinic Staff');
      } else if (op.entity_type === 'medicine_stock' || op.entity_type === 'stock_movement') {
        // Update stock
        if (op.entity_type === 'medicine_stock') {
          const clientStock = op.payload as MedicineStock;
          const existingServerStock = this.remoteMedicines.get(op.entity_id);
          const updatedVersion = Math.max((existingServerStock?.version || 0) + 1, clientStock.version || 1);
          const serverStock: MedicineStock = {
            ...clientStock,
            version: updatedVersion,
            syncStatus: 'synced',
            updatedAt: new Date().toISOString()
          };
          this.remoteMedicines.set(op.entity_id, serverStock);
          this.appendChangeLog('medicine_stock', op.entity_id, op.operation_type, serverStock, updatedVersion, facilityId, 'Pharmacy Staff');
        }
      }

      // Mark operation as safely processed and committed
      this.processedOperationIds.add(op.operation_id);
      committedOperationIds.push(op.operation_id);
    }

    this.saveState();

    return {
      committedOperationIds,
      idempotentDeduplicatedIds,
      conflicts,
      serverReceiptTime: new Date().toISOString()
    };
  }

  // Pull changes since client's cursor
  public async pullChanges(
    sinceCursor: number,
    facilityId: string,
    networkCondition: NetworkCondition
  ): Promise<PullResult> {
    await this.simulateNetworkTrip(networkCondition);

    // Get changes after this cursor, filtering out changes initiated by this facility if needed
    // (In store-and-forward, changes made by other facilities or central server are returned)
    const newChanges = this.changeLog.filter(c => c.cursor > sinceCursor && c.origin_facility_id !== facilityId);
    const maxCursor = this.changeLog.length > 0 ? this.changeLog[this.changeLog.length - 1].cursor : sinceCursor;

    return {
      changes: newChanges,
      newCursor: maxCursor,
      serverTime: new Date().toISOString()
    };
  }

  private appendChangeLog(
    entity_type: string,
    entity_id: string,
    operation_type: 'CREATE' | 'UPDATE' | 'DELETE',
    payload: any,
    version: number,
    origin_facility_id: string,
    origin_author: string
  ) {
    const nextCursor = this.changeLog.length + 1;
    this.changeLog.push({
      cursor: nextCursor,
      entity_type,
      entity_id,
      operation_type,
      payload,
      version,
      updated_at: new Date().toISOString(),
      origin_facility_id,
      origin_author
    });
  }

  // Test Simulation Helper: Inject a concurrent remote change from Sister Facility
  // This allows the user to immediately trigger and test real conflict resolution in the UI!
  public injectSimulatedRemoteConflict(targetPatient: Patient, conflictingAllergy: string, conflictingPhone: string): void {
    const serverVersion = (targetPatient.version || 1) + 1;
    const modifiedAllergies = [
      ...targetPatient.allergies,
      { allergen: conflictingAllergy, severity: 'severe' as const, reaction: 'Anaphylaxis recorded at Mutare General' }
    ];

    const remotePatient: Patient = {
      ...targetPatient,
      allergies: modifiedAllergies,
      phone: conflictingPhone,
      version: serverVersion,
      updatedAt: new Date().toISOString(),
      syncStatus: 'synced'
    };

    this.remotePatients.set(targetPatient.id, remotePatient);
    this.appendChangeLog('patient', targetPatient.id, 'UPDATE', remotePatient, serverVersion, 'FACILITY-MUTARE-GEN-002', 'Dr. Farai Gonese (Mutare General)');
    this.saveState();
  }

  // Remote records inspection
  public getCentralStatistics() {
    return {
      totalPatients: this.remotePatients.size,
      totalEncounters: this.remoteEncounters.size,
      totalMedicines: this.remoteMedicines.size,
      changeLogLength: this.changeLog.length,
      processedOpsCount: this.processedOperationIds.size
    };
  }

  public getRawCentralPatients(): Patient[] {
    return Array.from(this.remotePatients.values());
  }

  public getRawChangeLog(): CentralChangeRecord[] {
    return [...this.changeLog];
  }
}

export const centralServer = new CentralServerSimulator();
