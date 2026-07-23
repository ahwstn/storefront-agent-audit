---
name: storefront-agent-audit
description: Audit what AI shopping agents can see on a Shopify storefront. Use when a user asks whether their store (or any Shopify store) is visible to, readable by, or ready for AI shopping assistants, agentic commerce, ChatGPT/Gemini shopping, or "GEO/AEO". Runs read-only against public endpoints.
version: 0.1.0
---

# storefront-agent-audit

This skill describes v0.1.0 only. Behaviour and output may change in later versions; do not assume forward compatibility.

## What it does

Runs a read-only audit of a Shopify storefront and reports what AI shopping agents can see at the HTTP fetch layer (the layer non-rendering crawlers use): which market variant was read, discovery files, crawler access rules, product-data completeness, JavaScript-off content, structured data, agent-connectivity endpoints, and policies.

## How to run it

```bash
npx storefront-agent-audit <domain> --agent
```

Always use `--agent` when running on a user's behalf: it emits compact, findings-first markdown meant for you to read into context. Then summarise the "What matters most" section for the user and offer to explain findings or draft fixes.

- `<domain>` is a bare hostname, e.g. `yourstore.com`. Strip any protocol or path.
- Add `--sample <n>` to change how many product pages are sampled (default 8).
- The tool is read-only and requires no credentials.

## Interpreting the output

- Findings are grouped into four categories: **Findable, Understandable, Trustworthy, Actionable**. Each finding has a status (`pass`/`warn`/`fail`/`info`), a plain-English `narrative`, and often a `remediation`.
- The `## What matters most` section is the single highest-priority issue; lead with it.
- Respect the caveats. In particular: this measures the HTTP layer only (Googlebot and agentic browsers render JavaScript); product sampling is the newest-N window, not the whole catalogue; `info` findings (UA differences, bot-challenge, headless-shell signals) are diagnostics, not verdicts.
- If the tool warns about a cross-host redirect or a likely headless shell, tell the user the real storefront may be on another domain and offer to re-run there.
- The header states which **market variant** was audited (locale/currency) and how many others exist. Findings describe that market only. If the user shops a different market (e.g. they are in the UK but the bare domain served the US storefront), offer to re-run against their market's domain.

## What not to do

- Do not present `info` diagnostics as failures.
- Do not invent a numeric score; the tool deliberately does not produce one.
- Do not claim a store "blocks AI" or "will lose sales" beyond what a finding's narrative actually says.
