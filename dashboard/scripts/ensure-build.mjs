import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dashboardDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildId = path.join(dashboardDir, ".next", "BUILD_ID");

if (existsSync(buildId)) {
  console.log("[ensure-build] Using existing build (dashboard\\.next). Delete that folder to rebuild.");
  process.exit(0);
}

console.log(
  "[ensure-build] First build - this can take 10-25 minutes on a slow PC. Watch this window for errors.",
);
execSync("npm run build", { cwd: dashboardDir, stdio: "inherit", env: process.env });
