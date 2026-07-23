import type { Check, CheckContext, Finding } from '../../core/types.js';

interface ShopifyProduct {
  handle: string;
  body_html?: string;
  tags?: string | string[];
  options?: { name: string }[];
  images?: unknown[];
  variants?: { barcode?: string | null }[];
}

/**
 * products.json catalogue completeness. Honestly framed as a newest-N window,
 * not the whole catalogue (Shopify's default order is recency-biased).
 */
export const productsCheck: Check = {
  id: 'product-data',
  category: 'understandable',
  title: 'Product data completeness',
  async run(ctx: CheckContext): Promise<Finding> {
    const res = await ctx.fetch('/products.json?limit=50');
    const base = {
      id: 'product-data',
      category: 'understandable' as const,
      tags: [] as never[],
      title: 'Product data completeness',
      references: ['https://www.shopify.com/enterprise/blog/ai-search-insights'],
      fetchedAt: ctx.now(),
    };
    let products: ShopifyProduct[] = [];
    try {
      products = (JSON.parse(res.body).products ?? []) as ShopifyProduct[];
    } catch {
      return { ...base, status: 'info', narrative: 'products.json was not readable, so catalogue completeness could not be sampled.', evidence: { status: res.status } };
    }
    const n = products.length;
    if (n === 0) return { ...base, status: 'info', narrative: 'No products returned from products.json.', evidence: { count: 0 } };

    const descLens = products.map((p) => stripLen(p.body_html));
    const emptyDesc = descLens.filter((l) => l === 0).length;
    const median = [...descLens].sort((a, b) => a - b)[Math.floor(n / 2)] ?? 0;
    const withOptions = products.filter((p) => (p.options ?? []).some((o) => o.name !== 'Title')).length;
    const barcoded = products.filter((p) => (p.variants ?? []).length > 0 && (p.variants ?? []).every((v) => (v.barcode ?? '').trim())).length;

    const emptyShare = emptyDesc / n;
    const status = emptyShare > 0.3 ? 'fail' : emptyShare > 0.1 ? 'warn' : 'pass';
    const narrative = emptyShare > 0.1
      ? `Of the newest ${n} products, ${emptyDesc} have no description at all. AI assistants read descriptions to decide whether to recommend a product; an empty one usually means the product cannot be matched to a shopper's need.`
      : `The newest ${n} products mostly carry descriptions (median ${median} characters). That gives AI assistants something to work with.`;

    return {
      ...base,
      status,
      narrative,
      ...(emptyShare > 0.1 ? { remediation: 'Fill in product descriptions, especially materials, use-cases and attributes a shopper would ask about.' } : {}),
      evidence: { sampled: n, emptyDescriptions: emptyDesc, medianDescriptionChars: median, withRealOptions: withOptions, allVariantsBarcoded: barcoded },
      caveat: 'Sampled from the newest 50 published products (Shopify default order); not the whole catalogue.',
    };
  },
};

function stripLen(html?: string): number {
  return (html ?? '').replace(/<[^>]+>/g, '').trim().length;
}
