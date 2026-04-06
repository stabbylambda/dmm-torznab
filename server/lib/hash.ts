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
