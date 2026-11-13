# Vercel setup (per [vercel.com/get-started.md](https://vercel.com/get-started.md))

This repo’s Vercel deployment is the **Next.js app** in `dashboard/` (`vercel.json` at repo root sets `rootDirectory: "dashboard"`).

## On this machine (done)

- **Vercel CLI** installed to a user prefix (no sudo):  
  `~/.local/share/npm-global/bin/vercel` — version **65.12.1**
- **Cursor MCP config** merged at `~/.cursor/mcp.json` with:

```json
{
  "mcpServers": {
    "vercel": {
      "url": "https://mcp.vercel.com"
    }
  }
}
```

In Cursor, open MCP settings: if **Vercel** shows **Needs login**, complete OAuth (human step).

- **Plugin vs skills:** `npx plugins add vercel/vercel-plugin` reported *No supported targets* (headless agent). Standalone `npx skills add vercel-labs/agent-skills --global` cloned skills but Cursor/PromptScript could not install them globally here — on your **desktop Cursor**, run the plugin or skills steps from the playbook if you want them.

## What you must do locally (auth)

1. **Install CLI** (if missing): `npm install -g vercel@latest` then `vercel --version`
2. **Login:** `vercel login` (or `vercel signup`)
3. **Verify:** `vercel whoami`
4. **Link & deploy** from `dashboard/` (or repo root; Vercel reads root `vercel.json`):

   ```bash
   cd dashboard
   vercel link
   vercel --prod
   ```

   Or one-off without a permanent project: `vercel deploy --temporary` (see [deploy without logging in](https://vercel.com/docs/deployments/deploy-without-logging-in)).

## MCP (Cursor)

- Endpoint must be exactly **`https://mcp.vercel.com`**
- After login, verify with `list_teams` (or the MCP tools Cursor exposes after refresh).

## This project’s hosted behaviour

- `AAR_DISABLE_EXEC=1` is set in `vercel.json` so **Python forward test does not run** on Vercel; the UI is informational. The **Bybit demo key probe** (`POST /api/bybit/test`) uses **Node** only (no `python3` on the server).
