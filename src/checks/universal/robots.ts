import type { Check, CheckContext, Finding } from '../../core/types.js';

const AI_AGENTS = [
  'GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-User',
  'anthropic-ai', 'PerplexityBot', 'Google-Extended', 'Bingbot', 'Amazonbot', 'cohere-ai',
];

/**
 * robots.txt RULES parsed per agent against product paths, not mere mentions.
 * "GPTBot: not mentioned" says nothing; a wildcard Disallow can still block it.
 */
export const robotsCheck: Check = {
  id: 'robots-ai-access',
  category: 'findable',
  title: 'robots.txt access for AI crawlers',
  async run(ctx: CheckContext): Promise<Finding> {
    const res = await ctx.fetch('/robots.txt');
    const refs = ['https://vercel.com/blog/the-rise-of-the-ai-crawler'];
    const base = {
      id: 'robots-ai-access',
      category: 'findable' as const,
      tags: [] as never[],
      title: 'robots.txt access for AI crawlers',
      references: refs,
      fetchedAt: ctx.now(),
      caveat: 'Observed configuration only; says nothing about intent, and IP or TLS-level blocking is invisible to this check.',
    };
    if (res.status !== 200) {
      return { ...base, status: 'info', narrative: 'No robots.txt served, so all crawlers are allowed by default.', evidence: { status: res.status } };
    }
    const blocked = AI_AGENTS.filter((a) => !canFetchProducts(res.body, a));
    if (blocked.length === 0) {
      return { ...base, status: 'pass', narrative: 'All major AI crawlers are allowed to reach your product and collection pages.', evidence: { blocked: [], checked: AI_AGENTS.length } };
    }
    return {
      ...base,
      status: 'warn',
      narrative: `Your robots.txt blocks ${blocked.length} AI crawler${blocked.length > 1 ? 's' : ''} from product pages: ${blocked.join(', ')}. If these are meant to reach your store, an AI assistant using them will not see your catalogue. Note that some of these are training crawlers, which merchants sometimes block on purpose.`,
      remediation: 'Review the disallow rules for these user-agents if you want them to access product content.',
      evidence: { blocked, checked: AI_AGENTS.length },
    };
  },
};

/**
 * Minimal robots matcher: finds the most specific matching user-agent group
 * and evaluates Allow/Disallow (longest-match wins) against a product path.
 */
function canFetchProducts(robots: string, agent: string): boolean {
  const path = '/products/example';
  const groups = parseGroups(robots);
  const group = groups.find((g) => g.agents.some((a) => a.toLowerCase() === agent.toLowerCase()))
    ?? groups.find((g) => g.agents.includes('*'));
  if (!group) return true;

  let decision = true;
  let matchLen = -1;
  for (const rule of group.rules) {
    if (rule.path === '') {
      if (rule.type === 'disallow') continue; // empty Disallow = allow all
    }
    if (path.startsWith(rule.path) && rule.path.length > matchLen) {
      matchLen = rule.path.length;
      decision = rule.type === 'allow';
    }
  }
  return decision;
}

interface Group { agents: string[]; rules: { type: 'allow' | 'disallow'; path: string }[] }

function parseGroups(robots: string): Group[] {
  const groups: Group[] = [];
  let current: Group | null = null;
  let expectingAgents = false;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const [key, ...rest] = line.split(':');
    const value = rest.join(':').trim();
    const k = key?.toLowerCase();
    if (k === 'user-agent') {
      if (!expectingAgents || !current) { current = { agents: [], rules: [] }; groups.push(current); }
      current.agents.push(value);
      expectingAgents = true;
    } else if ((k === 'allow' || k === 'disallow') && current) {
      current.rules.push({ type: k, path: value });
      expectingAgents = false;
    } else {
      expectingAgents = false;
    }
  }
  return groups;
}
