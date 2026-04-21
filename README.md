# dmm-indexer

A Torznab indexer that exposes [Debrid Media Manager](https://debridmediamanager.com)'s torrent catalog to Prowlarr, Radarr, and Sonarr, filtered to torrents that are already cached on Real-Debrid.

Point your \*arr stack at this service and every search result is guaranteed to be an instant-streaming RD cache hit.

## How it works

```
Prowlarr / Radarr / Sonarr
          │   Torznab XML over HTTP
          ▼
     dmm-indexer ──► DMM search API       (catalog of torrents)
                 ──► DMM availability API  (which hashes are on Real-Debrid)
                 ──► Real-Debrid time API  (for DMM's token proof-of-work)
```

The service is stateless — a single container, no database, a small in-memory cache with a 5-minute TTL. Every request resolves an IMDb ID, asks DMM for matching torrents, filters to the RD-cached subset, and returns a Torznab RSS feed with magnet links.

## Running it

### Docker

Images are published to `ghcr.io/stabbylambda/dmm-torznab`:

```sh
docker run --rm -p 3000:3000 ghcr.io/stabbylambda/dmm-torznab:latest
```

### Kubernetes (Helm)

A Helm chart is published to the same registry:

```sh
helm install dmm-torznab oci://ghcr.io/stabbylambda/charts/dmm-torznab
```

See `chart/values.yaml` for the available values (image tag, timezone).

### From source

```sh
pnpm install
pnpm dev       # dev server on :3000
pnpm build     # → .output/server/index.mjs
```

Requires Node 24 and pnpm 10. A `devenv.nix` / `.envrc` is provided for [devenv](https://devenv.sh) users.

## Configuring Prowlarr

Add a new **Generic Torznab** indexer:

- **URL:** `http://<host>:3000/api`
- **API Path:** leave blank (the `/api` route handles everything)
- **API Key:** anything non-empty (not validated)
- **Categories:** Movies (2000/2030/2040/2045) and/or TV (5000/5030/5040/5045)

Test the connection — it should come back with results for a canned fallback query. Once added, Prowlarr will sync the indexer to Radarr and Sonarr automatically.

Radarr and Sonarr can also be pointed at `/api` directly if you'd rather skip Prowlarr.

## Configuration

All configuration is via environment variables. See `.env.example`.

| Variable | Default | Purpose |
|---|---|---|
| `DMM_API_URL` | `https://debridmediamanager.com` | DMM backend to proxy |
| `ONLY_TRUSTED` | `false` | Restrict results to DMM's trusted-uploader set |
| `MAX_SIZE_MB` | *(unset)* | Drop torrents larger than this |
| `PORT` | `3000` | HTTP port |
| `RD_API_KEY` | *(unset)* | Reserved for a future live-RD-check mode |
| `LIVE_RD_CHECK` | `false` | Reserved for a future live-RD-check mode |

## Supported Torznab queries

| `?t=` | Parameters | Notes |
|---|---|---|
| `caps` | — | Returns the static capabilities document |
| `movie` | `imdbid`, `q` | `imdbid` preferred; bare `q` falls back to a title search |
| `tvsearch` | `imdbid`, `season`, `ep`, `q` | Episode filtering is applied client-side after DMM returns the season |
| `search` | `q`, `imdbid`, `cat` | Generic search; auto-detects movie vs TV and merges results |

Categories emitted:

- `2000` Movies → `2030` SD · `2040` HD · `2045` UHD
- `5000` TV → `5030` SD · `5040` HD · `5045` UHD

Resolution is inferred from the torrent title (`2160p/4k/uhd` → UHD, `1080p/720p/bluray` → HD, else SD).

## Caveats

- **Results are only as fresh as DMM's scraped cache.** If DMM hasn't indexed something yet its first search returns empty (HTTP 204, which we translate to an empty feed).
- **Seeders are reported as `1`.** This is a cached-RD indexer; the magnet goes straight to a debrid client, so the seeder count has no practical meaning. Radarr/Sonarr only care that it is non-zero.
- **The indexer deliberately returns empty results instead of errors on downstream failures.** Returning a Torznab `<error/>` element causes Prowlarr to disable the indexer after a single transient DMM rate-limit or timeout.
- **Stateless & single-replica.** The in-memory cache is per-process; running multiple replicas just means more independent token handshakes against DMM.

## License

ISC
