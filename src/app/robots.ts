import type { MetadataRoute } from 'next';

/**
 * /robots.txt — keep search engines off the signed-token URLs and
 * authenticated dashboard. Allow only the public guest landing and join page.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/guest', '/join'],
        disallow: [
          '/guest/i/',     // signed-token URLs — should never be indexed
          '/guest/me',     // magic-link return page
          '/guest/error/', // error pages
          '/api/',         // all server routes
        ],
      },
    ],
    sitemap: 'https://dashboard.businessleadersofcharlotte.com/sitemap.xml',
  };
}
