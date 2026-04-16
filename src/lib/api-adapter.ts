import type { ApiFetchFn } from "@bio-mcp/shared/codemode/catalog";
import { esmfoldFetch, ESMFOLD_BASE } from "./http";

/**
 * Map clean catalog paths onto the actual ESM Atlas REST URLs.
 *
 *   /atlas/structure/{id}  →  /fetchPredictedStructure/{id}.pdb     (PDB text)
 *   /atlas/sequence/{id}   →  /fetchPredictedStructure/{id}         (JSON record)
 *   /atlas/search          →  /fetchPredictedStructure/{atlas_id}   (resolves the accession)
 *   /atlas/about           →  https://esmatlas.com/api/about         (Atlas web metadata)
 *
 * Live folding (`POST /foldSequence/v1/pdb/`) is intentionally NOT routed —
 * the catalog does not advertise it and the api-adapter returns 501 if asked.
 */
export function createEsmfoldApiFetch(): ApiFetchFn {
	return async (request) => {
		let path = request.path;
		const params = request.params;

		if (path.startsWith("/atlas/structure/")) {
			const id = path.replace("/atlas/structure/", "");
			path = `/fetchPredictedStructure/${id}.pdb`;
		} else if (path.startsWith("/atlas/sequence/")) {
			const id = path.replace("/atlas/sequence/", "");
			path = `/fetchPredictedStructure/${id}`;
		} else if (path === "/atlas/search") {
			const id = (params?.atlas_id as string | undefined) ?? "";
			if (!id) {
				const err = new Error("/atlas/search requires the atlas_id query param") as Error & {
					status: number;
				};
				err.status = 400;
				throw err;
			}
			path = `/fetchPredictedStructure/${id}`;
		} else if (path === "/atlas/about") {
			// Atlas about page lives on the web host, not the api host
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
		if (!contentType.includes("json")) {
			const text = await response.text();
			return { status: response.status, data: text };
		}
		const data = await response.json();
		return { status: response.status, data };
	};
}
