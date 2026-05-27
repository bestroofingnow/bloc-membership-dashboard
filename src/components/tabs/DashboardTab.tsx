'use client';

import { useState } from 'react';
import {
  Users,
  Target,
  TrendingUp,
  UserPlus,
  UserCheck,
  HandHeart,
  Handshake,
  Calendar,
  Pencil,
  Save,
  Loader2,
  Inbox,
  AlertCircle,
} from 'lucide-react';
import { StatCard, ProgressBar, Card, CardTitle, Button, Modal, Input, LunchLink } from '@/components/ui';
import { useMembers } from '@/hooks/useMembers';
import { useGuests } from '@/hooks/useGuests';
import { useIntakeGuests } from '@/hooks/useIntakeGuests';
import { useDashboardSettings } from '@/hooks/useDashboardSettings';
import { useAuth } from '@/contexts/AuthContext';
import { upcomingEvents } from '@/data/stats';
import { ChapterName } from '@/types';

const chapterColors: Record<ChapterName, 'blue' | 'green' | 'amber' | 'purple'> = {
  North: 'green',
  South: 'amber',
  Uptown: 'purple',
  FLOC: 'blue',
  Alumni: 'blue',
};

export function DashboardTab() {
  const { members, chapterCounts, fullMemberCount, afterHoursCount } = useMembers();
  const { guests } = useGuests();
  const { rows: intakeRows } = useIntakeGuests();
  const { targetMembers, chapterGoals, chapterLunchUrls, impactStats, updateMultiple } = useDashboardSettings();
  const { isAdmin, isDirector } = useAuth();

  const intakeRegistered = intakeRows.filter((r) => r.status === 'registered').length;
  const intakeNeedsAttention = intakeRows.filter(
    (r) => r.conflict_kind === 'other' || r.has_unresolved_side_effects,
  ).length;

  const currentMembers = fullMemberCount;
  const guestsInPipeline = guests.length;
  const membershipProgress = Math.round(
    (currentMembers / targetMembers) * 100
  );

  // Goals edit modal
  const [goalsModalOpen, setGoalsModalOpen] = useState(false);
  const [goalsSaving, setGoalsSaving] = useState(false);
  const [goalsForm, setGoalsForm] = useState({
    target_members: String(targetMembers),
    chapter_goal_north: String(chapterGoals.North),
    chapter_goal_south: String(chapterGoals.South),
    chapter_goal_uptown: String(chapterGoals.Uptown),
    chapter_goal_floc: String(chapterGoals.FLOC),
    chapter_goal_alumni: String(chapterGoals.Alumni),
  });

  const openGoalsModal = () => {
    setGoalsForm({
      target_members: String(targetMembers),
      chapter_goal_north: String(chapterGoals.North),
      chapter_goal_south: String(chapterGoals.South),
      chapter_goal_uptown: String(chapterGoals.Uptown),
      chapter_goal_floc: String(chapterGoals.FLOC),
      chapter_goal_alumni: String(chapterGoals.Alumni),
    });
    setGoalsModalOpen(true);
  };

  const saveGoals = async () => {
    setGoalsSaving(true);
    await updateMultiple(goalsForm);
    setGoalsSaving(false);
    setGoalsModalOpen(false);
  };

  // Impact edit modal
  const [impactModalOpen, setImpactModalOpen] = useState(false);
  const [impactSaving, setImpactSaving] = useState(false);
  const [impactForm, setImpactForm] = useState({
    impact_referrals: impactStats.referrals,
    impact_transactions: impactStats.transactions,
    impact_charity: impactStats.charity,
  });

  const openImpactModal = () => {
    setImpactForm({
      impact_referrals: impactStats.referrals,
      impact_transactions: impactStats.transactions,
      impact_charity: impactStats.charity,
    });
    setImpactModalOpen(true);
  };

  const saveImpact = async () => {
    setImpactSaving(true);
    await updateMultiple(impactForm);
    setImpactSaving(false);
    setImpactModalOpen(false);
  };

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-bloc-navy to-bloc-blue rounded-2xl p-8 text-white">
        <h2 className="text-2xl font-bold mb-2">
          Welcome to BLOC Membership Dashboard
        </h2>
        <p className="text-blue-100 max-w-2xl">
          Building friendships, growing business, and strengthening our community.
          Track your progress toward the 2026 membership goal.
        </p>
        <div className="mt-6 flex items-center gap-8">
          <div>
            <p className="text-5xl font-bold">{currentMembers}</p>
            <p className="text-blue-200 text-sm">Current Members</p>
          </div>
          <div className="text-4xl font-light text-blue-300">/</div>
          <div>
            <p className="text-5xl font-bold">{targetMembers}</p>
            <p className="text-blue-200 text-sm">2026 Goal</p>
          </div>
          <div className="flex-1 max-w-xs">
            <div className="bg-white/20 rounded-full h-4 overflow-hidden">
              <div
                className="h-full bg-white rounded-full transition-all duration-500"
                style={{ width: `${Math.min(membershipProgress, 100)}%` }}
              />
            </div>
            <p className="text-blue-200 text-sm mt-2">
              {membershipProgress}% to goal ({targetMembers - currentMembers} needed)
            </p>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Members"
          value={currentMembers}
          subtitle={`Target: ${targetMembers}`}
          icon={Users}
          color="blue"
        />
        <StatCard
          title="Guests in Pipeline"
          value={guestsInPipeline}
          subtitle="Active prospects"
          icon={UserPlus}
          color="purple"
        />
        <StatCard
          title="Seats Available"
          value={targetMembers - currentMembers}
          subtitle="Across all chapters"
          icon={Target}
          color="amber"
        />
        <StatCard
          title="Approved This Year"
          value={guests.filter((g) => g.status === 'Approved').length}
          subtitle="2026"
          icon={TrendingUp}
          color="green"
        />
        <StatCard
          title="After Hours Members"
          value={afterHoursCount}
          subtitle="Wait list — not in the 125 goal"
          icon={UserCheck}
          color="purple"
        />
      </div>

      {/* Public-flow intake activity — director/admin only */}
      {(isAdmin || isDirector) && (
        <div className="grid md:grid-cols-2 gap-4">
          <StatCard
            title="Guest RSVPs"
            value={intakeRegistered}
            subtitle="Registered through the public QR flow"
            icon={Inbox}
            color="blue"
          />
          <StatCard
            title="Needs attention"
            value={intakeNeedsAttention}
            subtitle='"Other" categories + sync failures'
            icon={AlertCircle}
            color={intakeNeedsAttention > 0 ? 'amber' : 'green'}
          />
        </div>
      )}

      {/* Chapter Progress */}
      <Card padding="lg">
        <div className="flex items-center justify-between">
          <CardTitle subtitle="Progress toward 2026 chapter goals">
            Chapter Membership Goals
          </CardTitle>
          {isAdmin && (
            <button
              onClick={openGoalsModal}
              className="p-2 text-slate-400 hover:text-bloc-blue hover:bg-blue-50 rounded-lg transition-colors"
              title="Edit goals"
            >
              <Pencil size={18} />
            </button>
          )}
        </div>
        <div className="mt-6 space-y-5">
          {(Object.entries(chapterGoals) as [ChapterName, number][]).map(
            ([chapter, target]) => (
              <div key={chapter} className="space-y-1.5">
                <ProgressBar
                  label={chapter === 'FLOC' ? 'FLOC (Future Leaders)' : `BLOC ${chapter}`}
                  current={chapterCounts[chapter] || 0}
                  target={target}
                  color={chapterColors[chapter]}
                />
                {chapterLunchUrls[chapter] && (
                  <LunchLink chapter={chapter} url={chapterLunchUrls[chapter]} />
                )}
              </div>
            )
          )}
        </div>
      </Card>

      {/* Bottom Grid */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Community Impact */}
        <Card padding="lg">
          <div className="flex items-center justify-between">
            <CardTitle subtitle="Since 2001">
              Community Impact
            </CardTitle>
            {isAdmin && (
              <button
                onClick={openImpactModal}
                className="p-2 text-slate-400 hover:text-bloc-blue hover:bg-blue-50 rounded-lg transition-colors"
                title="Edit impact stats"
              >
                <Pencil size={18} />
              </button>
            )}
          </div>
          <div className="mt-6 grid grid-cols-3 gap-4">
            <div className="text-center p-4 bg-emerald-50 rounded-xl">
              <Handshake className="mx-auto text-emerald-600 mb-2" size={28} />
              <p className="text-2xl font-bold text-slate-900">
                {impactStats.referrals}
              </p>
              <p className="text-sm text-slate-600">Referrals Given</p>
            </div>
            <div className="text-center p-4 bg-blue-50 rounded-xl">
              <TrendingUp className="mx-auto text-bloc-blue mb-2" size={28} />
              <p className="text-2xl font-bold text-slate-900">
                {impactStats.transactions}
              </p>
              <p className="text-sm text-slate-600">Transactions</p>
            </div>
            <div className="text-center p-4 bg-amber-50 rounded-xl">
              <HandHeart className="mx-auto text-amber-600 mb-2" size={28} />
              <p className="text-2xl font-bold text-slate-900">
                {impactStats.charity}
              </p>
              <p className="text-sm text-slate-600">Raised for Charity</p>
            </div>
          </div>
        </Card>

        {/* Upcoming Events */}
        <Card padding="lg">
          <CardTitle subtitle="Key dates to remember">
            Upcoming Events
          </CardTitle>
          <div className="mt-6 space-y-3">
            {upcomingEvents.slice(0, 4).map((event, index) => (
              <div
                key={index}
                className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <div className="p-2 bg-white rounded-lg shadow-sm">
                  <Calendar size={18} className="text-bloc-blue" />
                </div>
                <div>
                  <p className="font-medium text-slate-900">{event.name}</p>
                  <p className="text-sm text-slate-500">{event.date}</p>
                  {event.time && (
                    <p className="text-sm text-slate-400">{event.time}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Edit Goals Modal */}
      <Modal
        isOpen={goalsModalOpen}
        onClose={() => setGoalsModalOpen(false)}
        title="Edit Membership Goals"
        size="md"
      >
        <div className="space-y-4">
          <Input
            label="Overall Membership Target"
            type="number"
            value={goalsForm.target_members}
            onChange={(e) => setGoalsForm((p) => ({ ...p, target_members: e.target.value }))}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="North Goal"
              type="number"
              value={goalsForm.chapter_goal_north}
              onChange={(e) => setGoalsForm((p) => ({ ...p, chapter_goal_north: e.target.value }))}
            />
            <Input
              label="South Goal"
              type="number"
              value={goalsForm.chapter_goal_south}
              onChange={(e) => setGoalsForm((p) => ({ ...p, chapter_goal_south: e.target.value }))}
            />
            <Input
              label="Uptown Goal"
              type="number"
              value={goalsForm.chapter_goal_uptown}
              onChange={(e) => setGoalsForm((p) => ({ ...p, chapter_goal_uptown: e.target.value }))}
            />
            <Input
              label="FLOC Goal"
              type="number"
              value={goalsForm.chapter_goal_floc}
              onChange={(e) => setGoalsForm((p) => ({ ...p, chapter_goal_floc: e.target.value }))}
            />
            <Input
              label="Alumni Goal"
              type="number"
              value={goalsForm.chapter_goal_alumni}
              onChange={(e) => setGoalsForm((p) => ({ ...p, chapter_goal_alumni: e.target.value }))}
            />
          </div>
          <div className="flex gap-3 pt-4">
            <Button variant="secondary" className="flex-1" onClick={() => setGoalsModalOpen(false)}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={saveGoals} disabled={goalsSaving}>
              {goalsSaving ? (
                <><Loader2 size={14} className="mr-2 animate-spin" />Saving...</>
              ) : (
                <><Save size={14} className="mr-2" />Save Goals</>
              )}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Impact Stats Modal */}
      <Modal
        isOpen={impactModalOpen}
        onClose={() => setImpactModalOpen(false)}
        title="Edit Community Impact"
        size="md"
      >
        <div className="space-y-4">
          <Input
            label="Referrals Given"
            value={impactForm.impact_referrals}
            onChange={(e) => setImpactForm((p) => ({ ...p, impact_referrals: e.target.value }))}
            placeholder="e.g., 10,000+"
          />
          <Input
            label="Transactions"
            value={impactForm.impact_transactions}
            onChange={(e) => setImpactForm((p) => ({ ...p, impact_transactions: e.target.value }))}
            placeholder="e.g., 9,000+"
          />
          <Input
            label="Raised for Charity"
            value={impactForm.impact_charity}
            onChange={(e) => setImpactForm((p) => ({ ...p, impact_charity: e.target.value }))}
            placeholder="e.g., $732,171.45"
          />
          <div className="flex gap-3 pt-4">
            <Button variant="secondary" className="flex-1" onClick={() => setImpactModalOpen(false)}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={saveImpact} disabled={impactSaving}>
              {impactSaving ? (
                <><Loader2 size={14} className="mr-2 animate-spin" />Saving...</>
              ) : (
                <><Save size={14} className="mr-2" />Save</>
              )}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
