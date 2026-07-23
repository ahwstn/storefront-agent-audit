# storefront-agent-audit

**Audit what AI shopping agents can actually see on a Shopify storefront.** One command, no install, no signup.

Agent-first by design: you can run it yourself, or ask your AI assistant to run it and read the results back to you in plain English.

```bash
npx storefront-agent-audit yourstore.com
```

![Example output: auditing a real Shopify store](docs/media/terminal.svg)

## Why this exists

AI shopping assistants are starting to send real, high-intent shoppers to stores. The catch: the crawlers that feed those recommendations mostly **do not run JavaScript** ([Vercel/MERJ measurement](https://vercel.com/blog/the-rise-of-the-ai-crawler)). So a store that looks immaculate in a browser can be nearly invisible to an agent, and the gap lives in a layer most people have never had a reason to look at.

This tool checks that layer. It is deliberately **not** a general SEO or performance auditor; it looks at one thing (agent-readiness) and tries to do it honestly.

## Run it with your AI assistant

The primary way to use this is through an agent. Tell your assistant:

> Run `npx storefront-agent-audit mystore.com --agent` and tell me what to fix first.

The `--agent` flag emits compact, findings-first markdown written to be read straight into an assistant's context, so you can keep the conversation going ("explain the structured-data one", "draft the fixes in order"). The repo ships a [`SKILL.md`](./SKILL.md) so assistants that support skills can install it.

## What it checks

Grouped by what each finding means for you:

- **Findable** — can agents reach and discover you: `llms.txt` / `agents.md` (present, default, or customised, and if customised, whether it is any good), robots.txt rules parsed *per AI crawler* against product paths (not just mentions).
- **Understandable** — can agents parse your products: description completeness across a sampled catalogue window, JavaScript-off content across several product pages, JSON-LD structured-data field completeness (handles `@graph` nesting).
- **Trustworthy** — will agents recommend you: published policy pages, errors visible in served markup.
- **Actionable** — can agents connect to transact: storefront MCP endpoint, UCP manifest. *(Connectivity only; not proof a checkout completes.)*

Every finding ships with its own honesty caveat. The tool tells you what it cannot see.

## Scope and honesty

- Measures the **HTTP fetch layer** (relevant to non-rendering crawlers). Search-engine crawlers (Googlebot, Bingbot) and agentic browsers *do* render JavaScript; that is out of scope for this version and said so in the output.
- Findings are a **point-in-time snapshot** of public endpoints. Nothing is written; no login required.
- Product sampling uses the newest published products, stated as such, not the whole catalogue.
- Shopify-first. Non-Shopify stores get the platform-neutral checks with a clear note.

## Options

```
--json           Full findings as JSON (lossless, for CI or scripts)
--agent          Compact markdown for an AI assistant
--check <id>     Run a single check
--sample <n>     Product pages to sample (default 8)
--no-color       Plain terminal output
```

Exit codes: `0` clean, `1` tool error, `2` findings present (for CI).

## Contributing

Issues and PRs welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md). Built by [Alec Hewstone](https://github.com/ahwstn).

## Licence

MIT.
