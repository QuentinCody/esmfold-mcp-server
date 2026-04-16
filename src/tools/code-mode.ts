import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createSearchTool } from "@bio-mcp/shared/codemode/search-tool";
import { createExecuteTool } from "@bio-mcp/shared/codemode/execute-tool";
import { esmfoldCatalog } from "../spec/catalog";
import { createEsmfoldApiFetch } from "../lib/api-adapter";

interface CodeModeEnv {
	ESMFOLD_DATA_DO: DurableObjectNamespace;
	CODE_MODE_LOADER: WorkerLoader;
}

export function registerCodeMode(server: McpServer, env: CodeModeEnv): void {
	const apiFetch = createEsmfoldApiFetch();

	const searchTool = createSearchTool({
		prefix: "esmfold",
		catalog: esmfoldCatalog,
	});
	searchTool.register(server as unknown as { tool: (...args: unknown[]) => void });

	const executeTool = createExecuteTool({
		prefix: "esmfold",
		catalog: esmfoldCatalog,
		apiFetch,
		doNamespace: env.ESMFOLD_DATA_DO,
		loader: env.CODE_MODE_LOADER,
	});
	executeTool.register(server as unknown as { tool: (...args: unknown[]) => void });
}
