# DMM Torznab Indexer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Nitro v3 app that acts as a Torznab-compatible indexer for Prowlarr, proxying searches to DMM's backend and filtering by Real-Debrid availability.

**Architecture:** Stateless proxy with a single `/api` Torznab endpoint. Translates Torznab query params into DMM API calls (token generation → search → availability check), then formats results as Torznab XML. No local database or cache.

**Tech Stack:** Nitro v3 (beta), TypeScript, h3, vitest for testing

---

## File Structure

```
nitro.config.ts              ← Nitro config (standalone/rollup mode)
package.json                 ← Scripts and dependencies
tsconfig.json                ← Extends nitro/tsconfig
.env.example                 ← Documented env vars
server/
  routes/
    api.ts                   ← Single Torznab entry point, dispatches on ?t= param
  lib/
    hash.ts                  ← DMM's custom hash + combineHashes functions
    dmm-token.ts             ← Token generation (salt + RD timestamp + hash)
    dmm-client.ts            ← Calls DMM search + availability + title endpoints
    torznab.ts               ← Builds Torznab XML (caps, results, errors)
  types.ts                   ← Shared TypeScript types
tests/
  hash.test.ts
  dmm-token.test.ts
  torznab.test.ts
  dmm-client.test.ts
  api.test.ts
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `nitro.config.ts`
- Create: `tsconfig.json`
- Create: `.env.example`
- Create: `.gitignore` (update existing)

- [ ] **Step 1: Initialize package.json**

```bash
cd /home/david/code/dmm-indexer
pnpm init
```

- [ ] **Step 2: Install dependencies**

```bash
pnpm add -D nitro@latest vitest
```

- [ ] **Step 3: Create nitro.config.ts**

Write `nitro.config.ts`:

```ts
import { defineConfig } from "nitro";

export default defineConfig({
  serverDir: "./server",
});
```

- [ ] **Step 4: Create tsconfig.json**

Write `tsconfig.json`:

```json
{
  "extends": ["nitro/tsconfig"],
  "compilerOptions": {
    "paths": {
      "~/*": ["./*"]
    }
  }
}
```

- [ ] **Step 5: Update package.json scripts**

Add to `package.json`:

```json
{
  "type": "module",
  "scripts": {
    "dev": "nitro dev",
    "build": "nitro build",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 6: Create .env.example**

Write `.env.example`:

```bash
# Real-Debrid API key (optional - for Phase 2 live availability checks)
RD_API_KEY=

# DMM backend URL (default: https://debridmediamanager.com)
DMM_API_URL=https://debridmediamanager.com

# Only return trusted torrents (default: false)
ONLY_TRUSTED=false

# Max torrent size in MB (default: no limit)
MAX_SIZE_MB=

# Enable live RD availability check - Phase 2 (default: false)
LIVE_RD_CHECK=false

# Server port (default: 3000)
PORT=3000
```

- [ ] **Step 7: Update .gitignore**

Append to `.gitignore`:

```
# Node
node_modules
.output
.nitro

# Env
.env
```

- [ ] **Step 8: Create a smoke-test route and verify dev server starts**

Write `server/routes/health.ts`:

```ts
import { defineHandler } from "nitro/h3";

export default defineHandler(() => {
  return { status: "ok" };
});
```

Run:

```bash
pnpm dev
```

In another terminal:

```bash
curl http://localhost:3000/health
```

Expected: `{"status":"ok"}`

Kill the dev server after verifying.

- [ ] **Step 9: Commit**

```bash
git add package.json pnpm-lock.yaml nitro.config.ts tsconfig.json .env.example .gitignore server/routes/health.ts
git commit -m "feat: scaffold Nitro v3 project"
```

---

### Task 2: Shared Types

**Files:**
- Create: `server/types.ts`

- [ ] **Step 1: Write shared types**

Write `server/types.ts`:

```ts
// DMM API response types

export interface DmmSearchResult {
  title: string;
  fileSize: number; // in MB
  hash: string; // 40-char hex infohash
  files?: { fileId: number; filename: string; filesize: number }[];
}

export interface DmmSearchResponse {
  results: DmmSearchResult[];
}

export interface DmmTitleResult {
  id: string;
  type: string; // "movie" or "show"
  year: number;
  title: string;
  imdbid: string;
  score: number;
  score_average: number;
  searchTitle: string;
}

export interface DmmTitleSearchResponse {
  results: DmmTitleResult[];
}

export interface DmmAvailabilityFile {
  file_id: number;
  path: string;
  bytes: number;
}

export interface DmmAvailabilityResult {
  hash: string;
  files: DmmAvailabilityFile[];
}

export interface DmmAvailabilityResponse {
  available: DmmAvailabilityResult[];
}

// Internal types

export interface TorznabQuery {
  t: string; // caps, search, tvsearch, movie
  q?: string; // search query
  imdbid?: string; // tt1234567
  season?: string; // season number
  ep?: string; // episode number
  cat?: string; // category filter
  limit?: string; // result limit
  offset?: string; // result offset
}

export interface TorznabItem {
  title: string;
  hash: string;
  size: number; // bytes
  category: number; // 2000 or 5000
  magnetUrl: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add server/types.ts
git commit -m "feat: add shared TypeScript types"
```

---

### Task 3: DMM Custom Hash Function

**Files:**
- Create: `server/lib/hash.ts`
- Create: `tests/hash.test.ts`

- [ ] **Step 1: Write the failing test**

Write `tests/hash.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { generateHash, combineHashes } from "../server/lib/hash.js";

describe("generateHash", () => {
  it("produces an 8-char hex string", () => {
    const result = generateHash("test-input");
    expect(result).toMatch(/^[0-9a-f]{8}$/);
  });

  it("is deterministic for the same input", () => {
    const a = generateHash("hello-world");
    const b = generateHash("hello-world");
    expect(a).toBe(b);
  });

  it("produces different hashes for different inputs", () => {
    const a = generateHash("input-a");
    const b = generateHash("input-b");
    expect(a).not.toBe(b);
  });
});

describe("combineHashes", () => {
  it("produces a string of length equal to the sum of the two input lengths", () => {
    const a = generateHash("hash-a");
    const b = generateHash("hash-b");
    const combined = combineHashes(a, b);
    expect(combined.length).toBe(a.length + b.length);
  });

  it("is deterministic", () => {
    const a = generateHash("hash-a");
    const b = generateHash("hash-b");
    expect(combineHashes(a, b)).toBe(combineHashes(a, b));
  });

  it("interleaves first halves and reverses second halves", () => {
    // For two 8-char inputs "abcdefgh" and "12345678":
    // first halves: "abcd" and "1234" → interleaved: "a1b2c3d4"
    // second halves: "efgh" and "5678" → reversed: "hgfe" + "8765" → "hgfe8765"
    // result: "a1b2c3d4hgfe8765"
    const result = combineHashes("abcdefgh", "12345678");
    expect(result).toBe("a1b2c3d4hgfe8765");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- tests/hash.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the hash implementation**

Write `server/lib/hash.ts`:

```ts
/**
 * DMM's custom non-cryptographic hash function.
 * Ported from debrid-media-manager src/utils/token.ts.
 * Uses Math.imul with seeds 0xdeadbeef and 0x41c6ce57.
 */
export function generateHash(input: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;

  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }

  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);

  const combined = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return combined.toString(16).padStart(8, "0").slice(0, 8);
}

/**
 * Combines two hash strings by interleaving first halves
 * and reversing second halves.
 * Ported from debrid-media-manager src/utils/token.ts.
 */
export function combineHashes(hash1: string, hash2: string): string {
  const mid1 = Math.floor(hash1.length / 2);
  const mid2 = Math.floor(hash2.length / 2);

  const firstHalf1 = hash1.slice(0, mid1);
  const secondHalf1 = hash1.slice(mid1);
  const firstHalf2 = hash2.slice(0, mid2);
  const secondHalf2 = hash2.slice(mid2);

  let interleaved = "";
  const maxLen = Math.max(firstHalf1.length, firstHalf2.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < firstHalf1.length) interleaved += firstHalf1[i];
    if (i < firstHalf2.length) interleaved += firstHalf2[i];
  }

  const reversed1 = secondHalf1.split("").reverse().join("");
  const reversed2 = secondHalf2.split("").reverse().join("");

  return interleaved + reversed1 + reversed2;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test -- tests/hash.test.ts
```

Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/lib/hash.ts tests/hash.test.ts
git commit -m "feat: implement DMM custom hash function"
```

---

### Task 4: DMM Token Generation

**Files:**
- Create: `server/lib/dmm-token.ts`
- Create: `tests/dmm-token.test.ts`

- [ ] **Step 1: Write the failing test**

Write `tests/dmm-token.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateTokenAndHash, fetchTimestamp } from "../server/lib/dmm-token.js";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchTimestamp", () => {
  it("fetches and parses RD time API to epoch seconds", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve("2025-04-06T12:00:00.000Z"),
    });

    const ts = await fetchTimestamp();
    expect(ts).toBe(Math.floor(new Date("2025-04-06T12:00:00.000Z").getTime() / 1000));
    expect(mockFetch).toHaveBeenCalledWith(
      "https://app.real-debrid.com/rest/1.0/time/iso"
    );
  });
});

describe("generateTokenAndHash", () => {
  it("returns [dmmProblemKey, solution] tuple", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve("2025-04-06T12:00:00.000Z"),
    });

    const [dmmProblemKey, solution] = await generateTokenAndHash();

    // dmmProblemKey format: "{hextoken}-{timestamp}"
    expect(dmmProblemKey).toMatch(/^[0-9a-f]+-\d+$/);

    // solution is a combined hash string
    expect(typeof solution).toBe("string");
    expect(solution.length).toBeGreaterThan(0);
  });

  it("produces different tokens on each call", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("2025-04-06T12:00:00.000Z"),
    });

    const [key1] = await generateTokenAndHash();
    const [key2] = await generateTokenAndHash();
    expect(key1).not.toBe(key2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- tests/dmm-token.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the token generation implementation**

Write `server/lib/dmm-token.ts`:

```ts
import { generateHash, combineHashes } from "./hash.js";

const SALT = "debridmediamanager.com%%fe7#td00rA3vHz%VmI";

let cachedTimestamp: number | null = null;
let cachedTimestampAt = 0;
const TIMESTAMP_CACHE_MS = 10_000;

function generateRandomToken(): string {
  const array = new Uint32Array(4);
  crypto.getRandomValues(array);
  return Array.from(array, (v) => v.toString(16).padStart(8, "0")).join("");
}

export async function fetchTimestamp(): Promise<number> {
  const now = Date.now();
  if (cachedTimestamp !== null && now - cachedTimestampAt < TIMESTAMP_CACHE_MS) {
    return cachedTimestamp;
  }

  const response = await fetch(
    "https://app.real-debrid.com/rest/1.0/time/iso"
  );
  const text = await response.text();
  const timestamp = Math.floor(new Date(text).getTime() / 1000);

  cachedTimestamp = timestamp;
  cachedTimestampAt = now;

  return timestamp;
}

export async function generateTokenAndHash(): Promise<[string, string]> {
  const token = generateRandomToken();
  const timestamp = await fetchTimestamp();
  const tokenWithTimestamp = `${token}-${timestamp}`;
  const tokenTimestampHash = generateHash(tokenWithTimestamp);
  const tokenSaltHash = generateHash(`${SALT}-${token}`);
  const solution = combineHashes(tokenTimestampHash, tokenSaltHash);
  return [tokenWithTimestamp, solution];
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test -- tests/dmm-token.test.ts
```

Expected: all 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/lib/dmm-token.ts tests/dmm-token.test.ts
git commit -m "feat: implement DMM token generation"
```

---

### Task 5: Torznab XML Builder

**Files:**
- Create: `server/lib/torznab.ts`
- Create: `tests/torznab.test.ts`

- [ ] **Step 1: Write the failing tests**

Write `tests/torznab.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  buildCapsXml,
  buildSearchResultsXml,
  buildErrorXml,
} from "../server/lib/torznab.js";
import type { TorznabItem } from "../server/types.js";

describe("buildCapsXml", () => {
  it("returns valid caps XML with search capabilities", () => {
    const xml = buildCapsXml();
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain("<caps>");
    expect(xml).toContain('<server title="DMM Indexer"');
    expect(xml).toContain('<search available="yes"');
    expect(xml).toContain('supportedParams="q"');
    expect(xml).toContain('<tv-search available="yes"');
    expect(xml).toContain('supportedParams="q,season,ep,imdbid"');
    expect(xml).toContain('<movie-search available="yes"');
    expect(xml).toContain('supportedParams="q,imdbid"');
    expect(xml).toContain('<category id="2000" name="Movies"');
    expect(xml).toContain('<category id="5000" name="TV"');
  });
});

describe("buildSearchResultsXml", () => {
  it("returns empty channel for no results", () => {
    const xml = buildSearchResultsXml([]);
    expect(xml).toContain("<channel>");
    expect(xml).not.toContain("<item>");
  });

  it("maps a TorznabItem to proper XML item", () => {
    const items: TorznabItem[] = [
      {
        title: "Test.Movie.2024.1080p",
        hash: "abc123def456abc123def456abc123def456abc1",
        size: 4294967296,
        category: 2000,
        magnetUrl:
          "magnet:?xt=urn:btih:abc123def456abc123def456abc123def456abc1",
      },
    ];
    const xml = buildSearchResultsXml(items);
    expect(xml).toContain("<title>Test.Movie.2024.1080p</title>");
    expect(xml).toContain("<size>4294967296</size>");
    expect(xml).toContain(
      'url="magnet:?xt=urn:btih:abc123def456abc123def456abc123def456abc1"'
    );
    expect(xml).toContain(
      '<torznab:attr name="category" value="2000"/>'
    );
    expect(xml).toContain(
      '<torznab:attr name="infohash" value="abc123def456abc123def456abc123def456abc1"/>'
    );
    expect(xml).toContain(
      '<torznab:attr name="downloadvolumefactor" value="0"/>'
    );
  });

  it("escapes XML special characters in title", () => {
    const items: TorznabItem[] = [
      {
        title: 'Movie <Special> & "Quoted"',
        hash: "abc123def456abc123def456abc123def456abc1",
        size: 1000,
        category: 2000,
        magnetUrl:
          "magnet:?xt=urn:btih:abc123def456abc123def456abc123def456abc1",
      },
    ];
    const xml = buildSearchResultsXml(items);
    expect(xml).toContain(
      "Movie &lt;Special&gt; &amp; &quot;Quoted&quot;"
    );
  });
});

describe("buildErrorXml", () => {
  it("returns torznab error XML", () => {
    const xml = buildErrorXml(100, "Something went wrong");
    expect(xml).toContain('<error code="100"');
    expect(xml).toContain('description="Something went wrong"');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test -- tests/torznab.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the Torznab XML builder**

Write `server/lib/torznab.ts`:

```ts
import type { TorznabItem } from "../types.js";

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function buildCapsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
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
</caps>`;
}

export function buildSearchResultsXml(items: TorznabItem[]): string {
  const now = new Date().toUTCString();

  const itemsXml = items
    .map(
      (item) => `    <item>
      <title>${escapeXml(item.title)}</title>
      <guid>${escapeXml(item.magnetUrl)}</guid>
      <pubDate>${now}</pubDate>
      <size>${item.size}</size>
      <link>${escapeXml(item.magnetUrl)}</link>
      <enclosure url="${escapeXml(item.magnetUrl)}" length="${item.size}" type="application/x-bittorrent"/>
      <torznab:attr name="category" value="${item.category}"/>
      <torznab:attr name="seeders" value="0"/>
      <torznab:attr name="peers" value="0"/>
      <torznab:attr name="infohash" value="${item.hash}"/>
      <torznab:attr name="magneturl" value="${escapeXml(item.magnetUrl)}"/>
      <torznab:attr name="downloadvolumefactor" value="0"/>
      <torznab:attr name="uploadvolumefactor" value="1"/>
    </item>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:torznab="http://torznab.com/schemas/2015/feed">
  <channel>
    <title>DMM Indexer</title>
    <description>Debrid Media Manager Torznab Indexer</description>
    <link>http://localhost:3000</link>
    <language>en-us</language>
    <category>search</category>
${itemsXml}
  </channel>
</rss>`;
}

export function buildErrorXml(code: number, description: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<error code="${code}" description="${escapeXml(description)}"/>`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test -- tests/torznab.test.ts
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/lib/torznab.ts tests/torznab.test.ts
git commit -m "feat: implement Torznab XML builder"
```

---

### Task 6: DMM API Client

**Files:**
- Create: `server/lib/dmm-client.ts`
- Create: `tests/dmm-client.test.ts`

- [ ] **Step 1: Write the failing tests**

Write `tests/dmm-client.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  searchMovies,
  searchTv,
  searchTitle,
  checkAvailability,
} from "../server/lib/dmm-client.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock dmm-token to avoid real network calls
vi.mock("../server/lib/dmm-token.js", () => ({
  generateTokenAndHash: vi.fn().mockResolvedValue(["fake-key-123", "fake-solution"]),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("searchMovies", () => {
  it("calls DMM movie endpoint with correct params", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ results: [{ title: "Test", fileSize: 1500, hash: "a".repeat(40) }] }),
    });

    const results = await searchMovies("tt1234567");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/torrents/movie?imdbId=tt1234567"),
      expect.anything()
    );
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Test");
  });

  it("returns empty array on 204 (processing)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 204,
      headers: new Headers({ status: "processing" }),
    });

    const results = await searchMovies("tt1234567");
    expect(results).toEqual([]);
  });
});

describe("searchTv", () => {
  it("calls DMM tv endpoint with imdbId and seasonNum", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ results: [] }),
    });

    await searchTv("tt1234567", "2");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/torrents/tv?imdbId=tt1234567&seasonNum=2"),
      expect.anything()
    );
  });
});

describe("searchTitle", () => {
  it("calls DMM title search endpoint", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          results: [{ imdbid: "tt9999", type: "movie", title: "Test Movie" }],
        }),
    });

    const results = await searchTitle("test movie");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/search/title?keyword=test+movie"),
      expect.anything()
    );
    expect(results[0].imdbid).toBe("tt9999");
  });
});

describe("checkAvailability", () => {
  it("posts hashes in batches of 100", async () => {
    const hashes = Array.from({ length: 150 }, (_, i) =>
      i.toString(16).padStart(40, "0")
    );

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ available: [{ hash: hashes[0], files: [] }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ available: [] }),
      });

    const available = await checkAvailability("tt1234567", hashes);

    // Should have been called twice (100 + 50)
    const availCalls = mockFetch.mock.calls.filter(
      (c: [string, ...unknown[]]) => c[0].includes("/api/availability/check")
    );
    expect(availCalls).toHaveLength(2);
    expect(available).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test -- tests/dmm-client.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the DMM client implementation**

Write `server/lib/dmm-client.ts`:

```ts
import { generateTokenAndHash } from "./dmm-token.js";
import type {
  DmmSearchResult,
  DmmSearchResponse,
  DmmTitleResult,
  DmmTitleSearchResponse,
  DmmAvailabilityResult,
  DmmAvailabilityResponse,
} from "../types.js";

const DMM_API_URL =
  process.env.DMM_API_URL || "https://debridmediamanager.com";
const ONLY_TRUSTED = process.env.ONLY_TRUSTED === "true";
const MAX_SIZE_MB = process.env.MAX_SIZE_MB
  ? parseInt(process.env.MAX_SIZE_MB, 10)
  : undefined;

async function dmmFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${DMM_API_URL}/${path}`, init);
}

export async function searchMovies(
  imdbId: string
): Promise<DmmSearchResult[]> {
  const [dmmProblemKey, solution] = await generateTokenAndHash();

  const params = new URLSearchParams({
    imdbId,
    dmmProblemKey,
    solution,
    onlyTrusted: String(ONLY_TRUSTED),
  });
  if (MAX_SIZE_MB !== undefined) {
    params.set("maxSize", String(MAX_SIZE_MB));
  }

  const response = await dmmFetch(`api/torrents/movie?${params}`);

  if (response.status === 204) {
    return [];
  }

  if (!response.ok) {
    throw new Error(`DMM movie search failed: ${response.status}`);
  }

  const data: DmmSearchResponse = await response.json();
  return data.results;
}

export async function searchTv(
  imdbId: string,
  seasonNum: string
): Promise<DmmSearchResult[]> {
  const [dmmProblemKey, solution] = await generateTokenAndHash();

  const params = new URLSearchParams({
    imdbId,
    seasonNum,
    dmmProblemKey,
    solution,
    onlyTrusted: String(ONLY_TRUSTED),
  });
  if (MAX_SIZE_MB !== undefined) {
    params.set("maxSize", String(MAX_SIZE_MB));
  }

  const response = await dmmFetch(`api/torrents/tv?${params}`);

  if (response.status === 204) {
    return [];
  }

  if (!response.ok) {
    throw new Error(`DMM TV search failed: ${response.status}`);
  }

  const data: DmmSearchResponse = await response.json();
  return data.results;
}

export async function searchTitle(
  keyword: string
): Promise<DmmTitleResult[]> {
  const params = new URLSearchParams({ keyword });
  const response = await dmmFetch(`api/search/title?${params}`);

  if (!response.ok) {
    throw new Error(`DMM title search failed: ${response.status}`);
  }

  const data: DmmTitleSearchResponse = await response.json();
  return data.results;
}

export async function checkAvailability(
  imdbId: string,
  hashes: string[]
): Promise<DmmAvailabilityResult[]> {
  const results: DmmAvailabilityResult[] = [];
  const batchSize = 100;

  for (let i = 0; i < hashes.length; i += batchSize) {
    const batch = hashes.slice(i, i + batchSize);
    const [dmmProblemKey, solution] = await generateTokenAndHash();

    const response = await dmmFetch("api/availability/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imdbId,
        hashes: batch,
        dmmProblemKey,
        solution,
      }),
    });

    if (!response.ok) {
      throw new Error(`DMM availability check failed: ${response.status}`);
    }

    const data: DmmAvailabilityResponse = await response.json();
    results.push(...data.available);
  }

  return results;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test -- tests/dmm-client.test.ts
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/lib/dmm-client.ts tests/dmm-client.test.ts
git commit -m "feat: implement DMM API client"
```

---

### Task 7: Torznab API Route

**Files:**
- Create: `server/routes/api.ts`
- Create: `tests/api.test.ts`

- [ ] **Step 1: Write the failing tests**

Write `tests/api.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all dependencies before importing the handler
vi.mock("../server/lib/dmm-client.js", () => ({
  searchMovies: vi.fn().mockResolvedValue([]),
  searchTv: vi.fn().mockResolvedValue([]),
  searchTitle: vi.fn().mockResolvedValue([]),
  checkAvailability: vi.fn().mockResolvedValue([]),
}));

import { handleTorznabRequest } from "../server/routes/api.js";
import { searchMovies, searchTv, searchTitle, checkAvailability } from "../server/lib/dmm-client.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handleTorznabRequest", () => {
  it("returns caps XML for t=caps", async () => {
    const result = await handleTorznabRequest({ t: "caps" });
    expect(result.contentType).toBe("application/xml");
    expect(result.body).toContain("<caps>");
    expect(result.body).toContain('<movie-search available="yes"');
  });

  it("returns error for missing t param", async () => {
    const result = await handleTorznabRequest({});
    expect(result.body).toContain('<error code="200"');
  });

  it("returns error for unsupported t param", async () => {
    const result = await handleTorznabRequest({ t: "unknown" });
    expect(result.body).toContain('<error code="202"');
  });

  it("searches movies by imdbid for t=movie", async () => {
    vi.mocked(searchMovies).mockResolvedValueOnce([
      { title: "Test.Movie.2024", fileSize: 1500, hash: "a".repeat(40) },
    ]);
    vi.mocked(checkAvailability).mockResolvedValueOnce([
      { hash: "a".repeat(40), files: [] },
    ]);

    const result = await handleTorznabRequest({ t: "movie", imdbid: "tt1234567" });
    expect(searchMovies).toHaveBeenCalledWith("tt1234567");
    expect(result.body).toContain("Test.Movie.2024");
    expect(result.body).toContain('<torznab:attr name="category" value="2000"');
  });

  it("searches TV by imdbid and season for t=tvsearch", async () => {
    vi.mocked(searchTv).mockResolvedValueOnce([
      { title: "Show.S02E05.720p", fileSize: 800, hash: "b".repeat(40) },
    ]);
    vi.mocked(checkAvailability).mockResolvedValueOnce([
      { hash: "b".repeat(40), files: [] },
    ]);

    const result = await handleTorznabRequest({
      t: "tvsearch",
      imdbid: "tt9999999",
      season: "2",
    });
    expect(searchTv).toHaveBeenCalledWith("tt9999999", "2");
    expect(result.body).toContain("Show.S02E05.720p");
    expect(result.body).toContain('<torznab:attr name="category" value="5000"');
  });

  it("filters by episode number when ep is provided", async () => {
    vi.mocked(searchTv).mockResolvedValueOnce([
      { title: "Show.S02E05.720p", fileSize: 800, hash: "b".repeat(40) },
      { title: "Show.S02E06.720p", fileSize: 800, hash: "c".repeat(40) },
      { title: "Show.S02.Complete.720p", fileSize: 8000, hash: "d".repeat(40) },
    ]);
    vi.mocked(checkAvailability).mockResolvedValueOnce([
      { hash: "b".repeat(40), files: [] },
      { hash: "c".repeat(40), files: [] },
      { hash: "d".repeat(40), files: [] },
    ]);

    const result = await handleTorznabRequest({
      t: "tvsearch",
      imdbid: "tt9999999",
      season: "2",
      ep: "5",
    });
    // Should include the specific episode and season packs (no episode number)
    expect(result.body).toContain("Show.S02E05.720p");
    expect(result.body).toContain("Show.S02.Complete.720p");
    // Should exclude E06
    expect(result.body).not.toContain("Show.S02E06.720p");
  });

  it("resolves text query via title search for t=search", async () => {
    vi.mocked(searchTitle).mockResolvedValueOnce([
      { id: "1", type: "movie", year: 2024, title: "Test Movie", imdbid: "tt5555555", score: 10, score_average: 8, searchTitle: "test movie" },
    ]);
    vi.mocked(searchMovies).mockResolvedValueOnce([
      { title: "Test.Movie.2024.1080p", fileSize: 2000, hash: "e".repeat(40) },
    ]);
    vi.mocked(checkAvailability).mockResolvedValueOnce([
      { hash: "e".repeat(40), files: [] },
    ]);

    const result = await handleTorznabRequest({ t: "search", q: "test movie" });
    expect(searchTitle).toHaveBeenCalledWith("test movie");
    expect(searchMovies).toHaveBeenCalledWith("tt5555555");
    expect(result.body).toContain("Test.Movie.2024.1080p");
  });

  it("uses tvsearch title result with type=show for t=tvsearch with q", async () => {
    vi.mocked(searchTitle).mockResolvedValueOnce([
      { id: "2", type: "show", year: 2020, title: "Test Show", imdbid: "tt7777777", score: 10, score_average: 8, searchTitle: "test show" },
    ]);
    vi.mocked(searchTv).mockResolvedValueOnce([]);
    vi.mocked(checkAvailability).mockResolvedValueOnce([]);

    await handleTorznabRequest({ t: "tvsearch", q: "test show", season: "1" });
    expect(searchTv).toHaveBeenCalledWith("tt7777777", "1");
  });

  it("returns empty results when title search finds nothing", async () => {
    vi.mocked(searchTitle).mockResolvedValueOnce([]);

    const result = await handleTorznabRequest({ t: "search", q: "nonexistent" });
    expect(result.body).not.toContain("<item>");
  });

  it("filters results to only RD-available hashes", async () => {
    vi.mocked(searchMovies).mockResolvedValueOnce([
      { title: "Available.Movie", fileSize: 1500, hash: "a".repeat(40) },
      { title: "Unavailable.Movie", fileSize: 2000, hash: "f".repeat(40) },
    ]);
    vi.mocked(checkAvailability).mockResolvedValueOnce([
      { hash: "a".repeat(40), files: [] },
    ]);

    const result = await handleTorznabRequest({ t: "movie", imdbid: "tt1234567" });
    expect(result.body).toContain("Available.Movie");
    expect(result.body).not.toContain("Unavailable.Movie");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test -- tests/api.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the API route handler**

Write `server/routes/api.ts`:

```ts
import { defineHandler } from "nitro/h3";
import { getQuery, setResponseHeader } from "nitro/h3";
import {
  searchMovies,
  searchTv,
  searchTitle,
  checkAvailability,
} from "../lib/dmm-client.js";
import {
  buildCapsXml,
  buildSearchResultsXml,
  buildErrorXml,
} from "../lib/torznab.js";
import type { TorznabItem, TorznabQuery, DmmSearchResult } from "../types.js";

// Episode pattern: S01E05, s01e05, S1E5, etc.
const EPISODE_REGEX = /[Ss]\d{1,2}[Ee](\d{1,3})/;

function filterByEpisode(
  results: DmmSearchResult[],
  episode: string
): DmmSearchResult[] {
  const epNum = parseInt(episode, 10);
  return results.filter((r) => {
    const match = r.title.match(EPISODE_REGEX);
    if (!match) return true; // season packs without episode numbers pass through
    return parseInt(match[1], 10) === epNum;
  });
}

function toTorznabItems(
  results: DmmSearchResult[],
  category: number
): TorznabItem[] {
  return results.map((r) => ({
    title: r.title,
    hash: r.hash.toLowerCase(),
    size: Math.round(r.fileSize * 1024 * 1024), // MB to bytes
    category,
    magnetUrl: `magnet:?xt=urn:btih:${r.hash.toLowerCase()}`,
  }));
}

interface TorznabResponse {
  contentType: string;
  body: string;
}

export async function handleTorznabRequest(
  query: Partial<TorznabQuery>
): Promise<TorznabResponse> {
  const xml = (body: string): TorznabResponse => ({
    contentType: "application/xml",
    body,
  });

  if (!query.t) {
    return xml(buildErrorXml(200, "Missing parameter: t"));
  }

  if (query.t === "caps") {
    return xml(buildCapsXml());
  }

  try {
    switch (query.t) {
      case "movie":
        return xml(await handleMovieSearch(query));
      case "tvsearch":
        return xml(await handleTvSearch(query));
      case "search":
        return xml(await handleGeneralSearch(query));
      default:
        return xml(buildErrorXml(202, `Unsupported function: ${query.t}`));
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return xml(buildErrorXml(100, message));
  }
}

async function handleMovieSearch(
  query: Partial<TorznabQuery>
): Promise<string> {
  let imdbId = query.imdbid;

  if (!imdbId && query.q) {
    imdbId = await resolveImdbId(query.q, "movie");
  }

  if (!imdbId) {
    return buildSearchResultsXml([]);
  }

  const results = await searchMovies(imdbId);
  const available = await filterAvailable(imdbId, results);
  return buildSearchResultsXml(toTorznabItems(available, 2000));
}

async function handleTvSearch(
  query: Partial<TorznabQuery>
): Promise<string> {
  let imdbId = query.imdbid;

  if (!imdbId && query.q) {
    imdbId = await resolveImdbId(query.q, "show");
  }

  if (!imdbId) {
    return buildSearchResultsXml([]);
  }

  const season = query.season || "1";
  let results = await searchTv(imdbId, season);

  if (query.ep) {
    results = filterByEpisode(results, query.ep);
  }

  const available = await filterAvailable(imdbId, results);
  return buildSearchResultsXml(toTorznabItems(available, 5000));
}

async function handleGeneralSearch(
  query: Partial<TorznabQuery>
): Promise<string> {
  if (!query.q) {
    return buildSearchResultsXml([]);
  }

  const titleResults = await searchTitle(query.q);
  if (titleResults.length === 0) {
    return buildSearchResultsXml([]);
  }

  const top = titleResults[0];

  if (top.type === "show") {
    const results = await searchTv(top.imdbid, query.season || "1");
    const available = await filterAvailable(top.imdbid, results);
    return buildSearchResultsXml(toTorznabItems(available, 5000));
  }

  const results = await searchMovies(top.imdbid);
  const available = await filterAvailable(top.imdbid, results);
  return buildSearchResultsXml(toTorznabItems(available, 2000));
}

async function resolveImdbId(
  query: string,
  preferType: string
): Promise<string | undefined> {
  const titleResults = await searchTitle(query);
  if (titleResults.length === 0) return undefined;

  // Prefer the type hint from the Torznab request
  const matched = titleResults.find((r) => r.type === preferType);
  return (matched || titleResults[0]).imdbid;
}

async function filterAvailable(
  imdbId: string,
  results: DmmSearchResult[]
): Promise<DmmSearchResult[]> {
  if (results.length === 0) return [];

  const hashes = results.map((r) => r.hash.toLowerCase());
  const available = await checkAvailability(imdbId, hashes);
  const availableSet = new Set(available.map((a) => a.hash.toLowerCase()));

  return results.filter((r) => availableSet.has(r.hash.toLowerCase()));
}

export default defineHandler(async (event) => {
  const query = getQuery(event) as Partial<TorznabQuery>;
  const result = await handleTorznabRequest(query);
  setResponseHeader(event, "Content-Type", result.contentType);
  return result.body;
});
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test -- tests/api.test.ts
```

Expected: all 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/routes/api.ts tests/api.test.ts
git commit -m "feat: implement Torznab API route"
```

---

### Task 8: Remove Health Check & Integration Test

**Files:**
- Delete: `server/routes/health.ts`
- Create: `tests/integration.test.ts`

- [ ] **Step 1: Delete the scaffolding health check**

```bash
rm server/routes/health.ts
```

- [ ] **Step 2: Write an integration test**

Write `tests/integration.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fetch globally for all DMM + RD API calls
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Reset module registry to get fresh imports with mocked fetch
beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("end-to-end Torznab flow", () => {
  it("caps request returns valid XML without any external calls", async () => {
    const { handleTorznabRequest } = await import("../server/routes/api.js");
    const result = await handleTorznabRequest({ t: "caps" });
    expect(result.contentType).toBe("application/xml");
    expect(result.body).toContain("<caps>");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("movie search flow: token gen → DMM search → availability → Torznab XML", async () => {
    // 1. RD time API (for token generation) - called twice (search + availability)
    // 2. DMM movie search
    // 3. DMM availability check
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve("2025-04-06T12:00:00.000Z"),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            results: [
              { title: "Movie.2024.1080p.BluRay", fileSize: 1500, hash: "a".repeat(40) },
              { title: "Movie.2024.720p.WEB", fileSize: 800, hash: "b".repeat(40) },
            ],
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            available: [{ hash: "a".repeat(40), files: [] }],
          }),
      });

    const { handleTorznabRequest } = await import("../server/routes/api.js");
    const result = await handleTorznabRequest({ t: "movie", imdbid: "tt1234567" });

    expect(result.contentType).toBe("application/xml");
    // Only the available movie should be in results
    expect(result.body).toContain("Movie.2024.1080p.BluRay");
    expect(result.body).not.toContain("Movie.2024.720p.WEB");
    expect(result.body).toContain('<torznab:attr name="category" value="2000"');
    expect(result.body).toContain(`magnet:?xt=urn:btih:${"a".repeat(40)}`);
  });
});
```

- [ ] **Step 3: Run all tests**

```bash
pnpm test
```

Expected: all tests across all files PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add integration tests, remove health check scaffold"
```

---

### Task 9: Manual Smoke Test with Prowlarr

This task is a manual verification step — no code changes.

- [ ] **Step 1: Create .env file**

```bash
cp .env.example .env
```

Edit `.env` and set your `RD_API_KEY` if desired (not required for basic search).

- [ ] **Step 2: Start the dev server**

```bash
pnpm dev
```

- [ ] **Step 3: Test caps endpoint**

```bash
curl http://localhost:3000/api?t=caps
```

Expected: XML with `<caps>`, `<searching>`, `<categories>`.

- [ ] **Step 4: Test a movie search**

```bash
curl "http://localhost:3000/api?t=movie&imdbid=tt1375666"
```

Expected: Torznab XML with `<item>` entries for Inception (if cached on RD via DMM's database), or empty `<channel>` if no results.

- [ ] **Step 5: Test a text search**

```bash
curl "http://localhost:3000/api?t=search&q=inception"
```

Expected: Same as above — title resolves to IMDb ID, then searches.

- [ ] **Step 6: Add to Prowlarr**

In Prowlarr UI:
1. Settings → Indexers → Add → Generic Torznab
2. URL: `http://localhost:3000`
3. API Path: `/api`
4. Categories: 2000 (Movies), 5000 (TV)
5. Test the connection

Expected: Prowlarr shows a successful connection test.
