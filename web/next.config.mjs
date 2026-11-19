import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
// Linting runs separately (`npm run lint` at the repo root), not inside `next build`.
const nextConfig = {
  // E2E builds into its own folder so running the tests never breaks a running dev server.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  reactStrictMode: true,
  // In the monorepo the tracing root is the repo root; on Vercel only this folder is uploaded, so keep the default there.
  ...(process.env.VERCEL ? {} : { outputFileTracingRoot: path.join(path.dirname(fileURLToPath(import.meta.url)), '..') }), eslint: { ignoreDuringBuilds: true } };
export default nextConfig;
