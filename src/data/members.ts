import { Member, ChapterName } from '@/types';

// Generate unique IDs
const generateId = () => Math.random().toString(36).substring(2, 11);

export const members: Member[] = [
  {
    id: generateId(),
    name: 'Raph Thomas',
    company: 'Applied AI Advisory',
    chapter: 'Uptown',
    industry: 'AI Strategy Consulting',
  },
  {
    id: generateId(),
    name: 'Reece Arlin',
    company: 'Business Marketing Solutions',
    chapter: 'Uptown',
    industry: 'Digital Marketing',
  },
  {
    id: generateId(),
    name: 'Brad Watkins',
    company: 'Local & Qualified',
    chapter: 'North',
    industry: 'Web Development',
  },
  {
    id: generateId(),
    name: 'Joseph Rice',
    company: 'Armoured Books',
    chapter: 'South',
    industry: 'Accounting',
  },
  {
    id: generateId(),
    name: 'Sabrina Gregory',
    company: 'The Professional Cleaning Co',
    chapter: 'FLOC',
    industry: 'Commercial Cleaning',
  },
  {
    id: generateId(),
    name: 'Julia Sawicki',
    company: 'Nexera Inc',
    chapter: 'FLOC',
    industry: 'Healthcare Consulting',
  },
  {
    id: generateId(),
    name: 'Steve Tubel',
    company: 'Blanton Commercial',
    chapter: 'North',
    industry: 'Commercial Real Estate',
  },
  {
    id: generateId(),
    name: 'Anna Smith',
    company: 'Hibiscus',
    chapter: 'Alumni',
    industry: 'Brand Strategy',
  },
  {
    id: generateId(),
    name: 'Tammie Bullard',
    company: 'Business Benefits & Financial',
    chapter: 'North',
    industry: 'Health Insurance',
  },
  {
    id: generateId(),
    name: 'Tony Vanderpool',
    company: 'Garage Living',
    chapter: 'North',
    industry: 'Garage Renovation',
  },
  {
    id: generateId(),
    name: 'Brian Schu',
    company: 'Trolley Pub',
    chapter: 'Uptown',
    industry: 'Tourism & Entertainment',
  },
  {
    id: generateId(),
    name: 'John Van Matre',
    company: 'Rebel Spirits',
    chapter: 'Uptown',
    industry: 'Mobile Bar Services',
  },
  {
    id: generateId(),
    name: 'Jose Cruz',
    company: 'First Bank',
    chapter: 'South',
    industry: 'Retail Banking',
  },
  {
    id: generateId(),
    name: 'Lara Murphy',
    company: 'EXP Realty',
    chapter: 'South',
    industry: 'Residential Real Estate',
  },
  {
    id: generateId(),
    name: 'Jessica Peters',
    company: 'Spot Freight',
    chapter: 'FLOC',
    industry: 'Logistics & Freight',
  },
  {
    id: generateId(),
    name: 'Marcus Williams',
    company: 'Williams Law Group',
    chapter: 'Uptown',
    industry: 'Business Law',
  },
  {
    id: generateId(),
    name: 'Sarah Chen',
    company: 'Pinnacle HR Solutions',
    chapter: 'North',
    industry: 'HR Consulting',
  },
  {
    id: generateId(),
    name: 'David Kim',
    company: 'Carolina IT Services',
    chapter: 'South',
    industry: 'Managed IT Services',
  },
  {
    id: generateId(),
    name: 'Michelle Roberts',
    company: 'Roberts Financial Planning',
    chapter: 'FLOC',
    industry: 'Financial Planning',
  },
  {
    id: generateId(),
    name: 'Kevin Thompson',
    company: 'Thompson Electric',
    chapter: 'North',
    industry: 'Electrical Contractor',
  },
];

// Helper functions
export function getMembersByChapter(chapter: ChapterName): Member[] {
  return members.filter((m) => m.chapter === chapter);
}

export function getChapterCounts(): Record<ChapterName, number> {
  return {
    North: getMembersByChapter('North').length,
    South: getMembersByChapter('South').length,
    Uptown: getMembersByChapter('Uptown').length,
    FLOC: getMembersByChapter('FLOC').length,
    Alumni: getMembersByChapter('Alumni').length,
  };
}

export function searchMembers(query: string): Member[] {
  const lowerQuery = query.toLowerCase();
  return members.filter(
    (m) =>
      m.name.toLowerCase().includes(lowerQuery) ||
      m.company.toLowerCase().includes(lowerQuery) ||
      m.chapter.toLowerCase().includes(lowerQuery) ||
      m.industry.toLowerCase().includes(lowerQuery)
  );
}
