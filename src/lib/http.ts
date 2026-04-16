import { restFetch } from "@bio-mcp/shared/http/rest-fetch";
import type { RestFetchOptions } from "@bio-mcp/shared/http/rest-fetch";

const ESMFOLD_BASE = "https://api.esmatlas.com";
const ESMFOLD_WEB_BASE = "https://esmatlas.com";

export interface EsmfoldFetchOptions extends Omit<RestFetchOptions, "retryOn"> {
	baseUrl?: string;
}

/**
 * Fetch from the ESM Atlas API. Defaults to JSON Accept; PDB endpoints accept text.
 */
export async function esmfoldFetch(
	path: string,
	params?: Record<string, unknown>,
	opts?: EsmfoldFetchOptions,
): Promise<Response> {
	const baseUrl = opts?.baseUrl ?? ESMFOLD_BASE;
	const headers: Record<string, string> = {
		Accept: "application/json, text/plain;q=0.8",
		...(opts?.headers ?? {}),
	};
	return restFetch(baseUrl, path, params, {
		...opts,
		headers,
		retryOn: [429, 500, 502, 503],
		retries: opts?.retries ?? 3,
		timeout: opts?.timeout ?? 30_000,
		userAgent: "esmfold-mcp-server/0.1 (bio-mcp)",
	});
}

export { ESMFOLD_BASE, ESMFOLD_WEB_BASE };
