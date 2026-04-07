import { generateHash, combineHashes } from "./hash.js";

const SALT = "debridmediamanager.com%%fe7#td00rA3vHz%VmI";

let cachedTimestamp: number | null = null;
let cachedTimestampAt = 0;
const TIMESTAMP_CACHE_MS = 10_000;

function generateRandomToken(): string {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return array[0]!.toString(16);
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
