import type { NextConfig } from 'next';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

const NEXT_BASE_PATH = '/market-terminal';

const nextConfig: NextConfig = {
  output: 'standalone',
  basePath: NEXT_BASE_PATH,
  env: {
    NEXT_PUBLIC_BASE_PATH: NEXT_BASE_PATH,
  },
  turbopack: {
    // Prevent Next from inferring the workspace root from unrelated lockfiles.
    root,
  },
};

export default nextConfig;
