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
  parentCategory: number; // Newznab parent category (2000=Movies, 5000=TV)
  category: number; // Newznab subcategory (e.g. 2040=Movies/HD, 5045=TV/UHD)
  magnetUrl: string;
}
