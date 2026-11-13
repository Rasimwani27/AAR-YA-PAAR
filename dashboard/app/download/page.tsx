import type { Metadata } from "next";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { LAB_BUILD } from "@/lib/lab-version";
import { PROJECT_ZIP_NAME } from "@/lib/zip-download";

export const metadata: Metadata = {
  title: "Download AAR-YA-PAAR",
  description: "Full project zip for local forward test lab (Windows START-HERE-43123.bat)",
};

const PATCH_NAME = "AAR-UPDATE-MANUAL-TRADE.zip";

function zipSize(name: string): string | null {
  const p = path.join(process.cwd(), "public", name);
  if (!existsSync(p)) return null;
  const mb = statSync(p).size / (1024 * 1024);
  return `${mb.toFixed(2)} MB`;
}

function mirrorLink(): { url: string; note?: string } | null {
  try {
    const p = path.join(process.cwd(), "public", "download-link.json");
    if (!existsSync(p)) return null;
    const raw = JSON.parse(readFileSync(p, "utf-8")) as {
      directDownloadUrl?: string;
      mirrorPageUrl?: string;
      note?: string;
    };
    const url = raw.directDownloadUrl ?? raw.mirrorPageUrl;
    if (url) return { url, note: raw.note };
  } catch {
    return null;
  }
  return null;
}

export default function DownloadPage() {
  const fullMb = zipSize(PROJECT_ZIP_NAME);
  const patchMb = zipSize(PATCH_NAME);
  const mirror = mirrorLink();
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 px-6 py-16 text-zinc-100">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-500/90">AAR-YA-PAAR</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Download project</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Build <strong className="text-violet-200">{LAB_BUILD}</strong>. After unzip on Windows, run{" "}
          <strong className="text-zinc-200">START-HERE-43123.bat</strong>, then{" "}
          <strong className="text-zinc-200">http://127.0.0.1:43123</strong>.
        </p>
      </div>

      {mirror ? (
        <a
          href={mirror.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block rounded-xl bg-emerald-500 px-5 py-4 text-center text-base font-semibold text-zinc-950 shadow-lg shadow-emerald-500/20 hover:bg-emerald-400"
        >
          Download {PROJECT_ZIP_NAME} (~500 KB — real zip file)
        </a>
      ) : null}

      <a
        href="/api/download-zip?confirm=1"
        className="block rounded-xl bg-amber-500 px-5 py-4 text-center text-base font-semibold text-zinc-950 shadow-lg shadow-amber-500/20 hover:bg-amber-400"
      >
        Local server download {PROJECT_ZIP_NAME}
        {fullMb ? ` (${fullMb})` : ""}
      </a>

      <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-3 text-center text-xs text-emerald-100">
        <strong>New folder on Windows:</strong> double-click{" "}
        <code className="text-emerald-50">DOWNLOAD-NEW-FOLDER.bat</code> in the project — saves to{" "}
        <code className="text-emerald-50">Documents\AAR-YA-PAAR-YYYY-MM-DD</code> and opens Explorer.
      </p>

      {patchMb ? (
        <a
          href={`/${PATCH_NAME}`}
          className="block rounded-xl border border-violet-500/50 bg-violet-500/10 px-5 py-4 text-center text-base font-semibold text-violet-100 hover:bg-violet-500/20"
        >
          Small update only — {PATCH_NAME} ({patchMb})
        </a>
      ) : null}

      <section className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 text-sm text-zinc-400">
        <p className="font-medium text-zinc-200">If the button does nothing (Windows)</p>
        <ol className="mt-2 list-decimal space-y-2 pl-5 text-xs">
          <li>
            Start your <strong className="text-zinc-300">old</strong> folder with START-HERE-43123.bat (keep it open).
          </li>
          <li>
            Open <strong className="text-zinc-300">PowerShell</strong> and run:
            <pre className="mt-1 overflow-x-auto rounded bg-zinc-900 p-2 text-[10px] text-emerald-200/90">
              {`Invoke-WebRequest -Uri "http://127.0.0.1:43123/api/download-zip?confirm=1" -OutFile "$env:USERPROFILE\\Downloads\\AAR-YA-PAAR.zip" -UseBasicParsing`}
            </pre>
          </li>
          <li>
            Or run <code className="text-zinc-300">scripts\\GET-LATEST-AAR.ps1</code> from your project folder.
          </li>
          <li>
            Patch only: extract <code className="text-zinc-300">{PATCH_NAME}</code> on top of your existing folder, then{" "}
            <code className="text-zinc-300">UPDATE-FROM-PATCH.bat</code>.
          </li>
        </ol>
      </section>

      <p className="text-center text-xs text-zinc-600">
        If Downloads shows Type &quot;File&quot; with no .zip, rename to <strong className="text-zinc-400">AAR-YA-PAAR.zip</strong>{" "}
        then Extract All. See <code className="text-zinc-500">FIX-DOWNLOAD-AAR.txt</code> in the zip.
      </p>

      <a href="/" className="text-center text-sm text-zinc-500 underline hover:text-zinc-300">
        Back to dashboard
      </a>
    </main>
  );
}
