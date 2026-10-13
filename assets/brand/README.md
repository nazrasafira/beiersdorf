# Brand assets

- `beiersdorf-logo.png` — Beiersdorf logo (blue wordmark, transparent background, 850 × 140 px), supplied by the client.
  Used in the header and on the login page (`BRAND_LOGO` in `assets/js/common.js`).
- `favicon.png` — 64 px icon for the browser tab: the logo's "B" on a white tile.

To replace the logo, overwrite `beiersdorf-logo.png` (and `favicon.png`), run `python3 tools/bump-version.py`, and on the Laravel branch `server/deploy/sync-assets.sh`.
