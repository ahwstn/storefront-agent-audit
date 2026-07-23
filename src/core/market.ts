import type { FetchResult } from './types.js';

export interface MarketAlternate {
  lang: string;
  href: string;
}

export interface MarketInfo {
  /** BCP 47 language/region the audited storefront declares, e.g. "en-GB". */
  locale?: string;
  /** ISO currency the audited storefront serves, read from Shopify's own runtime config. */
  currency?: string;
  /** Other market variants the store declares via hreflang, excluding the audited one. */
  alternates: MarketAlternate[];
}

/**
 * Read the audited market from the homepage the store actually served, so the
 * report can say which storefront it graded instead of assuming one. Signals:
 * html lang, Shopify's currency runtime config, and hreflang alternate links.
 */
export function detectMarket(home: FetchResult): MarketInfo {
  const html = home.body;
  const locale = /<html[^>]*\slang=["']?([a-zA-Z-]{2,10})["'\s>]/.exec(html)?.[1];

  const currency =
    /Shopify\.currency\s*=\s*\{[^}]*["']active["']\s*:\s*["']([A-Z]{3})["']/.exec(html)?.[1] ??
    /["']currency["']\s*:\s*["']([A-Z]{3})["']/.exec(html)?.[1];

  const selfHost = (() => { try { return new URL(home.url).host; } catch { return ''; } })();
  const alternates: MarketAlternate[] = [];
  const seen = new Set<string>();
  const linkTag = /<link\s[^>]*rel=["']alternate["'][^>]*>/gi;
  for (const [tag] of html.matchAll(linkTag)) {
    const lang = /hreflang=["']([^"']+)["']/i.exec(tag)?.[1];
    const href = /href=["']([^"']+)["']/i.exec(tag)?.[1];
    if (!lang || !href || lang.toLowerCase() === 'x-default') continue;
    let host = '';
    let path = '';
    try { const u = new URL(href, home.url); host = u.host; path = u.pathname; } catch { continue; }
    // Skip the variant that is the audited page itself (same host modulo www, root path).
    const norm = (h: string) => h.replace(/^www\./, '');
    if (norm(host) === norm(selfHost) && (path === '/' || path === '')) continue;
    const key = `${lang}|${host}${path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    alternates.push({ lang, href: `${host}${path === '/' ? '' : path}` });
  }

  return { ...(locale ? { locale } : {}), ...(currency ? { currency } : {}), alternates };
}

/** Human phrase for the audited market, e.g. "en-GB / GBP", or null when nothing was declared. */
export function marketLabel(m: MarketInfo): string | null {
  if (m.locale && m.currency) return `${m.locale} / ${m.currency}`;
  return m.locale ?? m.currency ?? null;
}
