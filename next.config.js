/** @type {import('next').NextConfig} */
const securityHeaders = [
  // Forbid clickjacking; the dashboard should never be embedded.
  { key: 'X-Frame-Options', value: 'DENY' },
  // MIME-sniff protection.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Don't leak referrer to third parties.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Browsers: require HTTPS in production.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  // Lock down powerful APIs we don't use.
  {
    key: 'Permissions-Policy',
    value: 'camera=(self), microphone=(), geolocation=(), interest-cohort=()',
  },
  // Block legacy cross-domain policy files and IE "open" downloads.
  { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
  { key: 'X-Download-Options', value: 'noopen' },
];

const nextConfig = {
  reactStrictMode: true,
  images: { unoptimized: true },
  async headers() {
    return [
      {
        // Apply to all routes
        source: '/(.*)',
        headers: securityHeaders,
      },
      {
        // Never let a proxy/browser cache authenticated API responses (member data).
        source: '/api/(.*)',
        headers: [{ key: 'Cache-Control', value: 'no-store' }],
      },
    ];
  },
};

module.exports = nextConfig;
