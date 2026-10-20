import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Download AAR-YA-PAAR",
  description: "Full project zip for local forward test lab (Windows START-HERE-43123.bat)",
};

export default function DownloadPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 px-6 py-16 text-zinc-100">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-500/90">AAR-YA-PAAR</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Download project</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Full repo (~1 MB). After unzip on Windows, run <strong className="text-zinc-200">START-HERE-43123.bat</strong>,
          then open <strong className="text-zinc-200">http://127.0.0.1:43123</strong>.
        </p>
      </div>

      <a
        href="/download/file"
        className="block rounded-xl bg-amber-500 px-5 py-4 text-center text-base font-semibold text-zinc-950 shadow-lg shadow-amber-500/20 hover:bg-amber-400"
      >
        Download AAR-YA-PAAR-download.zip
      </a>

      <p className="text-center text-xs text-zinc-600">
        Direct link (same file):{" "}
        <code className="rounded bg-zinc-900 px-1.5 py-0.5 text-zinc-400">/download/file</code>
      </p>

      <a
        href="/AAR-YA-PAAR-download.zip"
        className="block text-center text-sm text-zinc-500 underline hover:text-zinc-300"
      >
        Alternate link (static file)
      </a>

      <a href="/" className="text-center text-sm text-zinc-500 underline hover:text-zinc-300">
        Back to dashboard
      </a>
    </main>
  );
}
