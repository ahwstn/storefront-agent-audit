import { describe, it, expect } from 'vitest';
import { detectMarket, marketLabel } from '../src/core/market.js';
import { marketCheck } from '../src/checks/universal/market.js';
import type { CheckContext, FetchResult, Finding } from '../src/core/types.js';

function home(body: string, url = 'https://gymshark.com/'): FetchResult {
  return { url, status: 200, ok: true, contentType: 'text/html', body };
}

const MULTI = `<html lang="en-US"><head>
<link rel="alternate" hreflang="en-US" href="https://gymshark.com/" />
<link rel="alternate" hreflang="en-GB" href="https://uk.gymshark.com/" />
<link rel="alternate" hreflang="de-DE" href="https://de.gymshark.com/" />
<link rel="alternate" hreflang="x-default" href="https://gymshark.com/" />
</head><body><script>Shopify.currency = {"active":"USD","rate":"1.0"};</script></body></html>`;

const SINGLE = `<html lang="en-GB"><head></head><body><script>Shopify.currency = {"active":"GBP","rate":"1.0"};</script></body></html>`;

describe('market detection', () => {
  it('reads locale and currency from the served page', () => {
    const m = detectMarket(home(MULTI));
    expect(m.locale).toBe('en-US');
    expect(m.currency).toBe('USD');
  });

  it('lists alternates, excluding x-default and the audited page itself', () => {
    const m = detectMarket(home(MULTI));
    expect(m.alternates.map((a) => a.lang)).toEqual(['en-GB', 'de-DE']);
    expect(m.alternates[0]?.href).toBe('uk.gymshark.com');
  });

  it('handles path-based market variants on one host', () => {
    const body = `<html lang="en"><head>
<link rel="alternate" hreflang="en" href="https://shop.com/" />
<link rel="alternate" hreflang="fr" href="https://shop.com/fr" />
</head></html>`;
    const m = detectMarket(home(body, 'https://shop.com/'));
    expect(m.alternates).toEqual([{ lang: 'fr', href: 'shop.com/fr' }]);
  });

  it('reports no alternates for a single-market store', () => {
    const m = detectMarket(home(SINGLE, 'https://shop.co.uk/'));
    expect(m.alternates).toEqual([]);
    expect(marketLabel(m)).toBe('en-GB / GBP');
  });

  it('survives a page with no market signals at all', () => {
    const m = detectMarket(home('<html><body>hi</body></html>'));
    expect(m.locale).toBeUndefined();
    expect(m.currency).toBeUndefined();
    expect(m.alternates).toEqual([]);
    expect(marketLabel(m)).toBeNull();
  });
});

describe('market-context check', () => {
  function ctx(body: string, url?: string): CheckContext {
    return {
      domain: 'gymshark.com', base: 'https://gymshark.com',
      home: home(body, url), sampleSize: 8, now: () => '2026-01-01T00:00:00Z',
      fetch: async () => ({ url: '', status: 404, ok: false, contentType: '', body: '' }),
    };
  }

  it('passes and names the audited market when alternates are declared', async () => {
    const f = (await marketCheck.run(ctx(MULTI))) as Finding;
    expect(f.status).toBe('pass');
    expect(f.narrative).toContain('en-US / USD');
    expect(f.narrative).toContain('2 other market variant');
    expect(f.narrative).toContain('uk.gymshark.com');
  });

  it('reports info, not fail, when no alternates are declared', async () => {
    const f = (await marketCheck.run(ctx(SINGLE, 'https://shop.co.uk/'))) as Finding;
    expect(f.status).toBe('info');
    expect(f.narrative).toContain('en-GB / GBP');
  });
});
