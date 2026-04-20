import { RestStagingDO } from "@bio-mcp/shared/staging/rest-staging-do";
import type { SchemaHints } from "@bio-mcp/shared/staging/schema-inference";

/**
 * ESM Atlas staging DO. Atlas responses are either:
 *   - JSON metadata records (sequence, length, plddt, model_version, ...)
 *   - PDB text (large strings — kept as TEXT per schema-inference v2)
 *
 * Per-record schema hint: store under `atlas_structures` with the metadata
 * columns indexed; the PDB text stays as a single TEXT column.
 */
export class EsmfoldDataDO extends RestStagingDO {
	protected getSchemaHints(data: unknown): SchemaHints | undefined {
		if (!data || typeof data !== "object") return undefined;
		const obj = data as Record<string, unknown>;

		// Inspect the rows under the envelope (wrapped `results: [...]` or bare object)
		const candidateSample = Array.isArray(obj.results) && obj.results.length > 0
			? (obj.results[0] as Record<string, unknown>)
			: obj;

		const hasAtlasShape =
			typeof candidateSample.atlas_id === "string" ||
			typeof candidateSample.sequence === "string" ||
			typeof candidateSample.pdb_text === "string" ||
			typeof candidateSample.plddt_mean === "number" ||
			typeof candidateSample.model_version === "string";

		if (hasAtlasShape) {
			return {
				tableName: "atlas_structures",
				// `pdb_text` stays TEXT (schema-inference v2 keeps large strings as TEXT).
				columnTypes: {
					atlas_id: "TEXT",
					sequence: "TEXT",
					pdb_text: "TEXT",
					length: "INTEGER",
					pdb_bytes: "INTEGER",
					plddt_mean: "REAL",
					model_version: "TEXT",
				},
				indexes: ["atlas_id", "length", "model_version"].filter((k) => k in candidateSample),
			};
		}

		if (Array.isArray(data) && data.length > 0) {
			const sample = data[0];
			if (sample && typeof sample === "object" && "sequence" in (sample as Record<string, unknown>)) {
				return { tableName: "atlas_structures", indexes: ["atlas_id", "length", "model_version"] };
			}
		}
		return undefined;
	}
}
