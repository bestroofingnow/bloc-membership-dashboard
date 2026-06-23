export const metadata = {
  title: 'Privacy Policy — BLOC',
  description: 'Privacy policy for Business Leaders of Charlotte (BLOC) web dashboard and mobile app.',
};

export default function PrivacyPolicyPage() {
  return (
    <main
      style={{
        maxWidth: 760,
        margin: '0 auto',
        padding: '40px 20px 80px',
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
        color: '#1e293b',
        lineHeight: 1.6,
      }}
    >
      <h1 style={{ color: '#1e3a5f' }}>Privacy Policy</h1>
      <p>
        <strong>Business Leaders of Charlotte (BLOC)</strong> — web dashboard and mobile app
        (&ldquo;BLOC Members&rdquo;).
      </p>
      <p>
        <em>Last updated: June 22, 2026.</em>
      </p>

      <p>
        The BLOC dashboard and the BLOC Members app are private, login-only tools for members of
        Business Leaders of Charlotte. Accounts are issued by BLOC administrators; the service is not
        open to public sign-up.
      </p>

      <h2 style={{ color: '#1e3a5f' }}>Information we handle</h2>
      <ul>
        <li>
          <strong>Account &amp; profile:</strong> your name, email, chapter, role, and the
          business-contact information in your member record (company, title, business phone, business
          email, website). Stored in BLOC&rsquo;s Supabase database.
        </li>
        <li>
          <strong>Optional personal fields:</strong> mobile phone, home address, and birthday are
          hidden from other members by default and shown only if you opt in.
        </li>
        <li>
          <strong>Business-card scans:</strong> when you use the Card Scanner, the photo you capture is
          sent to our server to extract contact details and create or update a lead.
        </li>
        <li>
          <strong>Authentication tokens:</strong> stored securely on your device to keep you signed in.
        </li>
      </ul>

      <h2 style={{ color: '#1e3a5f' }}>How we use it</h2>
      <p>
        To operate the member directory, leadership contacts, recruitment tools, the Ask BLOC
        assistant (which answers only from members&rsquo; business information), and the card scanner.
        We do <strong>not</strong> sell your data or use it for third-party advertising, and the app
        contains no advertising or tracking SDKs.
      </p>

      <h2 style={{ color: '#1e3a5f' }}>Sharing</h2>
      <p>
        Your information is visible to other authenticated BLOC members per your visibility settings,
        and to BLOC administrators and directors. Data is stored with Supabase and processed by the
        BLOC backend. We do not share it with unrelated third parties.
      </p>

      <h2 style={{ color: '#1e3a5f' }}>Camera &amp; photos</h2>
      <p>
        The app requests camera and photo-library access only for the Card Scanner, and only when you
        choose to scan a card.
      </p>

      <h2 style={{ color: '#1e3a5f' }}>Data retention &amp; deletion</h2>
      <p>
        Member records persist while you are a BLOC member. Because accounts are admin-provisioned, to
        correct your information or delete your account and data, contact{' '}
        <a href="mailto:admin@businessleadersofcharlotte.com">admin@businessleadersofcharlotte.com</a>.
      </p>

      <h2 style={{ color: '#1e3a5f' }}>Children</h2>
      <p>The service is intended for BLOC members (adults) and is not directed to children.</p>

      <h2 style={{ color: '#1e3a5f' }}>Contact</h2>
      <p>
        Questions:{' '}
        <a href="mailto:admin@businessleadersofcharlotte.com">admin@businessleadersofcharlotte.com</a>
      </p>
    </main>
  );
}
