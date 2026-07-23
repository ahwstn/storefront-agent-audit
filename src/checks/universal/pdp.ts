import type { Check, CheckContext, Finding } from '../../core/types.js';
import { wordCount, looksLikeChallenge } from '../../core/fetcher.js';

interface ShopifyProduct { handle: string }

const JSONLD_FIELDS = ['name', 'description', 'offers', 'image', 'sku', 'brand', 'aggregateRating'] as const;

/**
 * Multi-PDP JS-off content and JSON-LD field completeness, over a stratified
 * sample. Never a single-page point estimate (panel-mandated).
 */
export const pdpCheck: Check = {
  id: 'pdp-content',
  category: 'understandable',
  title: 'Product-page content for non-rendering agents',
  async run(ctx: CheckContext): Promise<Finding[]> {
    const list = await ctx.fetch('/products.json?limit=50');
    let products: ShopifyProduct[] = [];
    try { products = (JSON.parse(list.body).products ?? []) as ShopifyProduct[]; } catch { /* handled below */ }
    if (products.length === 0) {
      return [{ id: 'pdp-content', category: 'understandable', tags: [], title: 'Product-page content', status: 'info', narrative: 'No product handles available to sample.', evidence: {}, references: [], fetchedAt: ctx.now() }];
    }

    const handles = stratify(products.map((p) => p.handle), ctx.sampleSize);
    const words: { handle: string; count: number }[] = [];
    let liquidErrors = 0;
    let challenged = 0;
    const fieldPresence: Record<string, number> = Object.fromEntries(JSONLD_FIELDS.map((f) => [f, 0]));
    let productBlocks = 0;

    for (const h of handles) {
      const res = await ctx.fetch(`/products/${h}`);
      if (looksLikeChallenge(res.body)) { challenged += 1; continue; }
      words.push({ handle: h, count: wordCount(res.body) });
      if (/Liquid error/i.test(res.body)) liquidErrors += 1;
      const product = extractProductJsonLd(res.body);
      if (product) {
        productBlocks += 1;
        for (const f of JSONLD_FIELDS) {
          const v = product[f];
          const ok = f === 'description' ? String(v ?? '').trim().length > 0 : v != null && v !== '' && !(Array.isArray(v) && v.length === 0);
          if (ok) fieldPresence[f] = (fieldPresence[f] ?? 0) + 1;
        }
      }
    }

    const findings: Finding[] = [];
    const now = ctx.now();

    if (words.length === 0) {
      findings.push({ id: 'pdp-content', category: 'understandable', tags: [], title: 'Product-page content', status: 'info', narrative: `All ${handles.length} sampled product pages returned a bot-challenge or failed to fetch, so content could not be assessed.`, evidence: { challenged }, references: [], fetchedAt: now });
      return findings;
    }

    const counts = words.map((w) => w.count).sort((a, b) => a - b);
    const min = counts[0] ?? 0;
    const max = counts[counts.length - 1] ?? 0;
    const median = counts[Math.floor(counts.length / 2)] ?? 0;
    const contentStatus = median < 50 ? 'fail' : median < 150 ? 'warn' : 'pass';

    // Panel-flagged guard: near-zero, near-identical pages usually mean a headless
    // shell (the apex proxies product data but renders content client-side elsewhere),
    // not a genuinely empty store. Say so rather than publish a misleading verdict.
    if (max <= 5 && min === max) {
      findings.push({
        id: 'pdp-content', category: 'understandable', tags: ['findable'],
        title: 'Product-page content for non-rendering agents',
        status: 'info',
        narrative: `Every sampled product page returned almost no readable text (${median} words) without JavaScript. This usually means a headless front end that renders everything client-side, so the real customer-facing storefront may live on a different domain. Re-run against the domain shoppers actually browse.`,
        evidence: { pagesAnalysed: words.length, wordsMin: min, wordsMax: max, likelyHeadlessShell: true },
        caveat: 'Measures the HTTP fetch layer only.',
        references: ['https://vercel.com/blog/the-rise-of-the-ai-crawler'],
        fetchedAt: now,
      });
      return findings;
    }

    findings.push({
      id: 'pdp-content',
      category: 'understandable',
      tags: ['findable'],
      title: 'Product-page content for non-rendering agents',
      status: contentStatus,
      narrative: median < 150
        ? `Across ${words.length} product pages, the readable text without JavaScript ranged ${min} to ${max} words (median ${median}). The AI crawlers that feed shopping recommendations do not run JavaScript, so anything loaded client-side (often reviews and descriptions) is invisible to them.`
        : `Across ${words.length} product pages, ${min} to ${max} words (median ${median}) are readable without JavaScript. Non-rendering AI crawlers can see your product content.`,
      ...(median < 150 ? { remediation: 'Serve core product content (description, key attributes, reviews) in the initial HTML rather than injecting it with JavaScript.' } : {}),
      evidence: { pagesAnalysed: words.length, challenged, wordsMin: min, wordsMedian: median, wordsMax: max, perPage: words },
      caveat: 'Measures the HTTP fetch layer. Search-engine crawlers (Googlebot, Bingbot) and agentic browsers do render JavaScript.',
      references: ['https://vercel.com/blog/the-rise-of-the-ai-crawler'],
      fetchedAt: now,
    });

    if (productBlocks > 0) {
      const desc = fieldPresence.description ?? 0;
      const sku = fieldPresence.sku ?? 0;
      const jsonldStatus = desc < productBlocks ? 'warn' : 'pass';
      findings.push({
        id: 'pdp-structured-data',
        category: 'understandable',
        tags: [],
        title: 'Structured data completeness',
        status: jsonldStatus,
        narrative: desc < productBlocks
          ? `Of ${productBlocks} product pages with structured data, ${desc} include a description and ${sku} include a product code. Missing structured fields are the attributes an AI assistant filters on; when they are absent, a product is often excluded from results rather than ranked lower.`
          : `Structured product data is complete across the ${productBlocks} sampled pages. This is the machine-readable layer AI assistants read first.`,
        ...(desc < productBlocks ? { remediation: 'Populate JSON-LD Product fields (description, sku, brand, offers, aggregateRating) via your theme or product data.' } : {}),
        evidence: { productBlocks, fieldPresence },
        references: ['https://schema.org/Product'],
        fetchedAt: now,
      });
    }

    if (liquidErrors > 0) {
      findings.push({
        id: 'served-markup-errors',
        category: 'trustworthy',
        tags: ['understandable'],
        title: 'Errors in served markup',
        status: 'warn',
        narrative: `A Liquid error message is visible in the served HTML of ${liquidErrors} of ${words.length} sampled pages. These usually come from a third-party app rather than your own theme, but any AI assistant reading the page sees the error text sitting in your content.`,
        remediation: 'Trace the erroring snippet (often a third-party app) and fix or remove it.',
        evidence: { pagesWithErrors: liquidErrors, pagesSampled: words.length },
        caveat: 'Third-party app snippets are a common cause; attribute carefully before assuming a theme fault.',
        references: [],
        fetchedAt: now,
      });
    }

    return findings;
  },
};

function stratify<T>(items: T[], k: number): T[] {
  const n = items.length;
  if (n <= k) return items;
  const step = Math.max(1, Math.floor(n / k));
  const out: T[] = [];
  for (let i = 0; i < n && out.length < k; i += step) out.push(items[i]!);
  return out;
}

/** Extracts a Product node from JSON-LD, handling @graph nesting at any depth. */
function extractProductJsonLd(html: string): Record<string, unknown> | null {
  const blocks = html.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) ?? [];
  for (const block of blocks) {
    const json = block.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '').trim();
    let parsed: unknown;
    try { parsed = JSON.parse(json); } catch { continue; }
    const found = findProduct(parsed);
    if (found) return found;
  }
  return null;
}

function findProduct(node: unknown): Record<string, unknown> | null {
  if (Array.isArray(node)) {
    for (const item of node) { const f = findProduct(item); if (f) return f; }
    return null;
  }
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    const type = obj['@type'];
    if (type === 'Product' || (Array.isArray(type) && type.includes('Product'))) return obj;
    if (Array.isArray(obj['@graph'])) { const f = findProduct(obj['@graph']); if (f) return f; }
  }
  return null;
}
