'use client';

import { useState } from 'react';
import {
  Target,
  Briefcase,
  AlertCircle,
  CheckCircle2,
  User,
  ChevronDown,
  ChevronUp,
  Loader2,
} from 'lucide-react';
import { Card, Badge, Button, Modal, Input } from '@/components/ui';
import { useTargets } from '@/hooks/useTargets';
import { useBoardMembers } from '@/hooks/useBoardMembers';
import { IndustryTarget } from '@/types';

const priorityColors = {
  high: 'bg-red-100 text-red-700 border-red-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  low: 'bg-slate-100 text-slate-600 border-slate-200',
};

const priorityIcons = {
  high: <AlertCircle size={14} />,
  medium: <Target size={14} />,
  low: <CheckCircle2 size={14} />,
};

export function TargetsTab() {
  const {
    categories,
    totalTargets,
    assignedTargets,
    targetsByPriority,
    assignTarget,
    loading,
    error,
  } = useTargets();
  const { boardMembers } = useBoardMembers();

  const [expandedCategories, setExpandedCategories] = useState<string[]>(
    categories.map((c) => c.name)
  );
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<IndustryTarget | null>(null);

  const toggleCategory = (name: string) => {
    setExpandedCategories((prev) =>
      prev.includes(name)
        ? prev.filter((c) => c !== name)
        : [...prev, name]
    );
  };

  const handleAssign = (target: IndustryTarget) => {
    setSelectedTarget(target);
    setAssignModalOpen(true);
  };

  const confirmAssignment = async (boardMemberName: string) => {
    if (selectedTarget) {
      await assignTarget(selectedTarget.id, boardMemberName);
    }
    setAssignModalOpen(false);
    setSelectedTarget(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-bloc-blue" />
        <span className="ml-3 text-slate-600">Loading targets...</span>
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
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-l-4 border-amber-500 p-5 rounded-r-xl">
        <div className="flex items-start gap-3">
          <Target className="text-amber-600 mt-0.5" size={24} />
          <div>
            <h3 className="font-bold text-amber-900">Recruitment Strategy</h3>
            <p className="text-sm text-amber-800 mt-1">
              These are high-value industry seats that complement our existing membership.
              Assign each target to a Board Member who has connections in that industry.
            </p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="text-center" padding="md">
          <p className="text-3xl font-bold text-bloc-blue">{totalTargets}</p>
          <p className="text-sm text-slate-500">Target Industries</p>
        </Card>
        <Card className="text-center" padding="md">
          <p className="text-3xl font-bold text-red-600">{targetsByPriority.high.length}</p>
          <p className="text-sm text-slate-500">High Priority</p>
        </Card>
        <Card className="text-center" padding="md">
          <p className="text-3xl font-bold text-emerald-600">{assignedTargets}</p>
          <p className="text-sm text-slate-500">Assigned</p>
        </Card>
      </div>

      {/* Industry Categories */}
      <div className="space-y-4">
        {categories.map((category) => {
          const isExpanded = expandedCategories.includes(category.name);
          const categoryAssigned = category.targets.filter(
            (t) => t.assignedTo
          ).length;

          return (
            <Card key={category.name} padding="none" className="overflow-hidden">
              {/* Category Header */}
              <button
                onClick={() => toggleCategory(category.name)}
                className="w-full flex items-center justify-between p-5 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-bloc-blue/10 rounded-lg">
                    <Briefcase className="text-bloc-blue" size={20} />
                  </div>
                  <div className="text-left">
                    <h3 className="text-lg font-bold text-slate-900">
                      {category.name}
                    </h3>
                    <p className="text-sm text-slate-500">
                      {category.targets.length} targets &middot;{' '}
                      {categoryAssigned} assigned
                    </p>
                  </div>
                </div>
                {isExpanded ? (
                  <ChevronUp className="text-slate-400" size={20} />
                ) : (
                  <ChevronDown className="text-slate-400" size={20} />
                )}
              </button>

              {/* Targets List */}
              {isExpanded && (
                <div className="border-t border-slate-100 divide-y divide-slate-50">
                  {category.targets.map((target) => {
                    const assignedMember = target.assignedTo
                      ? boardMembers.find((m) => m.name === target.assignedTo)
                      : null;

                    return (
                      <div
                        key={target.id}
                        className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${
                              priorityColors[target.priority]
                            }`}
                          >
                            {priorityIcons[target.priority]}
                            {target.priority}
                          </span>
                          <span className="font-medium text-slate-800">
                            {target.title}
                          </span>
                        </div>

                        <div className="flex items-center gap-3">
                          {assignedMember || target.assignedTo ? (
                            <div className="flex items-center gap-2 text-sm text-emerald-600">
                              <User size={14} />
                              <span>{target.assignedTo}</span>
                            </div>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleAssign(target)}
                            >
                              + Assign
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Assignment Modal */}
      <Modal
        isOpen={assignModalOpen}
        onClose={() => setAssignModalOpen(false)}
        title={`Assign: ${selectedTarget?.title || ''}`}
      >
        <p className="text-sm text-slate-600 mb-4">
          Select a board member to own this recruitment target. They&apos;ll be
          responsible for finding and inviting candidates.
        </p>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {boardMembers
            .filter((m) => !m.role.includes('Admin'))
            .map((member) => (
              <button
                key={member.name}
                onClick={() => confirmAssignment(member.name)}
                className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-slate-100 transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-full bg-bloc-blue/10 flex items-center justify-center text-bloc-blue font-semibold">
                  {member.name
                    .split(' ')
                    .map((n) => n[0])
                    .join('')}
                </div>
                <div>
                  <p className="font-medium text-slate-900">{member.name}</p>
                  <p className="text-sm text-slate-500">{member.role}</p>
                </div>
              </button>
            ))}
        </div>
      </Modal>
    </div>
  );
}
