import type { Check, CheckContext, Finding } from '../../core/types.js';

/** UCP manifest + MCP endpoint connectivity: the Actionable category. */
export const endpointsCheck: Check = {
  id: 'agent-endpoints',
  category: 'actionable',
  title: 'Agent connectivity (MCP / UCP)',
  async run(ctx: CheckContext): Promise<Finding[]> {
    const now = ctx.now();
    const findings: Finding[] = [];

    const mcp = await ctx.fetch('/api/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    const validJsonRpc = mcp.body.includes('"jsonrpc"') && mcp.body.includes('"tools"');
    findings.push({
      id: 'mcp-endpoint',
      category: 'actionable',
      tags: ['findable'],
      title: 'Storefront MCP endpoint',
      status: validJsonRpc ? 'pass' : 'info',
      narrative: validJsonRpc
        ? 'Your store answers the storefront MCP protocol, so an AI assistant can search your catalogue and read product details directly.'
        : 'No valid MCP response at the standard path. On eligible Shopify stores this is usually present; absence may mean ineligibility or a non-standard setup.',
      evidence: { status: mcp.status, validJsonRpc, sample: mcp.body.slice(0, 160) },
      caveat: 'Connectivity verified; this does not prove a full checkout completes.',
      references: ['https://shopify.dev/docs/agents'],
      fetchedAt: now,
    });

    const ucp = await ctx.fetch('/.well-known/ucp');
    findings.push({
      id: 'ucp-manifest',
      category: 'actionable',
      tags: [],
      title: 'UCP manifest',
      status: ucp.status === 200 ? 'pass' : 'info',
      narrative: ucp.status === 200
        ? 'A Universal Commerce Protocol manifest is published, the discovery surface agents use to learn how to transact with your store.'
        : 'No UCP manifest at /.well-known/ucp. Native agentic checkout is currently gated to US-selling stores, so UK and other stores commonly lack this while still being discoverable.',
      evidence: { status: ucp.status },
      caveat: 'Connectivity and presence only; not proof that agentic checkout is enabled or complete.',
      references: ['https://ucp.dev/'],
      fetchedAt: now,
    });

    return findings;
  },
};
