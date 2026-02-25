'use client';

import { useState, useMemo } from 'react';
import { Users, Building2, Briefcase, Download, Loader2, UserPlus, Trash2 } from 'lucide-react';
import { Card, Badge, SearchInput, Button, Modal, Input } from '@/components/ui';
import { useMembers } from '@/hooks/useMembers';
import { useAuth } from '@/contexts/AuthContext';
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
  const { members, chapterCounts, loading, error, addMember, deleteMember } = useMembers();
  const { canEdit } = useAuth();
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
                {canEdit && (
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
                  className="hover:bg-slate-50 transition-colors"
                >
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-bloc-blue/10 flex items-center justify-center text-bloc-blue font-semibold">
                        {member.name
                          .split(' ')
                          .map((n) => n[0])
                          .join('')}
                      </div>
                      <span className="font-medium text-slate-900">
                        {member.name}
                      </span>
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
                  {canEdit && (
                    <td className="p-4 text-right">
                      <button
                        onClick={() => setDeleteConfirmId(member.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Remove member"
                      >
                        <Trash2 size={16} />
                      </button>
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
    </div>
  );
}
