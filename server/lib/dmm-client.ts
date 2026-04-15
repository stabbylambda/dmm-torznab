import { generateTokenAndHash } from "./dmm-token.js";
import { getCached, setCached } from "./cache.js";
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

const DMM_HEADERS: Record<string, string> = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
  "Referer": "https://debridmediamanager.com/",
  "Accept": "application/json, text/plain, */*",
};

async function dmmFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = { ...DMM_HEADERS, ...(init.headers as Record<string, string> || {}) };
  return fetch(`${DMM_API_URL}/${path}`, { ...init, headers });
}

export async function searchMovies(
  imdbId: string
): Promise<DmmSearchResult[]> {
  const cacheKey = `movie:${imdbId}`;
  const cached = getCached<DmmSearchResult[]>(cacheKey);
  if (cached) return cached;

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
    setCached(cacheKey, []);
    return [];
  }

  if (!response.ok) {
    throw new Error(`DMM movie search failed: ${response.status}`);
  }

  const data: DmmSearchResponse = await response.json();
  setCached(cacheKey, data.results);
  return data.results;
}

export async function searchTv(
  imdbId: string,
  seasonNum: string
): Promise<DmmSearchResult[]> {
  const cacheKey = `tv:${imdbId}:${seasonNum}`;
  const cached = getCached<DmmSearchResult[]>(cacheKey);
  if (cached) return cached;

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
    setCached(cacheKey, []);
    return [];
  }

  if (!response.ok) {
    throw new Error(`DMM TV search failed: ${response.status}`);
  }

  const data: DmmSearchResponse = await response.json();
  setCached(cacheKey, data.results);
  return data.results;
}

export async function searchTitle(
  keyword: string
): Promise<DmmTitleResult[]> {
  const cacheKey = `title:${keyword}`;
  const cached = getCached<DmmTitleResult[]>(cacheKey);
  if (cached) return cached;

  const params = new URLSearchParams({ keyword });
  const response = await dmmFetch(`api/search/title?${params}`);

  if (!response.ok) {
    throw new Error(`DMM title search failed: ${response.status}`);
  }

  const data: DmmTitleSearchResponse = await response.json();
  setCached(cacheKey, data.results);
  return data.results;
}

export async function checkAvailability(
  imdbId: string,
  hashes: string[]
): Promise<DmmAvailabilityResult[]> {
  const sortedKey = [...hashes].sort().join(",");
  const cacheKey = `avail:${imdbId}:${sortedKey}`;
  const cached = getCached<DmmAvailabilityResult[]>(cacheKey);
  if (cached) return cached;

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

  setCached(cacheKey, results);
  return results;
}
