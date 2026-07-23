import type { Check, CheckContext, Finding } from '../../core/types.js';

const SHOPIFY_DEFAULT_MARKER = 'openclaw-like manner';

/**
 * llms.txt / agents.md quality, not just presence. Since Shopify auto-generates
 * these on eligible stores, "present" is nearly tautological; the value is in
 * default-vs-customised, and for customised files, whether they are actually good.
 * Grading criteria adapted from prior production llms.txt rubric work.
 */
export const discoveryCheck: Check = {
  id: 'llms-txt',
  category: 'findable',
  tags: ['understandable'],
  title: 'llms.txt / agents.md agent guidance',
  async run(ctx: CheckContext): Promise<Finding[]> {
    const findings: Finding[] = [];
    const refs = [
      'https://shopify.dev/docs/storefronts/themes/architecture/templates/agents-md-liquid',
      'https://llmstxt.org/',
    ];

    for (const path of ['/llms.txt', '/agents.md']) {
      const res = await ctx.fetch(path);
      const base = {
        id: path === '/llms.txt' ? 'llms-txt' : 'agents-md',
        category: 'findable' as const,
        tags: ['understandable' as const],
        title: `${path} agent guidance`,
        references: refs,
        fetchedAt: ctx.now(),
      };

      if (res.status !== 200) {
        findings.push({
          ...base,
          status: 'warn',
          narrative: `No ${path} is served. This file is a plain-text menu that tells AI assistants what your store sells and where to find things. On eligible Shopify stores it is generated automatically, so a 404 usually means a headless or custom front end that is not serving it.`,
          remediation: `Ensure ${path} is reachable, or add a templates/agents.md.liquid template so it stays in sync with your store data.`,
          evidence: { status: res.status },
        });
        continue;
      }

      if (looksLikeHtml(res.body)) {
        findings.push({
          ...base,
          status: 'warn',
          narrative: `${path} returns an HTML page rather than the plain-text file. To an AI assistant this reads as missing. Common on headless front ends that catch every route with the app shell.`,
          remediation: `Serve ${path} as plain text at the exact path, not an SPA fallback.`,
          evidence: { status: res.status, contentType: res.contentType, firstBytes: res.body.slice(0, 80) },
        });
        continue;
      }

      const isDefault = res.body.includes(SHOPIFY_DEFAULT_MARKER);
      const grade = gradeLlmsTxt(res.body);

      if (isDefault) {
        findings.push({
          ...base,
          status: 'warn',
          narrative: `${path} is present but is Shopify's auto-generated default. Every eligible store gets the same file; almost nobody customises theirs. Customising it is a cheap way to tell AI assistants what makes your catalogue worth recommending.`,
          remediation: `Add a templates/agents.md.liquid template and curate the sections and links agents should prioritise.`,
          evidence: { status: res.status, bytes: res.body.length, classification: 'shopify-default', grade },
          caveat: 'Default detection uses a template fingerprint validated 2026-07; Shopify may change the template.',
        });
      } else {
        const weak = grade.missing.length > 0;
        findings.push({
          ...base,
          status: weak ? 'warn' : 'pass',
          narrative: weak
            ? `${path} is customised, good, but it is missing ${grade.missing.join(', ')}. A strong file leads with an H1 title, a one-line summary, and curated sections of links agents can follow.`
            : `${path} is customised and well-formed: it has a title, a summary, and curated link sections. This is what a store that wants to be understood by AI assistants looks like.`,
          ...(weak ? { remediation: `Add: ${grade.missing.join('; ')}.` } : {}),
          evidence: { status: res.status, bytes: res.body.length, classification: 'customised', grade },
        });
      }
    }
    return findings;
  },
};

function looksLikeHtml(body: string): boolean {
  return /^\s*<(!doctype|html)/i.test(body.slice(0, 200));
}

interface LlmsGrade {
  hasH1: boolean;
  hasSummary: boolean;
  linkSections: number;
  trackingParamsInLinks: boolean;
  missing: string[];
}

/**
 * Lightweight quality grade adapted from the production 5-dimension rubric
 * (spec compliance + content curation dimensions). Not a numeric score by design.
 */
function gradeLlmsTxt(raw: string): LlmsGrade {
  const hasH1 = /^#\s+\S/m.test(raw);
  const hasSummary = /^>\s+\S/m.test(raw) || /^#\s+.+\n+\S/m.test(raw);
  const h2Sections = raw.match(/^##\s+.+$/gm) ?? [];
  const links = raw.match(/\[[^\]]+\]\(([^)]+)\)/g) ?? [];
  const linkSections = h2Sections.length;
  const trackingParamsInLinks = /[?&](utm_|fbclid|gclid|mc_)/i.test(links.join(' '));

  const missing: string[] = [];
  if (!hasH1) missing.push('an H1 title line');
  if (!hasSummary) missing.push('a one-line summary');
  if (linkSections === 0) missing.push('at least one section of curated links');
  if (links.length === 0) missing.push('links to key pages (catalogue, policies, about)');
  if (trackingParamsInLinks) missing.push('clean URLs (tracking parameters found in links)');

  return { hasH1, hasSummary, linkSections, trackingParamsInLinks, missing };
}
