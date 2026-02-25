'use client';

import { useState } from 'react';
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  UserCheck,
  Calendar,
  Users,
  ArrowRight,
  Clock,
  AlertTriangle,
  CheckCircle2,
  FileText,
} from 'lucide-react';
import { Card, Badge } from '@/components/ui';

function Section({
  title,
  icon,
  children,
  defaultOpen = false,
  accent = 'blue',
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  accent?: 'blue' | 'purple' | 'emerald' | 'amber' | 'rose';
}) {
  const [open, setOpen] = useState(defaultOpen);

  const accentStyles = {
    blue: 'border-l-bloc-blue',
    purple: 'border-l-purple-500',
    emerald: 'border-l-emerald-500',
    amber: 'border-l-amber-500',
    rose: 'border-l-rose-500',
  };

  const iconStyles = {
    blue: 'text-bloc-blue',
    purple: 'text-purple-600',
    emerald: 'text-emerald-600',
    amber: 'text-amber-600',
    rose: 'text-rose-600',
  };

  return (
    <Card className={`border-l-4 ${accentStyles[accent]} overflow-hidden`} padding="none">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 p-5 text-left hover:bg-slate-50 transition-colors"
      >
        <span className={iconStyles[accent]}>{icon}</span>
        <h3 className="font-bold text-slate-900 flex-1">{title}</h3>
        {open ? (
          <ChevronDown size={20} className="text-slate-400" />
        ) : (
          <ChevronRight size={20} className="text-slate-400" />
        )}
      </button>
      {open && <div className="px-5 pb-5 border-t border-slate-100 pt-4">{children}</div>}
    </Card>
  );
}

function StepItem({
  number,
  label,
  location,
  children,
}: {
  number?: number;
  label?: string;
  location?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3 py-3">
      {number && (
        <div className="w-7 h-7 rounded-full bg-bloc-blue text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
          {number}
        </div>
      )}
      {label && (
        <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
          {label}
        </div>
      )}
      <div className="flex-1">
        {location && (
          <span className="text-xs font-semibold text-bloc-blue uppercase tracking-wide">
            {location}
          </span>
        )}
        <div className="text-sm text-slate-700 leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2 my-2">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
          <ChevronRight size={14} className="text-slate-400 mt-0.5 shrink-0" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function MembershipGuideTab() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-l-4 border-bloc-blue p-5 rounded-r-xl">
        <div className="flex items-start gap-3">
          <BookOpen className="text-bloc-blue mt-0.5" size={24} />
          <div>
            <h2 className="font-bold text-bloc-navy text-lg">
              Membership Guidelines &amp; Procedures
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              Reference guide for Chapter Membership Committee Representatives (CMCRs), Directors,
              and the Membership Committee. Keep this handy as you shepherd prospects through the
              process.
            </p>
          </div>
        </div>
      </div>

      {/* Quick Reference Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="text-center" padding="md">
          <div className="text-3xl font-bold text-bloc-blue mb-1">1-2-3-4</div>
          <p className="text-xs text-slate-500">
            After Hours → Luncheon → Industry Slot → Application
          </p>
        </Card>
        <Card className="text-center" padding="md">
          <div className="text-3xl font-bold text-amber-600 mb-1">$300</div>
          <p className="text-xs text-slate-500">
            Full Member / $150 Associate
          </p>
        </Card>
        <Card className="text-center" padding="md">
          <div className="text-3xl font-bold text-emerald-600 mb-1">48hr</div>
          <p className="text-xs text-slate-500">
            Welcome email deadline after board approval
          </p>
        </Card>
      </div>

      {/* CMCR Role & Responsibilities */}
      <Section
        title="CMCR Role & Responsibilities"
        icon={<UserCheck size={20} />}
        defaultOpen={true}
        accent="blue"
      >
        <div className="space-y-4">
          <div>
            <h4 className="font-semibold text-slate-800 mb-2">Role</h4>
            <BulletList
              items={[
                'Help your chapter retain & recruit quality professionals',
                'Handle the paperwork required for the approval of new members',
                'Attend monthly meetings for membership application review',
                'Be a conduit for membership communications between your Chapter & the Membership Committee',
              ]}
            />
          </div>

          <div>
            <h4 className="font-semibold text-slate-800 mb-2">Responsibilities</h4>
            <BulletList
              items={[
                'Attend monthly meetings, currently scheduled for the last Wed. of the month @ 5:00pm just prior to and at the same location as the After Hours (AH)',
                "Become your chapter's point person on all things regarding BLOC membership",
                'Know the Membership process and procedure',
                'Keep up with what industry slots are open',
                'Follow up with all inquiries regarding membership',
                'Check with current members to make sure there is no competitive conflict — if there is ANY question, CMCR needs to manage the industry slot',
              ]}
            />
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-800">
                  Send &ldquo;Join Us&rdquo; link ONLY after confirming:
                </p>
                <BulletList
                  items={[
                    'Their attendance at an After Hours (AH) event',
                    'Their attendance at a luncheon at the Chapter they want to join',
                    'There is an open industry slot and there is no competitive conflict',
                  ]}
                />
              </div>
            </div>
          </div>

          <div>
            <h4 className="font-semibold text-slate-800 mb-2">
              Application Follow-Through
            </h4>
            <BulletList
              items={[
                'Review Application to assure proper completion',
                "Check with listed 'Referrals' on the application to assure they are willing to vouch for the candidate",
                'Online research of applicant via LinkedIn, Google, Facebook, online reviews, etc.',
                'Schedule a One-on-One with applicant prior to Membership Meeting',
                'Review all applications as a Membership Committee',
                'Update Chapter Directors on approved/unapproved/pending applications',
                'Chapter Directors will then review with BLOC Board of Directors at the next Board meeting (usually the first Wednesday of each month)',
              ]}
            />
          </div>

          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <CheckCircle2 size={16} className="text-emerald-600 mt-0.5 shrink-0" />
              <div className="text-sm text-emerald-800">
                <p className="font-semibold">After approval:</p>
                <p className="mt-1">
                  Share the decision with the candidate immediately. If approved, let them know
                  an invoice is forthcoming. Remind the Chapter Director that a name tag is
                  required after membership payment is received. BLOC Admin will
                  monitor/order/distribute nametags.
                </p>
              </div>
            </div>
          </div>

          <div>
            <h4 className="font-semibold text-slate-800 mb-2">
              Monthly Luncheon Announcements
            </h4>
            <BulletList
              items={[
                'Membership achievements and ideas',
                'Introduction of new members',
                'Top industry needs for the chapter',
              ]}
            />
          </div>
        </div>
      </Section>

      {/* Standard Membership Process */}
      <Section
        title="Standard Membership Process"
        icon={<ClipboardList size={20} />}
        accent="purple"
      >
        <div className="space-y-1 divide-y divide-slate-100">
          <StepItem number={1}>
            <p className="font-semibold text-slate-900">Inquiry</p>
            <p>
              All inquiries are directed to the CMCR of the Chapter the inquirer is seeking
              membership in. Send the inquirer the &ldquo;BLOC General Inquiry Response&rdquo; to
              encourage standardization and minimize misinformation.
            </p>
          </StepItem>

          <StepItem number={2}>
            <p className="font-semibold text-slate-900">Industry Slot Check</p>
            <p>
              Since Industry Exclusivity is a pinnacle of BLOC, make sure the desired slot is
              available before proceeding.
            </p>
          </StepItem>

          <StepItem number={3}>
            <p className="font-semibold text-slate-900">1-2-3-4 Sequence</p>
            <div className="flex flex-wrap gap-2 my-2">
              <Badge variant="info">1. After Hours</Badge>
              <ArrowRight size={14} className="text-slate-400 self-center" />
              <Badge variant="info">2. Luncheon</Badge>
              <ArrowRight size={14} className="text-slate-400 self-center" />
              <Badge variant="info">3. Industry Slot</Badge>
              <ArrowRight size={14} className="text-slate-400 self-center" />
              <Badge variant="info">4. Application</Badge>
            </div>
            <p>
              Applicants start at an AH event. If still interested, they inquire with the CMCR
              about attending a Chapter luncheon. Then, if so inclined, they may proceed to
              apply via the CMCR, provided their Industry Slot is still available.
            </p>
          </StepItem>

          <StepItem number={4}>
            <p className="font-semibold text-slate-900">CMCR Vetting</p>
            <p>
              The CMCR is the point person and spokesperson for the applicant and will shepherd
              the application all the way from Inquiry to Decision Notification.
            </p>
          </StepItem>

          <StepItem number={5}>
            <p className="font-semibold text-slate-900">Membership Committee Approval</p>
            <BulletList
              items={[
                'If approved, application is sent to the Board for review and approval',
                'If not approved, CMCR will resolve issues and return to committee at the next meeting, or inform the applicant of the decline',
              ]}
            />
          </StepItem>

          <StepItem number={6}>
            <p className="font-semibold text-slate-900">Board Approval</p>
            <BulletList
              items={[
                'If approved, CMCR notifies the applicant immediately and that their invoice is forthcoming',
                'If not approved, CMCR resolves issues and returns to the Board at the next meeting, or informs the applicant of the decline',
              ]}
            />
          </StepItem>

          <StepItem number={7}>
            <p className="font-semibold text-slate-900">Payment</p>
            <p>
              Upon processing of membership dues, applicant is ordered a name tag and may attend
              and participate in all BLOC activities of the level of membership approved.
            </p>
          </StepItem>
        </div>
      </Section>

      {/* Membership A to Z */}
      <Section
        title="Membership A to Z — Full Timeline"
        icon={<FileText size={20} />}
        accent="emerald"
      >
        <div className="space-y-1">
          {/* At After Hours */}
          <div className="bg-blue-50 rounded-lg p-4 mb-4">
            <h4 className="font-bold text-blue-900 text-sm uppercase tracking-wide mb-3 flex items-center gap-2">
              <Calendar size={14} />
              At After Hours
            </h4>
            <div className="space-y-2 text-sm text-slate-700">
              <div className="flex items-start gap-2">
                <Badge variant="default" size="sm">Prospect</Badge>
                <span>Attend After Hours event</span>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="default" size="sm">Prospect</Badge>
                <span>
                  Show interest in a Chapter. Check industry slot on website. Reach out to CMCR
                  for the Chapter you want to join.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="info" size="sm">CMCR</Badge>
                <span>Double check industry slot is available, no conflicts</span>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="info" size="sm">CMCR / Director</Badge>
                <span>Invite prospective member to luncheon</span>
              </div>
            </div>
          </div>

          {/* At Chapter Luncheon */}
          <div className="bg-purple-50 rounded-lg p-4 mb-4">
            <h4 className="font-bold text-purple-900 text-sm uppercase tracking-wide mb-3 flex items-center gap-2">
              <Users size={14} />
              At Chapter Luncheon
            </h4>
            <div className="space-y-2 text-sm text-slate-700">
              <div className="flex items-start gap-2">
                <Badge variant="default" size="sm">Prospect</Badge>
                <span>Attend luncheon</span>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="warning" size="sm">Director</Badge>
                <span>Welcome new guest/prospective member</span>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="info" size="sm">CMCR</Badge>
                <span>Answer any membership questions</span>
              </div>
            </div>
          </div>

          {/* After Chapter Luncheon */}
          <div className="bg-amber-50 rounded-lg p-4 mb-4">
            <h4 className="font-bold text-amber-900 text-sm uppercase tracking-wide mb-3 flex items-center gap-2">
              <Clock size={14} />
              After Chapter Luncheon
            </h4>
            <div className="space-y-2 text-sm text-slate-700">
              <div className="flex items-start gap-2">
                <Badge variant="info" size="sm">CMCR</Badge>
                <span>
                  Follow up for feedback. Send link to apply if prospect still wishes to join
                  your chapter or seek another chapter.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="default" size="sm">Prospect</Badge>
                <span>Fill out application and sign expectation form online</span>
              </div>
            </div>
          </div>

          {/* Before Membership Meeting */}
          <div className="bg-slate-100 rounded-lg p-4 mb-4">
            <h4 className="font-bold text-slate-800 text-sm uppercase tracking-wide mb-3 flex items-center gap-2">
              <ClipboardList size={14} />
              Before Membership Monthly Meeting
            </h4>
            <div className="space-y-2 text-sm text-slate-700">
              <div className="flex items-start gap-2">
                <Badge variant="info" size="sm">CMCR</Badge>
                <span>
                  Vet new candidate. Complete a One-on-One with the prospective member.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="info" size="sm">CMCR</Badge>
                <span>
                  Complete checklist (satisfactory Google name search, etc.)
                </span>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="success" size="sm">Membership Chair</Badge>
                <span>Add prospective member to agenda</span>
              </div>
            </div>
          </div>

          {/* At Monthly Membership Meeting */}
          <div className="bg-blue-50 rounded-lg p-4 mb-4">
            <h4 className="font-bold text-blue-900 text-sm uppercase tracking-wide mb-3 flex items-center gap-2">
              <Users size={14} />
              Monthly Membership Meeting (5:00 PM before After Hours)
            </h4>
            <div className="space-y-2 text-sm text-slate-700">
              <div className="flex items-start gap-2">
                <Badge variant="info" size="sm">CMCR</Badge>
                <span>Present new application</span>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="success" size="sm">Committee</Badge>
                <span>Vote to approve or deny</span>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="info" size="sm">CMCR</Badge>
                <span>
                  Notify member of approval and next steps (goes to Board for approval) or
                  denial (work through Committee&rsquo;s concern with the member)
                </span>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="success" size="sm">Membership Chair</Badge>
                <span>Move pending application to Approved in Drop Box for Admin</span>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="success" size="sm">Membership Chair</Badge>
                <span>Add approved members to Membership Committee Report</span>
              </div>
            </div>
          </div>

          {/* At Monthly Board Meeting */}
          <div className="bg-emerald-50 rounded-lg p-4 mb-4">
            <h4 className="font-bold text-emerald-900 text-sm uppercase tracking-wide mb-3 flex items-center gap-2">
              <Users size={14} />
              Monthly Board Meeting (1st Wednesday of the Month)
            </h4>
            <div className="space-y-2 text-sm text-slate-700">
              <div className="flex items-start gap-2">
                <Badge variant="success" size="sm">Membership Chair</Badge>
                <span>Present new members for vote</span>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="warning" size="sm">Board</Badge>
                <span>Vote to approve / deny / referral</span>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="error" size="sm">Admin</Badge>
                <span>Notify Director of member status</span>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="warning" size="sm">Director</Badge>
                <span>
                  Send Welcome Email — must be done well in advance of the invoice being sent
                  and completed within 48 hours of the board meeting
                </span>
              </div>
            </div>
          </div>

          {/* After Board Meeting */}
          <div className="bg-slate-100 rounded-lg p-4 mb-4">
            <h4 className="font-bold text-slate-800 text-sm uppercase tracking-wide mb-3 flex items-center gap-2">
              <Clock size={14} />
              After Board Meeting
            </h4>
            <div className="space-y-2 text-sm text-slate-700">
              <div className="flex items-start gap-2">
                <Badge variant="error" size="sm">Admin</Badge>
                <span>
                  Add member to Outstand and appropriate groups based on contact info from
                  the application
                </span>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="error" size="sm">Admin</Badge>
                <span>Add names to attendance sheets</span>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="error" size="sm">Admin</Badge>
                <span>
                  Add names to lunch meeting guides to announce new members
                </span>
              </div>
            </div>
          </div>

          {/* 1.5 Weeks After Board Approval */}
          <div className="bg-amber-50 rounded-lg p-4 mb-4">
            <h4 className="font-bold text-amber-900 text-sm uppercase tracking-wide mb-3 flex items-center gap-2">
              <Clock size={14} />
              ~1.5 Weeks After Board Approval
            </h4>
            <div className="space-y-2 text-sm text-slate-700">
              <div className="flex items-start gap-2">
                <Badge variant="error" size="sm">Admin</Badge>
                <span>
                  Send invoice for dues — $300 Full Member, $150 Associate
                </span>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="default" size="sm">Member</Badge>
                <span>Receive and pay invoice</span>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="error" size="sm">Admin</Badge>
                <span>Request info for website profile posting</span>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="default" size="sm">Member</Badge>
                <span>Send website profile posting info</span>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="error" size="sm">Admin</Badge>
                <span>Post website profile &amp; do nametag layout, send to member for approval</span>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="default" size="sm">Member</Badge>
                <span>Approve nametag design</span>
              </div>
            </div>
          </div>

          {/* 1 Week Before After Hours */}
          <div className="bg-blue-50 rounded-lg p-4 mb-4">
            <h4 className="font-bold text-blue-900 text-sm uppercase tracking-wide mb-3 flex items-center gap-2">
              <Calendar size={14} />
              1 Week Before After Hours
            </h4>
            <div className="space-y-2 text-sm text-slate-700">
              <div className="flex items-start gap-2">
                <Badge variant="error" size="sm">Admin</Badge>
                <span>Send nametags to print</span>
              </div>
            </div>
          </div>

          {/* At After Hours - Final */}
          <div className="bg-emerald-50 rounded-lg p-4 mb-4">
            <h4 className="font-bold text-emerald-900 text-sm uppercase tracking-wide mb-3 flex items-center gap-2">
              <CheckCircle2 size={14} />
              At After Hours — Welcome!
            </h4>
            <div className="space-y-2 text-sm text-slate-700">
              <div className="flex items-start gap-2">
                <Badge variant="error" size="sm">Admin</Badge>
                <span>Bring nametags to After Hours and add to chapter bins</span>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="info" size="sm">CMCR &amp; Directors</Badge>
                <span>Welcome new member in person</span>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="default" size="sm">Member</Badge>
                <span>
                  Pick up and wear new nametag with pride at their first After Hours as a new
                  member!
                </span>
              </div>
            </div>
          </div>

          {/* New Member Next Steps */}
          <div className="bg-gradient-to-r from-bloc-blue/5 to-indigo-50 rounded-lg p-4 border border-bloc-blue/20">
            <h4 className="font-bold text-bloc-navy text-sm mb-3">
              New Member Next Steps
            </h4>
            <BulletList
              items={[
                'Join a committee and schedule one-on-ones with other members',
                'Attend the next Member Orientation',
                'Join BLOC Facebook and LinkedIn Groups',
                'Follow BLOC on Twitter and Instagram',
              ]}
            />
          </div>
        </div>
      </Section>

      {/* Attendance Waiver Policies */}
      <Section
        title="Attendance Waiver Policies"
        icon={<Calendar size={20} />}
        accent="amber"
      >
        <div className="space-y-6">
          {/* Executive Council Attendance Waiver */}
          <div>
            <h4 className="font-semibold text-slate-800 mb-2 flex items-center gap-2">
              <Badge variant="info">Executive Council Waiver</Badge>
            </h4>
            <div className="text-sm text-slate-700 space-y-2">
              <p>
                A member can solicit for approval a <strong>60-day attendance waiver</strong> for
                a personal reason. The individual must notify a Senior Board member or a member
                of the Executive Council.
              </p>
              <p>
                Should an extension be needed, the request must be communicated to a Senior Board
                Member. Both the initial waiver period and any extension will need to be shared
                with BLOC Admin and the respective Senior and Junior Chapter Directors.
              </p>
            </div>
          </div>

          {/* Medical Waiver */}
          <div>
            <h4 className="font-semibold text-slate-800 mb-2 flex items-center gap-2">
              <Badge variant="warning">Medical Waiver</Badge>
            </h4>
            <div className="text-sm text-slate-700 space-y-2">
              <p>
                A member can request a <strong>60-day medical attendance waiver</strong>. The
                individual must notify their Senior Chapter Director. The specific medical reason
                is <em>not</em> required to be shared.
              </p>
              <p>
                Extensions must be communicated. This information, including the initial waiver
                and any extension, will be shared with BLOC Admin, the Junior Chapter Director,
                and the Senior Membership Chair from the respective chapter.
              </p>
            </div>
          </div>

          {/* Waiver Addendum */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
              <div className="text-sm text-amber-800">
                <p className="font-semibold">Addendum</p>
                <p className="mt-1">
                  While the initial Attendance Waiver(s) should be communicated to chapter
                  leadership, the president, and the Board of Directors, an official Board vote
                  for approval is <strong>not</strong> required. Approval will need to be granted
                  by the President and/or the Executive Council.
                </p>
                <p className="mt-2">
                  However, if a <strong>second or additional 60-day waiver</strong> is requested,
                  the BLOC Board of Directors will need to approve via a Board meeting vote.
                </p>
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* Sub Attendance Policy */}
      <Section
        title="Substitute Attendance Policy"
        icon={<Users size={20} />}
        accent="rose"
      >
        <div className="space-y-4">
          <div className="bg-rose-50 border border-rose-200 rounded-lg p-4">
            <p className="text-sm font-semibold text-rose-800 mb-1">
              Applies ONLY to BLOC Monthly Luncheons — Not Tuesday Topics
            </p>
          </div>

          <div className="text-sm text-slate-700 space-y-3">
            <p>
              A sub can attend a member&rsquo;s luncheon, on their behalf, so that at least their
              brand is represented at the chapter luncheon, <strong>once per quarter</strong>. It
              does not need to be a member of another chapter, and no substitute would be in
              &ldquo;good standing.&rdquo;
            </p>
            <p>
              A member can send a sub from his/her place of business to attend that person&rsquo;s
              Member luncheon in lieu of themselves once a quarter. Doing so{' '}
              <strong>will count as having attended</strong>.
            </p>
          </div>

          <div className="bg-slate-100 rounded-lg p-4">
            <h4 className="font-semibold text-slate-800 text-sm mb-2">Key Rules</h4>
            <BulletList
              items={[
                'A sub cannot attend another chapter luncheon and have it count as attending their Chapter luncheon',
                'The sub does not have to be a member but could be from another chapter',
                "The sub is considered a guest but should sign in under the Full Member's Name to assure proper attendance credit",
                'Limit: once per quarter',
              ]}
            />
          </div>
        </div>
      </Section>
    </div>
  );
}
