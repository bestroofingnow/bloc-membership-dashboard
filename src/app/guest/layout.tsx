import type { Metadata } from 'next';

// All public guest routes read cookies and hit Supabase at request time —
// they cannot be statically prerendered at build time. This layout applies
// the force-dynamic flag to the whole subtree.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'BLOC Guest RSVP',
  description: 'Visit Business Leaders of Charlotte as a guest. RSVP to upcoming chapter meetings and After Hours mixers.',
  // Don't let search engines index signed-token URLs or the magic-link page.
  // The /guest/i/ paths set `robots: noindex` here at the layout level; the public
  // /guest landing also gets a "noindex,nofollow" by default since we have no
  // public content to surface there beyond an event list.
  robots: {
    index: false,
    follow: false,
  },
  openGraph: {
    title: 'BLOC Guest RSVP',
    description: 'Business Leaders of Charlotte — building friendships, growing business, strengthening our community.',
    type: 'website',
    siteName: 'Business Leaders of Charlotte',
  },
};

export default function GuestLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
