import type { Check, CheckContext, Finding } from '../../core/types.js';
import { detectMarket, marketLabel } from '../../core/market.js';

/**
 * Market context: say which market variant the audit read, and whether the store
 * declares its other markets in a way agents can discover. An AI serving a
 * shopper in another country reads a different storefront with different
 * prices and stock; a report that hides this invites wrong conclusions.
 */
export const marketCheck: Check = {
  id: 'market-context',
  category: 'findable',
  title: 'Market variants (which storefront agents read)',
  async run(ctx: CheckContext): Promise<Finding> {
    const market = detectMarket(ctx.home);
    const label = marketLabel(market);
    const audited = label ? `the ${label} storefront` : 'a storefront that declares no locale or currency';
    const base = {
      id: 'market-context', category: 'findable' as const, tags: [] as never[],
      title: 'Market variants (which storefront agents read)',
      references: ['https://developers.google.com/search/docs/specialty/international/localized-versions'],
      fetchedAt: ctx.now(),
      caveat: 'Detection reads hreflang and the served homepage only. Stores that vary market by IP or cookie without declaring alternates cannot be distinguished from single-market stores.',
    };

    if (market.alternates.length > 0) {
      const sample = market.alternates.slice(0, 6).map((a) => `${a.lang} (${a.href})`).join(', ');
      return {
        ...base, status: 'pass',
        narrative: `This audit read ${audited} at ${ctx.domain}. The store declares ${market.alternates.length} other market variant${market.alternates.length === 1 ? '' : 's'} via hreflang (${sample}${market.alternates.length > 6 ? ', …' : ''}), so agents can find the right market for their shopper. Findings in this report describe the audited market only; prices, stock and language differ elsewhere.`,
        evidence: { auditedLocale: market.locale, auditedCurrency: market.currency, alternates: market.alternates.slice(0, 20) },
      };
    }

    return {
      ...base, status: 'info',
      narrative: `This audit read ${audited} at ${ctx.domain}. No alternate market variants are declared via hreflang. If this store sells in one market, nothing is missing; if it serves several, agents have no declared way to find the localised storefront and may quote another market's prices to your shopper.`,
      evidence: { auditedLocale: market.locale, auditedCurrency: market.currency, alternates: [] },
    };
  },
};
