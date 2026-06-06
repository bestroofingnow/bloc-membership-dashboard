'use client';

import { useState, useMemo } from 'react';
import { Mail, Phone, Building2, Users, Loader2, UserPlus, Trash2, Pencil, Save } from 'lucide-react';
import { Card, Badge, SearchInput, Button, Modal, Input } from '@/components/ui';
import { useBoardMembers, BoardMemberWithId } from '@/hooks/useBoardMembers';
import { useAuth } from '@/contexts/AuthContext';
import { BoardMember } from '@/types';

type FilterType = 'all' | 'executive' | 'directors' | 'membership' | 'committees';

const filters: { value: FilterType; label: string }[] = [
  { value: 'all', label: 'All Board' },
  { value: 'executive', label: 'Executive' },
  { value: 'directors', label: 'Chapter Directors' },
  { value: 'membership', label: 'Membership Team' },
  { value: 'committees', label: 'Committees' },
];

function getRoleBadgeColor(role: string): 'success' | 'info' | 'warning' | 'default' {
  if (role === 'President' || role === 'Vice President') return 'success';
  if (role.includes('Director')) return 'info';
  if (role.includes('Membership')) return 'warning';
  return 'default';
}

function BoardMemberCard({
  member,
  canEdit,
  onDelete,
  onEdit,
}: {
  member: BoardMemberWithId;
  canEdit: boolean;
  onDelete: (id: string) => void;
  onEdit: (member: BoardMemberWithId) => void;
}) {
  return (
    <Card className="flex flex-col h-full" padding="md">
      <div className="flex-1">
        <div className="flex items-start justify-between">
          <Badge variant={getRoleBadgeColor(member.role)} size="sm">
            {member.role}
          </Badge>
          {canEdit && member.id && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => onEdit(member)}
                className="p-1.5 text-slate-400 hover:text-bloc-blue hover:bg-blue-50 rounded-lg transition-colors"
                title="Edit board member"
              >
                <Pencil size={14} />
              </button>
              <button
                onClick={() => onDelete(member.id!)}
                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title="Remove board member"
              >
                <Trash2 size={14} />
              </button>
            </div>
          )}
        </div>
        <h3 className="text-lg font-bold mt-3 text-slate-900">{member.name}</h3>
        <div className="flex items-center gap-1.5 text-slate-500 text-sm mt-1">
          <Building2 size={14} />
          <span>{member.company}</span>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-slate-100 flex gap-3">
        {member.email && (
          <a
            href={`mailto:${member.email}`}
            className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-bloc-blue transition-colors"
          >
            <Mail size={14} />
            <span>Email</span>
          </a>
        )}
        {member.phone && (
          <a
            href={`tel:${member.phone}`}
            className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-bloc-blue transition-colors"
          >
            <Phone size={14} />
            <span>{member.phone}</span>
          </a>
        )}
      </div>
    </Card>
  );
}

export function LeadershipTab() {
  const { boardMembers, loading, error, addBoardMember, updateBoardMember, deleteBoardMember } = useBoardMembers();
  const { isAdmin } = useAuth();
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newMember, setNewMember] = useState({
    role: '',
    name: '',
    company: '',
    email: '',
    phone: '',
  });

  // Edit state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editMember, setEditMember] = useState<BoardMemberWithId | null>(null);
  const [editData, setEditData] = useState({ role: '', name: '', company: '', email: '', phone: '' });

  const openEditModal = (member: BoardMemberWithId) => {
    setEditMember(member);
    setEditData({
      role: member.role,
      name: member.name,
      company: member.company,
      email: member.email,
      phone: member.phone,
    });
    setEditModalOpen(true);
  };

  const handleEditMember = async () => {
    if (!editMember?.id || !editData.name || !editData.role) return;
    setIsSubmitting(true);
    const result = await updateBoardMember(editMember.id, editData as BoardMember);
    if (result) {
      setEditModalOpen(false);
      setEditMember(null);
    }
    setIsSubmitting(false);
  };

  const filteredMembers = useMemo(() => {
    let members: BoardMemberWithId[];

    switch (filter) {
      case 'executive':
        members = boardMembers.filter((m) =>
          ['President', 'Vice President', 'Admin'].includes(m.role)
        );
        break;
      case 'directors':
        members = boardMembers.filter((m) => m.role.includes('Director'));
        break;
      case 'membership':
        members = boardMembers.filter((m) => m.role.includes('Membership'));
        break;
      case 'committees':
        members = boardMembers.filter(
          (m) =>
            m.role.includes('Treasurer') ||
            m.role.includes('After Hours') ||
            m.role.includes('Sponsorship') ||
            m.role.includes('CIC') ||
            m.role.includes('BIG')
        );
        break;
      default:
        members = boardMembers;
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      members = members.filter(
        (m) =>
          m.name.toLowerCase().includes(query) ||
          m.company.toLowerCase().includes(query) ||
          m.role.toLowerCase().includes(query)
      );
    }

    return members;
  }, [boardMembers, filter, searchQuery]);

  const handleAddMember = async () => {
    if (!newMember.name || !newMember.role || !newMember.company || !newMember.email || !newMember.phone) return;
    setIsSubmitting(true);

    const result = await addBoardMember(newMember as BoardMember);
    if (result) {
      setNewMember({ role: '', name: '', company: '', email: '', phone: '' });
      setAddModalOpen(false);
    }
    setIsSubmitting(false);
  };

  const handleDeleteMember = async (id: string) => {
    setIsSubmitting(true);
    const result = await deleteBoardMember(id);
    if (result) {
      setDeleteConfirmId(null);
    }
    setIsSubmitting(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-bloc-blue" />
        <span className="ml-3 text-slate-600">Loading board members...</span>
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

  return (
    <div className="space-y-6">
      {/* Strategy Banner */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-l-4 border-bloc-blue p-5 rounded-r-xl">
        <div className="flex items-start gap-3">
          <Users className="text-bloc-blue mt-0.5" size={24} />
          <div>
            <h3 className="font-bold text-bloc-navy">Board Strategy</h3>
            <p className="text-sm text-slate-600 mt-1">
              Use this directory to assign &ldquo;Wingmen&rdquo; for new guests. Every prospective
              member should meet at least one Director before their application.
            </p>
          </div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          {filters.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === f.value
                  ? 'bg-bloc-blue text-white'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="max-w-xs">
            <SearchInput
              placeholder="Search board members..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          {isAdmin && (
            <Button onClick={() => setAddModalOpen(true)}>
              <UserPlus size={16} className="mr-2" />
              Add
            </Button>
          )}
        </div>
      </div>

      {/* Results Count */}
      <p className="text-sm text-slate-500">
        Showing {filteredMembers.length} of {boardMembers.length} board members
      </p>

      {/* Board Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredMembers.map((member, index) => (
          <BoardMemberCard
            key={member.id || index}
            member={member}
            canEdit={isAdmin}
            onDelete={(id) => setDeleteConfirmId(id)}
            onEdit={openEditModal}
          />
        ))}
      </div>

      {filteredMembers.length === 0 && (
        <div className="text-center py-12 text-slate-500">
          <Users size={48} className="mx-auto mb-3 opacity-50" />
          <p>No board members match your search.</p>
        </div>
      )}

      {/* Add Board Member Modal */}
      <Modal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title="Add Board Member"
        size="md"
      >
        <div className="space-y-4">
          <Input
            label="Role *"
            value={newMember.role}
            onChange={(e) => setNewMember((prev) => ({ ...prev, role: e.target.value }))}
            placeholder="e.g., North Director (Sr)"
          />
          <Input
            label="Full Name *"
            value={newMember.name}
            onChange={(e) => setNewMember((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="e.g., John Smith"
          />
          <Input
            label="Company *"
            value={newMember.company}
            onChange={(e) => setNewMember((prev) => ({ ...prev, company: e.target.value }))}
            placeholder="e.g., Smith Consulting"
          />
          <Input
            label="Email *"
            type="email"
            value={newMember.email}
            onChange={(e) => setNewMember((prev) => ({ ...prev, email: e.target.value }))}
            placeholder="john@company.com"
          />
          <Input
            label="Phone *"
            type="tel"
            value={newMember.phone}
            onChange={(e) => setNewMember((prev) => ({ ...prev, phone: e.target.value }))}
            placeholder="704-555-0000"
          />

          <div className="flex gap-3 pt-4">
            <Button variant="secondary" className="flex-1" onClick={() => setAddModalOpen(false)}>
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={handleAddMember}
              disabled={
                !newMember.name || !newMember.role || !newMember.company ||
                !newMember.email || !newMember.phone || isSubmitting
              }
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={14} className="mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                'Add Board Member'
              )}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        title="Remove Board Member"
        size="sm"
      >
        <p className="text-slate-600 mb-4">
          Are you sure you want to remove{' '}
          <strong>{boardMembers.find((m) => m.id === deleteConfirmId)?.name}</strong>{' '}
          from the board? This action cannot be undone.
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => setDeleteConfirmId(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            onClick={() => deleteConfirmId && handleDeleteMember(deleteConfirmId)}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 size={14} className="mr-2 animate-spin" />
                Removing...
              </>
            ) : (
              'Remove'
            )}
          </Button>
        </div>
      </Modal>

      {/* Edit Board Member Modal */}
      <Modal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title="Edit Board Member"
        size="md"
      >
        <div className="space-y-4">
          <Input
            label="Role *"
            value={editData.role}
            onChange={(e) => setEditData((prev) => ({ ...prev, role: e.target.value }))}
            placeholder="e.g., North Director (Sr)"
          />
          <Input
            label="Full Name *"
            value={editData.name}
            onChange={(e) => setEditData((prev) => ({ ...prev, name: e.target.value }))}
          />
          <Input
            label="Company *"
            value={editData.company}
            onChange={(e) => setEditData((prev) => ({ ...prev, company: e.target.value }))}
          />
          <Input
            label="Email *"
            type="email"
            value={editData.email}
            onChange={(e) => setEditData((prev) => ({ ...prev, email: e.target.value }))}
          />
          <Input
            label="Phone *"
            type="tel"
            value={editData.phone}
            onChange={(e) => setEditData((prev) => ({ ...prev, phone: e.target.value }))}
          />

          <div className="flex gap-3 pt-4">
            <Button variant="secondary" className="flex-1" onClick={() => setEditModalOpen(false)}>
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={handleEditMember}
              disabled={!editData.name || !editData.role || !editData.company || isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={14} className="mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <><Save size={14} className="mr-2" />Save Changes</>
              )}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
