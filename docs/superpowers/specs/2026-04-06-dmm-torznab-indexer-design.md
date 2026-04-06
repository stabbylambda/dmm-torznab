# DMM Torznab Indexer — Design Spec

## Overview

A Nitro v3 stateless proxy that exposes a Torznab-compatible API for Prowlarr. It translates Torznab requests into calls to Debrid Media Manager's backend API (which maintains a pre-scraped cache of torrents), checks Real-Debrid availability via DMM's crowd-sourced availability database, and returns only RD-cached results as Torznab XML.

## Goals

- Prowlarr can add this app as a custom Torznab indexer
- Radarr/Sonarr search by IMDb ID for movies and TV shows
- Manual keyword search works via Prowlarr's UI
- Only torrents cached on Real-Debrid are returned
- Stateless — no local database or cache

## Architecture

```
Prowlarr/Radarr/Sonarr
        │
        ▼ (Torznab XML over HTTP)
   ┌─────────────┐
   │  Nitro App   │
   │              │
   │  /api?t=caps │ ← capabilities (static XML)
   │  /api?t=...  │ ← search/tvsearch/movie
   └──────┬───────┘
          │
    ┌─────┴──────┐
    ▼            ▼
 DMM Backend   RD Time API
 (search +     (for DMM token
  availability) generation)
```

### File Structure

```
server/
  routes/
    api.ts            ← single Torznab entry point, dispatches on ?t= param
  lib/
    dmm-token.ts      ← token generation (salt + RD timestamp + hash)
    dmm-client.ts     ← calls DMM search + availability endpoints
    torznab.ts        ← builds Torznab XML responses (caps, search results)
    rd-client.ts      ← optional live RD availability check (Phase 2)
  utils/
    hash.ts           ← DMM's custom hash + combineHashes functions
```

## Request Flow

### Torznab → DMM Mapping

| Torznab `?t=` | DMM Endpoint | Mapping |
|---|---|---|
| `caps` | (none) | Static XML response |
| `movie&imdbid=tt123` | `/api/torrents/movie?imdbId=tt123` | Direct |
| `tvsearch&imdbid=tt123&season=2` | `/api/torrents/tv?imdbId=tt123&seasonNum=2` | Direct |
| `search&q=breaking+bad` | `/api/search/title?keyword=...` → resolve IMDb ID → use DMM's `type` field to call `/api/torrents/movie` or `/api/torrents/tv` | Two-step |
| `tvsearch&q=breaking+bad&season=2` | Same title lookup → always use `/api/torrents/tv` regardless of DMM `type` | Two-step |

### Per-Request Flow

1. Parse Torznab query params (`t`, `q`, `imdbid`, `season`, `ep`)
2. If text query without IMDb ID: call DMM `/api/search/title?keyword=` to get IMDb ID + content type (movie vs show)
3. Generate DMM token: fetch RD timestamp → build `dmmProblemKey` + `solution`
4. Call DMM search endpoint with IMDb ID
5. If DMM returns 204 with `status: processing/requested` → return empty results (content not yet scraped by DMM)
6. Collect hashes from results → call DMM `/api/availability/check` with batches of 100
7. Filter to only RD-available results
8. Map each result to a Torznab `<item>` with magnet link, size, title, infohash
9. Return Torznab XML

### Episode Filtering

DMM returns all torrents for a season. When Prowlarr sends `&ep=5`, we filter results client-side by checking filenames/titles for episode number patterns (S02E05, etc.).

## DMM Token Generation

Replicates the proof-of-work from DMM's open-source frontend (`src/utils/token.ts`):

1. Generate random token — `crypto.getRandomValues(Uint32Array)` → hex string
2. Fetch timestamp — GET `https://app.real-debrid.com/rest/1.0/time/iso` → parse to epoch seconds. Cache for 10 seconds.
3. Build `dmmProblemKey` — `"{token}-{timestamp}"`
4. Hash — custom non-cryptographic hash using `Math.imul` with seeds `0xdeadbeef` and `0x41c6ce57`
5. Build `solution` — hash `"{token}-{timestamp}"`, hash `"{salt}-{token}"` (salt = `debridmediamanager.com%%fe7#td00rA3vHz%VmI`), then `combineHashes` (interleave first halves, reverse second halves)

## Torznab XML Response Format

### Search Results

```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"
     xmlns:torznab="http://torznab.com/schemas/2015/feed">
  <channel>
    <title>DMM Indexer</title>
    <description>Debrid Media Manager Torznab Indexer</description>
    <link>http://localhost:3000</link>
    <language>en-us</language>
    <category>search</category>
    <item>
      <title>Movie.Name.2024.1080p.BluRay.x264</title>
      <guid>http://localhost:3000/api?t=details&amp;id={hash}</guid>
      <pubDate>Sun, 06 Apr 2025 00:00:00 +0000</pubDate>
      <size>4294967296</size>
      <link>magnet:?xt=urn:btih:{hash}</link>
      <enclosure url="magnet:?xt=urn:btih:{hash}" length="4294967296"
                 type="application/x-bittorrent"/>
      <torznab:attr name="category" value="2000"/>
      <torznab:attr name="seeders" value="0"/>
      <torznab:attr name="peers" value="0"/>
      <torznab:attr name="infohash" value="{hash}"/>
      <torznab:attr name="magneturl" value="magnet:?xt=urn:btih:{hash}"/>
      <torznab:attr name="downloadvolumefactor" value="0"/>
      <torznab:attr name="uploadvolumefactor" value="1"/>
    </item>
  </channel>
</rss>
```

### Field Mapping

- **size**: DMM `fileSize` (MB) → bytes
- **category**: `2000` (Movies) or `5000` (TV) based on endpoint queried
- **seeders/peers**: `0` (DMM search doesn't return live tracker stats)
- **downloadvolumefactor**: `0` (freeleech equivalent — RD has no ratio)
- **pubDate**: current time (DMM doesn't return upload dates)
- **guid**: hash-based, unique per result

### Capabilities Response

```xml
<caps>
  <server title="DMM Indexer"/>
  <searching>
    <search available="yes" supportedParams="q"/>
    <tv-search available="yes" supportedParams="q,season,ep,imdbid"/>
    <movie-search available="yes" supportedParams="q,imdbid"/>
  </searching>
  <categories>
    <category id="2000" name="Movies"/>
    <category id="5000" name="TV"/>
  </categories>
</caps>
```

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `RD_API_KEY` | No (Phase 2) | — | Real-Debrid API key for live availability checks |
| `DMM_API_URL` | No | `https://debridmediamanager.com` | DMM backend URL |
| `ONLY_TRUSTED` | No | `false` | Only return trusted torrents |
| `MAX_SIZE_MB` | No | (no limit) | Max torrent size filter |
| `LIVE_RD_CHECK` | No | `false` | Enable live RD availability check (Phase 2) |
| `PORT` | No | `3000` | Server port |

No API key auth on the indexer itself — designed for local network use.

## Error Handling

- **DMM returns 204 (processing/requested)**: return empty Torznab result set (Prowlarr retries naturally)
- **DMM unreachable**: return Torznab error XML (`<error code="100" description="..."/>`)
- **RD time API unreachable**: return error (can't generate DMM token)
- **Title search returns no results**: return empty result set
- **Invalid Torznab params**: Torznab error XML with appropriate code

## Scope

### In Scope
- Movies and TV shows via IMDb ID
- Keyword search via DMM title lookup
- RD availability filtering via DMM's crowd-sourced database
- Episode-level filtering by filename pattern matching

### Out of Scope (Future)
- Anime (uses separate ID system)
- Live RD API availability checks (Phase 2, behind `LIVE_RD_CHECK` flag)
- Local caching layer
- API key authentication on the indexer
