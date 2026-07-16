import { getMcpClient } from "./client";

interface ResolvedTools {
  search?: string;
}

const resolvedByBaseUrl = new Map<string, ResolvedTools>();

async function resolveTools(baseUrl: string): Promise<ResolvedTools> {
  const cached = resolvedByBaseUrl.get(baseUrl);
  if (cached) return cached;

  const client = await getMcpClient("linear", baseUrl);
  const { tools } = await client.listTools();
  // Usually linear mcp has a search tool, or 'linear_search_issues' etc.
  const search = tools.find((tool) => /search/i.test(tool.name))?.name;

  const resolved: ResolvedTools = { search };
  resolvedByBaseUrl.set(baseUrl, resolved);
  return resolved;
}

export interface LinearResult {
  text: string;
  ok: boolean;
}

export async function searchLinear(baseUrl: string, query: string): Promise<LinearResult> {
  try {
    const { search } = await resolveTools(baseUrl);
    if (!search) return { text: "", ok: false };

    const client = await getMcpClient("linear", baseUrl);
    const result = await client.callTool({ name: search, arguments: { query, limit: 5 } });
    const blocks = (result.content ?? []) as Array<{ type: string; text?: string }>;
    const text = blocks
      .filter((block) => block.type === "text" && block.text)
      .map((block) => block.text)
      .join("\n\n");
    return { text, ok: true };
  } catch (err) {
    console.error("Linear search failed, continuing without grounding:", err);
    return { text: "", ok: false };
  }
}
