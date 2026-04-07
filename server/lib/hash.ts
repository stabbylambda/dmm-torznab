/**
 * DMM's custom non-cryptographic hash function.
 * Ported from debrid-media-manager src/utils/token.ts.
 */
export function generateHash(str: string): string {
  let hash1 = 0xdeadbeef ^ str.length;
  let hash2 = 0x41c6ce57 ^ str.length;

  for (let i = 0; i < str.length; i++) {
    const charCode = str.charCodeAt(i);
    hash1 = Math.imul(hash1 ^ charCode, 2654435761);
    hash2 = Math.imul(hash2 ^ charCode, 1597334677);
    hash1 = (hash1 << 5) | (hash1 >>> 27); // Rotate left
    hash2 = (hash2 << 5) | (hash2 >>> 27); // Rotate left
  }

  hash1 = (hash1 + Math.imul(hash2, 1566083941)) | 0;
  hash2 = (hash2 + Math.imul(hash1, 2024237689)) | 0;

  return ((hash1 ^ hash2) >>> 0).toString(16);
}

/**
 * Combines two hash strings by interleaving first halves
 * and appending reversed second halves.
 * Ported from debrid-media-manager src/utils/token.ts.
 */
export function combineHashes(hash1: string, hash2: string): string {
  const halfLength = Math.floor(hash1.length / 2);
  const firstPart1 = hash1.slice(0, halfLength);
  const secondPart1 = hash1.slice(halfLength);
  const firstPart2 = hash2.slice(0, halfLength);
  const secondPart2 = hash2.slice(halfLength);

  let obfuscated = "";
  for (let i = 0; i < halfLength; i++) {
    obfuscated += firstPart1[i]! + firstPart2[i]!;
  }

  obfuscated +=
    secondPart2.split("").reverse().join("") +
    secondPart1.split("").reverse().join("");

  return obfuscated;
}
