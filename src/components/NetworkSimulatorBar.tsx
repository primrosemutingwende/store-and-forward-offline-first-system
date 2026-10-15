import React from 'react';
import { WifiOff, Radio, ServerCrash, CheckCircle2, ArrowRight } from 'lucide-react';
import { useClinic } from '../context/ClinicContext';

export const NetworkSimulatorBar: React.FC = () => {
  const { networkCondition, setNetworkCondition, syncMetrics } = useClinic();

  if (networkCondition === 'online') {
    return null;
  }

  return (
    <div className={`px-4 py-2 border-b text-xs flex flex-wrap items-center justify-between gap-2 shadow-xs transition-colors ${
      networkCondition === 'offline'
        ? 'bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-200'
        : networkCondition === 'unstable_2g'
        ? 'bg-sky-500/10 border-sky-500/30 text-sky-900 dark:text-sky-200'
        : 'bg-rose-500/10 border-rose-500/30 text-rose-900 dark:text-rose-200'
    }`}>
      <div className="flex items-center gap-2">
        {networkCondition === 'offline' && <WifiOff className="w-4 h-4 text-amber-600 shrink-0" />}
        {networkCondition === 'unstable_2g' && <Radio className="w-4 h-4 text-sky-600 shrink-0 animate-pulse" />}
        {networkCondition === 'server_down' && <ServerCrash className="w-4 h-4 text-rose-600 shrink-0" />}

        <div>
          <span className="font-bold uppercase tracking-wider text-[11px] mr-1.5">
            {networkCondition === 'offline' && 'Offline-First Mode Active'}
            {networkCondition === 'unstable_2g' && 'Weak 2G Cellular Link'}
            {networkCondition === 'server_down' && 'Central Cloud Server 503 Outage'}
          </span>
          <span className="opacity-90">
            {networkCondition === 'offline' &&
              `No internet connection. Everything you save (patients, consultations, stock) commits safely to IndexedDB with ${syncMetrics.pendingOutboxCount} items currently in Outbox waiting for connectivity.`}
            {networkCondition === 'unstable_2g' &&
              'Simulating rural cellular mast with 1,200ms latency and 35% packet drops. Outbox handles retries gracefully.'}
            {networkCondition === 'server_down' &&
              'Central Ministry server is unavailable. Clinic operations continue without interruption.'}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => setNetworkCondition('online')}
          className="flex items-center gap-1 px-2.5 py-1 rounded bg-teal-600 hover:bg-teal-700 text-white font-medium text-[11px] transition shadow-xs"
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Restore Online Connection</span>
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};
