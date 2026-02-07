import { BoardMember } from '@/types';

export const boardMembers: BoardMember[] = [
  {
    role: 'President',
    name: 'Brett Metcalf',
    company: 'PROforma Think Ink',
    email: 'brett.metcalf@proforma.com',
    phone: '770-401-2793',
  },
  {
    role: 'Vice President',
    name: 'Faith Penney',
    company: 'Collected Spaces',
    email: 'faith@thecollectedspaces.com',
    phone: '813-951-3604',
  },
  {
    role: 'Membership (Sr)',
    name: 'James Turner',
    company: 'Best Roofing Now',
    email: 'james@bestroofingnow.com',
    phone: '704-831-1525',
  },
  {
    role: 'Membership (Jr)',
    name: 'Chad Nugen',
    company: 'Bank of America',
    email: 'chad.nugen@bofa.com',
    phone: '704-632-5327',
  },
  {
    role: 'Uptown Director (Sr)',
    name: 'Brandon Muhaw',
    company: 'Accents Painting',
    email: 'Brandon@accentspaintingclt.com',
    phone: '704-254-4147',
  },
  {
    role: 'Uptown Director (Jr)',
    name: 'Kayla Arnold',
    company: 'USHealth Advisors',
    email: 'kayla.arnold@ushadvisors.com',
    phone: '407-748-9091',
  },
  {
    role: 'North Director (Sr)',
    name: 'Clayton Young',
    company: 'Heartland Payroll',
    email: 'claxtonyoung@gmail.com',
    phone: '818-640-3007',
  },
  {
    role: 'North Director (Jr)',
    name: 'Summer Sprouse',
    company: 'Primerica',
    email: 'ssprouse@primerica.com',
    phone: '704-996-8129',
  },
  {
    role: 'South Director (Sr)',
    name: 'Julie Stevens',
    company: 'The Biz Spa',
    email: 'julie@thebizspa.com',
    phone: '704-699-9220',
  },
  {
    role: 'South Director (Jr)',
    name: 'Ben Stradtmann',
    company: 'Schooley Mitchell',
    email: 'benjamin.stradtmann@schooleymitchell.com',
    phone: '980-395-4329',
  },
  {
    role: 'FLOC Director (Sr)',
    name: 'Douglas Howard',
    company: 'Experient Group',
    email: 'dhoward@experientgroup.com',
    phone: '704-677-8555',
  },
  {
    role: 'FLOC Director (Jr)',
    name: 'Ryan Kidd',
    company: 'Best Integration Tech',
    email: 'rkidd@bestintech.com',
    phone: '803-981-4387',
  },
  {
    role: 'Alumni Director (Sr)',
    name: 'Joe Keener',
    company: 'Pruitt Keener Ins.',
    email: 'joe@pruittkeener.com',
    phone: '704-759-1300',
  },
  {
    role: 'Alumni Director (Jr)',
    name: 'Mike Waite',
    company: 'DiFabion Remodeling',
    email: 'mikewaite@difabionremodeling.com',
    phone: '704-254-1134',
  },
  {
    role: 'Treasurer (Sr)',
    name: 'Jon Massachi',
    company: 'Truist',
    email: 'jon.massachi@truist.com',
    phone: '704-650-9568',
  },
  {
    role: 'Treasurer (Jr)',
    name: 'Lauren Borchert',
    company: 'Sullivan CPA',
    email: 'lborchert@sullivancpapa.com',
    phone: '704-607-4364',
  },
  {
    role: 'After Hours (Sr)',
    name: 'Lesha Dodson',
    company: 'Brightway Insurance',
    email: 'lesha.dodson@brightway.com',
    phone: '704-458-9178',
  },
  {
    role: 'After Hours (Jr)',
    name: 'Lia Moore',
    company: 'Pruitt Keener Ins.',
    email: 'lia@pruittkeener.com',
    phone: '304-807-7056',
  },
  {
    role: 'Sponsorship (Sr)',
    name: 'Kristi Cruise',
    company: 'Living Libraries',
    email: 'kristi@living-libraries.com',
    phone: '513-444-8200',
  },
  {
    role: 'Sponsorship (Jr)',
    name: 'Madison Stenger',
    company: 'Corrective Chiropractic',
    email: 'drmadisonstenger@gmail.com',
    phone: '260-409-7632',
  },
  {
    role: 'CIC (Sr)',
    name: 'Nick Heffron',
    company: 'U.S. Bank',
    email: 'nicholas.heffron@usbank.com',
    phone: '704-488-5671',
  },
  {
    role: 'CIC (Jr)',
    name: 'Saket Nigam',
    company: 'Mosquito Shield',
    email: 'saketnigam@gmail.com',
    phone: '919-523-6865',
  },
  {
    role: 'BIG Program (Sr)',
    name: 'Liana Matheney',
    company: 'BHHS Carolinas',
    email: 'lmatheney@bhhscarolinas.com',
    phone: '980-297-4138',
  },
  {
    role: 'BIG Program (Jr)',
    name: 'Deepa Jagannathan',
    company: 'DJL Clinical Research',
    email: 'deepaj@djlresearch.com',
    phone: '704-247-9179',
  },
  {
    role: 'Admin',
    name: 'Kate Kidd',
    company: 'BLOC',
    email: 'admin@businessleadersofcharlotte.com',
    phone: '803-554-2844',
  },
];

// Get board members by role type
export function getExecutiveBoard(): BoardMember[] {
  return boardMembers.filter((m) =>
    ['President', 'Vice President', 'Admin'].includes(m.role)
  );
}

export function getChapterDirectors(): BoardMember[] {
  return boardMembers.filter((m) => m.role.includes('Director'));
}

export function getMembershipTeam(): BoardMember[] {
  return boardMembers.filter((m) => m.role.includes('Membership'));
}

export function getCommitteeLeads(): BoardMember[] {
  return boardMembers.filter(
    (m) =>
      m.role.includes('Treasurer') ||
      m.role.includes('After Hours') ||
      m.role.includes('Sponsorship') ||
      m.role.includes('CIC') ||
      m.role.includes('BIG')
  );
}
