import type { ApiFetchFn } from "@bio-mcp/shared/codemode/catalog";
import { getBulkManifest } from "./bulk";
import { ESMFOLD_BASE, ESMFOLD_WEB_BASE, readAtlasText, rejectAtlasResponse } from "./http";

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
	ALA: "A",
	ARG: "R",
	ASN: "N",
	ASP: "D",
	CYS: "C",
	GLN: "Q",
	GLU: "E",
	GLY: "G",
	HIS: "H",
	ILE: "I",
	LEU: "L",
	LYS: "K",
	MET: "M",
	PHE: "F",
	PRO: "P",
	SER: "S",
	THR: "T",
	TRP: "W",
	TYR: "Y",
	VAL: "V",
	SEC: "U",
	PYL: "O",
};

interface AtomResidue {
	key: string;
	aminoAcid: string;
}

function recordAtomResidue(line: string, chains: Map<string, AtomResidue[]>): void {
	if (line.slice(12, 16).trim() !== "CA") return;

	const aminoAcid = AA3_TO_AA1[line.slice(17, 20).trim().toUpperCase()];
	if (!aminoAcid) return;

	const chain = line[21] ?? "A";
	const residueKey = line.slice(22, 27).trim();
	const residues = chains.get(chain) ?? [];
	if (residues[residues.length - 1]?.key === residueKey) return;

	residues.push({ key: residueKey, aminoAcid });
	chains.set(chain, residues);
}

function sequenceFromSeqres(chains: Map<string, string[]>): string {
	return Array.from(chains.values())
		.map((chars) => chars.join(""))
		.join("");
}

function sequenceFromAtoms(chains: Map<string, AtomResidue[]>): string {
	return Array.from(chains.values())
		.map((residues) => residues.map(({ aminoAcid }) => aminoAcid).join(""))
		.join("");
}

/**
 * Parse a PDB text blob into { sequence, length, model_version, plddt_mean? }.
 * Falls back to empty fields when SEQRES is missing.
 */
interface ParsePdbSummaryInput {
	atlasId: string;
	pdb: string;
}

interface PdbSummary {
	atlas_id: string;
	sequence: string;
	length: number;
	model_version: string | null;
	plddt_mean: number | null;
}

export function parsePdbSummary({ atlasId, pdb }: ParsePdbSummaryInput): PdbSummary {
	const chainSeqs = new Map<string, string[]>();
	const atomChainSeqs = new Map<string, AtomResidue[]>();
	const plddts: number[] = [];
	let modelVersion: string | null = null;

	for (const line of pdb.replace(/^\uFEFF/, "").split(/\r?\n/)) {
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
			// ESM Atlas PDBs do not consistently include SEQRES. A CA atom is
			// present per modeled residue; this fallback may omit unmodeled residues.
			recordAtomResidue(line, atomChainSeqs);
			const b = Number.parseFloat(line.slice(60, 66));
			if (Number.isFinite(b)) plddts.push(b);
		}
	}

	const sequence = sequenceFromSeqres(chainSeqs) || sequenceFromAtoms(atomChainSeqs);
	const pLddtMean = plddts.length > 0 ? plddts.reduce((a, b) => a + b, 0) / plddts.length : null;

	return {
		atlas_id: atlasId,
		sequence,
		length: sequence.length,
		model_version: modelVersion,
		plddt_mean: pLddtMean != null ? Math.round(pLddtMean * 100) / 100 : null,
	};
}

function atlasId(value: unknown): string {
  if (typeof value !== "string" || !/^MGYP[0-9]+$/.test(value)) throw new Error("A single MGYP accession is required");
  return value;
}

async function structureResponse(id: string, includePdb: boolean): ReturnType<ApiFetchFn> {
  const evidence = await readAtlasText(`${ESMFOLD_BASE}/fetchPredictedStructure/${id}.pdb`);
  const pdb = evidence.text;
  if (/html|json|xml/i.test(evidence.content_type) || !/^(?:ATOM  |SEQRES )/m.test(pdb.replace(/^\uFEFF/, ""))) {
    rejectAtlasResponse("ESM Atlas did not return a PDB with sequence or atom records", evidence);
  }
  const summary = parsePdbSummary({ atlasId: id, pdb });
  if (!summary.sequence) rejectAtlasResponse("ESM Atlas PDB has no supported sequence records", evidence);
  const { text: _text, ...source } = evidence;
  return { status: evidence.status, data: { results: [{ ...summary, source,
    interpretation: "PDB-derived summary; sequence may omit unmodeled residues. plddt_mean is an atom-weighted B-factor mean on the source scale, not native bulk metadata or sequence-identity proof.",
    ...(includePdb ? { pdb_text: pdb, pdb_bytes: evidence.body_bytes } : {}),
  }] } };
}

export function createEsmfoldApiFetch(): ApiFetchFn {
  return async (request) => {
    if (request.path.startsWith("/foldSequence/")) {
      throw Object.assign(new Error("Live folding is out of scope; use precomputed Atlas endpoints."), { status: 501 });
    }
    if (request.method !== "GET" || request.body !== undefined) throw new Error("ESM Atlas requires GET without a body");
    if (request.path === "/atlas/bulk/manifest") return { status: 200, data: await getBulkManifest(request.params) };
    const params = request.params ?? {};
    if (request.path === "/atlas/search") {
      if (Object.keys(params).some(key => key !== "atlas_id")) throw new Error("Atlas lookup accepts only atlas_id");
      return structureResponse(atlasId(params.atlas_id), false);
    }
    if (Object.keys(params).length) throw new Error("This Atlas route has no query parameters");
    if (request.path === "/atlas/about") {
      const { text, source_url, ...source } = await readAtlasText(`${ESMFOLD_WEB_BASE}/about`);
      return { status: source.status, data: { url: source_url, body: text, source: { ...source, source_url } } };
    }
    const match = /^\/atlas\/(structure|sequence)\/([^/]+)$/.exec(request.path);
    if (!match) throw new Error("Unsupported precomputed Atlas route");
    return structureResponse(atlasId(match[2]), match[1] === "structure");
  };
}
