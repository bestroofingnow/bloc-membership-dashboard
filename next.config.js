/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },
  // Set basePath for GitHub Pages subdirectory deployment
  basePath: '/bloc-membership-dashboard',
  assetPrefix: '/bloc-membership-dashboard/',
}

module.exports = nextConfig
