import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

import { type BybitEnvironment, bybitEnvironmentLabel } from "@/lib/bybit-environment";
import { probeBybitAccount } from "@/lib/bybit-probe";

export type BybitNetwork = BybitEnvironment;

export type BybitConnectionStatus = "connected" | "disconnected" | "auth_failed" | "connection_error";

export type BybitConnectionMeta = {
  network: BybitEnvironment;
  maskedApiKey: string | null;
  status: BybitConnectionStatus;
  lastVerifiedAt: string | null;
  lastError: string | null;
  hasCredentials: boolean;
};

type StoredSecrets = {
  apiKey: string;
  apiSecret: string;
  network: BybitEnvironment;
  savedAt: string;
};

function credDir(root: string) {
  return path.join(root, "out", "forward");
}

function encPath(root: string, env: BybitEnvironment) {
  return path.join(credDir(root), `bybit-credentials-${env}.enc`);
}

function metaPath(root: string, env: BybitEnvironment) {
  return path.join(credDir(root), `bybit-connection-${env}.json`);
}

function keyPath(root: string) {
  return path.join(credDir(root), ".credential-key");
}

function migrateLegacyCredentials(root: string) {
  const legacy = path.join(credDir(root), "bybit-credentials.enc");
  const demo = encPath(root, "demo");
  if (existsSync(legacy) && !existsSync(demo)) {
    copyFileSync(legacy, demo);
  }
  const legacyMeta = path.join(credDir(root), "bybit-connection.json");
  const demoMeta = metaPath(root, "demo");
  if (existsSync(legacyMeta) && !existsSync(demoMeta)) {
    copyFileSync(legacyMeta, demoMeta);
  }
}

function deriveKey(root: string): Buffer {
  const env = process.env.AAR_CREDENTIALS_KEY?.trim();
  if (env) return createHash("sha256").update(env).digest();
  const kp = keyPath(root);
  if (!existsSync(kp)) {
    mkdirSync(credDir(root), { recursive: true });
    writeFileSync(kp, randomBytes(32).toString("hex"), { encoding: "utf-8", mode: 0o600 });
  }
  const raw = readFileSync(kp, "utf-8").trim();
  return createHash("sha256").update(raw).digest();
}

export function maskApiKey(key: string): string {
  const k = key.trim();
  if (k.length <= 4) return "****";
  return `${"*".repeat(Math.min(12, k.length - 4))}${k.slice(-4)}`;
}

function writeMeta(root: string, env: BybitEnvironment, meta: BybitConnectionMeta) {
  mkdirSync(credDir(root), { recursive: true });
  writeFileSync(metaPath(root, env), JSON.stringify(meta, null, 2), "utf-8");
}

export function readConnectionMeta(root: string, env: BybitEnvironment = "demo"): BybitConnectionMeta {
  migrateLegacyCredentials(root);
  const hasCredentials = existsSync(encPath(root, env));
  const mp = metaPath(root, env);
  if (!existsSync(mp)) {
    return {
      network: env,
      maskedApiKey: null,
      status: "disconnected",
      lastVerifiedAt: null,
      lastError: null,
      hasCredentials,
    };
  }
  try {
    return {
      network: env,
      ...(JSON.parse(readFileSync(mp, "utf-8")) as Omit<BybitConnectionMeta, "network">),
      hasCredentials,
    };
  } catch {
    return {
      network: env,
      maskedApiKey: null,
      status: "disconnected",
      lastVerifiedAt: null,
      lastError: null,
      hasCredentials,
    };
  }
}

export function readAllConnectionMeta(root: string): { demo: BybitConnectionMeta; mainnet: BybitConnectionMeta } {
  return { demo: readConnectionMeta(root, "demo"), mainnet: readConnectionMeta(root, "mainnet") };
}

export function saveBybitCredentials(
  root: string,
  env: BybitEnvironment,
  apiKey: string,
  apiSecret: string,
): void {
  const key = apiKey.trim();
  const secret = apiSecret.trim();
  if (!key || !secret) throw new Error("API key and secret required");
  const payload: StoredSecrets = {
    apiKey: key,
    apiSecret: secret,
    network: env,
    savedAt: new Date().toISOString(),
  };
  const keyBuf = deriveKey(root);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBuf, iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  mkdirSync(credDir(root), { recursive: true });
  writeFileSync(encPath(root, env), Buffer.concat([iv, tag, enc]), { mode: 0o600 });
  writeMeta(root, env, {
    network: env,
    maskedApiKey: maskApiKey(key),
    status: "disconnected",
    lastVerifiedAt: null,
    lastError: null,
    hasCredentials: true,
  });
}

export function loadBybitCredentials(root: string, env: BybitEnvironment = "demo"): { apiKey: string; apiSecret: string } | null {
  migrateLegacyCredentials(root);
  const p = encPath(root, env);
  if (!existsSync(p)) return null;
  try {
    const buf = readFileSync(p);
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const keyBuf = deriveKey(root);
    const decipher = createDecipheriv("aes-256-gcm", keyBuf, iv);
    decipher.setAuthTag(tag);
    const json = Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
    const stored = JSON.parse(json) as StoredSecrets;
    if (!stored.apiKey?.trim() || !stored.apiSecret?.trim()) return null;
    if (stored.network !== env) {
      throw new Error(
        `Stored credentials are for ${bybitEnvironmentLabel(stored.network)}, not ${bybitEnvironmentLabel(env)}.`,
      );
    }
    return { apiKey: stored.apiKey.trim(), apiSecret: stored.apiSecret.trim() };
  } catch (e) {
    if (e instanceof Error && e.message.includes("Stored credentials")) throw e;
    return null;
  }
}

export function clearBybitCredentials(root: string, env: BybitEnvironment): void {
  if (existsSync(encPath(root, env))) unlinkSync(encPath(root, env));
  writeMeta(root, env, {
    network: env,
    maskedApiKey: null,
    status: "disconnected",
    lastVerifiedAt: null,
    lastError: null,
    hasCredentials: false,
  });
}

/** Body keys override stored credentials when non-empty. */
export function resolveBybitCredentials(
  root: string,
  env: BybitEnvironment,
  body?: { apiKey?: string; apiSecret?: string },
): { apiKey: string; apiSecret: string; source: "body" | "stored"; environment: BybitEnvironment } | null {
  const bk = body?.apiKey?.trim() ?? "";
  const bs = body?.apiSecret?.trim() ?? "";
  if (bk && bs) return { apiKey: bk, apiSecret: bs, source: "body", environment: env };
  if (bk && !bs) {
    const stored = loadBybitCredentials(root, env);
    if (stored && stored.apiKey === bk) {
      return { apiKey: stored.apiKey, apiSecret: stored.apiSecret, source: "stored", environment: env };
    }
  }
  const stored = loadBybitCredentials(root, env);
  if (stored) return { apiKey: stored.apiKey, apiSecret: stored.apiSecret, source: "stored", environment: env };
  return null;
}

export async function verifyBybitConnection(
  root: string,
  env: BybitEnvironment,
  apiKey: string,
  apiSecret: string,
): Promise<BybitConnectionMeta> {
  const maskedApiKey = maskApiKey(apiKey);
  try {
    await probeBybitAccount(apiKey, apiSecret, env);
    const meta: BybitConnectionMeta = {
      network: env,
      maskedApiKey,
      status: "connected",
      lastVerifiedAt: new Date().toISOString(),
      lastError: null,
      hasCredentials: true,
    };
    writeMeta(root, env, meta);
    return meta;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Authentication failed";
    const status: BybitConnectionStatus = /403|401|10003|invalid|auth/i.test(msg)
      ? "auth_failed"
      : "connection_error";
    const meta: BybitConnectionMeta = {
      network: env,
      maskedApiKey,
      status,
      lastVerifiedAt: null,
      lastError: msg,
      hasCredentials: existsSync(encPath(root, env)),
    };
    writeMeta(root, env, meta);
    return meta;
  }
}
