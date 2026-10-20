import { createReadStream, existsSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";

import { NextResponse } from "next/server";

export const runtime = "nodejs";

const FILENAME = "AAR-YA-PAAR-download.zip";

function zipPath(): string {
  return path.join(process.cwd(), "public", FILENAME);
}

/** Force browser download — requires ?confirm=1 so browsers/CDNs do not prefetch the zip. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("confirm") !== "1") {
    return NextResponse.json(
      { error: "Add ?confirm=1 to download intentionally.", filename: FILENAME },
      { status: 400 },
    );
  }
  const file = zipPath();
  if (!existsSync(file)) {
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
