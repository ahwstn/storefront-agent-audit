import { describe, it, expect } from 'vitest';
import { robotsCheck } from '../src/checks/universal/robots.js';
import type { CheckContext, FetchResult, Finding } from '../src/core/types.js';

function ctxWith(robots: string): CheckContext {
  const res: FetchResult = { url: '', status: 200, ok: true, contentType: 'text/plain', body: robots };
  return {
    domain: 'x', base: '', sampleSize: 8, now: () => '2026-01-01T00:00:00Z',
    fetch: async () => res,
  };
}

describe('robots.txt rule parsing (not just mentions)', () => {
  it('passes when all agents are allowed', async () => {
    const f = (await robotsCheck.run(ctxWith('User-agent: *\nDisallow:\n'))) as Finding;
    expect(f.status).toBe('pass');
  });

  it('detects a wildcard block that a mention-check would miss', async () => {
    const f = (await robotsCheck.run(ctxWith('User-agent: *\nDisallow: /\n'))) as Finding;
    expect(f.status).toBe('warn');
    expect((f.evidence.blocked as string[]).length).toBeGreaterThan(0);
  });

  it('respects a named-agent block for GPTBot only', async () => {
    const robots = 'User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nDisallow:\n';
    const f = (await robotsCheck.run(ctxWith(robots))) as Finding;
    expect(f.evidence.blocked).toContain('GPTBot');
    expect(f.evidence.blocked).not.toContain('ClaudeBot');
  });

  it('honours an Allow override on products', async () => {
    const robots = 'User-agent: *\nDisallow: /\nAllow: /products/\n';
    const f = (await robotsCheck.run(ctxWith(robots))) as Finding;
    expect(f.status).toBe('pass');
  });
});
