import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function main() {
  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['-y', 'mcp-remote', 'https://mcp.usepylon.com']
  });
  const client = new Client({ name: 'test', version: '1.0.0' }, { capabilities: {} });
  await client.connect(transport);
  const tools = await client.listTools();
  const updateIssue = tools.tools.find(t => t.name === 'update_issue');
  console.log(JSON.stringify(updateIssue, null, 2));
  await client.close();
}
main().catch(console.error);
