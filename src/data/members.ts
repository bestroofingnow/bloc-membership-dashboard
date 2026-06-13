import { Member } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// SYNTHETIC PLACEHOLDER DATA — NOT REAL PEOPLE.
// This file is imported by client code and therefore ships in the public browser
// bundle, so it must never contain real member PII. The live app reads real
// members from Supabase (the member_directory view); this seed is only used for
// local demo mode (NEXT_PUBLIC_DEMO_MODE). All names/companies/emails/phones/
// addresses below are invented (example.com + 555-01xx). Real data backup lives
// OUTSIDE the repo — see bloc-private-member-backup-2026-06/.
// ─────────────────────────────────────────────────────────────────────────────

export const members: Member[] = [
  // North chapter
  { id: 'demo-001', name: 'Jordan Banks', company: 'Example National Bank', chapter: 'North', industry: 'Banking', email: 'jordan@example.com', phone: '704-555-0101', title: 'Branch Manager', website: 'www.example.com', description: 'Demo placeholder member — commercial and small-business banking.', address: '100 Example St, Charlotte, NC 28202', mobilePhone: '704-555-0111', birthday: '01/15', memberSince: '01/10/2020 0:00:00' },
  { id: 'demo-002', name: 'Riley Carpenter', company: 'Sample Roofing Co.', chapter: 'North', industry: 'Roofing', email: 'riley@example.com', phone: '704-555-0102', title: 'Owner', website: 'www.example.com', description: 'Demo placeholder member — residential and commercial roofing.', address: '102 Example St, Charlotte, NC 28202', mobilePhone: '704-555-0112', birthday: '02/20', memberSince: '03/05/2021 0:00:00' },
  { id: 'demo-003', name: 'Avery Marsh', company: 'Placeholder Marketing Group', chapter: 'North', industry: 'Digital Marketing', email: 'avery@example.com', phone: '704-555-0103', title: 'Director of Operations', website: 'www.example.com', description: 'Demo placeholder member — SEO, ads, and social.', address: '104 Example St, Charlotte, NC 28202', mobilePhone: '704-555-0113', birthday: '03/30', memberSince: '06/12/2022 0:00:00', referredBy: 'Jordan Banks' },

  // South chapter
  { id: 'demo-004', name: 'Casey Lawson', company: 'Sample Law, PLLC', chapter: 'South', industry: 'Business Law', email: 'casey@example.com', phone: '704-555-0104', title: 'Attorney', website: 'www.example.com', description: 'Demo placeholder member — small-business and contract law.', address: '200 Example Ave, Charlotte, NC 28203', mobilePhone: '704-555-0114', birthday: '04/12', memberSince: '02/18/2019 0:00:00' },
  { id: 'demo-005', name: 'Morgan Pratt', company: 'Pratt CPA, PA', chapter: 'South', industry: 'Public Accounting', email: 'morgan@example.com', phone: '704-555-0105', title: 'President', website: 'www.example.com', description: 'Demo placeholder member — tax and accounting services.', address: '202 Example Ave, Charlotte, NC 28203', mobilePhone: '704-555-0115', birthday: '05/22', memberSince: '09/01/2020 0:00:00' },
  { id: 'demo-006', name: 'Taylor Reese', company: 'Example Realty Collective', chapter: 'South', industry: 'Real Estate', email: 'taylor@example.com', phone: '704-555-0106', title: 'Broker', website: 'www.example.com', description: 'Demo placeholder member — residential real estate.', address: '204 Example Ave, Charlotte, NC 28203', mobilePhone: '704-555-0116', birthday: '06/08', memberSince: '11/15/2021 0:00:00', referredBy: 'Morgan Pratt' },

  // Uptown chapter
  { id: 'demo-007', name: 'Jamie Wells', company: 'Sample Insurance Advisors', chapter: 'Uptown', industry: 'Insurance', email: 'jamie@example.com', phone: '704-555-0107', title: 'Agent', website: 'www.example.com', description: 'Demo placeholder member — commercial and personal insurance.', address: '300 Example Blvd, Charlotte, NC 28204', mobilePhone: '704-555-0117', birthday: '07/19', memberSince: '04/10/2018 0:00:00' },
  { id: 'demo-008', name: 'Quinn Harper', company: 'Placeholder Interiors', chapter: 'Uptown', industry: 'Interior Design', email: 'quinn@example.com', phone: '704-555-0108', title: 'Principal Designer', website: 'www.example.com', description: 'Demo placeholder member — full-service interior design.', address: '302 Example Blvd, Charlotte, NC 28204', mobilePhone: '704-555-0118', birthday: '08/27', memberSince: '07/17/2019 0:00:00' },

  // FLOC chapter
  { id: 'demo-009', name: 'Devon Fields', company: 'Example Family Dentistry', chapter: 'FLOC', industry: 'Dentistry', email: 'devon@example.com', phone: '704-555-0109', title: 'Owner', website: 'www.example.com', description: 'Demo placeholder member — general and cosmetic dentistry.', address: '400 Example Way, Charlotte, NC 28205', mobilePhone: '704-555-0119', birthday: '09/03', memberSince: '05/19/2022 0:00:00' },
  { id: 'demo-010', name: 'Sawyer Glenn', company: 'Sample Construction LLC', chapter: 'FLOC', industry: 'Construction', email: 'sawyer@example.com', phone: '704-555-0110', title: 'General Contractor', website: 'www.example.com', description: 'Demo placeholder member — remodels and additions.', address: '402 Example Way, Charlotte, NC 28205', mobilePhone: '704-555-0120', birthday: '10/14', memberSince: '11/29/2023 0:00:00', referredBy: 'Devon Fields' },

  // Alumni chapter
  { id: 'demo-011', name: 'Reese Donovan', company: 'Placeholder Consulting', chapter: 'Alumni', industry: 'Business Consulting', email: 'reese@example.com', phone: '704-555-0121', title: 'Principal', website: 'www.example.com', description: 'Demo placeholder member — operations and strategy consulting.', address: '500 Example Ct, Charlotte, NC 28206', mobilePhone: '704-555-0131', birthday: '11/11', memberSince: '04/10/2017 0:00:00' },
  { id: 'demo-012', name: 'Skyler Nash', company: 'Example Technology Partners', chapter: 'Alumni', industry: 'Technology', email: 'skyler@example.com', phone: '704-555-0122', title: 'Senior Account Director', website: 'www.example.com', description: 'Demo placeholder member — IT and connectivity solutions.', address: '502 Example Ct, Charlotte, NC 28206', mobilePhone: '704-555-0132', birthday: '12/05', memberSince: '03/12/2018 0:00:00' },

  // After Hours tier (no chapter)
  { id: 'demo-013', name: 'Hayden Brooks', company: 'Sample Mortgage Group', chapter: null, memberType: 'after_hours', industry: 'Mortgage', email: 'hayden@example.com', phone: '704-555-0123', title: 'Loan Officer', website: 'www.example.com', description: 'Demo placeholder After Hours member — home and refinance loans.', mobilePhone: '704-555-0133', birthday: '01/28', memberSince: '06/01/2024 0:00:00' },
  { id: 'demo-014', name: 'Rowan Pierce', company: 'Placeholder Photography', chapter: null, memberType: 'after_hours', industry: 'Photography', email: 'rowan@example.com', phone: '704-555-0124', title: 'Photographer', website: 'www.example.com', description: 'Demo placeholder After Hours member — corporate and event photography.', mobilePhone: '704-555-0134', birthday: '02/09', memberSince: '08/01/2024 0:00:00' },
];
