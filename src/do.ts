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
		const hasAtlasShape =
			typeof obj.sequence === "string" ||
			typeof obj.plddt === "number" ||
			typeof obj.model_version === "string" ||
			typeof obj.length === "number";
		if (hasAtlasShape) {
			return {
				tableName: "atlas_structures",
				indexes: ["model_version", "length"].filter((k) => k in obj),
			};
		}
		if (Array.isArray(data) && data.length > 0) {
			const sample = data[0];
			if (sample && typeof sample === "object" && "sequence" in (sample as Record<string, unknown>)) {
				return { tableName: "atlas_structures", indexes: ["model_version", "length"] };
			}
		}
		return undefined;
	}
}
