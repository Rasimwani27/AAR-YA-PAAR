"use client";

import { useCallback, useState } from "react";

import { isLocalDashboard } from "@/lib/api-fetch";
import { saveProjectZipFromBrowser } from "@/lib/download-project-zip";
import { PROJECT_ZIP_NAME, PROJECT_ZIP_URL } from "@/lib/zip-download";

/** Shown on Vercel / no-Python hosts. No automatic downloads — user clicks once. */
export function HostedNotice() {
  const [zipMsg, setZipMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const onLocalPc = isLocalDashboard();

  const downloadZipOnce = useCallback(async () => {
    setBusy(true);
    setZipMsg("");
    try {
      await saveProjectZipFromBrowser();
      setZipMsg(`Saved ${PROJECT_ZIP_NAME} — check Downloads, then Extract All.`);
    } catch (e) {
      setZipMsg(e instanceof Error ? e.message : "Download failed");
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <div className="rounded-xl border border-sky-500/40 bg-sky-500/10 px-4 py-4 text-sm text-sky-50">
      <p className="text-base font-semibold text-sky-100">
        {onLocalPc ? "Local server in read-only mode" : "Public site — trading lab runs on your PC only"}
      </p>
      <p className="mt-2 text-sky-100/90">
        {onLocalPc ? (
          <>
            This URL is localhost but Python forward test is off (often{" "}
            <code className="text-sky-200">AAR_DISABLE_EXEC=1</code> in{" "}
            <code className="text-sky-200">dashboard/.env.local</code>). Delete that line, restart{" "}
            <code className="text-sky-200">START-HERE-43123.bat</code>, then refresh.
          </>
        ) : (
          <>
            Vercel cannot run Python or your exchange API. Unzip on Windows, double-click{" "}
            <code className="text-sky-200">START-HERE-43123.bat</code>, then open{" "}
            <strong className="text-white">http://127.0.0.1:43123</strong> (not this Vercel URL).
          </>
        )}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <a
          href={PROJECT_ZIP_URL}
          className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"
        >
          Download {PROJECT_ZIP_NAME}
        </a>
        <a
          href="/download"
          className="rounded-lg border border-sky-400/50 px-4 py-2 text-sm text-sky-100 hover:bg-sky-500/20"
        >
          Download help page
        </a>
        <button
          type="button"
          disabled={busy}
          onClick={() => void downloadZipOnce()}
          className="rounded-lg border border-sky-400/50 px-4 py-2 text-sm text-sky-100 hover:bg-sky-500/20 disabled:opacity-50"
        >
          {busy ? "Starting…" : "Download zip now"}
        </button>
        <a
          className="rounded-lg border border-sky-400/50 px-4 py-2 text-sm text-sky-100 hover:bg-sky-500/20"
          href="/Rassim_Muzaffar_Trading_Portfolio.pdf"
          target="_blank"
          rel="noopener noreferrer"
        >
          View portfolio PDF
        </a>
      </div>
      {zipMsg ? <p className="mt-2 text-xs text-sky-200/90">{zipMsg}</p> : null}
      <p className="mt-3 text-xs text-sky-300/70">
        Online: use <strong className="text-sky-100">Test Bybit demo API</strong> (or Binance testnet) for live
        exchange snapshots (keys go to the server once per request, never stored). Forward test (Start / ticks) still
        needs local <strong className="text-sky-100">43123</strong> for Python.
      </p>
    </div>
  );
}
