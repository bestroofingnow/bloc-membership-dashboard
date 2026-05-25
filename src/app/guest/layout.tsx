// All public guest routes read cookies and hit Supabase at request time —
// they cannot be statically prerendered at build time. This layout applies
// the force-dynamic flag to the whole subtree.
export const dynamic = 'force-dynamic';

export default function GuestLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
