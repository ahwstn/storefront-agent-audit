import type { Check, CheckContext, Finding } from '../../core/types.js';

const POLICIES = [
  { path: '/policies/refund-policy', label: 'refund' },
  { path: '/policies/shipping-policy', label: 'shipping' },
  { path: '/policies/privacy-policy', label: 'privacy' },
  { path: '/policies/terms-of-service', label: 'terms' },
];

/** Machine-readable policy pages: a trust input agents ask for before recommending. */
export const policiesCheck: Check = {
  id: 'policies',
  category: 'trustworthy',
  title: 'Store policies',
  async run(ctx: CheckContext): Promise<Finding> {
    const results = await Promise.all(POLICIES.map(async (p) => ({ ...p, status: (await ctx.fetch(p.path)).status })));
    const missing = results.filter((r) => r.status !== 200).map((r) => r.label);
    const base = {
      id: 'policies',
      category: 'trustworthy' as const,
      tags: [] as never[],
      title: 'Store policies',
      references: [] as string[],
      fetchedAt: ctx.now(),
    };
    if (missing.length === 0) {
      return { ...base, status: 'pass', narrative: 'Refund, shipping, privacy and terms policies are all published. Return policy in particular is one of the most common things an AI assistant checks before recommending a store.', evidence: { missing: [] } };
    }
    return {
      ...base,
      status: missing.includes('refund') || missing.includes('shipping') ? 'warn' : 'info',
      narrative: `Missing policy page${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. AI assistants surface return and shipping terms to reassure a shopper; a missing return policy measurably lowers agent confidence in a store.`,
      remediation: 'Publish the missing policies in your Shopify settings.',
      evidence: { missing },
    };
  },
};
