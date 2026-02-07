'use client';

import {
  Users,
  Target,
  TrendingUp,
  UserPlus,
  HandHeart,
  Handshake,
  Calendar,
} from 'lucide-react';
import { StatCard, ProgressBar, Card, CardTitle } from '@/components/ui';
import { dashboardStats, chapterGoals, upcomingEvents, impactStats } from '@/data/stats';
import { ChapterName } from '@/types';

const chapterColors: Record<ChapterName, 'blue' | 'green' | 'amber' | 'purple'> = {
  North: 'green',
  South: 'amber',
  Uptown: 'purple',
  FLOC: 'blue',
  Alumni: 'blue',
};

export function DashboardTab() {
  const membershipProgress = Math.round(
    (dashboardStats.currentMembers / dashboardStats.targetMembers) * 100
  );

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
            <p className="text-5xl font-bold">{dashboardStats.currentMembers}</p>
            <p className="text-blue-200 text-sm">Current Members</p>
          </div>
          <div className="text-4xl font-light text-blue-300">/</div>
          <div>
            <p className="text-5xl font-bold">{dashboardStats.targetMembers}</p>
            <p className="text-blue-200 text-sm">2026 Goal</p>
          </div>
          <div className="flex-1 max-w-xs">
            <div className="bg-white/20 rounded-full h-4 overflow-hidden">
              <div
                className="h-full bg-white rounded-full transition-all duration-500"
                style={{ width: `${membershipProgress}%` }}
              />
            </div>
            <p className="text-blue-200 text-sm mt-2">
              {membershipProgress}% to goal ({dashboardStats.targetMembers - dashboardStats.currentMembers} needed)
            </p>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Members"
          value={dashboardStats.currentMembers}
          subtitle={`Target: ${dashboardStats.targetMembers}`}
          icon={Users}
          color="blue"
        />
        <StatCard
          title="Guests in Pipeline"
          value={dashboardStats.guestsInPipeline}
          subtitle="Active prospects"
          icon={UserPlus}
          color="purple"
        />
        <StatCard
          title="New This Month"
          value={dashboardStats.newMembersThisMonth}
          subtitle="January 2026"
          icon={TrendingUp}
          trend={{ value: 12, isPositive: true }}
          color="green"
        />
        <StatCard
          title="Seats Available"
          value={dashboardStats.targetMembers - dashboardStats.currentMembers}
          subtitle="Across all chapters"
          icon={Target}
          color="amber"
        />
      </div>

      {/* Chapter Progress */}
      <Card padding="lg">
        <CardTitle subtitle="Progress toward 2026 chapter goals">
          Chapter Membership Goals
        </CardTitle>
        <div className="mt-6 space-y-5">
          {(Object.entries(chapterGoals) as [ChapterName, { current: number; target: number }][]).map(
            ([chapter, { current, target }]) => (
              <ProgressBar
                key={chapter}
                label={chapter === 'FLOC' ? 'FLOC (Future Leaders)' : `BLOC ${chapter}`}
                current={current}
                target={target}
                color={chapterColors[chapter]}
              />
            )
          )}
        </div>
      </Card>

      {/* Bottom Grid */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Community Impact */}
        <Card padding="lg">
          <CardTitle subtitle="Since 2001">
            Community Impact
          </CardTitle>
          <div className="mt-6 grid grid-cols-3 gap-4">
            <div className="text-center p-4 bg-emerald-50 rounded-xl">
              <Handshake className="mx-auto text-emerald-600 mb-2" size={28} />
              <p className="text-2xl font-bold text-slate-900">
                {impactStats.referralsSince2018}
              </p>
              <p className="text-sm text-slate-600">Referrals Given</p>
            </div>
            <div className="text-center p-4 bg-blue-50 rounded-xl">
              <TrendingUp className="mx-auto text-bloc-blue mb-2" size={28} />
              <p className="text-2xl font-bold text-slate-900">
                {impactStats.transactionsSince2018}
              </p>
              <p className="text-sm text-slate-600">Transactions</p>
            </div>
            <div className="text-center p-4 bg-amber-50 rounded-xl">
              <HandHeart className="mx-auto text-amber-600 mb-2" size={28} />
              <p className="text-2xl font-bold text-slate-900">
                {impactStats.charityRaisedSince2001}
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
    </div>
  );
}
