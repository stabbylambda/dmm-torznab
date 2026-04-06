import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all dependencies before importing the handler
vi.mock("../server/lib/dmm-client.js", () => ({
  searchMovies: vi.fn().mockResolvedValue([]),
  searchTv: vi.fn().mockResolvedValue([]),
  searchTitle: vi.fn().mockResolvedValue([]),
  checkAvailability: vi.fn().mockResolvedValue([]),
}));

import { handleTorznabRequest } from "../server/routes/api.js";
import { searchMovies, searchTv, searchTitle, checkAvailability } from "../server/lib/dmm-client.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handleTorznabRequest", () => {
  it("returns caps XML for t=caps", async () => {
    const result = await handleTorznabRequest({ t: "caps" });
    expect(result.contentType).toBe("application/xml");
    expect(result.body).toContain("<caps>");
    expect(result.body).toContain('<movie-search available="yes"');
  });

  it("returns error for missing t param", async () => {
    const result = await handleTorznabRequest({});
    expect(result.body).toContain('<error code="200"');
  });

  it("returns error for unsupported t param", async () => {
    const result = await handleTorznabRequest({ t: "unknown" });
    expect(result.body).toContain('<error code="202"');
  });

  it("searches movies by imdbid for t=movie", async () => {
    vi.mocked(searchMovies).mockResolvedValueOnce([
      { title: "Test.Movie.2024", fileSize: 1500, hash: "a".repeat(40) },
    ]);
    vi.mocked(checkAvailability).mockResolvedValueOnce([
      { hash: "a".repeat(40), files: [] },
    ]);

    const result = await handleTorznabRequest({ t: "movie", imdbid: "tt1234567" });
    expect(searchMovies).toHaveBeenCalledWith("tt1234567");
    expect(result.body).toContain("Test.Movie.2024");
    expect(result.body).toContain('<torznab:attr name="category" value="2000"');
  });

  it("searches TV by imdbid and season for t=tvsearch", async () => {
    vi.mocked(searchTv).mockResolvedValueOnce([
      { title: "Show.S02E05.720p", fileSize: 800, hash: "b".repeat(40) },
    ]);
    vi.mocked(checkAvailability).mockResolvedValueOnce([
      { hash: "b".repeat(40), files: [] },
    ]);

    const result = await handleTorznabRequest({
      t: "tvsearch",
      imdbid: "tt9999999",
      season: "2",
    });
    expect(searchTv).toHaveBeenCalledWith("tt9999999", "2");
    expect(result.body).toContain("Show.S02E05.720p");
    expect(result.body).toContain('<torznab:attr name="category" value="5000"');
  });

  it("filters by episode number when ep is provided", async () => {
    vi.mocked(searchTv).mockResolvedValueOnce([
      { title: "Show.S02E05.720p", fileSize: 800, hash: "b".repeat(40) },
      { title: "Show.S02E06.720p", fileSize: 800, hash: "c".repeat(40) },
      { title: "Show.S02.Complete.720p", fileSize: 8000, hash: "d".repeat(40) },
    ]);
    vi.mocked(checkAvailability).mockResolvedValueOnce([
      { hash: "b".repeat(40), files: [] },
      { hash: "c".repeat(40), files: [] },
      { hash: "d".repeat(40), files: [] },
    ]);

    const result = await handleTorznabRequest({
      t: "tvsearch",
      imdbid: "tt9999999",
      season: "2",
      ep: "5",
    });
    expect(result.body).toContain("Show.S02E05.720p");
    expect(result.body).toContain("Show.S02.Complete.720p");
    expect(result.body).not.toContain("Show.S02E06.720p");
  });

  it("resolves text query via title search for t=search", async () => {
    vi.mocked(searchTitle).mockResolvedValueOnce([
      { id: "1", type: "movie", year: 2024, title: "Test Movie", imdbid: "tt5555555", score: 10, score_average: 8, searchTitle: "test movie" },
    ]);
    vi.mocked(searchMovies).mockResolvedValueOnce([
      { title: "Test.Movie.2024.1080p", fileSize: 2000, hash: "e".repeat(40) },
    ]);
    vi.mocked(checkAvailability).mockResolvedValueOnce([
      { hash: "e".repeat(40), files: [] },
    ]);

    const result = await handleTorznabRequest({ t: "search", q: "test movie" });
    expect(searchTitle).toHaveBeenCalledWith("test movie");
    expect(searchMovies).toHaveBeenCalledWith("tt5555555");
    expect(result.body).toContain("Test.Movie.2024.1080p");
  });

  it("uses tvsearch title result with type=show for t=tvsearch with q", async () => {
    vi.mocked(searchTitle).mockResolvedValueOnce([
      { id: "2", type: "show", year: 2020, title: "Test Show", imdbid: "tt7777777", score: 10, score_average: 8, searchTitle: "test show" },
    ]);
    vi.mocked(searchTv).mockResolvedValueOnce([]);
    vi.mocked(checkAvailability).mockResolvedValueOnce([]);

    await handleTorznabRequest({ t: "tvsearch", q: "test show", season: "1" });
    expect(searchTv).toHaveBeenCalledWith("tt7777777", "1");
  });

  it("returns empty results when title search finds nothing", async () => {
    vi.mocked(searchTitle).mockResolvedValueOnce([]);

    const result = await handleTorznabRequest({ t: "search", q: "nonexistent" });
    expect(result.body).not.toContain("<item>");
  });

  it("filters results to only RD-available hashes", async () => {
    vi.mocked(searchMovies).mockResolvedValueOnce([
      { title: "Available.Movie", fileSize: 1500, hash: "a".repeat(40) },
      { title: "Unavailable.Movie", fileSize: 2000, hash: "f".repeat(40) },
    ]);
    vi.mocked(checkAvailability).mockResolvedValueOnce([
      { hash: "a".repeat(40), files: [] },
    ]);

    const result = await handleTorznabRequest({ t: "movie", imdbid: "tt1234567" });
    expect(result.body).toContain("Available.Movie");
    expect(result.body).not.toContain("Unavailable.Movie");
  });
});
