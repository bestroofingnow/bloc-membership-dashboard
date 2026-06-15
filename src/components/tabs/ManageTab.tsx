'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { visibleManageTools, type Role } from '@/lib/nav/manage';
import { TargetsTab } from './TargetsTab';
import { PipelineTab } from './PipelineTab';
import { IntakeGuestsTab } from './IntakeGuestsTab';
import { EventsTab } from './EventsTab';
import { QrTokensTab } from './QrTokensTab';
import { RosterTab } from './RosterTab';
import { SeatMapTab } from './SeatMapTab';
import { MemberTaxonomyTab } from './MemberTaxonomyTab';
import { AdminTab } from './AdminTab';

const COMPONENTS: Record<string, React.ReactNode> = {
  targets: <TargetsTab />,
  pipeline: <PipelineTab />,
  intake: <IntakeGuestsTab />,
  events: <EventsTab />,
  qr: <QrTokensTab />,
  roster: <RosterTab />,
  seats: <SeatMapTab />,
  taxonomy: <MemberTaxonomyTab />,
  admin: <AdminTab />,
};

/**
 * The single staff "Manage" hub — collapses the former nine staff tabs into one
 * place with an inner sub-navigation. Tools shown are role-gated (admins see all,
 * directors see non-admin tools) via the tested visibleManageTools().
 */
export function ManageTab() {
  const { isAdmin, isDirector } = useAuth();
  const role: Role = isAdmin ? 'admin' : isDirector ? 'chapter_director' : 'member';
  const tools = visibleManageTools(role);
  const [active, setActive] = useState<string>(tools[0]?.key ?? '');

  if (tools.length === 0) {
    return <div className="text-sm text-gray-500">You don&apos;t have access to management tools.</div>;
  }

  const current = tools.find((t) => t.key === active) ?? tools[0];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {tools.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActive(t.key)}
            aria-current={current.key === t.key ? 'page' : undefined}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              current.key === t.key ? 'bg-bloc-navy text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div>{COMPONENTS[current.key]}</div>
    </div>
  );
}
