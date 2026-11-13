import { createHmac } from "node:crypto";

import { repoRoot } from "@/lib/aar-paths";
import { loadBybitCredentials } from "@/lib/bybit-credentials";
import { type BybitEnvironment, bybitPrivateWs, bybitPublicWs, parseBybitEnvironment } from "@/lib/bybit-environment";
import { isHostedServer } from "@/lib/hosted-mode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function signWsAuth(apiKey: string, secret: string) {
  const expires = Date.now() + 10_000;
  const payload = `GET/realtime${expires}`;
  const sign = createHmac("sha256", secret).update(payload).digest("hex");
  return { apiKey, expires: String(expires), sign };
}

export async function GET(req: Request) {
  if (isHostedServer()) {
    return new Response("SSE unavailable on hosted site", { status: 503 });
  }
  const url = new URL(req.url);
  const environment = parseBybitEnvironment(url.searchParams.get("environment"), "demo");
  const creds = loadBybitCredentials(repoRoot(), environment);
  if (!creds) {
    return new Response(`No saved Bybit credentials for ${environment}`, { status: 401 });
  }

  const publicWsUrl = bybitPublicWs(environment);
  const privateWsUrl = bybitPrivateWs(environment);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      send("hello", { ok: true, ts: Date.now(), environment });

      let publicWs: WebSocket | null = null;
      let privateWs: WebSocket | null = null;
      let closed = false;

      const cleanup = () => {
        closed = true;
        try {
          publicWs?.close();
        } catch {
          /* ignore */
        }
        try {
          privateWs?.close();
        } catch {
          /* ignore */
        }
      };

      const connectPublic = () => {
        publicWs = new WebSocket(publicWsUrl);
        publicWs.onopen = () => {
          publicWs?.send(JSON.stringify({ op: "subscribe", args: ["tickers.BTCUSDT"] }));
        };
        publicWs.onmessage = (ev) => {
          try {
            const msg = JSON.parse(String(ev.data)) as { topic?: string; data?: Record<string, unknown> };
            if (msg.topic?.startsWith("tickers.")) {
              const row = (Array.isArray(msg.data) ? msg.data[0] : msg.data) as Record<string, unknown> | undefined;
              const mark = parseFloat(String(row?.markPrice ?? row?.lastPrice ?? 0));
              if (mark > 0) send("ticker", { mark_price: mark, symbol: "BTCUSDT" });
            }
          } catch {
            /* ignore */
          }
        };
        publicWs.onclose = () => {
          if (!closed) setTimeout(connectPublic, 2000);
        };
      };

      const connectPrivate = () => {
        privateWs = new WebSocket(privateWsUrl);
        privateWs.onopen = () => {
          const auth = signWsAuth(creds.apiKey, creds.apiSecret);
          privateWs?.send(
            JSON.stringify({
              op: "auth",
              args: [auth.apiKey, auth.expires, auth.sign],
            }),
          );
          setTimeout(() => {
            privateWs?.send(JSON.stringify({ op: "subscribe", args: ["position", "order", "wallet"] }));
          }, 250);
        };
        privateWs.onmessage = (ev) => {
          try {
            const msg = JSON.parse(String(ev.data)) as { topic?: string; data?: unknown };
            if (msg.topic === "position") {
              send("position", msg.data);
            } else if (msg.topic === "order") {
              send("order", msg.data);
            } else if (msg.topic === "wallet") {
              send("wallet", msg.data);
            }
          } catch {
            /* ignore */
          }
        };
        privateWs.onclose = () => {
          if (!closed) setTimeout(connectPrivate, 2500);
        };
      };

      connectPublic();
      connectPrivate();

      const heartbeat = setInterval(() => send("ping", { ts: Date.now() }), 15_000);

      return () => {
        clearInterval(heartbeat);
        cleanup();
        try {
          controller.close();
        } catch {
          /* ignore */
        }
      };
    },
    cancel() {
      /* stream cancelled */
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
