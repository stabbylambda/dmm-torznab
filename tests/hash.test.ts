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
    const result = combineHashes("abcdefgh", "12345678");
    expect(result).toBe("a1b2c3d4hgfe8765");
  });
});
