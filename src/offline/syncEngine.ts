import { localDb } from './db';
import { centralServer } from './centralServer';
import type {
  OutboxOperation,
  SyncConflict,
  NetworkCondition,
  SyncMetrics,
  Patient,
  Encounter,
  MedicineStock,
  EntityType,
  OperationType,
  AuditLog
} from '../types/clinic';
import { generateUUID } from '../utils/id';

type SyncListener = () => void;

class SyncEngine {
  private listeners: Set<SyncListener> = new Set();
  private isSyncing = false;
  private networkCondition: NetworkCondition = 'online';
  private autoSyncTimer: any = null;
  private currentFacilityId = 'FAC-CHIPINGE-RURAL-01';
  private currentDeviceId = 'TAB-TRIAGE-04';

  private metrics: SyncMetrics = {
    totalLocalOperationsSaved: 0,
    totalSyncedAcks: 0,
    idempotentDeduplicatedCount: 0,
    conflictCount: 0,
    resolvedConflictCount: 0,
    lastSyncTimestamp: null,
    lastSyncDurationMs: 0,
    dataLossIncidents: 0,
    pendingOutboxCount: 0,
    syncedOutboxCount: 0,
    failedOutboxCount: 0,
    bandwidthBytesTransferred: 0
  };

  constructor() {
    this.init();
  }

  private async init() {
    // Check initial cursor and metrics
    await this.refreshMetrics();

    // Auto-sync polling every 12 seconds when online
    this.startAutoSyncLoop();

    // Listen to window online/offline browser events
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        if (this.networkCondition === 'offline') {
          this.setNetworkCondition('online');
          this.triggerSync();
        }
      });
      window.addEventListener('offline', () => {
        this.setNetworkCondition('offline');
      });
    }
  }

  public subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (err) {
        console.error('Sync listener error:', err);
      }
    }
  }

  public getNetworkCondition(): NetworkCondition {
    return this.networkCondition;
  }

  public setNetworkCondition(condition: NetworkCondition) {
    this.networkCondition = condition;
    this.notify();
    if (condition === 'online' || condition === 'unstable_2g') {
      this.triggerSync();
    }
  }

  public getFacilityId(): string {
    return this.currentFacilityId;
  }

  public getDeviceId(): string {
    return this.currentDeviceId;
  }

  public getMetrics(): SyncMetrics {
    return { ...this.metrics };
  }

  public getIsSyncing(): boolean {
    return this.isSyncing;
  }

  // Transactional Write: Atomically writes entity + outbox operation to IndexedDB
  public async commitLocalOperation<T extends { id: string; version?: number; syncStatus?: any }>(
    entityType: EntityType,
    entityId: string,
    operationType: OperationType,
    payload: T,
    auditMeta: { userId: string; userName: string; userRole: any; action: string; details: string }
  ): Promise<T> {
    const operationId = generateUUID();
    const now = new Date().toISOString();

    const entityToSave: T = {
      ...payload,
      version: (payload.version || 0) + 1,
      syncStatus: 'pending',
      updatedAt: now
    };

    const outboxOp: OutboxOperation = {
      operation_id: operationId,
      facility_id: this.currentFacilityId,
      entity_type: entityType,
      entity_id: entityId,
      operation_type: operationType,
      payload: entityToSave,
      created_at: now,
      attempt_count: 0,
      status: 'pending'
    };

    const auditEntry: AuditLog = {
      id: generateUUID(),
      timestamp: now,
      userId: auditMeta.userId,
      userName: auditMeta.userName,
      userRole: auditMeta.userRole,
      action: auditMeta.action,
      entityType,
      entityId,
      facilityId: this.currentFacilityId,
      deviceId: this.currentDeviceId,
      details: auditMeta.details,
      isOfflineAction: this.networkCondition !== 'online'
    };

    // Use Dexie atomic transaction across tables
    await localDb.transaction('rw', [localDb.patients, localDb.encounters, localDb.medicines, localDb.stockMovements, localDb.queue, localDb.outbox, localDb.auditLogs], async () => {
      // 1. Commit entity into respective table
      if (entityType === 'patient') {
        await localDb.patients.put(entityToSave as unknown as Patient);
      } else if (entityType === 'encounter') {
        await localDb.encounters.put(entityToSave as unknown as Encounter);
      } else if (entityType === 'medicine_stock') {
        await localDb.medicines.put(entityToSave as unknown as MedicineStock);
      } else if (entityType === 'queue_item') {
        await localDb.queue.put(entityToSave as any);
      }

      // 2. Commit Outbox Queue item
      await localDb.outbox.put(outboxOp);

      // 3. Commit Audit Log
      await localDb.auditLogs.put(auditEntry);
    });

    this.metrics.totalLocalOperationsSaved += 1;
    await this.refreshMetrics();
    this.notify();

    // Trigger asynchronous sync attempt in background if connected
    if (this.networkCondition === 'online' || this.networkCondition === 'unstable_2g') {
      setTimeout(() => this.triggerSync(), 50);
    }

    return entityToSave;
  }

  // Trigger Two-Way Sync (Push outbox + Pull remote updates)
  public async triggerSync(): Promise<{ success: boolean; pushed: number; pulled: number; conflicts: number; error?: string }> {
    if (this.isSyncing) {
      return { success: false, pushed: 0, pulled: 0, conflicts: 0, error: 'Sync already in progress' };
    }

    if (this.networkCondition === 'offline') {
      return { success: false, pushed: 0, pulled: 0, conflicts: 0, error: 'Cannot sync: Clinic is in Offline Mode' };
    }

    this.isSyncing = true;
    this.notify();

    const startTime = Date.now();
    let pushedCount = 0;
    let pulledCount = 0;
    let conflictCount = 0;
    let errorResult: string | undefined;

    try {
      // --- PHASE 1: PUSH LOCAL OUTBOX ---
      const pendingOps = await localDb.outbox
        .where('status')
        .equals('pending')
        .or('status')
        .equals('failed')
        .limit(50) // Bounded batch
        .toArray();

      if (pendingOps.length > 0) {
        // Mark as in-progress
        for (const op of pendingOps) {
          op.status = 'in_progress';
          op.last_attempt_at = new Date().toISOString();
          op.attempt_count += 1;
        }
        await localDb.outbox.bulkPut(pendingOps);
        this.notify();

        // Calculate approximate payload bandwidth
        const payloadBytes = JSON.stringify(pendingOps).length;
        this.metrics.bandwidthBytesTransferred += payloadBytes;

        const pushResponse = await centralServer.pushBatch(pendingOps, this.currentFacilityId, this.networkCondition);

        // Process committed operations
        for (const opId of pushResponse.committedOperationIds) {
          const op = pendingOps.find(o => o.operation_id === opId);
          if (op) {
            op.status = 'synced';
            op.server_ack_id = `ACK-${Date.now().toString(36).toUpperCase()}`;
            await localDb.outbox.put(op);

            // Update local entity syncStatus to 'synced'
            if (op.entity_type === 'patient') {
              const p = await localDb.patients.get(op.entity_id);
              if (p) {
                p.syncStatus = 'synced';
                await localDb.patients.put(p);
              }
            } else if (op.entity_type === 'encounter') {
              const e = await localDb.encounters.get(op.entity_id);
              if (e) {
                e.syncStatus = 'synced';
                await localDb.encounters.put(e);
              }
            } else if (op.entity_type === 'medicine_stock') {
              const m = await localDb.medicines.get(op.entity_id);
              if (m) {
                m.syncStatus = 'synced';
                await localDb.medicines.put(m);
              }
            }
          }
        }

        pushedCount = pushResponse.committedOperationIds.length;
        this.metrics.totalSyncedAcks += pushedCount;
        this.metrics.idempotentDeduplicatedCount += pushResponse.idempotentDeduplicatedIds.length;

        // Process any detected conflicts
        if (pushResponse.conflicts && pushResponse.conflicts.length > 0) {
          for (const conf of pushResponse.conflicts) {
            await localDb.conflicts.put(conf);
            // Mark related outbox operation as conflict
            const relatedOp = pendingOps.find(o => o.entity_id === conf.entity_id);
            if (relatedOp) {
              relatedOp.status = 'conflict';
              relatedOp.error_message = `Concurrent edit conflict detected: ${conf.conflict_fields.join(', ')}`;
              await localDb.outbox.put(relatedOp);
            }
            // Update entity syncStatus
            if (conf.entity_type === 'patient') {
              const p = await localDb.patients.get(conf.entity_id);
              if (p) {
                p.syncStatus = 'conflict';
                await localDb.patients.put(p);
              }
            }
          }
          conflictCount = pushResponse.conflicts.length;
          this.metrics.conflictCount += conflictCount;
        }
      }

      // --- PHASE 2: PULL REMOTE CHANGES ---
      const cursorState = await localDb.systemState.get('sync_pull_cursor');
      const currentCursor: number = cursorState ? cursorState.value : 0;

      const pullResponse = await centralServer.pullChanges(currentCursor, this.currentFacilityId, this.networkCondition);

      if (pullResponse.changes.length > 0) {
        for (const change of pullResponse.changes) {
          if (change.entity_type === 'patient') {
            const existing = await localDb.patients.get(change.entity_id);
            // Don't overwrite if local has unpushed conflict or newer edit
            if (!existing || existing.syncStatus === 'synced') {
              await localDb.patients.put(change.payload);
              pulledCount++;
            }
          } else if (change.entity_type === 'encounter') {
            await localDb.encounters.put(change.payload);
            pulledCount++;
          } else if (change.entity_type === 'medicine_stock') {
            await localDb.medicines.put(change.payload);
            pulledCount++;
          }
        }
      }

      // Advance and persist client cursor only after all pulled records have safely written
      await localDb.systemState.put({ key: 'sync_pull_cursor', value: pullResponse.newCursor });

      this.metrics.lastSyncTimestamp = new Date().toISOString();
      this.metrics.lastSyncDurationMs = Date.now() - startTime;
    } catch (err: any) {
      errorResult = err.message || 'Sync connection failed';
      // Mark any in_progress items back to failed for retry
      const inProg = await localDb.outbox.where('status').equals('in_progress').toArray();
      for (const op of inProg) {
        op.status = 'failed';
        op.error_message = errorResult;
      }
      if (inProg.length > 0) {
        await localDb.outbox.bulkPut(inProg);
      }
    } finally {
      this.isSyncing = false;
      await this.refreshMetrics();
      this.notify();
    }

    return {
      success: !errorResult,
      pushed: pushedCount,
      pulled: pulledCount,
      conflicts: conflictCount,
      error: errorResult
    };
  }

  // Resolve conflict explicitly via user workbench
  public async resolveConflict(
    conflictId: string,
    resolutionType: 'keep_local' | 'keep_server' | 'custom_merge',
    resolvedPayload: any,
    resolvedBy: string
  ) {
    const conflict = await localDb.conflicts.get(conflictId);
    if (!conflict) return;

    conflict.resolved = true;
    conflict.resolution_type = resolutionType;
    conflict.resolved_by = resolvedBy;
    conflict.resolved_at = new Date().toISOString();
    conflict.resolved_payload = resolvedPayload;
    await localDb.conflicts.put(conflict);

    // Apply the winning payload locally
    if (conflict.entity_type === 'patient') {
      const p = resolvedPayload as Patient;
      p.syncStatus = 'pending';
      p.version = Math.max(conflict.client_version, conflict.server_version) + 1;
      await localDb.patients.put(p);

      // Create a fresh outbox operation with the resolved version
      const op: OutboxOperation = {
        operation_id: generateUUID(),
        facility_id: this.currentFacilityId,
        entity_type: 'patient',
        entity_id: p.id,
        operation_type: 'UPDATE',
        payload: p,
        created_at: new Date().toISOString(),
        attempt_count: 0,
        status: 'pending'
      };
      await localDb.outbox.put(op);
    }

    this.metrics.resolvedConflictCount += 1;
    await this.refreshMetrics();
    this.notify();

    // Trigger sync to upload resolution
    if (this.networkCondition === 'online') {
      this.triggerSync();
    }
  }

  public async refreshMetrics() {
    try {
      const pending = await localDb.outbox.where('status').equals('pending').count();
      const inProg = await localDb.outbox.where('status').equals('in_progress').count();
      const synced = await localDb.outbox.where('status').equals('synced').count();
      const failed = await localDb.outbox.where('status').equals('failed').count();
      const unresolvedConflicts = await localDb.conflicts.where('resolved').equals(0).count();

      this.metrics.pendingOutboxCount = pending + inProg;
      this.metrics.syncedOutboxCount = synced;
      this.metrics.failedOutboxCount = failed;
      this.metrics.conflictCount = unresolvedConflicts;
    } catch {
      // Safe fallback
    }
  }

  private startAutoSyncLoop() {
    if (this.autoSyncTimer) clearInterval(this.autoSyncTimer);
    this.autoSyncTimer = setInterval(() => {
      if (this.networkCondition === 'online' && !this.isSyncing) {
        this.triggerSync().catch(() => {});
      }
    }, 15000);
  }
}

export const syncEngine = new SyncEngine();
