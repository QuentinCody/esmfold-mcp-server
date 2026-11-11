import { afterEach, expect, it, vi } from "vitest";
import { getBulkManifest } from "./bulk";

afterEach(() => vi.unstubAllGlobals());
const selection = { release: "v2023_02", selection: "full", artifact: "embeddings" };
const artifact = "https://dl.fbaipublicfiles.com/esmatlas/v2023_02/full/lm_reps/tm_.40_.50_plddt_.40_.50_00.npz";

it("reads the documented embeddings manifest without downloading an artifact", async () => {
  const text = `${artifact}\r\n\r\n`;
  const fetcher = vi.fn().mockResolvedValue(new Response(text, { headers: { etag: '"version"' } }));
  vi.stubGlobal("fetch", fetcher);
  const result = await getBulkManifest(selection);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toBe("https://raw.githubusercontent.com/facebookresearch/esm/main/scripts/atlas/v2023_02/full/esm2_embeddings.txt");
  expect(result).toMatchObject({ ...selection, total_count: 1, etag: '"version"',
    manifest_text: text, manifest_bytes: new TextEncoder().encode(text).byteLength,
    // Golden SHA-256 computed independently with Python hashlib over the CRLF fixture.
    manifest_text_sha256: "02bbcaf9ef8b94f159bf75e02a6ad505c3139fb44e418bf9f6d6126a1f3c9059",
    data: [{ ...selection, url: artifact, filename: "tm_.40_.50_plddt_.40_.50_00.npz" }] });
});

it.each([
  { release: "v2026", selection: "full", artifact: "structures" },
  { release: "v2023_02", selection: "highquality_clust30", artifact: "foldseek" },
  { release: "v0", selection: "highquality_clust30", artifact: "embeddings" },
  { ...selection, unexpected: "ignored?" }, undefined,
])("rejects unsupported or missing selection %j before fetching", async params => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  await expect(getBulkManifest(params)).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});

it.each([
  ["", 200], ["unavailable", 404], ["redirect", 302], ["<html>not a manifest</html>", 200],
  ["https://example.org/file.npz", 200],
  [artifact.replace("v2023_02", "v0"), 200],
  [`${artifact}?redirect=elsewhere`, 200],
  ["x".repeat(1_000_001), 200],
  [artifact, 206],
])("fails on malformed/unavailable/oversized provider responses", async (text, status) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(text, { status })));
  await expect(getBulkManifest(selection)).rejects.toThrow();
});

it("keeps Foldseek companion files rather than filtering to only database payloads", async () => {
  const url = "https://dl.fbaipublicfiles.com/esmatlas/v0/highquality_clust30/foldseekdb/highquality_clust30";
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(`${url}\n${url}.dbtype\n${url}.index\n`)));
  expect(await getBulkManifest({ release: "v0", selection: "highquality_clust30", artifact: "foldseek" })).toMatchObject({ total_count: 3 });
});
