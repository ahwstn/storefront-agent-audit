import type { Check, CheckContext, Finding } from '../../core/types.js';

interface ShopifyProduct { title?: string; product_type?: string; variants?: { price?: string }[] }
interface CatalogProduct { title?: string; price_range?: { min?: { amount?: number } } }

/**
 * Retrieval quality: behave like an AI shopping agent. Derive a realistic query from
 * the store's own catalogue, run it through the store's MCP search_catalog, and grade
 * DETERMINISTICALLY whether results honour the price ceiling and category. This measures
 * what an agent actually GETS when it shops here, which reading the HTML cannot reveal.
 */
export const retrievalCheck: Check = {
  id: 'retrieval-quality',
  category: 'findable',
  tags: ['actionable'],
  title: 'Search retrieval quality (agent shopping test)',
  async run(ctx: CheckContext): Promise<Finding> {
    const now = ctx.now();
    const base = {
      id: 'retrieval-quality', category: 'findable' as const, tags: ['actionable' as const],
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
    const query = `${category} under ${ceiling} pounds`;

    // Run the query through the store's own MCP, exactly as an AI shopping agent would.
    const resp = await ctx.fetch('/api/mcp', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'search_catalog', arguments: { query } } }),
    });
    const returned = parseCatalogResults(resp.body);
    if (returned === null) {
      return { ...base, status: 'info', narrative: `The store's MCP search did not return usable results for "${query}", so retrieval quality could not be graded (the endpoint may be ineligible or gated).`, evidence: { query, endpoint: '/api/mcp' } };
    }
    if (returned.length === 0) {
      return { ...base, status: 'fail', narrative: `An agent searching your store for "${query}" gets zero results. A shopper asking an AI assistant for this would be told you have nothing, even though your catalogue does.`, remediation: 'Enrich product titles, types and descriptions so the catalogue search can match common shopper queries.', evidence: { query, returned: 0 } };
    }

    // Deterministic grading on the price constraint only. Category relevance needs
    // semantic judgement a string match cannot fairly provide (a "Cruiser" is a shoe),
    // so we do not fake it; the price constraint is objective and fair.
    const ceilingMinor = ceiling * 100;
    const withPrice = returned.filter((p) => typeof p.price_range?.min?.amount === 'number');
    if (withPrice.length === 0) {
      return { ...base, status: 'info', narrative: `The store's search returned results for "${query}" but without prices to grade against, so retrieval quality could not be assessed.`, evidence: { query, returned: returned.length } };
    }
    const underCeiling = withPrice.filter((p) => (p.price_range!.min!.amount as number) <= ceilingMinor).length;
    const priceAdherence = underCeiling / withPrice.length;
    const overBudget = withPrice
      .filter((p) => (p.price_range!.min!.amount as number) > ceilingMinor)
      .slice(0, 3)
      .map((p) => `${(p.title ?? '').slice(0, 40)} (£${((p.price_range!.min!.amount as number) / 100).toFixed(0)})`);

    const status = priceAdherence < 0.4 ? 'fail' : priceAdherence < 0.7 ? 'warn' : 'pass';
    const narrative = priceAdherence < 0.7
      ? `You have products under £${ceiling}, but when I searched your store's own agent endpoint for "${query}", only ${Math.round(priceAdherence * 100)}% of the results actually came in under budget.` +
        (overBudget.length ? ` It surfaced pricier items like ${overBudget.join(', ')}.` : '') +
        ' A shopper asking an AI assistant for something affordable would be shown things they did not ask for.'
      : `I searched your store's own agent endpoint for "${query}" and ${Math.round(priceAdherence * 100)}% of the results honoured the budget. An agent shopping your store on price gets sensible answers.`;

    return {
      ...base, status, narrative,
      ...(priceAdherence < 0.7 ? { remediation: 'Budget queries rely on clean, structured pricing and product attributes in your catalogue; enriching these helps the search return affordable matches.' } : {}),
      evidence: { query, ceilingPounds: ceiling, returned: returned.length, pricedResults: withPrice.length, underBudget: underCeiling, priceAdherence: round(priceAdherence), overBudgetExamples: overBudget },
      caveat: 'Measures price-constraint adherence only (not semantic relevance). Search runs on the store\'s own MCP endpoint; a low score can reflect either thin product data or the catalogue search not parsing budget constraints, both of which shape what an agent retrieves.',
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
