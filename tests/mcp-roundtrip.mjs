// Reality test: drives the MCP server exactly as a real client (Claude Desktop,
// ChatGPT) would, over stdio. Proves initialize -> tools/list -> tools/call works.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const domain = process.argv[2] ?? 'kyliecosmetics.com';

const transport = new StdioClientTransport({
  command: 'npx',
  args: ['tsx', 'src/mcp.ts'],
});
const client = new Client({ name: 'reality-test', version: '1.0.0' });
await client.connect(transport);

console.log('CONNECTED. Tools advertised:');
const { tools } = await client.listTools();
for (const t of tools) console.log(`  - ${t.name}: ${t.description.slice(0, 70)}...`);

console.log(`\nCalling audit_store({ domain: "${domain}", sample: 4 }) ...\n`);
const res = await client.callTool({ name: 'audit_store', arguments: { domain, sample: 4 } });

console.log('=== TEXT CONTENT (what the assistant reads) ===');
console.log(res.content[0].text.slice(0, 900));
console.log('\n=== STRUCTURED CONTENT (category rollups) ===');
console.log(JSON.stringify(res.structuredContent.categories, null, 2));
console.log(`\nfindings in structuredContent: ${res.structuredContent.findings.length}`);

await client.close();
