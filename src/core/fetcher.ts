import type { FetchResult } from './types.js';

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36 storefront-agent-audit';
const GPTBOT_UA =
  'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot';

export interface FetcherOptions {
  timeoutMs?: number;
  maxRetries?: number;
}

/**
 * Polite fetcher: per-request timeout, backoff on 429/503 honouring Retry-After.
 * The audit must never hammer a live storefront.
 */
export function createFetcher(base: string, opts: FetcherOptions = {}) {
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const maxRetries = opts.maxRetries ?? 2;

  return async function fetchPath(
    path: string,
    init: { ua?: 'browser' | 'gptbot'; method?: string; body?: string; headers?: Record<string, string> } = {},
  ): Promise<FetchResult> {
    const url = path.startsWith('http') ? path : `${base}${path}`;
    const ua = init.ua === 'gptbot' ? GPTBOT_UA : BROWSER_UA;

    let attempt = 0;
    for (;;) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, {
          method: init.method ?? 'GET',
          redirect: 'follow',
          headers: { 'user-agent': ua, accept: '*/*', ...init.headers },
          ...(init.body !== undefined ? { body: init.body } : {}),
          signal: controller.signal,
        });
        if ((res.status === 429 || res.status === 503) && attempt < maxRetries) {
          const retryAfter = Number(res.headers.get('retry-after')) || 2 ** attempt;
          await sleep(Math.min(retryAfter, 10) * 1000);
          attempt += 1;
          continue;
        }
        const body = await res.text();
        return {
          url,
          status: res.status,
          ok: res.ok,
          contentType: res.headers.get('content-type') ?? '',
          body,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { url, status: 0, ok: false, contentType: '', body: '', error: message };
      } finally {
        clearTimeout(timer);
      }
    }
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function wordCount(html: string): number {
  const text = stripTags(html);
  return text.length === 0 ? 0 : text.split(' ').length;
}

/**
 * Best-effort bot-challenge detection. Structural markers only; a bare
 * "captcha" mention (e.g. a reCAPTCHA privacy notice) must not trigger it.
 */
export function looksLikeChallenge(html: string): boolean {
  if (/cf-chl|challenge-platform|_cf_chl_opt/i.test(html)) return true;
  const title = /<title>([^<]*)<\/title>/i.exec(html)?.[1] ?? '';
  return /just a moment|attention required|access denied|captcha/i.test(title);
}
