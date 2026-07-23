import type { FetchResult } from '../../core/types.js';

export interface PlatformResult {
  detected: 'shopify' | 'unknown';
  evidence: string;
}

/**
 * Shopify detection from a homepage fetch, cheapest signals first.
 * Ported from Vectis platform attribution: header, then CDN, then myshopify redirect.
 */
export function detectShopify(home: FetchResult): PlatformResult {
  if (/cdn\.shopify\.com|cdn\/shop\//i.test(home.body))
    return { detected: 'shopify', evidence: 'Shopify CDN asset references in HTML' };
  if (/Shopify\.theme|shopify-features|myshopify\.com/i.test(home.body))
    return { detected: 'shopify', evidence: 'Shopify runtime markers in HTML' };
  return {
    detected: 'unknown',
    evidence: 'No Shopify markers found in homepage HTML',
  };
}
