import Link from 'next/link';

interface Props { params: Promise<{ code: string }> }

const messages: Record<string, { title: string; body: string }> = {
  'bad-link': {
    title: 'This link looks broken.',
    body: 'The link you followed isn\'t valid. Try the public site or ask whoever invited you to send a new one.',
  },
  'expired-link': {
    title: 'This link has expired.',
    body: 'You can request a new one below.',
  },
};

export default async function GuestErrorPage({ params }: Props) {
  const { code } = await params;
  const m = messages[code] ?? messages['bad-link'];
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold">{m.title}</h1>
      <p className="mt-3 text-gray-700">{m.body}</p>
      <Link href="/guest" className="mt-6 inline-block underline">Go to the public guest page</Link>
    </main>
  );
}
