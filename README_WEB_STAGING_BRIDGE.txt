KARNA Web v0.5 Staging Bridge
==============================
Compatible with KARNA Private Backend v0.5. Deploy PRIVATE backend upgrade FIRST and verify /api/v1/public/staging-status; then deploy these frontend files to the PUBLIC site.

Adds Cloud status tab with a deliberately PUBLIC, SYNTHETIC-ONLY read-only status check. Requires no login and never asks for or transmits the KARNA_ADMIN_TOKEN. No broker orders; no real price feed; no server-managed trading.

Load GitHub Pages site and press Ctrl+Shift+R if JS stale. Click Cloud status > Check cloud status.

Security: the public status endpoint returns ONLY generic staging flags. Never enter broker/admin credentials in GitHub Pages or commit them to GitHub. 
