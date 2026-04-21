# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Package manager is **pnpm** (Node 24). Dev environment is managed by devenv/direnv (`.envrc`).

- `pnpm dev` — run Nitro dev server on port 3000
- `pnpm build` — build to `.output/`; production entry is `.output/server/index.mjs`
- `pnpm test` — run the vitest suite once (what CI runs)
- `pnpm test:watch` — watch mode
- `pnpm vitest run tests/api.test.ts` — run a single test file
- `pnpm vitest run -t "caps request"` — run a single test by name

There is no lint or typecheck script. `tsconfig.json` extends `nitro/tsconfig` and includes both `server/` and `tests/`.

## Architecture

This is a stateless **Torznab indexer** that proxies Prowlarr/Radarr/Sonarr requests into Debrid Media Manager's backend, then filters the results to those cached on Real-Debrid. It is built on **Nitro v3 (beta)**, which is an unusual choice — the tsconfig alias `~/*` points at the repo root and handlers are defined with `defineHandler` from `nitro/h3`.

### The single-route design

Everything funnels through `server/routes/api.ts`, which dispatches on the Torznab `?t=` parameter (`caps`, `movie`, `tvsearch`, `search`). Each branch follows the same shape:

1. Resolve an IMDb ID (from `imdbid=` directly, or by calling DMM's title search with `q=`).
2. Hit DMM's `/api/torrents/{movie,tv}` endpoint.
3. Pass the resulting hashes to DMM's `/api/availability/check` and keep only RD-cached results.
4. Render a Torznab RSS document.

`handleTorznabRequest(query)` is exported separately from the `defineHandler` default export so tests can exercise the dispatch logic directly without going through HTTP.

### DMM token generation (`server/lib/dmm-token.ts`, `server/lib/hash.ts`)

DMM's API requires a proof-of-work-style `dmmProblemKey` + `solution` pair on every call. `hash.ts` is a **direct port** of DMM's frontend `src/utils/token.ts` — it is a custom non-cryptographic hash and a specific interleave/reverse combiner. Do not "clean up" or substitute a standard hash; the server on the other end verifies this exact algorithm. The RD time API (`https://app.real-debrid.com/rest/1.0/time/iso`) is the timestamp source and is cached for 10 seconds.

### Caching (`server/lib/cache.ts`)

In-memory `Map` with 5-minute TTL. It is per-process only — the app is otherwise stateless and intended to run as a single replica (see `chart/templates/deployment.yaml`).

### Deliberate protocol quirks (do not "fix" these without understanding why)

- **Errors are swallowed into empty results XML.** When a downstream call throws, `handleTorznabRequest` returns `<rss>…</rss>` with zero items instead of `<error/>`. Returning an error element causes Prowlarr to disable the indexer after transient DMM rate-limits or timeouts; empty results keep the indexer healthy.
- **Bare connection-test queries fall back to known titles.** Radarr/Sonarr/Prowlarr probe the indexer with `?t=movie`, `?t=tvsearch`, or `?t=search` and no parameters. These must return at least one item or the tool marks the indexer broken. `handleMovieSearch` / `handleTvSearch` / `handleGeneralSearch` therefore fall back to `"Inception"` / `"Breaking Bad"`. `handleGeneralSearch` also inspects `cat=` to pick the right fallback kind, because Prowlarr sometimes downgrades `?t=tvsearch` into `?t=search&cat=5xxx`.
- **`?t=search&imdbid=…` with no `season` tries both movie and TV in parallel** and merges the results, because Radarr/Sonarr sometimes route searches through `t=search` instead of `t=movie` and we don't know which kind they wanted.
- **Both `newznab:attr` and `torznab:attr` category attributes are emitted, and both the parent (2000/5000) and the subcategory are included.** Prowlarr's category parser needs this duplication — removing either namespace or the parent category breaks indexer recognition.
- **Category resolution is title-regex-based** (`resolveCategory` in `server/routes/api.ts`): `2160p|4k|uhd` → +45 (UHD), `1080p|720p|bluray` → +40 (HD), else +30 (SD).

### Types

`server/types.ts` holds both the DMM API response shapes and the internal `TorznabQuery` / `TorznabItem` shapes. `TorznabItem.size` is **bytes** while DMM's `fileSize` is **MB** — the conversion happens in `toTorznabItems`.

## Tests

Tests live in `tests/` and use vitest. `integration.test.ts` drives `handleTorznabRequest` end-to-end with `vi.stubGlobal("fetch", …)` and queued mock responses; note the expected call order is **RD time API → DMM search → DMM availability**. `beforeEach` calls `vi.resetModules()` so each test re-imports the route — keep this if you add module-level state anywhere.

## Deploy

`Dockerfile` builds a Node 24 image. `.github/workflows/docker-build.yml` runs tests, publishes `ghcr.io/<owner>/dmm-torznab:1.<run_number>.0`, packages and pushes the Helm chart in `chart/` to `oci://ghcr.io/<owner>/charts`, then triggers a Flux reconcile via Tailscale. Chart version, appVersion, and image tag are all rewritten in-workflow — don't bump them by hand.

## Configuration

Environment variables (see `.env.example`):

- `DMM_API_URL` — defaults to `https://debridmediamanager.com`
- `ONLY_TRUSTED` — forwarded to DMM search as `onlyTrusted=`
- `MAX_SIZE_MB` — forwarded to DMM search as `maxSize=`
- `PORT` — Nitro dev server port
- `RD_API_KEY`, `LIVE_RD_CHECK` — reserved for a Phase 2 direct-RD availability check that is not yet wired up
