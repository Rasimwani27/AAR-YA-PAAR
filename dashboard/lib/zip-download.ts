/** Single canonical browser download name (must end in .zip for Windows). */
export const PROJECT_ZIP_NAME = "AAR-YA-PAAR.zip";

/** Public URL — path ends with .zip so browsers save the right extension. */
export const PROJECT_ZIP_URL = `/${PROJECT_ZIP_NAME}`;

export function zipDownloadHeaders(): Record<string, string> {
  const fn = PROJECT_ZIP_NAME;
  return {
    "Content-Type": "application/zip",
    "Content-Disposition": `attachment; filename="${fn}"; filename*=UTF-8''${encodeURIComponent(fn)}`,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
}
