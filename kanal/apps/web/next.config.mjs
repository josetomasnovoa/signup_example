/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: { typedRoutes: true },
  transpilePackages: ['@kanal/sdk'],
  // For Fly.io deploy: produce a self-contained server in `.next/standalone`.
  output: 'standalone',
  // The standalone tracer needs to know the workspace root so it includes
  // sibling packages (e.g. @kanal/sdk) in the bundle.
  outputFileTracingRoot: new URL('../..', import.meta.url).pathname,
};

export default nextConfig;
