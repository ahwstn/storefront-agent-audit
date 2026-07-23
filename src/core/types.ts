export type Category = 'findable' | 'understandable' | 'trustworthy' | 'actionable';

export type Status = 'pass' | 'warn' | 'fail' | 'info';

export interface Finding {
  /** Stable machine identifier, e.g. "llms-txt". Never renamed within a major version. */
  id: string;
  /** Primary category: what this finding tells the consumer to act on. */
  category: Category;
  /** Secondary categories for checks that genuinely span. */
  tags: Category[];
  status: Status;
  title: string;
  /**
   * Merchant-English interpretation. Computed here and only here;
   * renderers must never synthesise their own narrative.
   */
  narrative: string;
  /** Raw observed facts backing the narrative. Lossless. */
  evidence: Record<string, unknown>;
  /** What to actually do about it, when status is warn or fail. */
  remediation?: string;
  /** Primary-source links backing the check's premise or the fix. */
  references: string[];
  /** Honesty caveat where the check has known limits. Always shipped with the finding. */
  caveat?: string;
  fetchedAt: string;
}

export interface CategoryRollup {
  category: Category;
  /** 'info' means nothing in this category could be assessed (no pass/warn/fail). */
  status: Status;
  counts: { pass: number; warn: number; fail: number; info: number };
}

export interface AuditReport {
  schemaVersion: 1;
  tool: { name: string; version: string };
  domain: string;
  startedAt: string;
  finishedAt: string;
  /** The scope claim, stated in every rendering. */
  scope: string;
  platform: { detected: 'shopify' | 'unknown'; evidence: string };
  /**
   * Which market variant this audit actually read. Multi-market stores serve
   * different prices, stock and language per market; the report must say which
   * one it graded rather than implying the store has only one.
   */
  market: { locale?: string; currency?: string; alternateCount: number };
  warnings: string[];
  summary: {
    headline: string;
    topActions: string[];
    counts: { pass: number; warn: number; fail: number; info: number };
  };
  categories: CategoryRollup[];
  findings: Finding[];
}

export interface FetchResult {
  url: string;
  status: number;
  ok: boolean;
  contentType: string;
  body: string;
  error?: string;
}

export interface CheckContext {
  domain: string;
  base: string;
  fetch: (path: string, init?: { ua?: 'browser' | 'gptbot'; method?: string; body?: string; headers?: Record<string, string> }) => Promise<FetchResult>;
  /** The homepage as already fetched by the engine, so checks need not refetch it. */
  home: FetchResult;
  sampleSize: number;
  now: () => string;
}

export interface Check {
  id: string;
  category: Category;
  tags?: Category[];
  title: string;
  run: (ctx: CheckContext) => Promise<Finding | Finding[]>;
}

export const SCOPE_CLAIM =
  'HTTP fetch layer only: what non-rendering AI crawlers receive. Rendered-browser behaviour is out of scope for this version.';
