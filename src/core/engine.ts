import type { AuditReport, Category, CategoryRollup, Check, CheckContext, Finding, Status } from './types.js';
import { SCOPE_CLAIM } from './types.js';
import { createFetcher, looksLikeChallenge } from './fetcher.js';
import { detectShopify } from '../checks/shopify/platform.js';
import { discoveryCheck } from '../checks/universal/discovery.js';
import { robotsCheck } from '../checks/universal/robots.js';
import { pdpCheck } from '../checks/universal/pdp.js';
import { productsCheck } from '../checks/shopify/products.js';
import { endpointsCheck } from '../checks/shopify/endpoints.js';
import { policiesCheck } from '../checks/shopify/policies.js';

const UNIVERSAL: Check[] = [discoveryCheck, robotsCheck, pdpCheck];
const SHOPIFY: Check[] = [productsCheck, endpointsCheck, policiesCheck];

const CATEGORY_ORDER: Category[] = ['findable', 'understandable', 'trustworthy', 'actionable'];
const RANK: Record<Status, number> = { pass: 0, info: 0, warn: 1, fail: 2 };

export interface RunOptions {
  sampleSize?: number;
  only?: string;
  timeoutMs?: number;
  now?: () => string;
}

export async function runAudit(domain: string, opts: RunOptions = {}): Promise<AuditReport> {
  const clean = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const base = `https://${clean}`;
  const now = opts.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const fetchPath = createFetcher(base, opts.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {});
  const warnings: string[] = [];

  const home = await fetchPath('/');
  const platform = detectShopify(home);
  if (looksLikeChallenge(home.body)) {
    warnings.push('The homepage returned a bot-challenge page; results may be unreliable, the store may block non-browser clients.');
  }
  const finalHost = (() => { try { return new URL(home.url).host; } catch { return clean; } })();
  if (finalHost && finalHost !== clean && finalHost !== `www.${clean}`) {
    warnings.push(`The homepage redirected to ${finalHost}. This audit stayed on ${clean} as requested; the customer-facing storefront may live elsewhere.`);
  }

  const ctx: CheckContext = { domain: clean, base, fetch: fetchPath, sampleSize: opts.sampleSize ?? 8, now };

  const active: Check[] = platform.detected === 'shopify'
    ? [...UNIVERSAL, ...SHOPIFY]
    : (warnings.push('No Shopify markers detected. Only platform-neutral checks were run; Shopify-specific checks were skipped.'), UNIVERSAL);

  const selected = opts.only ? active.filter((c) => c.id === opts.only) : active;

  const findings: Finding[] = [];
  for (const check of selected) {
    try {
      const out = await check.run(ctx);
      findings.push(...(Array.isArray(out) ? out : [out]));
    } catch (err) {
      findings.push({
        id: check.id,
        category: check.category,
        tags: [],
        status: 'info',
        title: check.title,
        narrative: `This check could not complete: ${err instanceof Error ? err.message : String(err)}`,
        evidence: {},
        references: [],
        fetchedAt: now(),
      });
    }
  }

  return {
    schemaVersion: 1,
    tool: { name: 'storefront-agent-audit', version: '0.1.0' },
    domain: clean,
    startedAt,
    finishedAt: now(),
    scope: SCOPE_CLAIM,
    platform,
    warnings,
    summary: buildSummary(findings),
    categories: buildRollups(findings),
    findings,
  };
}

function buildRollups(findings: Finding[]): CategoryRollup[] {
  return CATEGORY_ORDER.map((category) => {
    const inCat = findings.filter((f) => f.category === category);
    const counts = { pass: 0, warn: 0, fail: 0, info: 0 };
    for (const f of inCat) counts[f.status] += 1;
    const status: CategoryRollup['status'] = counts.fail > 0 ? 'fail' : counts.warn > 0 ? 'warn' : 'pass';
    return { category, status, counts };
  }).filter((r) => r.counts.pass + r.counts.warn + r.counts.fail + r.counts.info > 0);
}

function buildSummary(findings: Finding[]): AuditReport['summary'] {
  const counts = { pass: 0, warn: 0, fail: 0, info: 0 };
  for (const f of findings) counts[f.status] += 1;
  const actionable = findings
    .filter((f) => f.status === 'fail' || f.status === 'warn')
    .sort((a, b) => RANK[b.status] - RANK[a.status]);
  const topActions = [...new Set(actionable.map((f) => f.remediation ?? f.title))].slice(0, 3);
  const worst = actionable[0];
  const headline = worst
    ? worst.narrative
    : 'No blocking issues found: this store is broadly legible to AI shopping agents at the HTTP layer.';
  return { headline, topActions, counts };
}

export function exitCode(report: AuditReport): 0 | 2 {
  return report.findings.some((f) => f.status === 'fail' || f.status === 'warn') ? 2 : 0;
}
