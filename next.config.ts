import type { NextConfig } from 'next';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  output: 'standalone',
  turbopack: {
    // Prevent Next from inferring the workspace root from unrelated lockfiles.
    root,
  },
};

export default nextConfig;
