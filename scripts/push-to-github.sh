#!/usr/bin/env bash
# Upload to GitHub: ./scripts/push-to-github.sh YOUR_GITHUB_USER [REPO_NAME]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
OWNER="${1:?Usage: $0 OWNER [REPO]}"
REPO="${2:-AAR-YA-PAAR}"
FULL="$OWNER/$REPO"

command -v gh >/dev/null || { echo "Install gh and run: gh auth login"; exit 1; }
gh auth status >/dev/null

if gh repo view "$FULL" >/dev/null 2>&1; then
  git remote get-url github >/dev/null 2>&1 || git remote add github "https://github.com/$FULL.git"
  git push -u github main
else
  gh repo create "$FULL" --private --source=. --remote=github --push
fi
echo "https://github.com/$FULL"
