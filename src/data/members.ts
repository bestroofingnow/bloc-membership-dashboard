import { Member, ChapterName } from '@/types';

export const members: Member[] = [
  // Uptown Chapter
  { id: '37897897', name: 'Stephen Borchert', company: 'The Brand Affect', chapter: 'Uptown', industry: 'Brand Consulting' },
  { id: '38440448', name: 'Marc Manitt', company: 'M2 Planning and Design', chapter: 'Uptown', industry: 'Landscape Design' },
  { id: '38440481', name: 'Ben Helbein', company: 'Allstate Insurance', chapter: 'Uptown', industry: 'Insurance' },
  { id: '38440413', name: 'Charlie Williams', company: 'Premier Sotheby\'s International Realty', chapter: 'Uptown', industry: 'Real Estate' },
  { id: '38440469', name: 'Angelo Datseris', company: 'Leverage Lending Group, LLC', chapter: 'Uptown', industry: 'Mortgage' },
  { id: '38440512', name: 'Scott Donaghy', company: 'Best Integration Technologies, Inc.', chapter: 'Uptown', industry: 'IT Services' },
  { id: '38440467', name: 'Ryan Donaghy', company: 'Pelora Advisors', chapter: 'Uptown', industry: 'Financial Planning' },
  { id: '38440415', name: 'Marcel Papineau', company: 'Intelligent Design Engineering', chapter: 'Uptown', industry: 'Structural Engineering' },
  { id: '38440423', name: 'Kyle Donaghy', company: 'John Street Graphics', chapter: 'Uptown', industry: 'Promotional Products' },
  { id: '40605959', name: 'Ali Martin', company: 'Invantech Consulting, Inc.', chapter: 'Uptown', industry: 'Accounting/ERP Systems' },
  { id: '38440500', name: 'Troy Sacco', company: 'One Source Payroll', chapter: 'Uptown', industry: 'Payroll' },
  { id: '38440504', name: 'Justin Lowenberger', company: 'Ted A Greve & Associates PA', chapter: 'Uptown', industry: 'Personal Injury Law' },
  { id: '50473570', name: 'Faith Penney', company: 'Collected Spaces', chapter: 'Uptown', industry: 'Interior Design' },
  { id: '46190828', name: 'Jennifer Sullivan', company: 'Sullivan CPA, PA', chapter: 'Uptown', industry: 'Public Accounting' },
  { id: '45122015', name: 'Mark Haddad', company: 'Solitrade Group', chapter: 'Uptown', industry: 'International Sales' },
  { id: '60074611', name: 'Kayla Arnold', company: 'USHealth Advisors', chapter: 'Uptown', industry: 'Health Insurance' },
  { id: '69470147', name: 'Nick Heffron', company: 'U.S. Bank', chapter: 'Uptown', industry: 'Banking' },
  { id: '70266350', name: 'Sean McLeod', company: 'TLG Law', chapter: 'Uptown', industry: 'Commercial Litigation' },
  { id: '70082345', name: 'Brandon Muhaw', company: 'Accents Painting and Drywall', chapter: 'Uptown', industry: 'Commercial Painting' },
  { id: '75052285', name: 'Dave Kafer', company: 'Tuff Shed Inc', chapter: 'Uptown', industry: 'Storage Buildings' },
  { id: '77267921', name: 'Saket Nigam', company: 'Mosquito Shield', chapter: 'Uptown', industry: 'Pest Control' },
  { id: '79355114', name: 'Brad Hackett', company: 'Segra', chapter: 'Uptown', industry: 'Technology/Fiber' },
  { id: '83434716', name: 'Andrew Pimentel', company: 'Corporate Cleaning Group', chapter: 'Uptown', industry: 'Commercial Cleaning' },
  { id: '94321221', name: 'John Van Matre', company: 'Rebel Spirits LLC', chapter: 'Uptown', industry: 'Mobile Bar/Events' },
  { id: '92651045', name: 'Gabrial Erickson', company: 'One Day Doors & Closets Charlotte', chapter: 'Uptown', industry: 'Doors & Closets' },
  { id: '95413918', name: 'Brian Schu', company: 'Trolley Pub', chapter: 'Uptown', industry: 'Experiential Tourism' },
  { id: '94815554', name: 'Lauren Borchert', company: 'Sullivan CPA, PA', chapter: 'Uptown', industry: 'CPA/Taxes' },

  // North Chapter
  { id: '38440424', name: 'Liana Matheney', company: 'Berkshire Hathaway', chapter: 'North', industry: 'Real Estate' },
  { id: '41356891', name: 'Brett Metcalf', company: 'PROforma Think Ink', chapter: 'North', industry: 'Promotional Products' },
  { id: '40892019', name: 'Bob Burnette', company: 'DirectPay Payroll', chapter: 'North', industry: 'Payroll' },
  { id: '64567301', name: 'Steve Tubel', company: 'Blanton Commercial', chapter: 'North', industry: 'Commercial Real Estate' },
  { id: '70138348', name: 'Rusty Stevens', company: 'Advanced Tech Systems & Automation', chapter: 'North', industry: 'Security/IT/Electrical' },
  { id: '69456301', name: 'Clayton Young', company: 'Heartland Payroll', chapter: 'North', industry: 'Payroll' },
  { id: '75140739', name: 'Brad Watkins', company: 'Local & Qualified', chapter: 'North', industry: 'Digital Marketing' },
  { id: '67104526', name: 'Fred Turner', company: 'Best Roofing Now', chapter: 'North', industry: 'Solar' },
  { id: '78483447', name: 'Robert Kraft', company: 'Restoration 1 Of Gastonia & RockHill', chapter: 'North', industry: 'Restoration' },
  { id: '78786191', name: 'Max Ferguson', company: 'SoFi Home Mortgage', chapter: 'North', industry: 'Mortgage' },
  { id: '79346265', name: 'Tammie Bullard', company: 'Business Benefits & Financial Services', chapter: 'North', industry: 'Health Insurance' },
  { id: '66835593', name: 'Nikki Kemp', company: 'Ross', chapter: 'North', industry: 'Supply Chain IT' },
  { id: '88597980', name: 'Lia Moore', company: 'Pruitt Keener Insurance Services, INC.', chapter: 'North', industry: 'Property & Casualty Insurance' },
  { id: '90712113', name: 'Tony Vanderpool', company: 'Garage Living of Charlotte', chapter: 'North', industry: 'Garage Makeover' },

  // South Chapter
  { id: '38440434', name: 'Mark Leitgeb', company: 'Life Wave', chapter: 'South', industry: 'Wellness/Health' },
  { id: '38440474', name: 'Julie Stevens', company: 'The Biz Spa', chapter: 'South', industry: 'Online Marketing' },
  { id: '38440421', name: 'Jon Massachi', company: 'Truist Mortgage', chapter: 'South', industry: 'Mortgage' },
  { id: '55229670', name: 'Lesha Dodson', company: 'Brightway Insurance', chapter: 'South', industry: 'P&I Insurance' },
  { id: '62895942', name: 'Madison Stenger', company: 'Corrective Chiropractic', chapter: 'South', industry: 'Chiropractic' },
  { id: '44423457', name: 'Robert Jacik', company: 'Carolina Beer Temple & Ames St. Marketplace', chapter: 'South', industry: 'Brewery/Bar' },
  { id: '66833596', name: 'James Turner', company: 'Best Roofing Now LLC', chapter: 'South', industry: 'Roofing' },
  { id: '62962397', name: 'Kristina Cruise', company: 'Living Libraries', chapter: 'South', industry: 'Education' },
  { id: '72157854', name: 'Howard Hoyle Jr.', company: 'HHJ Construction, Inc.', chapter: 'South', industry: 'Construction' },
  { id: '75090852', name: 'Christopher Jones', company: '2Bware, LLC', chapter: 'South', industry: 'Information Security' },
  { id: '78770504', name: 'Stephanie Brown', company: 'Better Homes and Gardens Real Estate Paracle', chapter: 'South', industry: 'Real Estate' },
  { id: '91875980', name: 'Joseph Rice', company: 'Armoured Books', chapter: 'South', industry: 'Accounting & Tax' },
  { id: '94201010', name: 'Jose Cruz', company: 'First Bank', chapter: 'South', industry: 'Retail Banking' },

  // FLOC Chapter
  { id: '66741886', name: 'Kenneth Bingham', company: 'NC Farm Bureau Insurance', chapter: 'FLOC', industry: 'Insurance' },
  { id: '67104347', name: 'Frankie Gonzalez', company: 'Gonzalez Realty', chapter: 'FLOC', industry: 'Real Estate' },
  { id: '67114985', name: 'Madison Morell', company: 'Robert Half', chapter: 'FLOC', industry: 'Staffing' },
  { id: '67147742', name: 'Jordan Peterson', company: 'Foundry Commercial', chapter: 'FLOC', industry: 'Commercial Real Estate' },
  { id: '67193733', name: 'Devin Donaghy', company: 'Spot Inc.', chapter: 'FLOC', industry: 'Freight' },
  { id: '67223341', name: 'Matt Cruz', company: 'Barringer Construction', chapter: 'FLOC', industry: 'Construction' },
  { id: '67240973', name: 'Sumner Hinton', company: 'Ferretti Search', chapter: 'FLOC', industry: 'Staffing/Recruiting' },
  { id: '67200025', name: 'Chad Nugen', company: 'Bank of America', chapter: 'FLOC', industry: 'Banking' },
  { id: '68359840', name: 'Tim Woollum', company: 'Marsh McLennan Agency', chapter: 'FLOC', industry: 'Commercial Insurance' },
  { id: '69345662', name: 'Calvin Saunders', company: 'Brittian Chiropractic Charlotte, PLLC', chapter: 'FLOC', industry: 'Chiropractic' },
  { id: '69550610', name: 'Carson Fielding', company: 'Urology Specialist of the Carolinas', chapter: 'FLOC', industry: 'Medical' },
  { id: '70598810', name: 'Douglas Howard', company: 'Experient', chapter: 'FLOC', industry: 'Management Consulting' },
  { id: '74928338', name: 'Ryan Kidd', company: 'Best Integration Technologies', chapter: 'FLOC', industry: 'Information Technology' },
  { id: '76411914', name: 'Daniel Glendon', company: 'The Siegfried Group, LLP', chapter: 'FLOC', industry: 'Accounting/Finance' },
  { id: '76480325', name: 'Heidi Harlan', company: 'Sullivan CPA, PA', chapter: 'FLOC', industry: 'Accounting' },
  { id: '75758528', name: 'Jacob Shope', company: 'Mpire Financial', chapter: 'FLOC', industry: 'Mortgage' },
  { id: '76795953', name: 'John Ragus', company: 'Avobus Equipment, LLC', chapter: 'FLOC', industry: 'Medical Equipment' },
  { id: '70892705', name: 'Sophie Lorenzo', company: 'Pelora Advisors', chapter: 'FLOC', industry: 'Financial Planning' },
  { id: '77940887', name: 'Payden Honeycutt', company: 'DiFabion Remodeling', chapter: 'FLOC', industry: 'Residential Remodeling' },
  { id: '78158451', name: 'Jessica Peters', company: 'Spot Freight', chapter: 'FLOC', industry: 'Logistics/Freight' },
  { id: '92466281', name: 'Julia Sawicki', company: 'Nexera Inc', chapter: 'FLOC', industry: 'Healthcare Supply Chain' },

  // Alumni Chapter
  { id: '38440514', name: 'Joe Keener', company: 'Pruitt Keener Insurance', chapter: 'Alumni', industry: 'Insurance' },
  { id: '37897913', name: 'Kate Kidd', company: 'BLOC', chapter: 'Alumni', industry: 'Administration' },
  { id: '38440496', name: 'Craig Dunn', company: 'Carolina Office Solutions', chapter: 'Alumni', industry: 'Office Furniture' },
  { id: '38440456', name: 'Mike Waite', company: 'DiFabion Remodeling', chapter: 'Alumni', industry: 'Remodeling' },
  { id: '38440464', name: 'Jeremiah Hunt', company: 'First Bank', chapter: 'Alumni', industry: 'Banking' },
  { id: '38440409', name: 'Tommy Haughton', company: 'Segra', chapter: 'Alumni', industry: 'Telecom' },
  { id: '38440488', name: 'Eric Muhlitner', company: 'Eric David Travel, LLC', chapter: 'Alumni', industry: 'Travel' },
  { id: '38440436', name: 'Deepa Jagannathan', company: 'DJL Clinical Research', chapter: 'Alumni', industry: 'Clinical Research' },
  { id: '49517129', name: 'Summer Sprouse', company: 'Primerica Financial Services', chapter: 'Alumni', industry: 'Financial Services' },
  { id: '41754143', name: 'Abby Mathiason', company: 'First Citizens Bank', chapter: 'Alumni', industry: 'Banking' },
  { id: '40945912', name: 'Jonathan Malone', company: 'Castle Wealth Group', chapter: 'Alumni', industry: 'Financial Services' },
  { id: '42778801', name: 'Mimi McLeod', company: 'M. McLeod Photography', chapter: 'Alumni', industry: 'Photography' },
  { id: '49485165', name: 'Scott Fairman', company: 'Scott Turf and Landscape', chapter: 'Alumni', industry: 'Landscape' },
  { id: '65189581', name: 'Ben Stradtmann', company: 'Schooley Mitchell', chapter: 'Alumni', industry: 'Cost Reduction Consulting' },
  { id: '49860119', name: 'Jonathan Tedesco', company: 'Morgan Stanley', chapter: 'Alumni', industry: 'Financial Services' },
  { id: '95832010', name: 'Anna Smith', company: 'Hibiscus', chapter: 'Alumni', industry: 'Branding/Design' },
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
