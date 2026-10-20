import { createReadStream, existsSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";

import { NextResponse } from "next/server";

export const runtime = "nodejs";

const FILENAME = "AAR-YA-PAAR-download.zip";

function resolveZipPath(): string | null {
  const candidates = [
    path.join(process.cwd(), "public", FILENAME),
    path.join(process.cwd(), "dashboard", "public", FILENAME),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

export async function GET() {
  const file = resolveZipPath();
  if (!file) {
    return NextResponse.json({ error: "Zip not found on server." }, { status: 404 });
  }

  const nodeStream = createReadStream(file);
  const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;

  return new NextResponse(webStream, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${FILENAME}"`,
      "Cache-Control": "no-store",
    },
  });
}
