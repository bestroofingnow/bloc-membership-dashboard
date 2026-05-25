import type { MetadataRoute } from 'next';

/**
 * /sitemap.xml — only public pages. Dashboard is auth-gated and shouldn't
 * appear in search results.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://dashboard.businessleadersofcharlotte.com';
  const now = new Date();
  return [
    { url: `${base}/`, lastModified: now, changeFrequency: 'monthly', priority: 1 },
    { url: `${base}/guest`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${base}/join`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
  ];
}
