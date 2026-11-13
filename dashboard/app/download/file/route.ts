import { NextResponse } from "next/server";

import { PROJECT_ZIP_URL } from "@/lib/zip-download";

/** Old bookmark — URL had no .zip so Windows saved a generic "file". Redirect to .zip path. */
export async function GET(request: Request) {
  return NextResponse.redirect(new URL(PROJECT_ZIP_URL, request.url), 307);
}
