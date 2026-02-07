# BLOC Membership Dashboard

A modern membership management dashboard for **Business Leaders of Charlotte (BLOC)**.

> Building friendships, growing business, and strengthening our community.

## Features

- **Dashboard Overview**: Track membership progress toward 2026 goals
- **Leadership Directory**: Contact info for all board members with role-based filtering
- **Member Roster**: Searchable directory of all members by chapter and industry
- **Most Wanted**: Recruitment targets organized by industry category with assignment tracking
- **Guest Pipeline**: Kanban-style tracking from first contact to membership approval

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS
- **Language**: TypeScript
- **Icons**: Lucide React
- **Deployment**: Vercel

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd bloc-membership-dashboard

# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Deploy to Vercel

### Option 1: Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

### Option 2: GitHub Integration

1. Push code to GitHub
2. Visit [vercel.com/new](https://vercel.com/new)
3. Import your repository
4. Deploy automatically

## Project Structure

```
src/
├── app/
│   ├── globals.css      # Global styles & Tailwind
│   ├── layout.tsx       # Root layout with metadata
│   └── page.tsx         # Main dashboard page
├── components/
│   ├── tabs/            # Tab content components
│   │   ├── DashboardTab.tsx
│   │   ├── LeadershipTab.tsx
│   │   ├── MembersTab.tsx
│   │   ├── TargetsTab.tsx
│   │   └── PipelineTab.tsx
│   └── ui/              # Reusable UI components
│       ├── Badge.tsx
│       ├── Button.tsx
│       ├── Card.tsx
│       ├── Input.tsx
│       ├── Modal.tsx
│       ├── ProgressBar.tsx
│       └── StatCard.tsx
├── data/                # Static data files
│   ├── board.ts
│   ├── members.ts
│   ├── targets.ts
│   ├── guests.ts
│   └── stats.ts
└── types/               # TypeScript definitions
    └── index.ts
```

## Customization

### Updating Board Members

Edit `src/data/board.ts` to update the 2026 board roster.

### Updating Members

Edit `src/data/members.ts` to add or modify member records.

### Adding Industry Targets

Edit `src/data/targets.ts` to add new recruitment categories or targets.

## BLOC Information

- **Website**: [businessleadersofcharlotte.com](https://businessleadersofcharlotte.com)
- **Admin**: admin@businessleadersofcharlotte.com

### Chapters

- BLOC North
- BLOC South
- BLOC Uptown
- FLOC (Future Leaders of Charlotte) - Ages 18-35
- Alumni

### Monthly Events

- **Lunch Meetings**: 2nd week of each month, 11:45 AM - 1:00 PM
- **After Hours**: Last Wednesday, 5:30 PM - 7:30 PM at Slate Billiards

---

Built with care for the BLOC Membership Team.
