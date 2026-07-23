import { describe, it, expect } from 'vitest';
import { retrievalCheck } from '../src/checks/shopify/retrieval.js';
import type { CheckContext, FetchResult, Finding } from '../src/core/types.js';

// Catalogue: 6 products, "shoes", prices 40..90. Lower-third ceiling ~ £50.
const products = [40, 50, 60, 70, 80, 90].map((p, i) => ({
  handle: `p${i}`, title: `Shoe ${i}`, product_type: 'shoes', variants: [{ price: String(p) }],
}));

function ctx(mcpProducts: { title: string; price: number }[]): CheckContext {
  return {
    domain: 'x', base: '', home: { url: '', status: 200, ok: true, contentType: 'text/html', body: '' }, sampleSize: 8, now: () => '2026-01-01T00:00:00Z',
    async fetch(path: string): Promise<FetchResult> {
      if (path.includes('products.json')) {
        return { url: path, status: 200, ok: true, contentType: 'application/json', body: JSON.stringify({ products }) };
      }
      // MCP search_catalog response shape: result.content[0].text is a JSON string.
      const inner = JSON.stringify({ products: mcpProducts.map((p) => ({ title: p.title, price_range: { min: { amount: p.price * 100, currency: 'GBP' } } })) });
      const body = JSON.stringify({ jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: inner }] } });
      return { url: path, status: 200, ok: true, contentType: 'application/json', body };
    },
  };
}

describe('retrieval-quality (price-constraint adherence)', () => {
  it('passes when the search honours the budget', async () => {
    const f = (await retrievalCheck.run(ctx([
      { title: 'Shoe A', price: 40 }, { title: 'Shoe B', price: 45 }, { title: 'Shoe C', price: 50 },
    ]))) as Finding;
    expect(f.status).toBe('pass');
    expect(f.evidence.priceAdherence).toBe(1);
  });

  it('fails when the budget query returns mostly over-budget items', async () => {
    const f = (await retrievalCheck.run(ctx([
      { title: 'Shoe A', price: 90 }, { title: 'Shoe B', price: 85 }, { title: 'Shoe C', price: 80 }, { title: 'Shoe D', price: 45 },
    ]))) as Finding;
    expect(f.status).toBe('fail');
    expect(f.evidence.overBudgetExamples).toBeDefined();
    expect((f.evidence.overBudgetExamples as string[]).length).toBeGreaterThan(0);
  });

  it('reports info when the MCP endpoint returns nothing usable', async () => {
    const c: CheckContext = {
      domain: 'x', base: '', home: { url: '', status: 200, ok: true, contentType: 'text/html', body: '' }, sampleSize: 8, now: () => '2026-01-01T00:00:00Z',
      async fetch(path: string): Promise<FetchResult> {
        const body = path.includes('products.json') ? JSON.stringify({ products }) : '{"jsonrpc":"2.0","id":1,"error":{"code":-32001}}';
        return { url: path, status: 200, ok: true, contentType: 'application/json', body };
      },
    };
    const f = (await retrievalCheck.run(c)) as Finding;
    expect(f.status).toBe('info');
  });
});
