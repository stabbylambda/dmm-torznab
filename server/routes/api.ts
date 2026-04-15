import { defineHandler } from "nitro/h3";
import { getQuery } from "nitro/h3";
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
import type { TorznabQuery, DmmSearchResult } from "../types.js";

// Prowlarr sends IMDb IDs without the "tt" prefix
function normalizeImdbId(id: string): string {
  if (/^\d+$/.test(id)) return `tt${id}`;
  return id;
}

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
    return parseInt(match[1]!, 10) === epNum;
  });
}

// Newznab subcategories by resolution
// Movies: 2030=SD, 2040=HD, 2045=UHD
// TV:     5030=SD, 5040=HD, 5045=UHD
function resolveCategory(title: string, baseCategory: number): number {
  const t = title.toLowerCase();
  if (/2160p|4k|uhd/i.test(t)) return baseCategory + 45;
  if (/1080p|720p|bluray|blu-ray/i.test(t)) return baseCategory + 40;
  return baseCategory + 30; // SD fallback
}

function toTorznabItems(
  results: DmmSearchResult[],
  baseCategory: number
) {
  return results.map((r) => ({
    title: r.title,
    hash: r.hash.toLowerCase(),
    size: Math.round(r.fileSize * 1024 * 1024), // MB to bytes
    parentCategory: baseCategory,
    category: resolveCategory(r.title, baseCategory),
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
    console.error(`[ERR] ${message}`);
    // Return empty results instead of error XML for transient failures
    // (rate limits, timeouts). Error XML causes Prowlarr to disable the indexer.
    return xml(buildSearchResultsXml([]));
  }
}

async function handleMovieSearch(
  query: Partial<TorznabQuery>
): Promise<string> {
  let imdbId = query.imdbid ? normalizeImdbId(query.imdbid) : undefined;

  if (!imdbId) {
    // Radarr/Sonarr send bare t=movie as a connection test.
    // Fall back to a known title so we return at least one result.
    const keyword = query.q || "Inception";
    imdbId = await resolveImdbId(keyword, "movie");
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
  let imdbId = query.imdbid ? normalizeImdbId(query.imdbid) : undefined;

  if (!imdbId) {
    // Sonarr sends bare t=tvsearch as a connection test.
    // Fall back to a known title so we return at least one result.
    const keyword = query.q || "Breaking Bad";
    imdbId = await resolveImdbId(keyword, "show");
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
  // Radarr/Sonarr sometimes send t=search with imdbid instead of t=movie
  if (query.imdbid) {
    const imdbId = normalizeImdbId(query.imdbid);
    if (query.season) {
      const results = await searchTv(imdbId, query.season);
      if (query.ep) {
        const filtered = filterByEpisode(results, query.ep);
        const available = await filterAvailable(imdbId, filtered);
        return buildSearchResultsXml(toTorznabItems(available, 5000));
      }
      const available = await filterAvailable(imdbId, results);
      return buildSearchResultsXml(toTorznabItems(available, 5000));
    }
    // No season provided — try both movie and TV to determine the right category
    const [movieResults, tvResults] = await Promise.all([
      searchMovies(imdbId),
      searchTv(imdbId, "1"),
    ]);
    const [movieAvail, tvAvail] = await Promise.all([
      filterAvailable(imdbId, movieResults),
      filterAvailable(imdbId, tvResults),
    ]);
    return buildSearchResultsXml([
      ...toTorznabItems(movieAvail, 2000),
      ...toTorznabItems(tvAvail, 5000),
    ]);
  }

  // Prowlarr sends bare ?t=search with no query as a connection test.
  // Fall back to a known title so we return at least one result.
  const searchQuery = query.q || "Inception";

  const titleResults = await searchTitle(searchQuery);
  if (titleResults.length === 0) {
    return buildSearchResultsXml([]);
  }

  const top = titleResults[0]!;

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

  const matched = titleResults.find((r) => r.type === preferType);
  return (matched ?? titleResults[0])!.imdbid;
}

async function filterAvailable(
  imdbId: string,
  results: DmmSearchResult[]
): Promise<DmmSearchResult[]> {
  const hashes = results.map((r) => r.hash.toLowerCase());
  const available = await checkAvailability(imdbId, hashes);
  const availableSet = new Set(available.map((a) => a.hash.toLowerCase()));

  return results.filter((r) => availableSet.has(r.hash.toLowerCase()));
}

export default defineHandler(async (event) => {
  const query = getQuery(event) as Partial<TorznabQuery>;
  const start = Date.now();

  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v != null) params.set(k, String(v));
  }

  console.log(`[REQ] /api?${params}`);

  const result = await handleTorznabRequest(query);
  const ms = Date.now() - start;

  const isError = result.body.includes("<error");
  const itemCount = (result.body.match(/<item>/g) || []).length;
  console.log(`[RES] /api?${params} → ${isError ? "ERROR" : `${itemCount} results`} (${ms}ms)`);

  return new Response(result.body, {
    headers: { "Content-Type": result.contentType },
  });
});
