'use client';

import { useState } from 'react';
import {
  Shield,
  Users,
  Mail,
  Clock,
  Loader2,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Calendar,
  Database,
  Trash2,
} from 'lucide-react';
import { Card, Badge, Button, Modal } from '@/components/ui';
import { useProfiles, Profile } from '@/hooks/useProfiles';
import { useAuth, UserRole, ChapterName } from '@/contexts/AuthContext';
import { useWildApricot } from '@/hooks/useWildApricot';

const roleLabels: Record<UserRole, string> = {
  admin: 'Admin',
  chapter_director: 'Chapter Director',
  member: 'Member (View Only)',
};

const roleColors: Record<UserRole, 'success' | 'info' | 'default'> = {
  admin: 'success',
  chapter_director: 'info',
  member: 'default',
};

const chapters: ChapterName[] = ['North', 'South', 'Uptown', 'FLOC', 'Alumni'];

function UserCard({
  profile,
  onRoleChange,
  onChapterChange,
  onRemove,
  currentUserId,
}: {
  profile: Profile;
  onRoleChange: (userId: string, role: UserRole) => Promise<void>;
  onChapterChange: (userId: string, chapter: ChapterName | null) => Promise<void>;
  onRemove: (profile: Profile) => void;
  currentUserId: string | undefined;
}) {
  const [updating, setUpdating] = useState(false);
  const isCurrentUser = profile.id === currentUserId;
  const isPending = profile.role === 'member';

  const handleRoleChange = async (role: UserRole) => {
    setUpdating(true);
    await onRoleChange(profile.id, role);
    setUpdating(false);
  };

  const handleChapterChange = async (chapter: string) => {
    setUpdating(true);
    await onChapterChange(profile.id, chapter === '' ? null : (chapter as ChapterName));
    setUpdating(false);
  };

  return (
    <Card
      className={`${isPending ? 'border-l-4 border-l-amber-400' : ''}`}
      padding="md"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-bloc-blue/10 flex items-center justify-center text-bloc-blue font-semibold">
            {(profile.fullName || profile.email)
              .split(' ')
              .map((n) => n[0])
              .join('')
              .toUpperCase()
              .slice(0, 2)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-medium text-slate-900">
                {profile.fullName || 'No name set'}
              </p>
              {isCurrentUser && (
                <span className="text-xs bg-bloc-blue/10 text-bloc-blue px-2 py-0.5 rounded-full">
                  You
                </span>
              )}
              {isPending && (
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                  Pending Approval
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-sm text-slate-500">
              <Mail size={12} />
              <span>{profile.email}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
              <Clock size={10} />
              <span>Joined {new Date(profile.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {updating && <Loader2 size={16} className="animate-spin text-slate-400" />}

          <select
            value={profile.role}
            onChange={(e) => handleRoleChange(e.target.value as UserRole)}
            disabled={updating || isCurrentUser}
            aria-label={`Role for ${profile.fullName || 'this user'}`}
            className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-sm focus:ring-2 focus:ring-bloc-blue focus:border-bloc-blue outline-none disabled:opacity-50"
          >
            <option value="member">Member (View Only)</option>
            <option value="chapter_director">Chapter Director</option>
            <option value="admin">Admin</option>
          </select>

          {profile.role === 'chapter_director' && (
            <select
              value={profile.chapter || ''}
              onChange={(e) => handleChapterChange(e.target.value)}
              disabled={updating}
              aria-label={`Chapter for ${profile.fullName || 'this user'}`}
              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-sm focus:ring-2 focus:ring-bloc-blue focus:border-bloc-blue outline-none disabled:opacity-50"
            >
              <option value="">No Chapter</option>
              {chapters.map((ch) => (
                <option key={ch} value={ch}>
                  {ch}
                </option>
              ))}
            </select>
          )}

          {!isCurrentUser && (
            <button
              onClick={() => onRemove(profile)}
              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title="Remove user access"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>
    </Card>
  );
}

export function AdminTab() {
  const { profile: currentProfile, isConfigured } = useAuth();
  const { profiles, loading, error, updateProfile, deleteProfile } = useProfiles();
  const [removeConfirm, setRemoveConfirm] = useState<Profile | null>(null);
  const [removing, setRemoving] = useState(false);
  const {
    syncing,
    lastResult,
    syncLogs,
    syncMembers,
    syncEvents,
    lastMemberSync,
    lastEventSync,
  } = useWildApricot();

  const handleRoleChange = async (userId: string, role: UserRole) => {
    await updateProfile(userId, { role });
  };

  const handleChapterChange = async (userId: string, chapter: ChapterName | null) => {
    await updateProfile(userId, { chapter });
  };

  const handleRemoveUser = async () => {
    if (!removeConfirm) return;
    setRemoving(true);
    await deleteProfile(removeConfirm.id);
    setRemoving(false);
    setRemoveConfirm(null);
  };

  if (!isConfigured) {
    return (
      <div className="text-center py-20">
        <Shield size={48} className="mx-auto mb-3 text-slate-300" />
        <p className="text-slate-500">
          Admin panel requires Supabase to be configured.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-bloc-blue" />
        <span className="ml-3 text-slate-600">Loading users...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-20">
        <AlertCircle size={48} className="mx-auto mb-3 text-red-300" />
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  const pendingUsers = profiles.filter((p) => p.role === 'member');
  const activeUsers = profiles.filter((p) => p.role !== 'member');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border-l-4 border-purple-500 p-5 rounded-r-xl">
        <div className="flex items-start gap-3">
          <Shield className="text-purple-600 mt-0.5" size={24} />
          <div>
            <h3 className="font-bold text-purple-900">User Management</h3>
            <p className="text-sm text-purple-800 mt-1">
              Manage team access. New sign-ups get &ldquo;Member&rdquo; (view-only) access.
              Promote them to &ldquo;Chapter Director&rdquo; to allow editing, or &ldquo;Admin&rdquo; for full control.
            </p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="text-center" padding="md">
          <p className="text-3xl font-bold text-bloc-blue">{profiles.length}</p>
          <p className="text-sm text-slate-500">Total Users</p>
        </Card>
        <Card className="text-center" padding="md">
          <p className="text-3xl font-bold text-amber-600">{pendingUsers.length}</p>
          <p className="text-sm text-slate-500">Pending Approval</p>
        </Card>
        <Card className="text-center" padding="md">
          <p className="text-3xl font-bold text-emerald-600">{activeUsers.length}</p>
          <p className="text-sm text-slate-500">Active Editors</p>
        </Card>
      </div>

      {/* Pending Users */}
      {pendingUsers.length > 0 && (
        <div>
          <h3 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2">
            <AlertCircle size={18} className="text-amber-500" />
            Pending Approval ({pendingUsers.length})
          </h3>
          <div className="space-y-3">
            {pendingUsers.map((profile) => (
              <UserCard
                key={profile.id}
                profile={profile}
                onRoleChange={handleRoleChange}
                onChapterChange={handleChapterChange}
                onRemove={setRemoveConfirm}
                currentUserId={currentProfile?.id}
              />
            ))}
          </div>
        </div>
      )}

      {/* Active Users */}
      <div>
        <h3 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2">
          <CheckCircle size={18} className="text-emerald-500" />
          Active Team ({activeUsers.length})
        </h3>
        <div className="space-y-3">
          {activeUsers.map((profile) => (
            <UserCard
              key={profile.id}
              profile={profile}
              onRoleChange={handleRoleChange}
              onChapterChange={handleChapterChange}
              onRemove={setRemoveConfirm}
              currentUserId={currentProfile?.id}
            />
          ))}
        </div>
      </div>

      {/* Wild Apricot Sync */}
      <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-l-4 border-emerald-500 p-5 rounded-r-xl">
        <div className="flex items-start gap-3">
          <Database className="text-emerald-600 mt-0.5" size={24} />
          <div className="flex-1">
            <h3 className="font-bold text-emerald-900">Wild Apricot Sync</h3>
            <p className="text-sm text-emerald-800 mt-1">
              Sync members and events from Wild Apricot. Requires API key to be configured.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card padding="md">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Users size={18} className="text-bloc-blue" />
              <h4 className="font-bold text-slate-900">Members</h4>
            </div>
            <Button
              size="sm"
              onClick={syncMembers}
              disabled={syncing !== null}
            >
              {syncing === 'members' ? (
                <>
                  <Loader2 size={14} className="mr-1.5 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <RefreshCw size={14} className="mr-1.5" />
                  Sync Now
                </>
              )}
            </Button>
          </div>
          {lastMemberSync && (
            <p className="text-xs text-slate-400">
              Last synced: {new Date(lastMemberSync.completedAt!).toLocaleString()}
              {' '}({lastMemberSync.recordsSynced} members)
            </p>
          )}
          {!lastMemberSync && (
            <p className="text-xs text-slate-400">Never synced</p>
          )}
        </Card>

        <Card padding="md">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Calendar size={18} className="text-purple-600" />
              <h4 className="font-bold text-slate-900">Events</h4>
            </div>
            <Button
              size="sm"
              onClick={syncEvents}
              disabled={syncing !== null}
            >
              {syncing === 'events' ? (
                <>
                  <Loader2 size={14} className="mr-1.5 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <RefreshCw size={14} className="mr-1.5" />
                  Sync Now
                </>
              )}
            </Button>
          </div>
          {lastEventSync && (
            <p className="text-xs text-slate-400">
              Last synced: {new Date(lastEventSync.completedAt!).toLocaleString()}
              {' '}({lastEventSync.recordsSynced} events)
            </p>
          )}
          {!lastEventSync && (
            <p className="text-xs text-slate-400">Never synced</p>
          )}
        </Card>
      </div>

      {/* Sync Result */}
      {lastResult && (
        <Card padding="md" className={lastResult.success ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}>
          {lastResult.success ? (
            <div className="flex items-center gap-2 text-emerald-700">
              <CheckCircle size={16} />
              <span className="text-sm font-medium">
                Sync complete: {lastResult.added} added, {lastResult.updated} updated
                ({lastResult.total} total)
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-red-700">
              <AlertCircle size={16} />
              <span className="text-sm font-medium">
                Sync failed: {lastResult.error}
              </span>
            </div>
          )}
        </Card>
      )}

      {/* Recent Sync History */}
      {syncLogs.length > 0 && (
        <div>
          <h3 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2">
            <Clock size={18} className="text-slate-400" />
            Sync History
          </h3>
          <Card padding="sm">
            <div className="divide-y divide-slate-100">
              {syncLogs.slice(0, 10).map((log) => (
                <div key={log.id} className="flex items-center justify-between py-2.5 px-2">
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        log.status === 'success'
                          ? 'bg-emerald-500'
                          : log.status === 'error'
                            ? 'bg-red-500'
                            : 'bg-amber-500'
                      }`}
                    />
                    <span className="text-sm font-medium text-slate-700 capitalize">
                      {log.syncType.replace('_', ' ')}
                    </span>
                    {log.status === 'success' && (
                      <span className="text-xs text-slate-400">
                        {log.recordsSynced} records
                      </span>
                    )}
                    {log.error && (
                      <span className="text-xs text-red-500 truncate max-w-[200px]">
                        {log.error}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-slate-400">
                    {new Date(log.startedAt).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Remove User Confirmation Modal */}
      <Modal
        isOpen={!!removeConfirm}
        onClose={() => setRemoveConfirm(null)}
        title="Remove User Access"
        size="sm"
      >
        {removeConfirm && (
          <div className="space-y-4">
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
              <p className="font-medium">This will revoke dashboard access for:</p>
              <p className="mt-1">
                <strong>{removeConfirm.fullName || removeConfirm.email}</strong>
                {removeConfirm.fullName && (
                  <span className="text-red-600"> ({removeConfirm.email})</span>
                )}
              </p>
              <p className="mt-2 text-red-600">
                They will see an &ldquo;Account Deactivated&rdquo; message next time they log in.
              </p>
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setRemoveConfirm(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                onClick={handleRemoveUser}
                disabled={removing}
              >
                {removing ? (
                  <>
                    <Loader2 size={14} className="mr-2 animate-spin" />
                    Removing...
                  </>
                ) : (
                  <>
                    <Trash2 size={14} className="mr-2" />
                    Remove Access
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
