import type { TorznabItem } from "../types.js";

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function buildCapsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<caps>
  <server title="DMM Indexer"/>
  <searching>
    <search available="yes" supportedParams="q,imdbid"/>
    <tv-search available="yes" supportedParams="q,season,ep,imdbid"/>
    <movie-search available="yes" supportedParams="q,imdbid"/>
  </searching>
  <categories>
    <category id="2000" name="Movies">
      <subcat id="2030" name="Movies/SD"/>
      <subcat id="2040" name="Movies/HD"/>
      <subcat id="2045" name="Movies/UHD"/>
    </category>
    <category id="5000" name="TV">
      <subcat id="5030" name="TV/SD"/>
      <subcat id="5040" name="TV/HD"/>
      <subcat id="5045" name="TV/UHD"/>
    </category>
  </categories>
</caps>`;
}

export function buildSearchResultsXml(items: TorznabItem[]): string {
  const now = new Date().toUTCString();

  const itemsXml = items
    .map(
      (item) => `    <item>
      <title>${escapeXml(item.title)}</title>
      <guid>${escapeXml(item.magnetUrl)}</guid>
      <pubDate>${now}</pubDate>
      <size>${item.size}</size>
      <link>${escapeXml(item.magnetUrl)}</link>
      <enclosure url="${escapeXml(item.magnetUrl)}" length="${item.size}" type="application/x-bittorrent"/>
      <torznab:attr name="category" value="${item.category}"/>
      <torznab:attr name="seeders" value="1"/>
      <torznab:attr name="peers" value="1"/>
      <torznab:attr name="infohash" value="${item.hash}"/>
      <torznab:attr name="magneturl" value="${escapeXml(item.magnetUrl)}"/>
      <torznab:attr name="downloadvolumefactor" value="0"/>
      <torznab:attr name="uploadvolumefactor" value="1"/>
    </item>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:torznab="http://torznab.com/schemas/2015/feed">
  <channel>
    <title>DMM Indexer</title>
    <description>Debrid Media Manager Torznab Indexer</description>
    <link>https://github.com/stabbylambda/dmm-torznab</link>
    <language>en-us</language>
    <category>search</category>
${itemsXml}
  </channel>
</rss>`;
}

export function buildErrorXml(code: number, description: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<error code="${code}" description="${escapeXml(description)}"/>`;
}
