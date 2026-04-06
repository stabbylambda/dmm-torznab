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
