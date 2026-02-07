'use client';

import { useState } from 'react';
import { Mail, Phone, Building2, Search, Users } from 'lucide-react';
import { Card, Badge, SearchInput } from '@/components/ui';
import {
  boardMembers,
  getExecutiveBoard,
  getChapterDirectors,
  getMembershipTeam,
  getCommitteeLeads,
} from '@/data/board';
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

function BoardMemberCard({ member }: { member: BoardMember }) {
  return (
    <Card className="flex flex-col h-full" padding="md">
      <div className="flex-1">
        <Badge variant={getRoleBadgeColor(member.role)} size="sm">
          {member.role}
        </Badge>
        <h3 className="text-lg font-bold mt-3 text-slate-900">{member.name}</h3>
        <div className="flex items-center gap-1.5 text-slate-500 text-sm mt-1">
          <Building2 size={14} />
          <span>{member.company}</span>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-slate-100 flex gap-3">
        <a
          href={`mailto:${member.email}`}
          className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-bloc-blue transition-colors"
        >
          <Mail size={14} />
          <span>Email</span>
        </a>
        <a
          href={`tel:${member.phone}`}
          className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-bloc-blue transition-colors"
        >
          <Phone size={14} />
          <span>{member.phone}</span>
        </a>
      </div>
    </Card>
  );
}

export function LeadershipTab() {
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const getFilteredMembers = (): BoardMember[] => {
    let members: BoardMember[];

    switch (filter) {
      case 'executive':
        members = getExecutiveBoard();
        break;
      case 'directors':
        members = getChapterDirectors();
        break;
      case 'membership':
        members = getMembershipTeam();
        break;
      case 'committees':
        members = getCommitteeLeads();
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
  };

  const filteredMembers = getFilteredMembers();

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
      <div className="flex flex-col sm:flex-row gap-4">
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
        <div className="flex-1 max-w-xs">
          <SearchInput
            placeholder="Search board members..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Results Count */}
      <p className="text-sm text-slate-500">
        Showing {filteredMembers.length} of {boardMembers.length} board members
      </p>

      {/* Board Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredMembers.map((member, index) => (
          <BoardMemberCard key={index} member={member} />
        ))}
      </div>

      {filteredMembers.length === 0 && (
        <div className="text-center py-12 text-slate-500">
          <Users size={48} className="mx-auto mb-3 opacity-50" />
          <p>No board members match your search.</p>
        </div>
      )}
    </div>
  );
}
