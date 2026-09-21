import assert from "node:assert/strict";

/** @param {string} html */
export function scriptSources(html) {
  const sources = [...html.matchAll(/<script\b[^>]*>/gi)].flatMap(([tag]) => {
    const match = tag.match(/\ssrc\s*=\s*(?:"([^"]+)"|'([^']+)')/i);
    return match ? [(match[1] ?? match[2]).replaceAll("&amp;", "&")] : [];
  });
  return [...new Set(sources)];
}

/**
 * Audit the actual HTML references, never the files of a potentially newer build.
 * request() must enforce same-origin URLs, timeouts and HTTP 200 responses.
 * @param {string} html
 * @param {(path: string) => Promise<{ bytes: Uint8Array, type: string }>} request
 */
export async function checkJavaScriptAssets(html, request) {
  const sources = scriptSources(html);
  assert(sources.length > 0, "Page has no external JavaScript references");
  for (const source of sources) {
    const { bytes, type } = await request(source);
    assert(/^(?:text|application)\/(?:javascript|ecmascript)(?:\s*;|\s*$)/i.test(type), `${source}: expected JavaScript, received ${type}`);
    assert(bytes.length > 0, `${source}: empty JavaScript response`);
  }
  return sources.length;
}
