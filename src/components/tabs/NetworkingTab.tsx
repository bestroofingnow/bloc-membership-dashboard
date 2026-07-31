'use client';

import { useState } from 'react';
import { Handshake, Loader2, AlertCircle, ToggleLeft, ToggleRight } from 'lucide-react';
import { Card } from '@/components/ui';
import { useNetworkingStats, type NetworkingStatsRow } from '@/hooks/useNetworkingStats';
import { useDashboardSettings } from '@/hooks/useDashboardSettings';
import { useAuth } from '@/contexts/AuthContext';

type SortKey = 'meetings' | 'connections' | 'referralsGiven' | 'referralsClosedValue';

function sortRows(rows: NetworkingStatsRow[], key: SortKey): NetworkingStatsRow[] {
  return [...rows].sort((a, b) => b[key] - a[key]);
}

export function NetworkingTab() {
  const { rows, loading, error } = useNetworkingStats();
  const { settings, updateSetting } = useDashboardSettings();
  const { isAdmin } = useAuth();
  const [sortKey, setSortKey] = useState<SortKey>('referralsClosedValue');
  const [toggling, setToggling] = useState(false);

  const enabled = settings.networking_enabled !== 'false'; // default on
  const sorted = sortRows(rows, sortKey);

  async function handleToggle() {
    setToggling(true);
    await updateSetting('networking_enabled', enabled ? 'false' : 'true');
    setToggling(false);
  }

  const columns: { key: SortKey; label: string }[] = [
    { key: 'meetings', label: 'Meetings' },
    { key: 'connections', label: 'Connections' },
    { key: 'referralsGiven', label: 'Referrals Given' },
    { key: 'referralsClosedValue', label: 'Closed $' },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-l-4 border-blue-500 p-5 rounded-r-xl flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Handshake className="text-blue-600 mt-0.5" size={24} />
          <div>
            <h3 className="font-bold text-blue-900">Networking Activity</h3>
            <p className="text-sm text-blue-800 mt-1">
              Aggregate counts only — meeting notes and connection contact details are
              never shown here, only how much activity each member is logging.
            </p>
          </div>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={handleToggle}
            disabled={toggling}
            aria-pressed={enabled}
            className="flex items-center gap-2 shrink-0 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-medium text-blue-900 disabled:opacity-50"
          >
            {toggling ? (
              <Loader2 size={16} className="animate-spin" />
            ) : enabled ? (
              <ToggleRight size={20} className="text-emerald-600" />
            ) : (
              <ToggleLeft size={20} className="text-slate-400" />
            )}
            {enabled ? 'Enabled for all members' : 'Disabled for all members'}
          </button>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-bloc-blue" />
        </div>
      )}
      {error && (
        <div className="text-center py-10">
          <AlertCircle size={32} className="mx-auto mb-2 text-red-300" />
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}

      {!loading && !error && (
        <Card padding="sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="py-2 px-3 font-medium">Member</th>
                  {columns.map((c) => (
                    <th key={c.key} className="py-2 px-3 font-medium">
                      <button
                        type="button"
                        onClick={() => setSortKey(c.key)}
                        className={`hover:text-slate-900 ${sortKey === c.key ? 'text-bloc-blue font-semibold' : ''}`}
                      >
                        {c.label}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.member_id} className="border-b border-slate-100">
                    <td className="py-2 px-3">
                      <span className="font-medium text-slate-900">{r.name}</span>
                      {r.chapter && <span className="text-xs text-slate-400 ml-1.5">{r.chapter}</span>}
                    </td>
                    <td className="py-2 px-3">{r.meetings}</td>
                    <td className="py-2 px-3">
                      {r.connections}
                      {r.connectionsConverted > 0 && (
                        <span className="text-xs text-emerald-600 ml-1">({r.connectionsConverted} converted)</span>
                      )}
                    </td>
                    <td className="py-2 px-3">{r.referralsGiven}</td>
                    <td className="py-2 px-3">${r.referralsClosedValue.toLocaleString()}</td>
                  </tr>
                ))}
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      No activity logged yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
