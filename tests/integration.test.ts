import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fetch globally for all DMM + RD API calls
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Reset module registry to get fresh imports with mocked fetch
beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("end-to-end Torznab flow", () => {
  it("caps request returns valid XML without any external calls", async () => {
    const { handleTorznabRequest } = await import("../server/routes/api.js");
    const result = await handleTorznabRequest({ t: "caps" });
    expect(result.contentType).toBe("application/xml");
    expect(result.body).toContain("<caps>");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("movie search flow: token gen → DMM search → availability → Torznab XML", async () => {
    // 1. RD time API (for token generation) - called twice (search + availability)
    // 2. DMM movie search
    // 3. DMM availability check
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve("2025-04-06T12:00:00.000Z"),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            results: [
              { title: "Movie.2024.1080p.BluRay", fileSize: 1500, hash: "a".repeat(40) },
              { title: "Movie.2024.720p.WEB", fileSize: 800, hash: "b".repeat(40) },
            ],
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            available: [{ hash: "a".repeat(40), files: [] }],
          }),
      });

    const { handleTorznabRequest } = await import("../server/routes/api.js");
    const result = await handleTorznabRequest({ t: "movie", imdbid: "tt1234567" });

    expect(result.contentType).toBe("application/xml");
    // Only the available movie should be in results
    expect(result.body).toContain("Movie.2024.1080p.BluRay");
    expect(result.body).not.toContain("Movie.2024.720p.WEB");
    expect(result.body).toContain('<torznab:attr name="category" value="2000"');
    expect(result.body).toContain(`magnet:?xt=urn:btih:${"a".repeat(40)}`);
  });
});
