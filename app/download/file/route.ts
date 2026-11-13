import { NextResponse } from "next/server";

/** Legacy — redirect to path that ends in .zip (Windows saves correct extension). */
export async function GET(request: Request) {
  return NextResponse.redirect(new URL("/AAR-YA-PAAR.zip", request.url), 307);
}
