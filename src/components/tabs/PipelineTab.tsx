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
} from 'lucide-react';
import { Card, Badge, Button, Modal, Input } from '@/components/ui';
import { pipelineStages } from '@/data/guests';
import { Guest, GuestStatus } from '@/types';
import { useGuests } from '@/hooks/useGuests';
import { useBoardMembers } from '@/hooks/useBoardMembers';
import { useSignups, PublicSignup } from '@/hooks/useSignups';
import { useAuth } from '@/contexts/AuthContext';

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
            <h4 className="font-bold text-slate-900 truncate">{signup.name}</h4>
            <Badge variant="warning" size="sm">New</Badge>
          </div>
          <div className="flex items-center gap-1.5 text-sm text-slate-500 mt-0.5">
            <Building2 size={12} />
            <span className="truncate">{signup.company}</span>
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
}: {
  guest: Guest;
  onAdvance: () => void;
  onEdit: () => void;
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

      <div className="pt-3 border-t border-slate-100">
        <p className="text-xs font-semibold text-amber-600 uppercase mb-2">
          Next: {guest.nextStep}
        </p>
        <Button size="sm" variant="primary" onClick={onAdvance} className="w-full">
          <span>Advance</span>
          <ChevronRight size={14} className="ml-1" />
        </Button>
      </div>
    </div>
  );
}

export function PipelineTab() {
  const { guests, loading, error, addGuest, advanceGuest, deleteGuest } = useGuests();
  const { boardMembers } = useBoardMembers();
  const { signups, loading: signupsLoading, promoteToGuest, dismissSignup } = useSignups();
  const { canEdit } = useAuth();

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedGuest, setSelectedGuest] = useState<Guest | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [processingSignupId, setProcessingSignupId] = useState<string | null>(null);

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

  const handleEditGuest = (guest: Guest) => {
    setSelectedGuest(guest);
    setEditModalOpen(true);
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

  // Show condensed view for mobile - first 3 stages
  const displayStages = guestsByStage.slice(0, 6);

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
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
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
        size="sm"
      >
        {selectedGuest && (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-slate-600">
                <Building2 size={16} />
                <span>{selectedGuest.company}</span>
              </div>
              {selectedGuest.email && (
                <div className="flex items-center gap-2 text-slate-600">
                  <Mail size={16} />
                  <a
                    href={`mailto:${selectedGuest.email}`}
                    className="hover:text-bloc-blue"
                  >
                    {selectedGuest.email}
                  </a>
                </div>
              )}
              {selectedGuest.phone && (
                <div className="flex items-center gap-2 text-slate-600">
                  <Phone size={16} />
                  <a
                    href={`tel:${selectedGuest.phone}`}
                    className="hover:text-bloc-blue"
                  >
                    {selectedGuest.phone}
                  </a>
                </div>
              )}
            </div>

            <div className="pt-4 border-t">
              <p className="text-sm text-slate-500 mb-2">Current Status</p>
              <Badge variant="info">{selectedGuest.status}</Badge>
            </div>

            <div className="flex gap-3 pt-4">
              {canEdit && (
                <Button
                  variant="danger"
                  className="flex-1"
                  onClick={handleDeleteGuest}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={14} className="mr-2 animate-spin" />
                      Removing...
                    </>
                  ) : (
                    'Remove Guest'
                  )}
                </Button>
              )}
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => setEditModalOpen(false)}
              >
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
