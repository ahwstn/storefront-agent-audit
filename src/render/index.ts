import pc from 'picocolors';
import type { AuditReport, Finding, Status } from '../core/types.js';

/**
 * Renderers are LOSSY PROJECTIONS of the findings model. They select, order and
 * decorate. They must never synthesise interpretation: every narrative, headline
 * and action already lives in the model. If you find yourself writing merchant
 * copy in here, it belongs in a check instead.
 */

const ICON: Record<Status, string> = { pass: '✓', warn: '!', fail: '✗', info: '·' };
const CAT_LABEL: Record<string, string> = {
  findable: 'FINDABLE', understandable: 'UNDERSTANDABLE', trustworthy: 'TRUSTWORTHY', actionable: 'ACTIONABLE',
};

export function renderJson(report: AuditReport): string {
  return JSON.stringify(report, null, 2);
}

export function renderTerminal(report: AuditReport, color = true): string {
  const c = color ? pc : noColor();
  const lines: string[] = [];
  lines.push(`${c.bold('storefront-agent-audit')} ${report.tool.version} · ${c.bold(report.domain)} · ${report.startedAt.slice(0, 10)}`);
  lines.push(c.dim(report.scope));
  const mkt = marketLine(report);
  if (mkt) lines.push(c.dim(mkt));
  if (report.warnings.length) { lines.push(''); for (const w of report.warnings) lines.push(c.yellow(`  ⚠ ${w}`)); }
  lines.push('');
  for (const cat of report.categories) {
    const badge = cat.status === 'fail' ? c.red(ICON.fail) : cat.status === 'warn' ? c.yellow(ICON.warn) : cat.status === 'info' ? c.dim(ICON.info) : c.green(ICON.pass);
    lines.push(`  ${badge} ${c.bold((CAT_LABEL[cat.category] ?? cat.category).padEnd(15))} ${statusWord(cat.status, c)}`);
    for (const f of report.findings.filter((x) => x.category === cat.category)) {
      lines.push(`      ${dot(f.status, c)} ${f.title}`);
      lines.push(`        ${c.dim(wrap(f.narrative, 74, 8))}`);
    }
    lines.push('');
  }
  const s = report.summary.counts;
  lines.push(c.dim(`  ${report.findings.length} findings · ${s.fail} fail · ${s.warn} warn · ${s.pass} pass · ${s.info} info`));
  lines.push(c.dim('  Full detail: --json  ·  For your AI assistant: --agent'));
  return lines.join('\n');
}

/**
 * Agent rendering: token-frugal, findings-first, conversation-ready markdown.
 * This is the primary product; a human terminal is the secondary courtesy.
 */
export function renderAgent(report: AuditReport): string {
  const s = report.summary;
  const out: string[] = [];
  out.push(`# Agent-visibility audit: ${report.domain} (${report.startedAt.slice(0, 10)})`);
  out.push(`Scope: ${report.scope}`);
  const mkt = marketLine(report);
  if (mkt) out.push(mkt);
  if (report.platform.detected !== 'shopify') out.push(`Platform: not detected as Shopify (${report.platform.evidence}); Shopify-specific checks skipped.`);
  if (report.warnings.length) out.push(`Warnings: ${report.warnings.join(' ')}`);
  out.push('');
  out.push(`## What matters most`);
  out.push(s.headline);
  if (s.topActions.length) { out.push(''); out.push('Top actions:'); for (const a of s.topActions) out.push(`- ${a}`); }
  out.push('');
  out.push('## Category verdicts');
  for (const cat of report.categories) out.push(`- ${CAT_LABEL[cat.category] ?? cat.category}: ${cat.status.toUpperCase()} (${cat.counts.fail} fail, ${cat.counts.warn} warn, ${cat.counts.pass} pass)`);
  out.push('');
  out.push('## Findings');
  for (const f of report.findings) {
    out.push(`- [${f.status.toUpperCase()}] ${f.title}: ${f.narrative}${f.remediation ? ` Fix: ${f.remediation}` : ''}`);
  }
  out.push('');
  out.push('## Suggested next steps for the user');
  out.push('- Ask me to explain any finding, or to draft the fixes in priority order.');
  out.push('- Findings reflect the HTTP layer on the date shown; re-run to confirm changes.');
  return out.join('\n');
}

function marketLine(report: AuditReport): string | null {
  const m = report.market;
  if (!m) return null;
  const label = m.locale && m.currency ? `${m.locale} / ${m.currency}` : m.locale ?? m.currency ?? null;
  if (!label && m.alternateCount === 0) return null;
  const audited = label ? `Audited market: ${label}` : 'Audited market: undeclared';
  return m.alternateCount > 0
    ? `${audited} · ${m.alternateCount} other market variant${m.alternateCount === 1 ? '' : 's'} exist; findings describe this market only`
    : audited;
}

function statusWord(status: Status, c: typeof pc): string {
  if (status === 'fail') return c.red('needs work');
  if (status === 'warn') return c.yellow('room to improve');
  if (status === 'info') return c.dim('not assessed');
  return c.green('looking good');
}
function dot(status: Status, c: typeof pc): string {
  const i = ICON[status];
  return status === 'fail' ? c.red(i) : status === 'warn' ? c.yellow(i) : status === 'pass' ? c.green(i) : c.dim(i);
}
function wrap(text: string, width: number, indent: number): string {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    if ((line + w).length > width) { lines.push(line.trim()); line = ''; }
    line += w + ' ';
  }
  if (line.trim()) lines.push(line.trim());
  return lines.join('\n' + ' '.repeat(indent));
}
function noColor(): typeof pc {
  const id = (s: string) => s;
  return new Proxy(pc, { get: () => id }) as unknown as typeof pc;
}
