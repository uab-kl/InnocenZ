---
name: innocenz-metro-watcher-wedge
description: Blank localhost:8081 root cause — Metro watcher 240s startup timeout on Windows under dev:all load; patched to 900s; corrupt-cache guard in dev scripts
metadata: 
  node_type: memory
  type: project
  originSessionId: a5f4c109-f298-406a-b432-09cd0afff086
  modified: 2026-08-08T09:10:49.322Z
---

Blank `localhost:8081` after `pnpm dev:all` (diagnosed 8 Aug 2026) had TWO stacked causes:

1. **Watcher startup timeout (the wedge).** `metro-file-map/src/Watcher.js` `MAX_WAIT_TIME = 240000` gives `@parcel/watcher` 240 s to subscribe to all 8 watchFolders. On this Windows box (repo in `Downloads`, possibly OneDrive-tagged) subscription takes 4–7 min when Vite + backend + a cold crawl run together → `Failed to start watch mode` → DependencyGraph init rejects **silently** → every bundle request 500s `Cannot read properties of undefined (reading 'get')` at `DependencyGraph.js:28` forever, while `/status` still says `packager-status:running`. Fixed by `patches/metro-file-map@0.83.7.patch` (→ 900000) registered in `pnpm-workspace.yaml`. Proof: cold `--clear` boot under full load served bundle 200 at 385 s — past the old cliff.

2. **Corrupt file-map cache (the trigger loop).** Ctrl+C on dev:all `taskkill /F`s Metro, which can die mid cache write in `%TEMP%\metro-file-map-*`; next boot Metro only warns, then full-crawls (which is what pushes watcher setup past the cliff). `clearCorruptMetroCaches()` in `tools/scripts/dev-shared.mjs` (called by dev-all/dev-mobile/dev-mobile-web before Expo) v8-deserialize-checks and deletes corrupt caches.

**How to diagnose next time:** blank page + 500 only on the bundle URL → curl the bundle URL directly (error is only in the response body); Expo prints nothing. First cold boot after a cache purge takes ~6 min — do not Ctrl+C mid-boot; warm boots are fast.

Related: [[innocenz-dev-environment]] (dev:all staggering, watcher contention), [[innocenz-pr-mobile-app]].
