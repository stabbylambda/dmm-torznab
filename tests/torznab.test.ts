import { describe, it, expect } from "vitest";
import {
  buildCapsXml,
  buildSearchResultsXml,
  buildErrorXml,
} from "../server/lib/torznab.js";
import type { TorznabItem } from "../server/types.js";

describe("buildCapsXml", () => {
  it("returns valid caps XML with search capabilities", () => {
    const xml = buildCapsXml();
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain("<caps>");
    expect(xml).toContain('<server title="DMM Indexer"');
    expect(xml).toContain('<search available="yes"');
    expect(xml).toContain('supportedParams="q,imdbid"');
    expect(xml).toContain('<tv-search available="yes"');
    expect(xml).toContain('supportedParams="q,season,ep,imdbid"');
    expect(xml).toContain('<movie-search available="yes"');
    expect(xml).toContain('supportedParams="q,imdbid"');
    expect(xml).toContain('<category id="2000" name="Movies"');
    expect(xml).toContain('<category id="5000" name="TV"');
  });
});

describe("buildSearchResultsXml", () => {
  it("returns empty channel for no results", () => {
    const xml = buildSearchResultsXml([]);
    expect(xml).toContain("<channel>");
    expect(xml).not.toContain("<item>");
  });

  it("maps a TorznabItem to proper XML item", () => {
    const items: TorznabItem[] = [
      {
        title: "Test.Movie.2024.1080p",
        hash: "abc123def456abc123def456abc123def456abc1",
        size: 4294967296,
        category: 2000,
        magnetUrl:
          "magnet:?xt=urn:btih:abc123def456abc123def456abc123def456abc1",
      },
    ];
    const xml = buildSearchResultsXml(items);
    expect(xml).toContain("<title>Test.Movie.2024.1080p</title>");
    expect(xml).toContain("<size>4294967296</size>");
    expect(xml).toContain(
      'url="magnet:?xt=urn:btih:abc123def456abc123def456abc123def456abc1"'
    );
    expect(xml).toContain(
      '<torznab:attr name="category" value="2000"/>'
    );
    expect(xml).toContain(
      '<torznab:attr name="infohash" value="abc123def456abc123def456abc123def456abc1"/>'
    );
    expect(xml).toContain(
      '<torznab:attr name="downloadvolumefactor" value="0"/>'
    );
  });

  it("escapes XML special characters in title", () => {
    const items: TorznabItem[] = [
      {
        title: 'Movie <Special> & "Quoted"',
        hash: "abc123def456abc123def456abc123def456abc1",
        size: 1000,
        category: 2000,
        magnetUrl:
          "magnet:?xt=urn:btih:abc123def456abc123def456abc123def456abc1",
      },
    ];
    const xml = buildSearchResultsXml(items);
    expect(xml).toContain(
      "Movie &lt;Special&gt; &amp; &quot;Quoted&quot;"
    );
  });
});

describe("buildErrorXml", () => {
  it("returns torznab error XML", () => {
    const xml = buildErrorXml(100, "Something went wrong");
    expect(xml).toContain('<error code="100"');
    expect(xml).toContain('description="Something went wrong"');
  });
});
