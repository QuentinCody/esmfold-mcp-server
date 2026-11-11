import { afterEach, expect, it, vi } from "vitest";
import { createEsmfoldApiFetch } from "./api-adapter";
afterEach(() => vi.unstubAllGlobals());
const api = createEsmfoldApiFetch();
const pdb = "REMARK    fixture α😀\nSEQRES   1 A    3  MET GLY LYS\n";

it.each([
  { method: "POST", path: "/atlas/about" },
  { method: "GET", path: "/atlas/about", body: {} },
  { method: "GET", path: "/atlas/sequence/MGYP1", params: { ignored: 1 } },
  { method: "GET", path: "/atlas/search", params: { atlas_id: "MGYP1", ignored: 1 } },
  { method: "GET", path: "/atlas/search", params: { atlas_id: ["MGYP1"] } },
  { method: "GET", path: "/atlas/search", params: { atlas_id: "MGYP1?x=1" } },
  { method: "GET", path: "/atlas/structure/MGYP1/../../about" },
  { method: "GET", path: "/atlas/structure/MGYP1.pdb" },
  { method: "GET", path: "https://example.org" },
])("rejects unsupported requests before fetching %j", async request => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  await expect(api(request)).rejects.toThrow(); expect(fetcher).not.toHaveBeenCalled();
});

it.each(["<html>Service unavailable</html>", '{"error":"unavailable"}', "\n", "TITLE     ERROR"])("rejects a non-PDB success while preserving its body", async text => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(text)));
  await expect(api({ method: "GET", path: "/atlas/sequence/MGYP1" })).rejects.toMatchObject({ status: 502, data: { text } });
});

it("retains UTF-8 PDB bytes and source identity, and resolves search through the same route", async () => {
  const fetcher = vi.fn().mockImplementation(() => Promise.resolve(new Response(pdb)));
  vi.stubGlobal("fetch", fetcher);
  const result = await api({ method: "GET", path: "/atlas/structure/MGYP1" });
  expect(result.data).toMatchObject({ results: [{ pdb_text: pdb, pdb_bytes: new TextEncoder().encode(pdb).byteLength,
    sequence: "MGK", source: { source_url: "https://api.esmatlas.com/fetchPredictedStructure/MGYP1.pdb" } }] });
  expect((await api({ method: "GET", path: "/atlas/search", params: { atlas_id: "MGYP1" } })).data).toMatchObject({ results: [{ sequence: "MGK" }] });
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("preserves About HTML and rejects its native HTTP failures", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("<html>Atlas</html>"))
    .mockResolvedValueOnce(new Response("Native failure", { status: 503 })));
  expect((await api({ method: "GET", path: "/atlas/about" })).data).toMatchObject({ body: "<html>Atlas</html>" });
  await expect(api({ method: "GET", path: "/atlas/about" })).rejects.toMatchObject({ status: 503, data: { text: "Native failure" } });
});

it("keeps live folding explicitly unavailable", async () => {
  await expect(api({ method: "POST", path: "/foldSequence/v1/pdb/", body: "AAA" })).rejects.toMatchObject({ status: 501 });
});
