import type { McpServer } from "@bio-mcp/shared/mcp";
import { createSearchTool } from "@bio-mcp/shared/codemode/search-tool";
import { createExecuteTool } from "@bio-mcp/shared/codemode/execute-tool";
import { esmfoldCatalog } from "../spec/catalog";
import { createEsmfoldApiFetch } from "../lib/api-adapter";
import { esmfoldResponse, ESMFOLD_SOURCE } from "../lib/tool-result";

interface CodeModeEnv {
	ESMFOLD_DATA_DO: DurableObjectNamespace;
	CODE_MODE_LOADER: WorkerLoader;
}

export function registerCodeMode(server: McpServer, env: CodeModeEnv): void {
	const apiFetch = createEsmfoldApiFetch();
	const registrar = { tool: (...args: unknown[]) => {
		const [name, ...rest] = args;
		const register = server.tool.bind(server) as (...values: unknown[]) => void;
		const handler = rest.pop() as (input: unknown, extra: unknown) => ReturnType<typeof esmfoldResponse>;
		for (const alias of [String(name), `mcp_${String(name)}`]) register(alias, ...rest,
			(input: unknown, extra: unknown) => esmfoldResponse(() => handler(input, extra), env, alias, extra, input));
	} };

	const searchTool = createSearchTool({
		prefix: "esmfold",
		catalog: esmfoldCatalog,
	});
	searchTool.register(registrar);

	const executeTool = createExecuteTool({
		prefix: "esmfold",
		// Verifiable provenance: esmfold_execute results carry a _meta.citation.
		source: ESMFOLD_SOURCE,
		catalog: esmfoldCatalog,
		apiFetch,
		preserveApiErrors: true,
		maxInlineBytes: 30 * 1024,
		stagingThreshold: 30 * 1024,
		timeout: 90_000,
		doNamespace: env.ESMFOLD_DATA_DO,
		loader: env.CODE_MODE_LOADER,
	});
	executeTool.register(registrar);
}
