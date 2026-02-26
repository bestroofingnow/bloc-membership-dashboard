'use client';

import { useState, useMemo } from 'react';
import { Users, Building2, Briefcase, Download, Loader2, UserPlus, Trash2, Shield, Mail, Phone, Globe, MapPin, Calendar, UserCheck, ChevronRight, Pencil, Save, X } from 'lucide-react';
import { Card, Badge, SearchInput, Button, Modal, Input } from '@/components/ui';
import { useMembers } from '@/hooks/useMembers';
import { useAuth, UserRole } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { ChapterName, Member } from '@/types';

type ChapterFilter = ChapterName | 'all';

const chapterFilters: { value: ChapterFilter; label: string }[] = [
  { value: 'all', label: 'All Chapters' },
  { value: 'North', label: 'North' },
  { value: 'South', label: 'South' },
  { value: 'Uptown', label: 'Uptown' },
  { value: 'FLOC', label: 'FLOC' },
  { value: 'Alumni', label: 'Alumni' },
];

const chapters: ChapterName[] = ['North', 'South', 'Uptown', 'FLOC', 'Alumni'];

export function MembersTab() {
  const { members, chapterCounts, loading, error, addMember, updateMember, deleteMember } = useMembers();
  const { canEdit, isAdmin } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [chapterFilter, setChapterFilter] = useState<ChapterFilter>('all');
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newMember, setNewMember] = useState({
    name: '',
    company: '',
    chapter: 'North' as ChapterName,
    industry: '',
    email: '',
    phone: '',
  });

  // Member detail state
  const [detailMember, setDetailMember] = useState<Member | null>(null);
  const [isEditingMember, setIsEditingMember] = useState(false);
  const [editMemberData, setEditMemberData] = useState<Partial<Member>>({});
  const [editMemberSaving, setEditMemberSaving] = useState(false);

  const startEditMember = (member: Member) => {
    setEditMemberData({ ...member });
    setIsEditingMember(true);
  };

  const cancelEditMember = () => {
    setIsEditingMember(false);
    setEditMemberData({});
  };

  const handleSaveMember = async () => {
    if (!detailMember) return;
    setEditMemberSaving(true);
    const result = await updateMember(detailMember.id, editMemberData);
    if (result) {
      setDetailMember({ ...detailMember, ...editMemberData } as Member);
      setIsEditingMember(false);
      setEditMemberData({});
    }
    setEditMemberSaving(false);
  };

  const closeDetailModal = () => {
    setDetailMember(null);
    setIsEditingMember(false);
    setEditMemberData({});
  };

  // Role management state
  const [roleModalMember, setRoleModalMember] = useState<Member | null>(null);
  const [roleModalLoading, setRoleModalLoading] = useState(false);
  const [roleModalRole, setRoleModalRole] = useState<UserRole>('member');
  const [roleModalProfileId, setRoleModalProfileId] = useState<string | null>(null);
  const [roleModalError, setRoleModalError] = useState<string | null>(null);
  const [roleModalSuccess, setRoleModalSuccess] = useState<string | null>(null);
  const [roleModalEmail, setRoleModalEmail] = useState('');

  const [roleModalNoAccount, setRoleModalNoAccount] = useState(false);

  const lookupProfile = async (email: string) => {
    if (!email) return;
    setRoleModalLoading(true);
    setRoleModalError(null);
    setRoleModalSuccess(null);
    setRoleModalProfileId(null);
    setRoleModalNoAccount(false);
    try {
      const { data, error: fetchErr } = await supabase
        .from('profiles')
        .select('id, role')
        .eq('email', email)
        .maybeSingle();

      if (fetchErr) {
        setRoleModalError(`Failed to look up account: ${fetchErr.message}`);
      } else if (!data) {
        setRoleModalNoAccount(true);
      } else {
        setRoleModalProfileId(data.id);
        setRoleModalRole(data.role as UserRole);
      }
    } catch {
      setRoleModalError('Failed to look up account.');
    } finally {
      setRoleModalLoading(false);
    }
  };

  const openRoleModal = async (member: Member) => {
    setRoleModalMember(member);
    setRoleModalError(null);
    setRoleModalSuccess(null);
    setRoleModalProfileId(null);
    setRoleModalRole('member');
    setRoleModalNoAccount(false);
    const email = member.email || '';
    setRoleModalEmail(email);

    if (email) {
      await lookupProfile(email);
    }
  };

  const handleRoleSave = async () => {
    if (!roleModalProfileId) return;
    setRoleModalLoading(true);
    setRoleModalError(null);
    setRoleModalSuccess(null);

    try {
      const { error: updateErr } = await supabase
        .from('profiles')
        .update({ role: roleModalRole })
        .eq('id', roleModalProfileId);

      if (updateErr) {
        setRoleModalError(`Failed to update role: ${updateErr.message}`);
      } else {
        setRoleModalSuccess(`Role updated to "${roleModalRole}" successfully.`);
      }
    } catch {
      setRoleModalError('Failed to update role.');
    } finally {
      setRoleModalLoading(false);
    }
  };

  const filteredMembers = useMemo(() => {
    let result = members;

    if (chapterFilter !== 'all') {
      result = result.filter((m) => m.chapter === chapterFilter);
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (m) =>
          m.name.toLowerCase().includes(query) ||
          m.company.toLowerCase().includes(query) ||
          m.industry.toLowerCase().includes(query)
      );
    }

    return result.sort((a, b) => a.name.localeCompare(b.name));
  }, [members, searchQuery, chapterFilter]);

  const handleExport = () => {
    const csv = [
      ['Name', 'Company', 'Chapter', 'Industry'].join(','),
      ...filteredMembers.map((m) =>
        [m.name, m.company, m.chapter, m.industry].join(',')
      ),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bloc-members-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleAddMember = async () => {
    if (!newMember.name || !newMember.company || !newMember.industry) return;
    setIsSubmitting(true);

    const result = await addMember({
      name: newMember.name,
      company: newMember.company,
      chapter: newMember.chapter,
      industry: newMember.industry,
      email: newMember.email || undefined,
      phone: newMember.phone || undefined,
    });

    if (result) {
      setNewMember({ name: '', company: '', chapter: 'North', industry: '', email: '', phone: '' });
      setAddModalOpen(false);
    }
    setIsSubmitting(false);
  };

  const handleDeleteMember = async (id: string) => {
    setIsSubmitting(true);
    const result = await deleteMember(id);
    if (result) {
      setDeleteConfirmId(null);
    }
    setIsSubmitting(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-bloc-blue" />
        <span className="ml-3 text-slate-600">Loading members...</span>
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
      {/* Chapter Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {(Object.entries(chapterCounts) as [ChapterName, number][]).map(
          ([chapter, count]) => (
            <button
              key={chapter}
              onClick={() =>
                setChapterFilter(chapterFilter === chapter ? 'all' : chapter)
              }
              className={`p-4 rounded-xl text-center transition-all ${
                chapterFilter === chapter
                  ? 'bg-bloc-blue text-white shadow-lg scale-105'
                  : 'bg-white border border-slate-200 hover:border-bloc-blue'
              }`}
            >
              <p className="text-2xl font-bold">{count}</p>
              <p
                className={`text-sm ${
                  chapterFilter === chapter ? 'text-blue-100' : 'text-slate-500'
                }`}
              >
                {chapter}
              </p>
            </button>
          )
        )}
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex-1 max-w-md">
          <SearchInput
            placeholder="Search by name, company, or industry..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <select
            value={chapterFilter}
            onChange={(e) => setChapterFilter(e.target.value as ChapterFilter)}
            className="px-4 py-2.5 rounded-lg border border-slate-300 bg-white text-sm focus:ring-2 focus:ring-bloc-blue focus:border-bloc-blue outline-none"
          >
            {chapterFilters.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <Button variant="secondary" onClick={handleExport}>
            <Download size={16} className="mr-2" />
            Export
          </Button>
          {canEdit && (
            <Button onClick={() => setAddModalOpen(true)}>
              <UserPlus size={16} className="mr-2" />
              Add Member
            </Button>
          )}
        </div>
      </div>

      {/* Results Count */}
      <p className="text-sm text-slate-500">
        Showing {filteredMembers.length} members
        {chapterFilter !== 'all' && ` in ${chapterFilter}`}
      </p>

      {/* Members Table */}
      <Card padding="none" className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left p-4 text-sm font-semibold text-slate-600">
                  Member
                </th>
                <th className="text-left p-4 text-sm font-semibold text-slate-600">
                  Company
                </th>
                <th className="text-left p-4 text-sm font-semibold text-slate-600">
                  Chapter
                </th>
                <th className="text-left p-4 text-sm font-semibold text-slate-600">
                  Industry
                </th>
                {(canEdit || isAdmin) && (
                  <th className="text-right p-4 text-sm font-semibold text-slate-600 w-20">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredMembers.map((member) => (
                <tr
                  key={member.id}
                  className="hover:bg-slate-50 transition-colors cursor-pointer"
                  onClick={() => setDetailMember(member)}
                >
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-bloc-blue/10 flex items-center justify-center text-bloc-blue font-semibold">
                        {member.name
                          .split(' ')
                          .map((n) => n[0])
                          .join('')}
                      </div>
                      <div>
                        <span className="font-medium text-slate-900">
                          {member.name}
                        </span>
                        {member.title && (
                          <p className="text-xs text-slate-400">{member.title}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-1.5 text-slate-600">
                      <Building2 size={14} className="text-slate-400" />
                      {member.company}
                    </div>
                  </td>
                  <td className="p-4">
                    <Badge chapter={member.chapter}>{member.chapter}</Badge>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-1.5 text-slate-500 text-sm">
                      <Briefcase size={14} className="text-slate-400" />
                      {member.industry}
                    </div>
                  </td>
                  {(canEdit || isAdmin) && (
                    <td className="p-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        {isAdmin && (
                          <button
                            onClick={() => openRoleModal(member)}
                            className="p-1.5 text-slate-400 hover:text-bloc-blue hover:bg-blue-50 rounded-lg transition-colors"
                            title="Manage access role"
                          >
                            <Shield size={16} />
                          </button>
                        )}
                        {isAdmin && (
                          <button
                            onClick={() => setDeleteConfirmId(member.id)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Remove member"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {filteredMembers.length === 0 && (
        <div className="text-center py-12 text-slate-500">
          <Users size={48} className="mx-auto mb-3 opacity-50" />
          <p>No members match your search.</p>
        </div>
      )}

      {/* Add Member Modal */}
      <Modal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title="Add New Member"
        size="md"
      >
        <div className="space-y-4">
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
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Chapter *
            </label>
            <select
              value={newMember.chapter}
              onChange={(e) => setNewMember((prev) => ({ ...prev, chapter: e.target.value as ChapterName }))}
              className="w-full px-4 py-2.5 rounded-lg border border-slate-300 bg-white focus:ring-2 focus:ring-bloc-blue focus:border-bloc-blue outline-none"
            >
              {chapters.map((ch) => (
                <option key={ch} value={ch}>{ch}</option>
              ))}
            </select>
          </div>
          <Input
            label="Industry *"
            value={newMember.industry}
            onChange={(e) => setNewMember((prev) => ({ ...prev, industry: e.target.value }))}
            placeholder="e.g., Roofing"
          />
          <Input
            label="Email (optional)"
            type="email"
            value={newMember.email}
            onChange={(e) => setNewMember((prev) => ({ ...prev, email: e.target.value }))}
            placeholder="john@company.com"
          />
          <Input
            label="Phone (optional)"
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
              disabled={!newMember.name || !newMember.company || !newMember.industry || isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={14} className="mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                'Add Member'
              )}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        title="Remove Member"
        size="sm"
      >
        <p className="text-slate-600 mb-4">
          Are you sure you want to remove{' '}
          <strong>{members.find((m) => m.id === deleteConfirmId)?.name}</strong>{' '}
          from the roster? This action cannot be undone.
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

      {/* Member Detail Modal */}
      <Modal
        isOpen={!!detailMember}
        onClose={closeDetailModal}
        title={isEditingMember ? 'Edit Member' : 'Member Profile'}
        size="lg"
      >
        {detailMember && !isEditingMember && (
          <div className="space-y-5">
            {/* Header */}
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-full bg-bloc-blue/10 flex items-center justify-center text-bloc-blue text-xl font-bold flex-shrink-0">
                {detailMember.name.split(' ').map((n) => n[0]).join('')}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-xl font-bold text-slate-900">{detailMember.name}</h3>
                {detailMember.title && (
                  <p className="text-slate-600">{detailMember.title}</p>
                )}
                <div className="flex items-center gap-2 mt-1">
                  <Badge chapter={detailMember.chapter}>{detailMember.chapter}</Badge>
                  {detailMember.industry && (
                    <span className="text-sm text-slate-500">{detailMember.industry}</span>
                  )}
                </div>
              </div>
              {canEdit && (
                <button
                  onClick={() => startEditMember(detailMember)}
                  className="p-2 text-slate-400 hover:text-bloc-blue hover:bg-blue-50 rounded-lg transition-colors"
                  title="Edit member"
                >
                  <Pencil size={18} />
                </button>
              )}
            </div>

            {/* Company */}
            <div className="p-4 bg-slate-50 rounded-lg space-y-2">
              <div className="flex items-center gap-2 font-medium text-slate-900">
                <Building2 size={16} className="text-bloc-blue" />
                {detailMember.company}
              </div>
              {detailMember.description && (
                <p className="text-sm text-slate-600 leading-relaxed">{detailMember.description}</p>
              )}
            </div>

            {/* Contact Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {detailMember.email && (
                <a href={`mailto:${detailMember.email}`} className="flex items-center gap-2 p-3 rounded-lg border border-slate-200 hover:border-bloc-blue hover:bg-blue-50/50 transition-colors">
                  <Mail size={16} className="text-bloc-blue flex-shrink-0" />
                  <span className="text-sm text-slate-700 truncate">{detailMember.email}</span>
                </a>
              )}
              {detailMember.phone && (
                <a href={`tel:${detailMember.phone}`} className="flex items-center gap-2 p-3 rounded-lg border border-slate-200 hover:border-bloc-blue hover:bg-blue-50/50 transition-colors">
                  <Phone size={16} className="text-bloc-blue flex-shrink-0" />
                  <span className="text-sm text-slate-700">{detailMember.phone}</span>
                </a>
              )}
              {detailMember.mobilePhone && detailMember.mobilePhone !== detailMember.phone && (
                <a href={`tel:${detailMember.mobilePhone}`} className="flex items-center gap-2 p-3 rounded-lg border border-slate-200 hover:border-bloc-blue hover:bg-blue-50/50 transition-colors">
                  <Phone size={16} className="text-green-600 flex-shrink-0" />
                  <span className="text-sm text-slate-700">{detailMember.mobilePhone} <span className="text-slate-400">(mobile)</span></span>
                </a>
              )}
              {detailMember.website && (
                <a href={detailMember.website.startsWith('http') ? detailMember.website : `https://${detailMember.website}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-3 rounded-lg border border-slate-200 hover:border-bloc-blue hover:bg-blue-50/50 transition-colors">
                  <Globe size={16} className="text-bloc-blue flex-shrink-0" />
                  <span className="text-sm text-slate-700 truncate">{detailMember.website}</span>
                </a>
              )}
              {detailMember.address && (
                <div className="flex items-start gap-2 p-3 rounded-lg border border-slate-200 sm:col-span-2">
                  <MapPin size={16} className="text-bloc-blue flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-slate-700">{detailMember.address}</span>
                </div>
              )}
            </div>

            {/* Membership Details */}
            {(detailMember.memberSince || detailMember.birthday || detailMember.referredBy) && (
              <div className="border-t border-slate-200 pt-4 space-y-2">
                <h4 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Membership</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {detailMember.memberSince && (
                    <div className="flex items-center gap-2">
                      <Calendar size={14} className="text-slate-400" />
                      <div>
                        <p className="text-xs text-slate-400">Member Since</p>
                        <p className="text-sm text-slate-700">{detailMember.memberSince}</p>
                      </div>
                    </div>
                  )}
                  {detailMember.birthday && (
                    <div className="flex items-center gap-2">
                      <Calendar size={14} className="text-slate-400" />
                      <div>
                        <p className="text-xs text-slate-400">Birthday</p>
                        <p className="text-sm text-slate-700">{detailMember.birthday}</p>
                      </div>
                    </div>
                  )}
                  {detailMember.referredBy && (
                    <div className="flex items-center gap-2">
                      <UserCheck size={14} className="text-slate-400" />
                      <div>
                        <p className="text-xs text-slate-400">Referred By</p>
                        <p className="text-sm text-slate-700">{detailMember.referredBy}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {detailMember && isEditingMember && (
          <div className="space-y-4 max-h-[70vh] overflow-y-auto">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="Name" value={editMemberData.name || ''} onChange={(e) => setEditMemberData((p) => ({ ...p, name: e.target.value }))} />
              <Input label="Company" value={editMemberData.company || ''} onChange={(e) => setEditMemberData((p) => ({ ...p, company: e.target.value }))} />
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Chapter</label>
                <select
                  value={editMemberData.chapter || 'North'}
                  onChange={(e) => setEditMemberData((p) => ({ ...p, chapter: e.target.value as ChapterName }))}
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-300 bg-white focus:ring-2 focus:ring-bloc-blue focus:border-bloc-blue outline-none"
                >
                  {chapters.map((ch) => (<option key={ch} value={ch}>{ch}</option>))}
                </select>
              </div>
              <Input label="Industry" value={editMemberData.industry || ''} onChange={(e) => setEditMemberData((p) => ({ ...p, industry: e.target.value }))} />
              <Input label="Title" value={editMemberData.title || ''} onChange={(e) => setEditMemberData((p) => ({ ...p, title: e.target.value }))} />
              <Input label="Email" type="email" value={editMemberData.email || ''} onChange={(e) => setEditMemberData((p) => ({ ...p, email: e.target.value }))} />
              <Input label="Phone" type="tel" value={editMemberData.phone || ''} onChange={(e) => setEditMemberData((p) => ({ ...p, phone: e.target.value }))} />
              <Input label="Mobile Phone" type="tel" value={editMemberData.mobilePhone || ''} onChange={(e) => setEditMemberData((p) => ({ ...p, mobilePhone: e.target.value }))} />
              <Input label="Website" value={editMemberData.website || ''} onChange={(e) => setEditMemberData((p) => ({ ...p, website: e.target.value }))} />
              <Input label="Birthday" value={editMemberData.birthday || ''} onChange={(e) => setEditMemberData((p) => ({ ...p, birthday: e.target.value }))} placeholder="MM/DD" />
              <Input label="Member Since" value={editMemberData.memberSince || ''} onChange={(e) => setEditMemberData((p) => ({ ...p, memberSince: e.target.value }))} />
              <Input label="Renewal Due" value={editMemberData.renewalDue || ''} onChange={(e) => setEditMemberData((p) => ({ ...p, renewalDue: e.target.value }))} />
              <Input label="Referred By" value={editMemberData.referredBy || ''} onChange={(e) => setEditMemberData((p) => ({ ...p, referredBy: e.target.value }))} />
            </div>
            <div className="sm:col-span-2">
              <Input label="Address" value={editMemberData.address || ''} onChange={(e) => setEditMemberData((p) => ({ ...p, address: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Company Description</label>
              <textarea
                value={editMemberData.description || ''}
                onChange={(e) => setEditMemberData((p) => ({ ...p, description: e.target.value }))}
                rows={3}
                className="w-full px-4 py-2.5 rounded-lg border border-slate-300 bg-white focus:ring-2 focus:ring-bloc-blue focus:border-bloc-blue outline-none resize-none"
              />
            </div>
            <div className="flex gap-3 pt-2 sticky bottom-0 bg-white pb-1">
              <Button variant="secondary" className="flex-1" onClick={cancelEditMember}>
                <X size={14} className="mr-2" />
                Cancel
              </Button>
              <Button className="flex-1" onClick={handleSaveMember} disabled={editMemberSaving}>
                {editMemberSaving ? (
                  <><Loader2 size={14} className="mr-2 animate-spin" />Saving...</>
                ) : (
                  <><Save size={14} className="mr-2" />Save Changes</>
                )}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Role Management Modal */}
      <Modal
        isOpen={!!roleModalMember}
        onClose={() => setRoleModalMember(null)}
        title="Manage Access"
        size="sm"
      >
        {roleModalMember && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
              <div className="w-10 h-10 rounded-full bg-bloc-blue/10 flex items-center justify-center text-bloc-blue font-semibold">
                {roleModalMember.name.split(' ').map((n) => n[0]).join('')}
              </div>
              <div>
                <p className="font-medium text-slate-900">{roleModalMember.name}</p>
                <p className="text-sm text-slate-500">{roleModalMember.company}</p>
              </div>
            </div>

            {/* Email input for profile lookup */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Email Address
              </label>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={roleModalEmail}
                  onChange={(e) => {
                    setRoleModalEmail(e.target.value);
                    setRoleModalProfileId(null);
                    setRoleModalNoAccount(false);
                    setRoleModalError(null);
                    setRoleModalSuccess(null);
                  }}
                  placeholder="Enter member email..."
                  className="flex-1 px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm focus:ring-2 focus:ring-bloc-blue focus:border-bloc-blue outline-none"
                />
                <Button
                  onClick={() => lookupProfile(roleModalEmail)}
                  disabled={!roleModalEmail || roleModalLoading}
                >
                  {roleModalLoading ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    'Look Up'
                  )}
                </Button>
              </div>
            </div>

            {roleModalError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {roleModalError}
              </div>
            )}

            {roleModalSuccess && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                {roleModalSuccess}
              </div>
            )}

            {roleModalNoAccount && !roleModalLoading && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                <p className="font-medium">No dashboard account found</p>
                <p className="mt-1">
                  No account exists for <strong>{roleModalEmail}</strong>. They need to sign up for the
                  dashboard first, then you can assign their role here.
                </p>
              </div>
            )}

            {roleModalProfileId && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Dashboard Role
                </label>
                <select
                  value={roleModalRole}
                  onChange={(e) => {
                    setRoleModalRole(e.target.value as UserRole);
                    setRoleModalSuccess(null);
                  }}
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-300 bg-white focus:ring-2 focus:ring-bloc-blue focus:border-bloc-blue outline-none"
                >
                  <option value="member">Member (view only)</option>
                  <option value="chapter_director">Chapter Director (can edit their chapter)</option>
                  <option value="admin">Admin (full access)</option>
                </select>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button variant="secondary" className="flex-1" onClick={() => setRoleModalMember(null)}>
                {roleModalProfileId ? 'Cancel' : 'Close'}
              </Button>
              {roleModalProfileId && (
                <Button
                  className="flex-1"
                  onClick={handleRoleSave}
                  disabled={roleModalLoading}
                >
                  {roleModalLoading ? (
                    <>
                      <Loader2 size={14} className="mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Shield size={14} className="mr-2" />
                      Save Role
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
