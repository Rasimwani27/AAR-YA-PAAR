import { createHash } from "node:crypto";
import { readFileSync, statSync, existsSync } from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";

import { LAB_BUILD } from "@/lib/lab-version";
import { PROJECT_ZIP_NAME } from "@/lib/zip-download";

export const runtime = "nodejs";

const PATCH_NAME = "AAR-UPDATE-MANUAL-TRADE.zip";

export async function GET() {
  const pub = path.join(process.cwd(), "public");
  const full = path.join(pub, PROJECT_ZIP_NAME);
  const patch = path.join(pub, PATCH_NAME);
  const body: Record<string, unknown> = {
    ok: true,
    labBuild: LAB_BUILD,
    fullZip: existsSync(full)
      ? { name: PROJECT_ZIP_NAME, bytes: statSync(full).size, url: `/${PROJECT_ZIP_NAME}` }
      : null,
    patchZip: existsSync(patch)
      ? { name: PATCH_NAME, bytes: statSync(patch).size, url: `/${PATCH_NAME}` }
      : null,
    apiDownload: "/api/download-zip?confirm=1",
    help: "/download",
  };
  if (existsSync(full)) {
    try {
      const zip = readFileSync(full);
      body.fullZipSha256Prefix = createHash("sha256").update(zip).digest("hex").slice(0, 12);
    } catch {
      /* ignore */
    }
  }
  return NextResponse.json(body);
}
