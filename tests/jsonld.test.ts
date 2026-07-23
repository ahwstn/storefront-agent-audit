import { describe, it, expect } from 'vitest';
import { pdpCheck } from '../src/checks/universal/pdp.js';
import type { CheckContext, FetchResult, Finding } from '../src/core/types.js';

function html(jsonld: string, words = 300): string {
  const filler = 'word '.repeat(words);
  return `<html><body><p>${filler}</p><script type="application/ld+json">${jsonld}</script></body></html>`;
}

function ctx(pages: Record<string, string>): CheckContext {
  return {
    domain: 'x', base: '', home: { url: '', status: 200, ok: true, contentType: 'text/html', body: '' }, sampleSize: 8, now: () => '2026-01-01T00:00:00Z',
    async fetch(path: string): Promise<FetchResult> {
      const body = path.includes('products.json')
        ? JSON.stringify({ products: Object.keys(pages).map((h) => ({ handle: h })) })
        : pages[path.replace('/products/', '')] ?? '';
      return { url: path, status: 200, ok: true, contentType: 'text/html', body };
    },
  };
}

describe('JSON-LD extraction handles @graph nesting', () => {
  it('finds a flat Product node', async () => {
    const out = (await pdpCheck.run(ctx({ a: html('{"@type":"Product","name":"A","description":"desc"}') }))) as Finding[];
    const sd = out.find((f) => f.id === 'pdp-structured-data');
    expect(sd).toBeDefined();
    expect((sd!.evidence.fieldPresence as Record<string, number>).description).toBe(1);
  });

  it('finds a Product nested inside @graph inside WebPage', async () => {
    const graph = '{"@context":"x","@graph":[{"@type":"WebPage"},{"@type":"Product","name":"B","description":"d","sku":"S1"}]}';
    const out = (await pdpCheck.run(ctx({ b: html(graph) }))) as Finding[];
    const sd = out.find((f) => f.id === 'pdp-structured-data');
    expect((sd!.evidence.fieldPresence as Record<string, number>).sku).toBe(1);
  });

  it('flags a headless shell rather than reporting an empty store', async () => {
    const shell = '<html><body>x</body></html>';
    const out = (await pdpCheck.run(ctx({ a: shell, b: shell, c: shell }))) as Finding[];
    const content = out.find((f) => f.id === 'pdp-content');
    expect(content!.status).toBe('info');
    expect(content!.evidence.likelyHeadlessShell).toBe(true);
  });
});
