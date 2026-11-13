import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const py = process.platform === "win32" ? "py -3" : "python3";

try {
  execSync(`${py} tools/pack_download_zip.py`, { cwd: repoRoot, stdio: "inherit" });
} catch (e) {
  console.warn("[prebuild-pack-zip] Python pack failed, keeping existing public zip if any.", e?.message);
  process.exit(0);
}
