import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'BLOC Membership Dashboard | Business Leaders of Charlotte',
  description:
    'Membership management dashboard for Business Leaders of Charlotte (BLOC). Track members, manage guest pipeline, and drive growth.',
  keywords: [
    'BLOC',
    'Business Leaders of Charlotte',
    'networking',
    'Charlotte business',
    'membership',
  ],
  authors: [{ name: 'BLOC Membership Team' }],
  openGraph: {
    title: 'BLOC Membership Dashboard',
    description: 'Building friendships, growing business, and strengthening our community.',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-sans">{children}</body>
    </html>
  );
}
