# BLOC Membership Dashboard

A multi-user membership management platform for **Business Leaders of Charlotte (BLOC)**.

> Building friendships, growing business, and strengthening our community.

## Features

- **Multi-User Authentication**: Role-based access — Admins, Chapter Directors, and Members
- **Dashboard Overview**: Track membership progress toward 2026 goals (target: 125 members)
- **Leadership Directory**: Contact info for all board members with role-based filtering
- **Member Roster**: Searchable directory of all members by chapter and industry
- **Most Wanted**: Recruitment targets organized by industry category with assignment tracking
- **Guest Pipeline**: Kanban-style tracking from first contact to membership approval
- **Public Join Form**: Prospects can submit interest at `/join` — feeds into the pipeline
- **Email Intake**: Inbound emails auto-create leads for the team to review
- **Wild Apricot Integration**: Two-way sync of members and events with WA
- **Admin Panel**: User management, role assignment, and WA sync controls
- **Real-time Updates**: All changes sync instantly via Supabase Realtime

### Public Guest Intake Flow (sub-project A)

- **QR-driven public flow** at `/guest/i/<token>` with signed JWT tokens
- **Live category-conflict check** with soft-warn (never blocks)
- **Anonymous + magic-link** identity for return RSVPs
- **GoHighLevel + Resend** integration with non-blocking side-effect retry
- **Dashboard tabs for directors/admins**: Guest Inbox, Events, QR Codes, Roster Manager
- **Member self-service**: My Profile tab lets members opt themselves in/out of the public roster
- **Print-friendly QR sheets** for distributing physical codes at chapter events

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Styling**: Tailwind CSS
- **Language**: TypeScript
- **Database**: Supabase (PostgreSQL + Auth + Realtime)
- **Icons**: Lucide React
- **Deployment**: Vercel

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- A Supabase project (optional — runs in demo mode without it)

### Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd bloc-membership-dashboard

# Install dependencies
npm install

# Copy environment template
cp .env.local.example .env.local
# Edit .env.local with your Supabase keys

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Demo Mode

Without Supabase environment variables, the app runs in **demo mode** with static sample data. All features are visible but data isn't persisted.

## Setup Guides

| Guide | Description |
|---|---|
| [Production Deployment](docs/PRODUCTION_DEPLOYMENT.md) | End-to-end Vercel + Supabase + Resend + GHL setup |
| [Supabase Setup](docs/SUPABASE_SETUP.md) | Database, auth, and realtime configuration |
| [Deployment](docs/DEPLOYMENT.md) | Deploy to Vercel with custom domain |
| [Wild Apricot](docs/WILDAPRICOT_SETUP.md) | Two-way member/event sync with Wild Apricot |
| [Email Intake](docs/EMAIL_INTAKE_SETUP.md) | Auto-create leads from inbound emails |
| [Guest Flow Spec](docs/superpowers/specs/2026-05-08-public-guest-intake-flow-design.md) | Design spec for the public QR flow |

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── join/             # Public signup API
│   │   └── wa/               # Wild Apricot sync routes
│   ├── join/                 # Public join form page
│   ├── layout.tsx            # Root layout
│   ├── page.tsx              # Main dashboard (auth-protected)
│   └── providers.tsx         # Client-side providers (AuthProvider)
├── components/
│   ├── auth/                 # AuthGuard, LoginForm
│   ├── tabs/                 # Tab content components
│   │   ├── AdminTab.tsx      # User management + WA sync
│   │   ├── DashboardTab.tsx  # Overview stats
│   │   ├── LeadershipTab.tsx # Board directory
│   │   ├── MembersTab.tsx    # Member roster
│   │   ├── PipelineTab.tsx   # Guest pipeline + signup review
│   │   └── TargetsTab.tsx    # Recruitment targets
│   └── ui/                   # Reusable UI components
├── contexts/
│   └── AuthContext.tsx        # Auth state, roles, permissions
├── hooks/                     # Supabase data hooks with realtime
│   ├── useGuests.ts          # Guest pipeline CRUD
│   ├── useMembers.ts         # Member roster
│   ├── useSignups.ts         # Public signup review
│   ├── useWildApricot.ts     # WA sync controls
│   └── ...
├── lib/
│   ├── supabase.ts           # Supabase client
│   └── wildapricot.ts        # WA API client
├── data/                      # Static fallback data (demo mode)
└── types/                     # TypeScript definitions

supabase/
├── migrations/
│   ├── 001_schema.sql        # Core schema + RLS
│   ├── 002_public_signup.sql # Public signups table
│   └── 003_wildapricot.sql   # WA integration tables
└── functions/
    └── inbound-email/        # Edge Function for email intake

docs/                          # Setup and deployment guides
```

## User Roles

| Role | Tabs available |
|---|---|
| **Member** | Dashboard, Leadership, Members, Most Wanted, Pipeline (read), Card Scanner, Membership Guide, **My Profile** (own roster opt-out) |
| **Chapter Director** | All Member tabs + **Guest Inbox**, **Events**, **QR Codes**, **Roster** (scoped to own chapter) |
| **Admin** | Same as Director + **Admin** panel; all chapters in scope |

New sign-ups get **Member** (view-only) access. Admins promote them via the Admin tab.

The dashboard surface is responsive to role: members never see director-only tabs, directors only see their own chapter's data in the intake/roster/QR views.

## BLOC Information

- **Website**: [businessleadersofcharlotte.com](https://businessleadersofcharlotte.com)
- **Admin**: admin@businessleadersofcharlotte.com

### Chapters

- BLOC North
- BLOC South
- BLOC Uptown
- FLOC (Future Leaders of Charlotte) — Ages 18-35
- Alumni

### Monthly Events

- **Lunch Meetings**: 2nd week of each month, 11:45 AM - 1:00 PM
- **After Hours**: Last Wednesday, 5:30 PM - 7:30 PM at Slate Billiards

---

Built with care for the BLOC Membership Team.
