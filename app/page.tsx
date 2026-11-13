"use client";

import { useEffect, useState } from "react";

const LAB_PORT = 43123;

export default function Home() {
  const [msg, setMsg] = useState("Checking for the forward test lab…");

  useEffect(() => {
    const port = typeof window !== "undefined" ? window.location.port : "";
    if (port === String(LAB_PORT)) {
      setMsg("Wrong app bundle — open the dashboard folder server. See below.");
      return;
    }
    fetch(`http://127.0.0.1:${LAB_PORT}/api/ping`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (j?.ok) {
          window.location.replace(`http://127.0.0.1:${LAB_PORT}/`);
          return;
        }
        setMsg("Lab not running on port 43123.");
      })
      .catch(() => {
        setMsg("Start START-HERE-43123.bat, then open the link below.");
      });
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 px-6 py-16 font-sans text-zinc-100 bg-zinc-950">
      <h1 className="text-2xl font-semibold">Wrong page — use the Forward Test Lab</h1>
      <p className="text-zinc-400">{msg}</p>
      <p className="text-sm text-zinc-500">
        You may have opened the <strong>repo root</strong> app (port 3000). The lab with working buttons is only on{" "}
        <strong>port 43123</strong>.
      </p>
      <a
        className="inline-block rounded-lg bg-amber-600 px-5 py-3 text-center font-semibold text-zinc-950 hover:bg-amber-500"
        href={`http://127.0.0.1:${LAB_PORT}/`}
      >
        Open Forward Test Lab (port {LAB_PORT})
      </a>
      <p className="text-xs text-zinc-600">Windows: double-click START-HERE-43123.bat in the project folder.</p>
    </main>
  );
}
