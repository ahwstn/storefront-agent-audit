import type { AuditReport, Category, CategoryRollup, Check, CheckContext, Finding, Status } from './types.js';
import { SCOPE_CLAIM } from './types.js';
import { createFetcher, looksLikeChallenge } from './fetcher.js';
import { detectMarket } from './market.js';
import { detectShopify } from '../checks/shopify/platform.js';
import { discoveryCheck } from '../checks/universal/discovery.js';
import { robotsCheck } from '../checks/universal/robots.js';
import { pdpCheck } from '../checks/universal/pdp.js';
import { marketCheck } from '../checks/universal/market.js';
import { productsCheck } from '../checks/shopify/products.js';
import { endpointsCheck } from '../checks/shopify/endpoints.js';
import { policiesCheck } from '../checks/shopify/policies.js';
import { retrievalCheck } from '../checks/shopify/retrieval.js';

const UNIVERSAL: Check[] = [marketCheck, discoveryCheck, robotsCheck, pdpCheck];
const SHOPIFY: Check[] = [productsCheck, endpointsCheck, policiesCheck, retrievalCheck];

const CATEGORY_ORDER: Category[] = ['findable', 'understandable', 'trustworthy', 'actionable'];
const RANK: Record<Status, number> = { pass: 0, info: 0, warn: 1, fail: 2 };

export interface RunOptions {
  sampleSize?: number;
  only?: string;
  timeoutMs?: number;
  /** Hard ceiling on total audit wall time. A partial report beats a hang. */
  budgetMs?: number;
  now?: () => string;
}

const DEFAULT_BUDGET_MS = 120_000;

export async function runAudit(domain: string, opts: RunOptions = {}): Promise<AuditReport> {
  const clean = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const base = `https://${clean}`;
  const now = opts.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const fetchPath = createFetcher(base, opts.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {});
  const warnings: string[] = [];

  const home = await fetchPath('/');
  // A homepage that never answered means there is no store to audit; findings
  // built on failed fetches would present a typo'd domain as a broken store.
  if (home.status === 0) {
    throw new Error(`could not reach https://${clean}/ (${home.error ?? 'no response'}). Check the domain and try again.`);
  }
  const platform = detectShopify(home);
  if (looksLikeChallenge(home.body)) {
    warnings.push('The homepage returned a bot-challenge page; results may be unreliable, the store may block non-browser clients.');
  }
  const finalHost = (() => { try { return new URL(home.url).host; } catch { return clean; } })();
  if (finalHost && finalHost !== clean && finalHost !== `www.${clean}`) {
    warnings.push(`The homepage redirected to ${finalHost}. This audit stayed on ${clean} as requested; the customer-facing storefront may live elsewhere.`);
  }

  const market = detectMarket(home);
  const ctx: CheckContext = { domain: clean, base, fetch: fetchPath, home, sampleSize: opts.sampleSize ?? 8, now };

  const active: Check[] = platform.detected === 'shopify'
    ? [...UNIVERSAL, ...SHOPIFY]
    : (warnings.push('No Shopify markers detected. Only platform-neutral checks were run; Shopify-specific checks were skipped.'), UNIVERSAL);

  const selected = opts.only ? active.filter((c) => c.id === opts.only) : active;

  // Hard wall-time ceiling. A store that slow-walks connections (bot
  // mitigation tarpits especially) must produce a partial report with a
  // warning, never an audit that hangs its caller.
  const deadline = Date.now() + (opts.budgetMs ?? DEFAULT_BUDGET_MS);
  let budgetHit = false;

  const findings: Finding[] = [];
  for (const check of selected) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      budgetHit = true;
      findings.push(skipped(check, now(), 'the audit time budget was reached before this check could run'));
      continue;
    }
    try {
      const out = await Promise.race([
        check.run(ctx),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('BUDGET')), remaining).unref?.()),
      ]);
      findings.push(...(Array.isArray(out) ? out : [out]));
    } catch (err) {
      if (err instanceof Error && err.message === 'BUDGET') {
        budgetHit = true;
        findings.push(skipped(check, now(), 'the audit time budget ran out while this check was waiting on the store'));
        continue;
      }
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
  if (budgetHit) {
    warnings.push('The store responded slowly and the audit hit its time budget; some checks were skipped and are marked "not assessed". Re-run later for a complete picture.');
  }

  return {
    schemaVersion: 1,
    tool: { name: 'storefront-agent-audit', version: '0.1.2' },
    domain: clean,
    startedAt,
    finishedAt: now(),
    scope: SCOPE_CLAIM,
    platform,
    market: {
      ...(market.locale ? { locale: market.locale } : {}),
      ...(market.currency ? { currency: market.currency } : {}),
      alternateCount: market.alternates.length,
    },
    warnings,
    summary: buildSummary(findings),
    categories: buildRollups(findings),
    findings,
  };
}

function skipped(check: Check, fetchedAt: string, reason: string): Finding {
  return {
    id: check.id,
    category: check.category,
    tags: [],
    status: 'info',
    title: check.title,
    narrative: `Not assessed: ${reason}.`,
    evidence: {},
    references: [],
    fetchedAt,
  };
}

function buildRollups(findings: Finding[]): CategoryRollup[] {
  return CATEGORY_ORDER.map((category) => {
    const inCat = findings.filter((f) => f.category === category);
    const counts = { pass: 0, warn: 0, fail: 0, info: 0 };
    for (const f of inCat) counts[f.status] += 1;
    // A category with no pass/warn/fail (only info, or nothing) was not assessable;
    // reporting it as 'pass' would falsely claim "looking good".
    const assessed = counts.pass + counts.warn + counts.fail;
    const status: CategoryRollup['status'] =
      counts.fail > 0 ? 'fail' : counts.warn > 0 ? 'warn' : assessed > 0 ? 'pass' : 'info';
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
