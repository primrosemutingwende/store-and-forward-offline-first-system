import React, { useState, useEffect } from 'react';
import {
  Pill,
  Package,
  AlertTriangle,
  Clock,
  Plus,
  ArrowDownCircle,
  ArrowUpCircle,
  Calendar,
  Layers,
  Search,
  CheckCircle,
  FileSpreadsheet
} from 'lucide-react';
import { localDb } from '../offline/db';
import { syncEngine } from '../offline/syncEngine';
import { useClinic } from '../context/ClinicContext';
import { generateUUID } from '../utils/id';
import type { MedicineStock, StockMovement, StockBatch } from '../types/clinic';

export const PharmacyInventory: React.FC = () => {
  const { currentUser, showToast, facilityId } = useClinic();

  const [medicines, setMedicines] = useState<MedicineStock[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('All');
  const [selectedMed, setSelectedMed] = useState<MedicineStock | null>(null);

  // Dispense modal
  const [showDispenseModal, setShowDispenseModal] = useState(false);
  const [dispenseQty, setDispenseQty] = useState(10);
  const [selectedBatch, setSelectedBatch] = useState('');
  const [dispenseNotes, setDispenseNotes] = useState('');

  // Receive stock modal
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [receiveQty, setReceiveQty] = useState(100);
  const [receiveBatchNo, setReceiveBatchNo] = useState('');
  const [receiveExpiry, setReceiveExpiry] = useState('2028-12-31');

  useEffect(() => {
    loadStockData();
    const unsub = syncEngine.subscribe(loadStockData);
    return () => unsub();
  }, []);

  const loadStockData = async () => {
    const meds = await localDb.medicines.toArray();
    setMedicines(meds);
    const movs = await localDb.stockMovements.toArray();
    setMovements(movs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    if (selectedMed) {
      const refreshed = meds.find(m => m.id === selectedMed.id);
      if (refreshed) setSelectedMed(refreshed);
    }
  };

  const handleDispense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMed) return;

    if (selectedMed.currentQuantity < dispenseQty) {
      alert(`Insufficient stock! Available: ${selectedMed.currentQuantity} ${selectedMed.unit}`);
      return;
    }

    const newBalance = selectedMed.currentQuantity - Number(dispenseQty);
    const updatedBatches = [...selectedMed.batches];

    // Decrement from selected batch or first batch
    const targetBatchIndex = updatedBatches.findIndex(b => b.batchNumber === selectedBatch);
    if (targetBatchIndex >= 0) {
      updatedBatches[targetBatchIndex].quantity = Math.max(0, updatedBatches[targetBatchIndex].quantity - Number(dispenseQty));
    }

    const updatedMed: MedicineStock = {
      ...selectedMed,
      currentQuantity: newBalance,
      batches: updatedBatches,
      version: (selectedMed.version || 1) + 1,
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending'
    };

    const mov: StockMovement = {
      id: generateUUID(),
      medicineId: selectedMed.id,
      medicineName: selectedMed.brandName,
      batchNumber: selectedBatch || selectedMed.batches[0]?.batchNumber || 'BAT-GEN',
      movementType: 'dispense',
      quantityDelta: -Number(dispenseQty),
      balanceAfter: newBalance,
      performedBy: currentUser.id,
      performedByName: currentUser.name,
      notes: dispenseNotes.trim() || 'Outpatient prescription dispense',
      createdAt: new Date().toISOString(),
      syncStatus: 'pending'
    };

    // Commit both stock and ledger atomically
    await localDb.transaction('rw', [localDb.medicines, localDb.stockMovements, localDb.outbox, localDb.auditLogs], async () => {
      await localDb.medicines.put(updatedMed);
      await localDb.stockMovements.put(mov);
    });

    // Also register outbox operation for stock change
    await syncEngine.commitLocalOperation(
      'medicine_stock',
      updatedMed.id,
      'UPDATE',
      updatedMed,
      {
        userId: currentUser.id,
        userName: currentUser.name,
        userRole: currentUser.role,
        action: 'DISPENSE_MEDICINE',
        details: `Dispensed ${dispenseQty} ${selectedMed.unit} of ${selectedMed.brandName} (${selectedBatch}). New balance: ${newBalance}`
      }
    );

    showToast(`Dispensed ${dispenseQty} ${selectedMed.unit} of ${selectedMed.brandName}. Stock: ${newBalance}`, 'success');
    setShowDispenseModal(false);
    setDispenseNotes('');
    await loadStockData();
  };

  const handleReceiveStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMed) return;

    const newBalance = selectedMed.currentQuantity + Number(receiveQty);
    const updatedBatches = [...selectedMed.batches];

    const existingBatchIndex = updatedBatches.findIndex(b => b.batchNumber === receiveBatchNo);
    if (existingBatchIndex >= 0) {
      updatedBatches[existingBatchIndex].quantity += Number(receiveQty);
    } else {
      updatedBatches.push({
        batchNumber: receiveBatchNo.trim(),
        expiryDate: receiveExpiry,
        quantity: Number(receiveQty)
      });
    }

    const updatedMed: MedicineStock = {
      ...selectedMed,
      currentQuantity: newBalance,
      batches: updatedBatches,
      version: (selectedMed.version || 1) + 1,
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending'
    };

    const mov: StockMovement = {
      id: generateUUID(),
      medicineId: selectedMed.id,
      medicineName: selectedMed.brandName,
      batchNumber: receiveBatchNo.trim(),
      movementType: 'receive',
      quantityDelta: Number(receiveQty),
      balanceAfter: newBalance,
      performedBy: currentUser.id,
      performedByName: currentUser.name,
      notes: `Restock shipment from District Medical Store (NatPharm)`,
      createdAt: new Date().toISOString(),
      syncStatus: 'pending'
    };

    await localDb.transaction('rw', [localDb.medicines, localDb.stockMovements, localDb.outbox, localDb.auditLogs], async () => {
      await localDb.medicines.put(updatedMed);
      await localDb.stockMovements.put(mov);
    });

    await syncEngine.commitLocalOperation(
      'medicine_stock',
      updatedMed.id,
      'UPDATE',
      updatedMed,
      {
        userId: currentUser.id,
        userName: currentUser.name,
        userRole: currentUser.role,
        action: 'RECEIVE_MEDICINE_SHIPMENT',
        details: `Received ${receiveQty} ${selectedMed.unit} of ${selectedMed.brandName} (Batch ${receiveBatchNo}). New balance: ${newBalance}`
      }
    );

    showToast(`Received ${receiveQty} ${selectedMed.unit}. New balance: ${newBalance}`, 'success');
    setShowReceiveModal(false);
    await loadStockData();
  };

  // Filtered medicines
  const filteredMeds = medicines.filter(m => {
    const q = searchTerm.toLowerCase();
    const matchesSearch =
      m.brandName.toLowerCase().includes(q) ||
      m.genericName.toLowerCase().includes(q) ||
      m.medicineCode.toLowerCase().includes(q);
    const matchesCategory = filterCategory === 'All' || m.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  const categories = ['All', 'Antimalarial', 'Antibiotic', 'Analgesic', 'Antihypertensive', 'Antidiabetic', 'Rehydration'];

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Banner and Search Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white dark:bg-slate-850 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Pill className="w-5 h-5 text-teal-600" />
            <span>Pharmacy Stock Ledger &amp; Dispensing Station</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Offline inventory management with batch tracking, expiry date monitors, and stock reconciliations.
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search formulary..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
            />
          </div>

          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium"
          >
            {categories.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Grid: Medicines Table + Stock Movement Ledger */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Formulary Inventory */}
        <div className="lg:col-span-7 space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500 px-1">
            <span>Essential Medicines List ({filteredMeds.length})</span>
            <span className="flex items-center gap-2">
              <span className="flex items-center gap-1 text-amber-600">
                <AlertTriangle className="w-3 h-3" /> Low Stock
              </span>
            </span>
          </div>

          <div className="space-y-2.5 max-h-[calc(100vh-270px)] overflow-y-auto pr-1">
            {filteredMeds.map((med) => {
              const isLowStock = med.currentQuantity <= med.minReorderLevel;
              const isSelected = selectedMed?.id === med.id;

              return (
                <div
                  key={med.id}
                  onClick={() => setSelectedMed(med)}
                  className={`p-3.5 rounded-xl border text-xs cursor-pointer transition ${
                    isSelected
                      ? 'bg-teal-50/70 dark:bg-teal-950/40 border-teal-500 shadow-xs'
                      : 'bg-white dark:bg-slate-850 border-slate-200 dark:border-slate-800 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                        <span>{med.brandName}</span>
                        <span className="text-slate-400 font-normal">({med.strength})</span>
                        {isLowStock && (
                          <span className="px-1.5 py-0.5 rounded-xs bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-bold text-[10px] flex items-center gap-1">
                            <AlertTriangle className="w-2.5 h-2.5" /> Reorder Needed
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-teal-600 dark:text-teal-400 font-medium">
                        {med.genericName} • <span className="font-mono text-slate-500">[{med.medicineCode}]</span>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className={`text-base font-extrabold ${isLowStock ? 'text-amber-600' : 'text-slate-900 dark:text-white'}`}>
                        {med.currentQuantity} <span className="text-xs font-normal text-slate-500">{med.unit}</span>
                      </div>
                      <div className="text-[10px] text-slate-400">Min: {med.minReorderLevel} {med.unit}</div>
                    </div>
                  </div>

                  {/* Batches Preview */}
                  <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-2 text-[11px] text-slate-500">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">Batches on shelf:</span>
                    {med.batches.map((b, i) => (
                      <span key={i} className="px-1.5 py-0.5 rounded-xs bg-slate-100 dark:bg-slate-800 font-mono text-[10px]">
                        {b.batchNumber}: {b.quantity} (Exp: {b.expiryDate})
                      </span>
                    ))}
                  </div>

                  <div className="mt-3 flex items-center justify-end gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedMed(med);
                        setSelectedBatch(med.batches[0]?.batchNumber || '');
                        setShowDispenseModal(true);
                      }}
                      className="px-2.5 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded-md text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <ArrowDownCircle className="w-3 h-3" />
                      <span>Dispense Out</span>
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedMed(med);
                        setReceiveBatchNo(`BAT-${new Date().getFullYear()}-${Math.floor(10 + Math.random() * 90)}`);
                        setShowReceiveModal(true);
                      }}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded-md text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <ArrowUpCircle className="w-3 h-3" />
                      <span>Receive Stock</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Stock Movement Ledger & Audit */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500 px-1">
            <span className="font-semibold flex items-center gap-1.5 text-slate-700 dark:text-slate-200">
              <FileSpreadsheet className="w-4 h-4 text-teal-600" />
              <span>Offline Stock Transaction Ledger</span>
            </span>
            <span className="font-mono text-[11px]">{movements.length} logged</span>
          </div>

          <div className="bg-white dark:bg-slate-850 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-xs space-y-3 max-h-[calc(100vh-270px)] overflow-y-auto">
            {movements.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-xs">
                No stock transactions recorded yet. Dispense or receive stock to populate the audit ledger.
              </div>
            ) : (
              movements.map((mov) => {
                const isOut = mov.quantityDelta < 0;
                return (
                  <div
                    key={mov.id}
                    className="p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        {isOut ? (
                          <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                        ) : (
                          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        )}
                        <span>{mov.medicineName}</span>
                      </span>

                      <span className={`font-mono font-bold ${isOut ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {mov.quantityDelta > 0 ? `+${mov.quantityDelta}` : mov.quantityDelta}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-500 flex items-center justify-between">
                      <span>Batch: <strong className="font-mono text-slate-700 dark:text-slate-300">{mov.batchNumber}</strong></span>
                      <span>Balance: <strong className="font-mono text-slate-700 dark:text-slate-300">{mov.balanceAfter}</strong></span>
                    </div>

                    <div className="text-[10px] text-slate-400 flex items-center justify-between pt-1">
                      <span>By: {mov.performedByName}</span>
                      <span>{new Date(mov.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* MODAL: Dispense Medicine */}
      {showDispenseModal && selectedMed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <ArrowDownCircle className="w-5 h-5 text-teal-600" />
                <span>Dispense Medicine: {selectedMed.brandName}</span>
              </h3>
              <button onClick={() => setShowDispenseModal(false)} className="text-slate-400 font-bold">✕</button>
            </div>

            <form onSubmit={handleDispense} className="mt-4 space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Select Stock Batch to Deduct From
                </label>
                <select
                  required
                  value={selectedBatch}
                  onChange={(e) => setSelectedBatch(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg font-mono font-medium"
                >
                  {selectedMed.batches.map(b => (
                    <option key={b.batchNumber} value={b.batchNumber}>
                      {b.batchNumber} - In Stock: {b.quantity} (Exp: {b.expiryDate})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Quantity to Dispense ({selectedMed.unit})
                </label>
                <input
                  type="number"
                  min="1"
                  max={selectedMed.currentQuantity}
                  value={dispenseQty}
                  onChange={(e) => setDispenseQty(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg font-bold text-sm"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Prescription Reference / Notes
                </label>
                <input
                  type="text"
                  placeholder="e.g. Rx for Tatenda Mutasa / Malaria protocol"
                  value={dispenseNotes}
                  onChange={(e) => setDispenseNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowDispenseModal(false)}
                  className="px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-semibold"
                >
                  Commit Dispensing &amp; Log Movement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Receive Shipment */}
      {showReceiveModal && selectedMed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <ArrowUpCircle className="w-5 h-5 text-teal-600" />
                <span>Receive Medicine Shipment</span>
              </h3>
              <button onClick={() => setShowReceiveModal(false)} className="text-slate-400 font-bold">✕</button>
            </div>

            <form onSubmit={handleReceiveStock} className="mt-4 space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Batch Number
                </label>
                <input
                  type="text"
                  required
                  value={receiveBatchNo}
                  onChange={(e) => setReceiveBatchNo(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg font-mono font-bold"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Expiry Date
                </label>
                <input
                  type="date"
                  required
                  value={receiveExpiry}
                  onChange={(e) => setReceiveExpiry(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Quantity Received ({selectedMed.unit})
                </label>
                <input
                  type="number"
                  min="1"
                  value={receiveQty}
                  onChange={(e) => setReceiveQty(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg font-bold text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowReceiveModal(false)}
                  className="px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-semibold"
                >
                  Commit Restock to Shelf
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
