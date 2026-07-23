import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const t = new StdioClientTransport({ command: 'node', args: [process.env.HOME + '/Projects/storefront-agent-audit/dist/mcp.js'] });
const c = new Client({ name: 'dist-check', version: '1.0.0' });
await c.connect(t);
const { tools } = await c.listTools();
console.log('BUILT BINARY WORKS. Tool advertised:', tools[0].name);
await c.close();
