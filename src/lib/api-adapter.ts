import type { ApiFetchFn } from "@bio-mcp/shared/codemode/catalog";
import { esmfoldFetch, ESMFOLD_BASE } from "./http";

/**
 * Map clean catalog paths onto the actual ESM Atlas REST URLs.
 *
 *   /atlas/structure/{id}  → /fetchPredictedStructure/{id}.pdb  (PDB text)
 *   /atlas/sequence/{id}   → /fetchPredictedStructure/{id}.pdb  (PDB text, parsed
 *                             here into { atlas_id, sequence, length, model })
 *   /atlas/search          → /fetchPredictedStructure/{atlas_id} (resolves the
 *                             accession; returns whatever upstream serves)
 *   /atlas/about           → https://esmatlas.com/about         (web metadata)
 *
 * Upstream has NO dedicated JSON-metadata route for precomputed entries —
 * `/fetchPredictedStructure/{id}` (with or without `.pdb`) returns PDB text
 * both ways. /atlas/sequence/ therefore downloads the PDB and parses out the
 * 1-letter sequence from SEQRES records so callers get a compact JSON shape
 * instead of a duplicate PDB blob.
 *
 * Live folding (`POST /foldSequence/v1/pdb/`) is intentionally NOT routed —
 * the catalog does not advertise it and this adapter returns 501 if asked.
 */

/** Minimal three-letter → one-letter amino acid table for SEQRES parsing. */
const AA3_TO_AA1: Record<string, string> = {
	ALA: "A", ARG: "R", ASN: "N", ASP: "D", CYS: "C",
	GLN: "Q", GLU: "E", GLY: "G", HIS: "H", ILE: "I",
	LEU: "L", LYS: "K", MET: "M", PHE: "F", PRO: "P",
	SER: "S", THR: "T", TRP: "W", TYR: "Y", VAL: "V",
	SEC: "U", PYL: "O",
};

/**
 * Parse a PDB text blob into { sequence, length, model_version, plddt_mean? }.
 * Falls back to empty fields when SEQRES is missing.
 */
function parsePdbSummary(atlasId: string, pdb: string): {
	atlas_id: string;
	sequence: string;
	length: number;
	model_version: string | null;
	plddt_mean: number | null;
} {
	const chainSeqs = new Map<string, string[]>();
	const plddts: number[] = [];
	let modelVersion: string | null = null;

	for (const line of pdb.split(/\r?\n/)) {
		if (line.startsWith("SEQRES")) {
			const chain = line[11] ?? "A";
			const residues = line.slice(19).trim().split(/\s+/);
			const existing = chainSeqs.get(chain) ?? [];
			for (const r of residues) {
				const aa = AA3_TO_AA1[r.toUpperCase()];
				if (aa) existing.push(aa);
			}
			chainSeqs.set(chain, existing);
		} else if (line.startsWith("TITLE") && !modelVersion) {
			const match = line.match(/ESM[\w.-]*\s+([\w.-]+)/i);
			if (match) modelVersion = match[1];
		} else if (line.startsWith("ATOM") && line.length >= 66) {
			const b = Number.parseFloat(line.slice(60, 66));
			if (Number.isFinite(b)) plddts.push(b);
		}
	}

	const sequence = Array.from(chainSeqs.values())
		.map((chars) => chars.join(""))
		.join("");
	const pLddtMean = plddts.length > 0
		? plddts.reduce((a, b) => a + b, 0) / plddts.length
		: null;

	return {
		atlas_id: atlasId,
		sequence,
		length: sequence.length,
		model_version: modelVersion,
		plddt_mean: pLddtMean != null ? Math.round(pLddtMean * 100) / 100 : null,
	};
}

export function createEsmfoldApiFetch(): ApiFetchFn {
	return async (request) => {
		let path = request.path;
		const params = request.params;
		let summariseSequence = false;
		let sequenceAtlasId = "";
		let structureAtlasId = "";

		if (path.startsWith("/atlas/structure/")) {
			structureAtlasId = path.replace("/atlas/structure/", "");
			path = `/fetchPredictedStructure/${structureAtlasId}.pdb`;
		} else if (path.startsWith("/atlas/sequence/")) {
			sequenceAtlasId = path.replace("/atlas/sequence/", "");
			summariseSequence = true;
			path = `/fetchPredictedStructure/${sequenceAtlasId}.pdb`;
		} else if (path === "/atlas/search") {
			const id = (params?.atlas_id as string | undefined) ?? "";
			if (!id) {
				const err = new Error("/atlas/search requires the atlas_id query param") as Error & {
					status: number;
				};
				err.status = 400;
				throw err;
			}
			sequenceAtlasId = id;
			summariseSequence = true;
			path = `/fetchPredictedStructure/${id}.pdb`;
		} else if (path === "/atlas/about") {
			const response = await fetch("https://esmatlas.com/about", {
				headers: { Accept: "text/html" },
			});
			const text = await response.text();
			return { status: response.status, data: { url: "https://esmatlas.com/about", body: text } };
		} else if (path === "/foldSequence/v1/pdb/" || path.startsWith("/foldSequence/")) {
			const err = new Error(
				"Live folding is out of scope for this server. POST /foldSequence/v1/pdb/ is deferred to the future Workflow-async plan (see docs/adr/ADR-005). Use precomputed Atlas endpoints only.",
			) as Error & { status: number };
			err.status = 501;
			throw err;
		}

		const response = await esmfoldFetch(path, params, { baseUrl: ESMFOLD_BASE });

		if (!response.ok) {
			let errorBody: string;
			try {
				errorBody = await response.text();
			} catch {
				errorBody = response.statusText;
			}
			const error = new Error(`HTTP ${response.status}: ${errorBody.slice(0, 200)}`) as Error & {
				status: number;
				data: unknown;
			};
			error.status = response.status;
			error.data = errorBody;
			throw error;
		}

		const contentType = response.headers.get("content-type") || "";

		if (summariseSequence) {
			const pdbText = await response.text();
			if (!pdbText || pdbText.trim().length === 0) {
				const err = new Error(`ESM Atlas returned an empty body for ${sequenceAtlasId}`) as Error & {
					status: number;
				};
				err.status = 404;
				throw err;
			}
			// Wrap in a one-element array under `results` so the staging engine's
			// detectArrays() finds a tabular shape and produces the
			// atlas_structures table (with DO schema hints applied).
			return {
				status: response.status,
				data: { results: [parsePdbSummary(sequenceAtlasId, pdbText)] },
			};
		}

		if (structureAtlasId) {
			// Wrap raw PDB text in a columnar envelope under `results` so the
			// staging engine creates a real `atlas_structures` table instead of
			// a chunked blob.
			const pdbText = await response.text();
			if (!pdbText || pdbText.trim().length === 0) {
				const err = new Error(`ESM Atlas returned an empty body for ${structureAtlasId}`) as Error & {
					status: number;
				};
				err.status = 404;
				throw err;
			}
			const summary = parsePdbSummary(structureAtlasId, pdbText);
			return {
				status: response.status,
				data: {
					results: [{
						...summary,
						pdb_text: pdbText,
						pdb_bytes: pdbText.length,
					}],
				},
			};
		}

		if (!contentType.includes("json")) {
			const text = await response.text();
			return { status: response.status, data: text };
		}
		const data = await response.json();
		return { status: response.status, data };
	};
}
