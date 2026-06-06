'use client';

import { useState } from 'react';
import {
  UserPlus,
  Clock,
  MapPin,
  FileText,
  CheckCircle,
  ChevronRight,
  Mail,
  Phone,
  User,
  Building2,
  MoreVertical,
  Loader2,
  Globe,
  ArrowRight,
  XCircle,
  Save,
} from 'lucide-react';
import { Card, Badge, Button, Modal, Input, useToast } from '@/components/ui';
import { pipelineStages, getNextStepText } from '@/data/guests';
import { Guest, GuestStatus } from '@/types';
import { useGuests } from '@/hooks/useGuests';
import { useBoardMembers } from '@/hooks/useBoardMembers';
import { useSignups, PublicSignup } from '@/hooks/useSignups';
import { useEvents } from '@/hooks/useEvents';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { visibleKanbanStages } from '@/lib/pipeline/stages';

const stageIcons: Record<string, React.ReactNode> = {
  'New Lead': <UserPlus size={16} />,
  'After Hours Invited': <Clock size={16} />,
  'After Hours Done': <Clock size={16} />,
  'Lunch Invited': <MapPin size={16} />,
  'Lunch Done': <MapPin size={16} />,
  'Application Sent': <FileText size={16} />,
  'Application Received': <FileText size={16} />,
  Approved: <CheckCircle size={16} />,
};

function SignupCard({
  signup,
  onPromote,
  onDismiss,
  disabled,
}: {
  signup: PublicSignup;
  onPromote: () => void;
  onDismiss: () => void;
  disabled: boolean;
}) {
  return (
    <div className="bg-white p-4 rounded-xl border border-amber-200 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-bold text-slate-900 truncate" title={signup.name}>{signup.name}</h4>
            <Badge variant="warning" size="sm">New</Badge>
          </div>
          <div className="flex items-center gap-1.5 text-sm text-slate-500 mt-0.5">
            <Building2 size={12} />
            <span className="truncate" title={signup.company}>{signup.company}</span>
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-slate-400">
            {signup.industry && (
              <span className="bg-slate-100 px-2 py-0.5 rounded">{signup.industry}</span>
            )}
            {signup.email && (
              <span className="flex items-center gap-1">
                <Mail size={10} />
                {signup.email}
              </span>
            )}
            {signup.phone && (
              <span className="flex items-center gap-1">
                <Phone size={10} />
                {signup.phone}
              </span>
            )}
            {signup.referralSource && (
              <span>via {signup.referralSource}</span>
            )}
          </div>
          {signup.notes && (
            <p className="text-xs text-slate-500 mt-1.5 line-clamp-2">{signup.notes}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="primary"
            onClick={onPromote}
            disabled={disabled}
          >
            <ArrowRight size={14} className="mr-1" />
            Add to Pipeline
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={onDismiss}
            disabled={disabled}
          >
            <XCircle size={14} className="mr-1" />
            Dismiss
          </Button>
        </div>
      </div>
    </div>
  );
}

function GuestCard({
  guest,
  onAdvance,
  onEdit,
  onInvite,
}: {
  guest: Guest;
  onAdvance: () => void;
  onEdit: () => void;
  onInvite: () => void;
}) {
  return (
    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h4 className="font-bold text-slate-900">{guest.name}</h4>
          <div className="flex items-center gap-1.5 text-sm text-slate-500 mt-0.5">
            <Building2 size={12} />
            <span>{guest.company}</span>
          </div>
        </div>
        <button
          onClick={onEdit}
          className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <MoreVertical size={16} className="text-slate-400" />
        </button>
      </div>

      {guest.industry && (
        <Badge variant="info" size="sm" className="mb-3">
          {guest.industry}
        </Badge>
      )}

      <div className="text-xs text-slate-400 mb-3">
        <div className="flex items-center gap-1">
          <User size={12} />
          <span>Invited by {guest.invitedBy}</span>
        </div>
      </div>

      <div className="pt-3 border-t border-slate-100 space-y-2">
        <p className="text-xs font-semibold text-amber-600 uppercase">
          Next: {guest.nextStep}
        </p>
        <Button size="sm" variant="primary" onClick={onAdvance} className="w-full">
          <span>Advance</span>
          <ChevronRight size={14} className="ml-1" />
        </Button>
        {guest.email && (
          <button
            type="button"
            onClick={onInvite}
            className="w-full text-xs text-bloc-blue hover:underline flex items-center justify-center gap-1"
          >
            <Mail size={12} /> Invite to event
          </button>
        )}
      </div>
    </div>
  );
}

export function PipelineTab() {
  const { guests, loading, error, addGuest, updateGuest, advanceGuest, deleteGuest } = useGuests();
  const { boardMembers } = useBoardMembers();
  const { signups, loading: signupsLoading, promoteToGuest, dismissSignup } = useSignups();
  const { canEdit, isAdmin } = useAuth();

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedGuest, setSelectedGuest] = useState<Guest | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [processingSignupId, setProcessingSignupId] = useState<string | null>(null);

  // Event invite modal state
  const { events } = useEvents();
  const [inviteGuest, setInviteGuest] = useState<Guest | null>(null);
  const [inviteEventId, setInviteEventId] = useState('');
  const [inviteMessage, setInviteMessage] = useState('');
  const [inviteSending, setInviteSending] = useState(false);
  const toast = useToast();

  // New guest form state
  const [newGuest, setNewGuest] = useState({
    name: '',
    company: '',
    industry: '',
    invitedBy: '',
    email: '',
    phone: '',
  });

  const guestsByStage = pipelineStages.map((stage) => ({
    ...stage,
    guests: guests.filter((g) => g.status === stage.status),
  }));

  const handleAdvance = async (guest: Guest) => {
    if (!canEdit) return;
    setIsSubmitting(true);
    await advanceGuest(guest.id);
    setIsSubmitting(false);
  };

  const handleAddGuest = async () => {
    if (!canEdit) return;
    setIsSubmitting(true);

    const result = await addGuest({
      name: newGuest.name,
      company: newGuest.company,
      industry: newGuest.industry,
      invitedBy: newGuest.invitedBy,
      email: newGuest.email,
      phone: newGuest.phone,
    });

    if (result) {
      setNewGuest({
        name: '',
        company: '',
        industry: '',
        invitedBy: '',
        email: '',
        phone: '',
      });
      setAddModalOpen(false);
    }
    setIsSubmitting(false);
  };

  // Edit guest form state
  const [editGuestData, setEditGuestData] = useState<Partial<Guest>>({});

  const handleEditGuest = (guest: Guest) => {
    setSelectedGuest(guest);
    setEditGuestData({
      name: guest.name,
      company: guest.company,
      industry: guest.industry,
      invitedBy: guest.invitedBy,
      email: guest.email,
      phone: guest.phone,
      status: guest.status,
      notes: guest.notes,
    });
    setEditModalOpen(true);
  };

  const handleSaveGuest = async () => {
    if (!canEdit || !selectedGuest) return;
    setIsSubmitting(true);
    const updates: Partial<Guest> = { ...editGuestData };
    if (updates.status && updates.status !== selectedGuest.status) {
      updates.nextStep = getNextStepText(updates.status);
    }
    const result = await updateGuest(selectedGuest.id, updates);
    if (result) {
      setEditModalOpen(false);
      setSelectedGuest(null);
    }
    setIsSubmitting(false);
  };

  const handleDeleteGuest = async () => {
    if (!canEdit || !selectedGuest) return;
    setIsSubmitting(true);

    const result = await deleteGuest(selectedGuest.id);
    if (result) {
      setEditModalOpen(false);
      setSelectedGuest(null);
    }
    setIsSubmitting(false);
  };

  const handlePromoteSignup = async (signupId: string) => {
    setProcessingSignupId(signupId);
    await promoteToGuest(signupId);
    setProcessingSignupId(null);
  };

  const handleDismissSignup = async (signupId: string) => {
    setProcessingSignupId(signupId);
    await dismissSignup(signupId);
    setProcessingSignupId(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-bloc-blue" />
        <span className="ml-3 text-slate-600">Loading pipeline...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-20">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  // Render all 8 stages — no slicing (was slice(0,6), which hid App Received + Approved).
  const displayStages = visibleKanbanStages(guestsByStage);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            The Bridge - Guest Pipeline
          </h2>
          <p className="text-sm text-slate-500">
            Track prospects from first contact to membership approval
          </p>
          {canEdit && (
            <p className="text-xs text-slate-500 mt-1">
              Looking for guests who RSVP&apos;d through the public QR flow?
              See the <strong>Guest Inbox</strong> tab.
            </p>
          )}
        </div>
{canEdit && (
          <Button onClick={() => setAddModalOpen(true)}>
            <UserPlus size={16} className="mr-2" />
            Add Guest
          </Button>
        )}
      </div>

      {/* New Sign-ups Banner */}
      {canEdit && signups.length > 0 && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Globe size={20} className="text-amber-600" />
            <h3 className="font-bold text-amber-900">
              New Sign-ups ({signups.length})
            </h3>
            <span className="text-sm text-amber-700">
              from the public join form
            </span>
          </div>
          <div className="space-y-3">
            {signups.map((signup) => (
              <SignupCard
                key={signup.id}
                signup={signup}
                onPromote={() => handlePromoteSignup(signup.id)}
                onDismiss={() => handleDismissSignup(signup.id)}
                disabled={processingSignupId === signup.id}
              />
            ))}
          </div>
        </div>
      )}

      {/* Pipeline Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="text-center" padding="sm">
          <p className="text-2xl font-bold text-slate-900">{guests.length}</p>
          <p className="text-xs text-slate-500">Total Guests</p>
        </Card>
        <Card className="text-center" padding="sm">
          <p className="text-2xl font-bold text-blue-600">
            {guests.filter((g) => g.status.includes('After Hours')).length}
          </p>
          <p className="text-xs text-slate-500">At After Hours</p>
        </Card>
        <Card className="text-center" padding="sm">
          <p className="text-2xl font-bold text-purple-600">
            {guests.filter((g) => g.status.includes('Lunch')).length}
          </p>
          <p className="text-xs text-slate-500">At Lunch Stage</p>
        </Card>
        <Card className="text-center" padding="sm">
          <p className="text-2xl font-bold text-emerald-600">
            {guests.filter((g) => g.status.includes('Application')).length}
          </p>
          <p className="text-xs text-slate-500">In Application</p>
        </Card>
      </div>

      {/* Pipeline Columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 gap-4">
        {displayStages.map((stage) => (
          <div
            key={stage.status}
            className={`rounded-xl p-4 min-h-[300px] ${stage.color}`}
          >
            <div className="flex items-center gap-2 mb-4">
              <span className="text-slate-600">{stageIcons[stage.status]}</span>
              <h3 className="font-bold text-sm text-slate-700">{stage.label}</h3>
              <span className="ml-auto text-xs font-medium text-slate-500 bg-white px-2 py-0.5 rounded-full">
                {stage.guests.length}
              </span>
            </div>

            <div className="space-y-3">
              {stage.guests.length === 0 && (
                <p className="text-sm text-slate-400 italic text-center py-8">
                  No guests
                </p>
              )}
              {stage.guests.map((guest) => (
                <GuestCard
                  key={guest.id}
                  guest={guest}
                  onAdvance={() => handleAdvance(guest)}
                  onEdit={() => handleEditGuest(guest)}
                  onInvite={() => {
                    setInviteGuest(guest);
                    setInviteEventId('');
                    setInviteMessage('');
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Add Guest Modal */}
      <Modal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title="Add New Guest"
        size="md"
      >
        <div className="space-y-4">
          <Input
            label="Full Name"
            value={newGuest.name}
            onChange={(e) =>
              setNewGuest((prev) => ({ ...prev, name: e.target.value }))
            }
            placeholder="e.g., John Smith"
          />
          <Input
            label="Company"
            value={newGuest.company}
            onChange={(e) =>
              setNewGuest((prev) => ({ ...prev, company: e.target.value }))
            }
            placeholder="e.g., Smith Consulting"
          />
          <Input
            label="Industry"
            value={newGuest.industry}
            onChange={(e) =>
              setNewGuest((prev) => ({ ...prev, industry: e.target.value }))
            }
            placeholder="e.g., Business Consulting"
          />
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Invited By
            </label>
            <select
              value={newGuest.invitedBy}
              onChange={(e) =>
                setNewGuest((prev) => ({ ...prev, invitedBy: e.target.value }))
              }
              className="w-full px-4 py-2.5 rounded-lg border border-slate-300 bg-white focus:ring-2 focus:ring-bloc-blue focus:border-bloc-blue outline-none"
            >
              <option value="">Select a member...</option>
              {boardMembers.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.name} ({m.role})
                </option>
              ))}
            </select>
          </div>
          <Input
            label="Email (optional)"
            type="email"
            value={newGuest.email}
            onChange={(e) =>
              setNewGuest((prev) => ({ ...prev, email: e.target.value }))
            }
            placeholder="john@company.com"
          />
          <Input
            label="Phone (optional)"
            type="tel"
            value={newGuest.phone}
            onChange={(e) =>
              setNewGuest((prev) => ({ ...prev, phone: e.target.value }))
            }
            placeholder="704-555-0000"
          />

          <div className="flex gap-3 pt-4">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setAddModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={handleAddGuest}
              disabled={!newGuest.name || !newGuest.company || !newGuest.invitedBy || isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={14} className="mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                'Add Guest'
              )}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Guest Modal */}
      <Modal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title={`Edit: ${selectedGuest?.name || ''}`}
        size="md"
      >
        {selectedGuest && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Name"
                value={editGuestData.name || ''}
                onChange={(e) => setEditGuestData((p) => ({ ...p, name: e.target.value }))}
              />
              <Input
                label="Company"
                value={editGuestData.company || ''}
                onChange={(e) => setEditGuestData((p) => ({ ...p, company: e.target.value }))}
              />
              <Input
                label="Industry"
                value={editGuestData.industry || ''}
                onChange={(e) => setEditGuestData((p) => ({ ...p, industry: e.target.value }))}
              />
              <Input
                label="Invited By"
                value={editGuestData.invitedBy || ''}
                onChange={(e) => setEditGuestData((p) => ({ ...p, invitedBy: e.target.value }))}
              />
              <Input
                label="Email"
                type="email"
                value={editGuestData.email || ''}
                onChange={(e) => setEditGuestData((p) => ({ ...p, email: e.target.value }))}
              />
              <Input
                label="Phone"
                type="tel"
                value={editGuestData.phone || ''}
                onChange={(e) => setEditGuestData((p) => ({ ...p, phone: e.target.value }))}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Pipeline Status
              </label>
              <select
                value={editGuestData.status || selectedGuest.status}
                onChange={(e) => setEditGuestData((p) => ({ ...p, status: e.target.value as GuestStatus }))}
                className="w-full px-4 py-2.5 rounded-lg border border-slate-300 bg-white focus:ring-2 focus:ring-bloc-blue focus:border-bloc-blue outline-none"
              >
                {pipelineStages.map((s) => (
                  <option key={s.status} value={s.status}>{s.label}</option>
                ))}
                <option value="Declined">Declined</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Notes
              </label>
              <textarea
                value={editGuestData.notes || ''}
                onChange={(e) => setEditGuestData((p) => ({ ...p, notes: e.target.value }))}
                rows={3}
                className="w-full px-4 py-2.5 rounded-lg border border-slate-300 bg-white focus:ring-2 focus:ring-bloc-blue focus:border-bloc-blue outline-none resize-none"
                placeholder="Add notes about this guest..."
              />
            </div>

            <div className="flex gap-3 pt-2">
              {isAdmin && (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={handleDeleteGuest}
                  disabled={isSubmitting}
                >
                  Remove
                </Button>
              )}
              <div className="flex-1" />
              <Button variant="secondary" onClick={() => setEditModalOpen(false)}>
                Cancel
              </Button>
              {canEdit && (
                <Button onClick={handleSaveGuest} disabled={isSubmitting}>
                  {isSubmitting ? (
                    <><Loader2 size={14} className="mr-2 animate-spin" />Saving...</>
                  ) : (
                    <><Save size={14} className="mr-2" />Save</>
                  )}
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Event Invite Modal */}
      <Modal
        isOpen={inviteGuest !== null}
        onClose={() => setInviteGuest(null)}
        title={inviteGuest ? `Invite ${inviteGuest.name} to an event` : 'Invite to event'}
        size="md"
      >
        {inviteGuest && (
          <div className="space-y-4">
            <div className="rounded border bg-slate-50 p-3 text-sm">
              <div><strong>{inviteGuest.name}</strong> · {inviteGuest.company}</div>
              <div className="text-slate-600">{inviteGuest.email}</div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Event</label>
              <select
                value={inviteEventId}
                onChange={(e) => setInviteEventId(e.target.value)}
                className="w-full rounded border border-slate-300 p-2"
              >
                <option value="">— Pick an upcoming event —</option>
                {events
                  .filter((e) => new Date(e.starts_at).getTime() >= Date.now() && e.public_visible)
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {new Date(e.starts_at).toLocaleDateString()} · {e.title}
                      {e.chapter ? ` (${e.chapter})` : ''}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Personal note (optional, logged in guest notes)
              </label>
              <textarea
                value={inviteMessage}
                onChange={(e) => setInviteMessage(e.target.value)}
                rows={2}
                className="w-full rounded border border-slate-300 p-2 text-sm"
                placeholder="e.g. Met at BLOCtail; following up about real-estate seat."
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setInviteGuest(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={!inviteEventId || inviteSending}
                onClick={async () => {
                  if (!inviteGuest || !inviteEventId) return;
                  setInviteSending(true);
                  try {
                    const { data: session } = await supabase.auth.getSession();
                    const token = session.session?.access_token;
                    const res = await fetch('/api/admin/guest-invite', {
                      method: 'POST',
                      headers: {
                        'content-type': 'application/json',
                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
                      },
                      body: JSON.stringify({
                        guest_id: inviteGuest.id,
                        event_id: inviteEventId,
                        custom_message: inviteMessage || undefined,
                      }),
                    });
                    const body = await res.json().catch(() => null);
                    if (!res.ok) {
                      toast.error(`Invite failed: ${body?.error ?? `error_${res.status}`}`);
                    } else {
                      toast.success(`Invite sent to ${inviteGuest.email}`);
                      setInviteGuest(null);
                    }
                  } catch (e) {
                    toast.error(`Network error: ${e instanceof Error ? e.message : String(e)}`);
                  } finally {
                    setInviteSending(false);
                  }
                }}
              >
                {inviteSending ? (
                  <><Loader2 size={14} className="mr-2 animate-spin" /> Sending…</>
                ) : (
                  <><Mail size={14} className="mr-2" /> Send invite</>
                )}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
