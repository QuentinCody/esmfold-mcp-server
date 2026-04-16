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
	version: "v1",
	auth: "none",
	endpointCount: 4,
	notes:
		"- ATLAS-ONLY: this server returns precomputed structures from the ESM Metagenomic Atlas (~617M predictions).\n" +
		"- LIVE FOLDING IS NOT EXPOSED. POST /foldSequence/v1/pdb/ is intentionally absent — sequence-prediction\n" +
		"  jobs can take 5–60+ seconds and don't fit in the 30s Worker CPU budget. They will be added in a\n" +
		"  follow-up plan that wires Cloudflare Workflows for async/long-running endpoints.\n" +
		"- ID convention: MGnify accessions (e.g. MGYP000912776285).\n" +
		"- /atlas/structure/{id} returns PDB text (large strings stay as TEXT in staging — schema-inference v2).\n" +
		"- /atlas/sequence/{id} returns the JSON metadata record (sequence, length, plddt, model_version, etc.).",
	endpoints: [
		{
			method: "GET",
			path: "/atlas/structure/{atlas_id}",
			summary: "Fetch the precomputed PDB text for an Atlas structure (mapped to /fetchPredictedStructure/{id}.pdb)",
			category: "atlas",
			pathParams: [
				{
					name: "atlas_id",
					type: "string",
					required: true,
					description: "MGnify accession (e.g. MGYP000912776285) for a precomputed Atlas structure",
				},
			],
		},
		{
			method: "GET",
			path: "/atlas/sequence/{atlas_id}",
			summary: "Fetch the JSON metadata record for an Atlas entry (sequence, length, plddt, model_version)",
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
				"Resolve an Atlas accession to its metadata record. Synchronous Atlas lookup only — for sequence-similarity search use the deferred Foldseek async endpoint (not in this server).",
			category: "atlas",
			queryParams: [
				{
					name: "atlas_id",
					type: "string",
					required: true,
					description: "MGnify accession to resolve. Currently this returns the same record as /atlas/sequence/{id}.",
				},
			],
		},
		{
			method: "GET",
			path: "/atlas/about",
			summary: "Fetch the Atlas About page metadata (release notes, build version, total entries).",
			category: "atlas",
		},
	],
};
