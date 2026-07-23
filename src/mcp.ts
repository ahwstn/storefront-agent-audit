#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { runAudit } from './core/engine.js';
import { renderAgent } from './render/index.js';
import type { AuditReport } from './core/types.js';

/**
 * MCP server: a fifth renderer on the same findings model. One tool, audit_store.
 * The readable agent-markdown goes in text content (what a model reads); a LEAN
 * structured projection goes in structuredContent (heavy per-page evidence is
 * dropped so we do not bloat the caller's context). stdout stays MCP-only; any
 * diagnostics go to stderr.
 */

const server = new McpServer({ name: 'storefront-agent-audit', version: '0.1.0' });

const findingSchema = {
  id: z.string(),
  category: z.string(),
  status: z.string(),
  title: z.string(),
  narrative: z.string(),
  remediation: z.string().optional(),
};

server.registerTool(
  'audit_store',
  {
    title: 'Audit a Shopify store for AI-agent visibility',
    description:
      'Audits what AI shopping agents can see on a Shopify storefront at the HTTP fetch layer (the layer non-rendering crawlers use). Returns findings grouped as Findable, Understandable, Trustworthy and Actionable, each with a plain-English explanation and a fix. Read-only; no credentials. Use when a user asks whether their store (or any Shopify store) is visible to, readable by, or ready for AI shopping assistants / agentic commerce. Lead with the "what matters most" summary. Respect the caveats: it measures the HTTP layer only, samples the newest products, and marks diagnostics as info rather than verdicts.',
    inputSchema: {
      domain: z.string().describe('Store hostname, e.g. "yourstore.com". No protocol or path.'),
      sample: z.number().int().min(1).max(20).optional().describe('How many product pages to sample (default 6).'),
    },
    outputSchema: {
      domain: z.string(),
      platform: z.string(),
      market: z.object({
        locale: z.string().optional(),
        currency: z.string().optional(),
        alternateCount: z.number(),
      }).describe('Which market variant was audited; multi-market stores differ per market.'),
      scope: z.string(),
      headline: z.string(),
      topActions: z.array(z.string()),
      categories: z.array(z.object({ category: z.string(), status: z.string() })),
      findings: z.array(z.object(findingSchema)),
    },
  },
  async ({ domain, sample }) => {
    try {
      const report = await runAudit(domain, { sampleSize: sample ?? 6 });
      return {
        content: [{ type: 'text', text: renderAgent(report) }],
        structuredContent: lean(report),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        isError: true,
        content: [{ type: 'text', text: `Audit failed for ${domain}: ${message}` }],
      };
    }
  },
);

function lean(report: AuditReport) {
  return {
    domain: report.domain,
    platform: report.platform.detected,
    market: report.market,
    scope: report.scope,
    headline: report.summary.headline,
    topActions: report.summary.topActions,
    categories: report.categories.map((c) => ({ category: c.category, status: c.status })),
    findings: report.findings.map((f) => ({
      id: f.id,
      category: f.category,
      status: f.status,
      title: f.title,
      narrative: f.narrative,
      ...(f.remediation ? { remediation: f.remediation } : {}),
    })),
  };
}

const transport = new StdioServerTransport();
await server.connect(transport);
process.stderr.write('storefront-agent-audit MCP server ready on stdio\n');
