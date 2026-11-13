import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dashboardDir = path.dirname(fileURLToPath(import.meta.url));
const inferredRepoRoot = path.resolve(dashboardDir, "..");

// Always anchor Python/backtest paths to the folder above dashboard/ (works even if npm cwd differs).
if (!process.env.AAR_REPO_ROOT?.trim()) {
  process.env.AAR_REPO_ROOT = inferredRepoRoot;
} else {
  process.env.AAR_REPO_ROOT = path.resolve(process.env.AAR_REPO_ROOT.trim());
}

const nextConfig: NextConfig = {
  env: {
    AAR_REPO_ROOT: process.env.AAR_REPO_ROOT,
  },
  async headers() {
    return [
      {
        source: "/:file(.*\\.zip)",
        headers: [
          { key: "Content-Type", value: "application/zip" },
          {
            key: "Content-Disposition",
            value:
              'attachment; filename="AAR-YA-PAAR.zip"; filename*=UTF-8\'\'AAR-YA-PAAR.zip',
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
  // Keep resolution inside dashboard/ (avoid picking /workspace/package-lock.json).
  turbopack: {
    root: dashboardDir,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
