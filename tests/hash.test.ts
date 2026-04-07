import { describe, it, expect } from "vitest";
import { generateHash, combineHashes } from "../server/lib/hash.js";

describe("generateHash", () => {
  it("produces a hex string", () => {
    const result = generateHash("test-input");
    expect(result).toMatch(/^[0-9a-f]+$/);
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
  it("is deterministic", () => {
    const a = generateHash("hash-a");
    const b = generateHash("hash-b");
    expect(combineHashes(a, b)).toBe(combineHashes(a, b));
  });

  it("interleaves first halves then appends reversed secondPart2 + reversed secondPart1", () => {
    // DMM source: obfuscated += reversed(secondPart2) + reversed(secondPart1)
    const result = combineHashes("abcdefgh", "12345678");
    // halfLength=4, firstPart1="abcd", secondPart1="efgh", firstPart2="1234", secondPart2="5678"
    // interleaved: a1b2c3d4
    // reversed secondPart2: 8765, reversed secondPart1: hgfe
    expect(result).toBe("a1b2c3d48765hgfe");
  });
});
