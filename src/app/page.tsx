'use client';

import { useState, useMemo } from 'react';
import {
  LayoutDashboard,
  Users,
  Search,
  Target,
  UserPlus,
  BookOpen,
  Menu,
  X,
  ExternalLink,
  LogOut,
  Shield,
  CreditCard,
} from 'lucide-react';
import {
  DashboardTab,
  LeadershipTab,
  MembersTab,
  TargetsTab,
  PipelineTab,
  MembershipGuideTab,
  AdminTab,
  ScannerTab,
  IntakeGuestsTab,
  EventsTab,
  QrTokensTab,
  RosterTab,
  MyProfileTab,
  MemberTaxonomyTab,
  SeatMapTab,
} from '@/components/tabs';
import { Inbox, CalendarDays, QrCode, Users2, UserCircle, Sparkles, Grid3x3 } from 'lucide-react';
import { AuthGuard } from '@/components/auth';
import { useAuth } from '@/contexts/AuthContext';
import { TabId } from '@/types';

type TabGroup = 'core' | 'guestflow' | 'personal' | 'admin';

interface TabConfig {
  id: TabId;
  label: string;
  icon: React.ReactNode;
  component: React.ReactNode;
  group: TabGroup;
}

const GROUP_LABEL: Record<TabGroup, string> = {
  core: 'Membership',
  guestflow: 'Guest Flow',
  personal: 'You',
  admin: 'Admin',
};

const baseTabs: TabConfig[] = [
  { id: 'dashboard', label: 'Dashboard',         icon: <LayoutDashboard size={18} />, component: <DashboardTab />,        group: 'core' },
  { id: 'leadership', label: 'Leadership',       icon: <Users size={18} />,           component: <LeadershipTab />,       group: 'core' },
  { id: 'members', label: 'Members',             icon: <Search size={18} />,          component: <MembersTab />,          group: 'core' },
  { id: 'targets', label: 'Most Wanted',         icon: <Target size={18} />,          component: <TargetsTab />,          group: 'core' },
  { id: 'pipeline', label: 'Guest Pipeline',     icon: <UserPlus size={18} />,        component: <PipelineTab />,         group: 'core' },
  { id: 'scanner', label: 'Card Scanner',        icon: <CreditCard size={18} />,      component: <ScannerTab />,          group: 'core' },
  { id: 'guide', label: 'Membership Guide',      icon: <BookOpen size={18} />,        component: <MembershipGuideTab />,  group: 'core' },
];

function DashboardContent() {
  const { profile, signOut, isConfigured, isAdmin, isDirector } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const displayName = profile?.fullName || 'BLOC Member';
  const displayRole =
    profile?.role === 'admin'
      ? 'Admin'
      : profile?.role === 'chapter_director'
        ? `${profile.chapter || ''} Director`
        : 'Member';

  const tabs = useMemo(() => {
    // Build the role-appropriate set of tabs, each tagged with a `group` so the
    // nav can render them in clear visual sections.
    const all: TabConfig[] = [...baseTabs];
    if (isAdmin || isDirector) {
      all.push(
        { id: 'intake', label: 'Guest Inbox',     icon: <Inbox size={18} />,       component: <IntakeGuestsTab />, group: 'guestflow' },
        { id: 'events', label: 'Events',          icon: <CalendarDays size={18} />, component: <EventsTab />,       group: 'guestflow' },
        { id: 'qr', label: 'QR Codes',            icon: <QrCode size={18} />,      component: <QrTokensTab />,     group: 'guestflow' },
        { id: 'roster', label: 'Roster',          icon: <Users2 size={18} />,      component: <RosterTab />,       group: 'guestflow' },
        { id: 'seats', label: 'Category Seats',   icon: <Grid3x3 size={18} />,     component: <SeatMapTab />,      group: 'guestflow' },
      );
    }
    all.push({ id: 'me', label: 'My Profile', icon: <UserCircle size={18} />, component: <MyProfileTab />, group: 'personal' });
    if (isAdmin) {
      all.push(
        { id: 'taxonomy', label: 'Member Taxonomy', icon: <Sparkles size={18} />, component: <MemberTaxonomyTab />, group: 'admin' },
        { id: 'admin', label: 'Admin',              icon: <Shield size={18} />,   component: <AdminTab />,           group: 'admin' },
      );
    }
    // Stable group order: core → guestflow → personal → admin
    const order: TabGroup[] = ['core', 'guestflow', 'personal', 'admin'];
    return all.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
  }, [isAdmin, isDirector]);

  // Index of where each group starts in the tabs array (for separator render)
  const groupBoundaries = useMemo(() => {
    const boundaries = new Set<number>();
    let lastGroup: TabGroup | null = null;
    tabs.forEach((t, i) => {
      if (lastGroup !== null && t.group !== lastGroup) boundaries.add(i);
      lastGroup = t.group;
    });
    return boundaries;
  }, [tabs]);

  const currentTab = tabs.find((t) => t.id === activeTab);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-bloc-navy to-bloc-blue text-white shadow-lg sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 sm:h-20">
            {/* Logo & Title */}
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white rounded-xl flex items-center justify-center shadow-md">
                <span className="text-bloc-navy font-display font-bold text-lg sm:text-xl">
                  B
                </span>
              </div>
              <div>
                <h1 className="text-lg sm:text-2xl font-display font-bold tracking-tight">
                  BLOC 2026 Dashboard
                </h1>
                <p className="text-blue-200 text-xs sm:text-sm hidden sm:block">
                  Drive to 125 Members
                </p>
              </div>
            </div>

            {/* User Info & External Link */}
            <div className="flex items-center gap-4">
              <a
                href="https://businessleadersofcharlotte.com"
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:flex items-center gap-1.5 text-sm text-blue-200 hover:text-white transition-colors"
              >
                <span>BLOC Website</span>
                <ExternalLink size={14} />
              </a>
              <div className="hidden sm:block text-right">
                <p className="font-semibold text-sm">{displayName}</p>
                <p className="text-xs text-blue-200">{displayRole}</p>
              </div>
              {isConfigured && (
                <button
                  onClick={signOut}
                  className="hidden sm:flex items-center gap-1.5 text-sm text-blue-200 hover:text-white transition-colors p-2 hover:bg-white/10 rounded-lg"
                  title="Sign Out"
                >
                  <LogOut size={16} />
                </button>
              )}

              {/* Mobile Menu Button */}
              <button
                className="sm:hidden p-2 hover:bg-white/10 rounded-lg transition-colors"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
            </div>
          </div>
        </div>

        {/* Navigation - Desktop */}
        <nav className="hidden sm:block border-t border-white/10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex -mb-px overflow-x-auto">
              {tabs.map((tab, i) => (
                <div key={tab.id} className="flex items-center">
                  {groupBoundaries.has(i) && (
                    <span aria-hidden="true" className="mx-1 h-6 w-px bg-white/20 self-center" />
                  )}
                  <button
                    onClick={() => setActiveTab(tab.id)}
                    title={`${GROUP_LABEL[tab.group]} · ${tab.label}`}
                    className={`flex items-center gap-2 px-3 lg:px-4 py-4 border-b-2 transition-all font-medium text-sm whitespace-nowrap ${
                      activeTab === tab.id
                        ? 'border-white text-white bg-white/10'
                        : 'border-transparent text-blue-200 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {tab.icon}
                    <span>{tab.label}</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </nav>

        {/* Navigation - Mobile */}
        {mobileMenuOpen && (
          <nav className="sm:hidden border-t border-white/10 bg-bloc-navy/95 backdrop-blur-sm">
            <div className="px-4 py-2 space-y-1">
              {tabs.map((tab, i) => (
                <div key={tab.id}>
                  {groupBoundaries.has(i) && (
                    <div className="px-4 pt-3 pb-1 text-[10px] uppercase tracking-widest text-blue-300/70">
                      {GROUP_LABEL[tab.group]}
                    </div>
                  )}
                  {i === 0 && (
                    <div className="px-4 pt-1 pb-1 text-[10px] uppercase tracking-widest text-blue-300/70">
                      {GROUP_LABEL[tab.group]}
                    </div>
                  )}
                  <button
                    onClick={() => {
                      setActiveTab(tab.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all font-medium ${
                      activeTab === tab.id
                        ? 'bg-white/10 text-white'
                        : 'text-blue-200 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    {tab.icon}
                    <span>{tab.label}</span>
                  </button>
                </div>
              ))}
              <div className="pt-3 pb-2 border-t border-white/10 mt-3">
                {isConfigured && (
                  <div className="flex items-center justify-between px-4 py-2 mb-2">
                    <span className="text-sm text-blue-200">{displayName}</span>
                    <button
                      onClick={signOut}
                      className="flex items-center gap-1.5 text-sm text-blue-200 hover:text-white"
                    >
                      <LogOut size={14} />
                      <span>Sign Out</span>
                    </button>
                  </div>
                )}
                <a
                  href="https://businessleadersofcharlotte.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-blue-200 hover:text-white px-4 py-2"
                >
                  <ExternalLink size={16} />
                  <span>Visit BLOC Website</span>
                </a>
              </div>
            </div>
          </nav>
        )}
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {currentTab?.component}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-center sm:text-left">
              <p className="text-sm text-slate-500">
                Business Leaders of Charlotte &copy; {new Date().getFullYear()}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Building friendships, growing business, and strengthening our community.
              </p>
            </div>
            <div className="flex items-center gap-4 text-sm text-slate-500">
              <a
                href="mailto:admin@businessleadersofcharlotte.com"
                className="hover:text-bloc-blue transition-colors"
              >
                Contact Admin
              </a>
              <span className="text-slate-300">|</span>
              <a
                href="https://businessleadersofcharlotte.com"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-bloc-blue transition-colors"
              >
                Main Website
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function HomePage() {
  return (
    <AuthGuard>
      <DashboardContent />
    </AuthGuard>
  );
}
