"use client";

import { PROJECT_ZIP_NAME, PROJECT_ZIP_URL } from "@/lib/zip-download";

/** Client-side save with explicit .zip name (works when headers are ignored). */
export async function saveProjectZipFromBrowser(): Promise<void> {
  const res = await fetch(`${PROJECT_ZIP_URL}?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) {
    const alt = await fetch(`/api/download-zip?confirm=1&t=${Date.now()}`, { cache: "no-store" });
    if (!alt.ok) throw new Error(`Download failed (${res.status})`);
    return saveBlob(await alt.blob());
  }
  return saveBlob(await res.blob());
}

function saveBlob(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = PROJECT_ZIP_NAME;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
