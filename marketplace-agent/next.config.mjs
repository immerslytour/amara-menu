/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['better-sqlite3', 'playwright'],
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
