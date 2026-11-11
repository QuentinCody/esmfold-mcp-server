import { afterEach, describe, expect, it, vi } from "vitest";
import { createEsmfoldApiFetch, parsePdbSummary } from "./api-adapter";

afterEach(() => vi.unstubAllGlobals());

it("routes bulk discovery and rejects writes before fetching", async () => {
	const fetcher = vi.fn().mockImplementation(() => Promise.resolve(new Response("https://dl.fbaipublicfiles.com/esmatlas/v0/highquality_clust30/foldseekdb/highquality_clust30.dbtype\n")));
	vi.stubGlobal("fetch", fetcher);
	const api = createEsmfoldApiFetch();
	const request = { path: "/atlas/bulk/manifest", params: { release: "v0", selection: "highquality_clust30", artifact: "foldseek" } };
	expect(await api({ ...request, method: "GET" })).toMatchObject({ status: 200, data: { total_count: 1 } });
	await expect(api({ ...request, method: "POST" })).rejects.toThrow("requires GET");
	expect(fetcher).toHaveBeenCalledTimes(1);
});

it("preserves summary and raw PDB row envelopes and rejects empty bodies", async () => {
	const pdb = "SEQRES   1 A    3  MET GLY LYS";
	vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(new Response(pdb))));
	const api = createEsmfoldApiFetch();
	const summary = await api({ method: "GET", path: "/atlas/sequence/MGYP1" });
	expect(summary.data).toMatchObject({ results: [{ atlas_id: "MGYP1", sequence: "MGK", length: 3, model_version: null, plddt_mean: null, source: { body_bytes: pdb.length } }] });
	expect((await api({ method: "GET", path: "/atlas/structure/MGYP1" })).data).toMatchObject({ results: [{ pdb_text: pdb, pdb_bytes: pdb.length }] });
	vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(" ")));
	await expect(api({ method: "GET", path: "/atlas/sequence/MGYP1" })).rejects.toMatchObject({ status: 502 });
});

describe("parsePdbSummary", () => {
	it("derives a sequence from CA atoms when an Atlas PDB omits SEQRES", () => {
		const pdb = [
			"TITLE     ESMFOLD V0 PREDICTION FOR MGYP002537940442",
			"ATOM      1 N    GLY A   1     -32.687 -14.011  15.587  1.00  0.59          N   ",
			"ATOM      2 CA   GLY A   1     -31.934 -14.270  16.804  1.00  0.58          C   ",
			"ATOM      3 C    GLY A   1     -32.792 -14.803  17.935  1.00  0.59          C   ",
			"ATOM      4 CA   GLU A   2     -33.500 -16.602  19.133  1.00  0.55          C   ",
		].join("\n");

		expect(parsePdbSummary({ atlasId: "MGYP002537940442", pdb })).toMatchObject({
			atlas_id: "MGYP002537940442",
			sequence: "GE",
			length: 2,
			model_version: "V0",
		});
	});

	it("prefers explicit SEQRES records when they are present", () => {
		const pdb = [
			"SEQRES   1 A    3  MET GLY LYS",
			"ATOM      1 CA   ALA A   1       0.000   0.000   0.000  1.00 80.00          C   ",
		].join("\n");

		expect(parsePdbSummary({ atlasId: "MGYP_TEST", pdb })).toMatchObject({
			sequence: "MGK",
			length: 3,
		});
	});
});
