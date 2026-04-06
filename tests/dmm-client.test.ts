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
