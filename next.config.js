/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },
  // Set basePath if deploying to a repo subdirectory (e.g., /bloc-membership-dashboard)
  // Uncomment and update if your repo name is different:
  // basePath: '/bloc-membership-dashboard',
  // assetPrefix: '/bloc-membership-dashboard/',
}

module.exports = nextConfig
