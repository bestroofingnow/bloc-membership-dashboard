import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Providers } from './providers';
import './globals.css';

const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'BLOC Membership Dashboard | Business Leaders of Charlotte',
  description:
    'Membership management dashboard for Business Leaders of Charlotte (BLOC). Track members, manage guest pipeline, and drive growth.',
  keywords: ['BLOC', 'Business Leaders of Charlotte', 'networking', 'Charlotte business', 'membership'],
  authors: [{ name: 'BLOC Membership Team' }],
  openGraph: {
    title: 'BLOC Membership Dashboard',
    description: 'Building friendships, growing business, and strengthening our community.',
    type: 'website',
  },
  // Members-only portal — keep it out of search engines (the public marketing
  // site lives at businessleadersofcharlotte.com, not here).
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
