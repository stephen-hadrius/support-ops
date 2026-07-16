import { getMcpClient } from "./client";

interface ResolvedTools {
  search?: string;
}

const resolvedByBaseUrl = new Map<string, ResolvedTools>();

/**
 * Notion's hosted MCP server doesn't publish fixed tool names in its docs,
 * so we discover the search-capable tool at runtime instead of hardcoding a guess.
 */
async function resolveTools(baseUrl: string): Promise<ResolvedTools> {
  const cached = resolvedByBaseUrl.get(baseUrl);
  if (cached) return cached;

  const client = await getMcpClient("notion", baseUrl);
  const { tools } = await client.listTools();
  const search = tools.find((tool) => /search/i.test(tool.name))?.name;

  const resolved: ResolvedTools = { search };
  resolvedByBaseUrl.set(baseUrl, resolved);
  return resolved;
}

export interface KnowledgeResult {
  /** Matching Notion content as plain text; empty when nothing matched or the search failed. */
  text: string;
  /** False when the search itself failed (disconnected, no search tool, upstream error). */
  ok: boolean;
}

/** Searches everything shared with the Notion integration. Failures are non-fatal but reported via `ok`. */
export async function searchKnowledge(baseUrl: string, query: string): Promise<KnowledgeResult> {
  try {
    const { search } = await resolveTools(baseUrl);
    if (!search) return { text: "", ok: false };

    const client = await getMcpClient("notion", baseUrl);
    const result = await client.callTool({ name: search, arguments: { query, page_size: 5 } });
    const blocks = (result.content ?? []) as Array<{ type: string; text?: string }>;
    const text = blocks
      .filter((block) => block.type === "text" && block.text)
      .map((block) => block.text)
      .join("\n\n");
    return { text, ok: true };
  } catch (err) {
    console.error("Notion search failed, continuing without grounding:", err);
    return { text: "", ok: false };
  }
}
