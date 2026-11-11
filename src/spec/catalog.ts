import type { ApiCatalog } from "@bio-mcp/shared/codemode/catalog";

/**
 * ESM Atlas catalog. ATLAS-ONLY — no live folding endpoints in this server.
 * Live structure prediction (`POST /foldSequence/v1/pdb/`) is variable 5–60s
 * and exceeds the 30s Worker CPU budget. It is deferred to a future Workflow-
 * based plan (see docs/plans/2026-04-16-life-science-expansion.md §13.1 and
 * docs/adr/ADR-005-workflow-async-mcp-servers.md).
 *
 * The clean paths in this catalog are mapped to the actual ESM Atlas API
 * URLs by `src/lib/api-adapter.ts`.
 */
export const esmfoldCatalog: ApiCatalog = {
	name: "ESM Metagenomic Atlas (precomputed)",
	baseUrl: "https://api.esmatlas.com",
	version: "unversioned API; explicit bulk archive labels",
	auth: "none",
	endpointCount: 5,
	notes:
		"- ATLAS-ONLY: this server returns precomputed structures from the ESM Metagenomic Atlas.\n" +
		"- LIVE FOLDING IS NOT EXPOSED. POST /foldSequence/v1/pdb/ is intentionally absent — sequence-prediction\n" +
		"  jobs can take 5–60+ seconds and don't fit in the 30s Worker CPU budget. They will be added in a\n" +
		"  follow-up plan that wires Cloudflare Workflows for async/long-running endpoints.\n" +
		"- ID convention: MGnify accessions (e.g. MGYP002537940442, the Atlas documentation sample).\n" +
		"- /atlas/structure/{id} returns PDB text (large strings stay as TEXT in staging — schema-inference v2).\n" +
		"- Reads require GET without a body and documented parameters. Complete HTTP 200 bodies only; source URLs, byte counts and SHA-256 are retained. Reads are capped at 8MiB (manifests 1MB) with a 30-second deadline.\n" +
		"- /atlas/sequence/{id} derives a summary from PDB SEQRES or modeled CA atoms; it is not native Atlas metadata and may omit unmodeled residues. plddt_mean averages atom B factors, retaining the provider scale.\n" +
		"- /atlas/bulk/manifest discovers provider URL lists: explicit v0/v2023_02 release, full/highquality_clust30 selection, structures/foldseek/embeddings artifact. It downloads no binaries and runs no compute.\n" +
		"- v0 highquality_clust30 supports structures and Foldseek only. Absence from this subset is not absence from Atlas. Preserve the manifest hash and release with downstream results.\n" +
		"- Bulk metadata and compute instructions: https://github.com/facebookresearch/esm/blob/main/scripts/atlas/README.md . Download outside Code Mode. CRC64 sequenceChecksum is a candidate lookup, not sequence-identity proof. These resources do not establish a new 2026 release.",
	endpoints: [
		{
			method: "GET",
			path: "/atlas/structure/{atlas_id}",
			summary:
				"Fetch the precomputed PDB text for an Atlas structure (mapped to /fetchPredictedStructure/{id}.pdb)",
			category: "atlas",
			pathParams: [
				{
					name: "atlas_id",
					type: "string",
					required: true,
					description:
						"MGnify accession (e.g. MGYP002537940442) for a precomputed Atlas structure",
				},
			],
		},
		{
			method: "GET",
			path: "/atlas/sequence/{atlas_id}",
			summary:
				"Derive a compact summary from an Atlas PDB (sequence, length, atom B-factor mean and TITLE model version); not native bulk metadata",
			category: "atlas",
			pathParams: [
				{
					name: "atlas_id",
					type: "string",
					required: true,
					description: "MGnify accession for a precomputed Atlas entry",
				},
			],
		},
		{
			method: "GET",
			path: "/atlas/search",
			summary:
				"Resolve an Atlas accession to a PDB-derived summary. This is identifier lookup, not sequence-similarity search. Discover Foldseek bulk files via /atlas/bulk/manifest for separate local compute.",
			category: "atlas",
			queryParams: [
				{
					name: "atlas_id",
					type: "string",
					required: true,
					description:
						"MGnify accession to resolve. Currently this returns the same record as /atlas/sequence/{id}.",
				},
			],
		},
		{
			method: "GET",
			path: "/atlas/about",
			summary:
				"Fetch raw Atlas About page HTML in {url, body}; does not extract release metadata or entry counts.",
			category: "atlas",
		},
		{
			method: "GET",
			path: "/atlas/bulk/manifest",
			summary: "Read a versioned provider URL manifest for structure archives, Foldseek companion files or ESM2 embeddings; local compute/download discovery only",
			category: "bulk",
			queryParams: [
				{ name: "release", type: "string", required: true, description: "v0 or v2023_02 (documented archives, not an assertion of the latest release)" },
				{ name: "selection", type: "string", required: true, description: "full or highquality_clust30; the latter is a v0 confidence-filtered clustered subset" },
				{ name: "artifact", type: "string", required: true, description: "structures, foldseek or embeddings; embeddings requires full selection" },
			],
		},
	],
};
