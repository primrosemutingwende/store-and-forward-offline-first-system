import React, { useState } from 'react';
import {
  Activity,
  Wifi,
  WifiOff,
  Radio,
  ServerCrash,
  RefreshCw,
  AlertTriangle,
  User,
  ChevronDown,
  Inbox,
  ShieldCheck
} from 'lucide-react';
import { useClinic } from '../context/ClinicContext';
import { PWAInstallButton } from './PWAInstallButton';
import type { NetworkCondition, ClinicUser } from '../types/clinic';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, setActiveTab }) => {
  const {
    currentUser,
    setCurrentUser,
    staffList,
    networkCondition,
    setNetworkCondition,
    syncMetrics,
    isSyncing,
    triggerManualSync,
    facilityName
  } = useClinic();

  const [showNetworkMenu, setShowNetworkMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const getNetworkBadge = () => {
    switch (networkCondition) {
      case 'online':
        return {
          icon: <Wifi className="w-3.5 h-3.5 text-emerald-400" />,
          label: 'Online (MoH Cloud)',
          bg: 'bg-emerald-950/80 border-emerald-500/30 text-emerald-300'
        };
      case 'unstable_2g':
        return {
          icon: <Radio className="w-3.5 h-3.5 text-amber-400 animate-pulse" />,
          label: 'Unstable 2G (Slow/Drops)',
          bg: 'bg-amber-950/80 border-amber-500/30 text-amber-300'
        };
      case 'offline':
        return {
          icon: <WifiOff className="w-3.5 h-3.5 text-rose-400" />,
          label: 'Offline (Store-and-Forward)',
          bg: 'bg-rose-950/80 border-rose-500/30 text-rose-300'
        };
      case 'server_down':
        return {
          icon: <ServerCrash className="w-3.5 h-3.5 text-red-400" />,
          label: 'Central Server 503',
          bg: 'bg-red-950/80 border-red-500/30 text-red-300'
        };
    }
  };

  const badge = getNetworkBadge();

  return (
    <header className="sticky top-0 z-40 bg-slate-900 border-b border-slate-800 text-white shadow-md">
      {/* Primary header bar */}
      <div className="px-3 sm:px-6 py-2.5 flex items-center justify-between gap-3">
        {/* Brand & Clinic Info */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-teal-600 to-emerald-500 flex items-center justify-center text-white shadow-sm ring-1 ring-white/20">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base tracking-tight text-white flex items-center gap-1.5">
                Equator MedFlow
                <span className="text-[10px] uppercase font-mono tracking-wider px-1.5 py-0.5 rounded-sm bg-teal-500/20 text-teal-300 border border-teal-500/30 font-semibold">
                  Offline-First OS
                </span>
              </span>
            </div>
            <p className="text-xs text-slate-400 flex items-center gap-1">
              <span>{facilityName}</span>
              <span className="text-slate-600">•</span>
              <span className="text-slate-400 font-mono text-[11px]">IndexedDB v1</span>
            </p>
          </div>
        </div>

        {/* Center / Right Control Hub */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Network Simulator Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setShowNetworkMenu(!showNetworkMenu);
                setShowUserMenu(false);
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition cursor-pointer ${badge.bg}`}
              title="Click to simulate clinic network connectivity"
            >
              {badge.icon}
              <span className="font-semibold hidden md:inline">{badge.label}</span>
              <span className="font-semibold md:hidden">
                {networkCondition === 'online' ? 'Online' : networkCondition === 'offline' ? 'Offline' : '2G'}
              </span>
              <ChevronDown className="w-3 h-3 opacity-70" />
            </button>

            {showNetworkMenu && (
              <div className="absolute right-0 mt-2 w-64 bg-slate-850 rounded-xl shadow-2xl border border-slate-700 p-2 z-50 text-slate-200">
                <div className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800">
                  Simulate Network Environment
                </div>
                <div className="space-y-1 mt-1">
                  <button
                    onClick={() => {
                      setNetworkCondition('online');
                      setShowNetworkMenu(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-xs transition ${
                      networkCondition === 'online' ? 'bg-teal-600/30 text-teal-300 font-semibold' : 'hover:bg-slate-800'
                    }`}
                  >
                    <Wifi className="w-4 h-4 text-emerald-400" />
                    <div>
                      <div>Online (Broadband / LTE)</div>
                      <div className="text-[10px] text-slate-400">Immediate background synchronization</div>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      setNetworkCondition('unstable_2g');
                      setShowNetworkMenu(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-xs transition ${
                      networkCondition === 'unstable_2g' ? 'bg-amber-600/30 text-amber-300 font-semibold' : 'hover:bg-slate-800'
                    }`}
                  >
                    <Radio className="w-4 h-4 text-amber-400" />
                    <div>
                      <div>Unstable 2G (Rural Mast)</div>
                      <div className="text-[10px] text-slate-400">1.2s delay & 35% packet drops</div>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      setNetworkCondition('offline');
                      setShowNetworkMenu(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-xs transition ${
                      networkCondition === 'offline' ? 'bg-rose-600/30 text-rose-300 font-semibold' : 'hover:bg-slate-800'
                    }`}
                  >
                    <WifiOff className="w-4 h-4 text-rose-400" />
                    <div>
                      <div>Offline (No Connection)</div>
                      <div className="text-[10px] text-slate-400">Pure local IndexedDB & Outbox queue</div>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      setNetworkCondition('server_down');
                      setShowNetworkMenu(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-xs transition ${
                      networkCondition === 'server_down' ? 'bg-red-600/30 text-red-300 font-semibold' : 'hover:bg-slate-800'
                    }`}
                  >
                    <ServerCrash className="w-4 h-4 text-red-400" />
                    <div>
                      <div>Central Server Outage (503)</div>
                      <div className="text-[10px] text-slate-400">Central cloud API returns 503 error</div>
                    </div>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Outbox Badge */}
          <button
            onClick={() => setActiveTab('sync')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition ${
              syncMetrics.pendingOutboxCount > 0
                ? 'bg-amber-950/80 border-amber-500/40 text-amber-300 animate-pulse'
                : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-800'
            }`}
            title="View Outbox Queue and synchronization pipeline"
          >
            <Inbox className="w-3.5 h-3.5" />
            <span>Outbox:</span>
            <span className="font-mono bg-black/40 px-1.5 py-0.2 rounded-sm text-xs font-bold">
              {syncMetrics.pendingOutboxCount}
            </span>
          </button>

          {/* Conflict Alert Badge (if any) */}
          {syncMetrics.conflictCount > 0 && (
            <button
              onClick={() => setActiveTab('sync')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-rose-950/90 border border-rose-500 text-rose-200 text-xs font-semibold animate-bounce"
              title="Concurrent edit conflict detected! Click to resolve."
            >
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
              <span>{syncMetrics.conflictCount} Conflict</span>
            </button>
          )}

          {/* Sync Now Action */}
          <button
            onClick={triggerManualSync}
            disabled={isSyncing || networkCondition === 'offline'}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-xs transition ${
              networkCondition === 'offline'
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                : 'bg-teal-600 hover:bg-teal-500 text-white'
            }`}
            title="Trigger push and pull sync with central server"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
          </button>

          {/* PWA Install Button */}
          <PWAInstallButton />

          {/* User Switcher / Staff Role */}
          <div className="relative">
            <button
              onClick={() => {
                setShowUserMenu(!showUserMenu);
                setShowNetworkMenu(false);
              }}
              className="flex items-center gap-2 pl-2 pr-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-750 border border-slate-700 text-xs transition"
            >
              <div className={`w-6 h-6 rounded-full ${currentUser.avatarColor} text-white flex items-center justify-center font-bold text-[10px]`}>
                {currentUser.name.charAt(currentUser.name.indexOf('.') > -1 ? currentUser.name.indexOf('.') + 2 : 0)}
              </div>
              <div className="text-left hidden lg:block">
                <div className="font-medium text-white leading-tight">{currentUser.name}</div>
                <div className="text-[10px] text-teal-400 capitalize">{currentUser.title}</div>
              </div>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {showUserMenu && (
              <div className="absolute right-0 mt-2 w-64 bg-slate-850 rounded-xl shadow-2xl border border-slate-700 p-2 z-50 text-slate-200">
                <div className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800 flex items-center justify-between">
                  <span>Switch Staff Role</span>
                  <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
                </div>
                <div className="space-y-1 mt-1">
                  {staffList.map((user) => (
                    <button
                      key={user.id}
                      onClick={() => {
                        setCurrentUser(user);
                        setShowUserMenu(false);
                      }}
                      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-xs transition ${
                        currentUser.id === user.id ? 'bg-teal-600/30 text-teal-300 font-semibold' : 'hover:bg-slate-800'
                      }`}
                    >
                      <div className={`w-7 h-7 rounded-full ${user.avatarColor} text-white flex items-center justify-center font-bold text-[11px]`}>
                        {user.name.charAt(user.name.indexOf('.') > -1 ? user.name.indexOf('.') + 2 : 0)}
                      </div>
                      <div>
                        <div className="text-slate-100 font-medium">{user.name}</div>
                        <div className="text-[10px] text-slate-400">{user.title} ({user.role})</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Navigation tabs */}
      <nav className="px-3 sm:px-6 flex items-center gap-1 overflow-x-auto border-t border-slate-800 text-xs font-medium no-scrollbar">
        <button
          onClick={() => setActiveTab('queue')}
          className={`px-3 py-2 border-b-2 whitespace-nowrap transition flex items-center gap-1.5 ${
            activeTab === 'queue'
              ? 'border-teal-400 text-teal-300 font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>Outpatient Queue &amp; Triage</span>
        </button>

        <button
          onClick={() => setActiveTab('patients')}
          className={`px-3 py-2 border-b-2 whitespace-nowrap transition flex items-center gap-1.5 ${
            activeTab === 'patients'
              ? 'border-teal-400 text-teal-300 font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>Patient Registry &amp; Matching</span>
        </button>

        <button
          onClick={() => setActiveTab('consultation')}
          className={`px-3 py-2 border-b-2 whitespace-nowrap transition flex items-center gap-1.5 ${
            activeTab === 'consultation'
              ? 'border-teal-400 text-teal-300 font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>Clinical Consultation</span>
        </button>

        <button
          onClick={() => setActiveTab('pharmacy')}
          className={`px-3 py-2 border-b-2 whitespace-nowrap transition flex items-center gap-1.5 ${
            activeTab === 'pharmacy'
              ? 'border-teal-400 text-teal-300 font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>Pharmacy &amp; Stock Ledger</span>
        </button>

        <button
          onClick={() => setActiveTab('sync')}
          className={`px-3 py-2 border-b-2 whitespace-nowrap transition flex items-center gap-1.5 ${
            activeTab === 'sync'
              ? 'border-teal-400 text-teal-300 font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <span className="flex items-center gap-1">
            <span>Sync Engine &amp; Outbox</span>
            {syncMetrics.pendingOutboxCount > 0 && (
              <span className="w-2 h-2 rounded-full bg-amber-400"></span>
            )}
            {syncMetrics.conflictCount > 0 && (
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
            )}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('reports')}
          className={`px-3 py-2 border-b-2 whitespace-nowrap transition flex items-center gap-1.5 ${
            activeTab === 'reports'
              ? 'border-teal-400 text-teal-300 font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>Daily Reports &amp; Audit Trail</span>
        </button>
      </nav>
    </header>
  );
};
