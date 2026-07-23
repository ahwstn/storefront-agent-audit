import type { Check, CheckContext, Finding } from '../../core/types.js';

interface ShopifyProduct { title?: string; product_type?: string; variants?: { price?: string }[] }
interface CatalogProduct { title?: string; price_range?: { min?: { amount?: number; currency?: string } } }

/**
 * Retrieval quality: behave like an AI shopping agent. Derive a realistic query from
 * the store's own catalogue, run it through the store's MCP search_catalog, and grade
 * DETERMINISTICALLY whether results honour the price ceiling and category. This measures
 * what an agent actually GETS when it shops here, which reading the HTML cannot reveal.
 */
export const retrievalCheck: Check = {
  id: 'retrieval-quality',
  category: 'actionable',
  tags: ['findable'],
  title: 'Search retrieval quality (agent shopping test)',
  async run(ctx: CheckContext): Promise<Finding> {
    const now = ctx.now();
    const base = {
      id: 'retrieval-quality', category: 'actionable' as const, tags: ['findable' as const],
      title: 'Search retrieval quality (agent shopping test)',
      references: ['https://shopify.dev/docs/agents/catalog'], fetchedAt: now,
    };

    // Need the catalogue to derive a fair, store-specific query.
    let products: ShopifyProduct[] = [];
    try { products = (JSON.parse((await ctx.fetch('/products.json?limit=50')).body).products ?? []) as ShopifyProduct[]; } catch { /* handled */ }
    if (products.length < 3) {
      return { ...base, status: 'info', narrative: 'Not enough catalogue data to construct a fair search query, so retrieval quality was not tested.', evidence: {} };
    }

    // Category term: most common product_type, else a keyword from the first title.
    const category = commonType(products) ?? firstNoun(products[0]?.title ?? '');
    // Price ceiling: a round number near the lower-middle of the catalogue, so the
    // constraint is meaningful (some products under, some over).
    const prices = products.map((p) => Number(p.variants?.[0]?.price ?? 0)).filter((n) => n > 0).sort((a, b) => a - b);
    if (!category || prices.length < 3) {
      return { ...base, status: 'info', narrative: 'Could not derive a representative query from this catalogue; retrieval quality not tested.', evidence: { category, samplePrices: prices.length } };
    }
    const ceiling = niceCeiling(prices[Math.floor(prices.length / 3)] ?? prices[0]!);
    const ceilingMinor = ceiling * 100;

    // Query the store's own catalogue exactly as a Shopify-native agent does: a natural
    // category query PLUS the documented STRUCTURED price filter (minor units), not a
    // free-text "under X" (which the endpoint does not parse). This makes any failure the
    // endpoint's, not ours.
    const resp = await ctx.fetch('/api/mcp', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'search_catalog', arguments: { query: category, context: { intent: 'shopping' }, filters: { price: { max: ceilingMinor } } } } }),
    });
    const query = `${category} (structured filter: max ${ceiling})`;
    const returned = parseCatalogResults(resp.body);
    if (returned === null) {
      return { ...base, status: 'info', narrative: `The store's MCP search did not return usable results for "${query}", so retrieval quality could not be graded (the endpoint may be ineligible or gated).`, evidence: { query, endpoint: '/api/mcp' } };
    }
    if (returned.length === 0) {
      return { ...base, status: 'fail', narrative: `An agent searching your store for "${query}" gets zero results. A shopper asking an AI assistant for this would be told you have nothing, even though your catalogue does.`, remediation: 'Enrich product titles, types and descriptions so the catalogue search can match common shopper queries.', evidence: { query, returned: 0 } };
    }

    // Deterministic grading on the price constraint only. Category relevance needs
    // semantic judgement a string match cannot fairly provide (a "Cruiser" is a shoe),
    // so we do not fake it; the price constraint is objective and fair. Grade in the
    // currency the endpoint actually returns (may differ from the storefront's).
    const cur = firstCurrency(returned);
    const sym = symbolFor(cur);
    const withPrice = returned.filter((p) => typeof p.price_range?.min?.amount === 'number');
    if (withPrice.length === 0) {
      return { ...base, status: 'info', narrative: `The store's search returned results for "${query}" but without prices to grade against, so retrieval quality could not be assessed.`, evidence: { query, returned: returned.length } };
    }
    const underCeiling = withPrice.filter((p) => (p.price_range!.min!.amount as number) <= ceilingMinor).length;
    const priceAdherence = underCeiling / withPrice.length;
    const overBudget = withPrice
      .filter((p) => (p.price_range!.min!.amount as number) > ceilingMinor)
      .slice(0, 3)
      .map((p) => `${(p.title ?? '').slice(0, 40)} (${sym}${((p.price_range!.min!.amount as number) / 100).toFixed(0)})`);

    const status = priceAdherence < 0.4 ? 'fail' : priceAdherence < 0.7 ? 'warn' : 'pass';
    const narrative = priceAdherence < 0.7
      ? `Using the documented structured price filter (max ${sym}${ceiling}) on your store's own agent search endpoint, only ${Math.round(priceAdherence * 100)}% of the results actually came back under that ceiling.` +
        (overBudget.length ? ` It surfaced pricier items like ${overBudget.join(', ')}.` : '') +
        ' An agent that trusts the endpoint would show a budget shopper items they filtered out.'
      : `Using the documented structured price filter (max ${sym}${ceiling}) on your store's own agent search endpoint, ${Math.round(priceAdherence * 100)}% of results honoured the ceiling. The catalogue search respects budget filters.`;

    return {
      ...base, status, narrative,
      ...(priceAdherence < 0.7 ? { remediation: 'The endpoint ignored a structured price filter; check that variant pricing and taxonomy attributes are populated so the catalogue search can filter on them.' } : {}),
      evidence: { query, currency: cur, ceiling, returned: returned.length, pricedResults: withPrice.length, underBudget: underCeiling, priceAdherence: round(priceAdherence), overBudgetExamples: overBudget },
      caveat: 'Tests the Shopify-native MCP catalogue path with a documented structured price filter. Today\'s consumer assistants (ChatGPT, Perplexity) also crawl the storefront and product feeds, a different path this check does not cover. Returned currency may differ from the market a local shopper sees.',
    };
  },
};

function commonType(products: ShopifyProduct[]): string | null {
  const counts = new Map<string, number>();
  for (const p of products) { const t = (p.product_type ?? '').trim().toLowerCase(); if (t) counts.set(t, (counts.get(t) ?? 0) + 1); }
  let best: string | null = null; let n = 0;
  for (const [t, c] of counts) if (c > n) { best = t; n = c; }
  return best;
}
function firstNoun(title: string): string {
  const words = title.replace(/[^\w\s]/g, ' ').split(/\s+/).filter((w) => w.length > 3);
  return (words[words.length - 1] ?? words[0] ?? '').toLowerCase();
}
function niceCeiling(price: number): number {
  const p = Math.max(10, price);
  if (p <= 30) return Math.max(10, Math.floor(p / 5) * 5);
  if (p <= 100) return Math.floor(p / 10) * 10;
  return Math.floor(p / 25) * 25;
}
function parseCatalogResults(body: string): CatalogProduct[] | null {
  try {
    const r = JSON.parse(body);
    const text = r?.result?.content?.[0]?.text;
    if (typeof text !== 'string') return null;
    const d = JSON.parse(text);
    const prods = d.products ?? (Array.isArray(d) ? d : null);
    return Array.isArray(prods) ? (prods as CatalogProduct[]) : null;
  } catch { return null; }
}
function round(n: number): number { return Math.round(n * 100) / 100; }
function firstCurrency(products: CatalogProduct[]): string {
  for (const p of products) { const c = (p.price_range?.min as { currency?: string } | undefined)?.currency; if (c) return c; }
  return '';
}
function symbolFor(cur: string): string {
  return cur === 'GBP' ? '£' : cur === 'USD' ? '$' : cur === 'EUR' ? '€' : cur ? `${cur} ` : '';
}
