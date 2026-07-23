# agents.md

Guidance for AI agents and assistants working with this repository.

## What this project is

`storefront-agent-audit` is a command-line tool that audits what AI shopping agents can see on a Shopify storefront. It is agent-first: its primary consumer is an AI assistant running it on a user's behalf.

## Running it

```bash
npx storefront-agent-audit <domain> --agent
```

Use `--agent` for machine-readable, token-frugal markdown. Use `--json` for the full lossless findings model. The tool is read-only and needs no credentials. See [SKILL.md](./SKILL.md) for how to interpret and relay the output.

## Working on the code

- TypeScript, Node 20+, ESM. `npm run dev -- <domain>` runs from source.
- `npm test` runs the offline fixture suite. `npm run lint` type-checks.
- Architecture: `src/core` (fetcher, findings model, engine, renderers), `src/checks/universal` (platform-neutral), `src/checks/shopify` (Shopify-specific). Both emit the same `Finding` type.
- **The load-bearing rule:** interpretation (narrative, remediation, summary) lives in the checks, computed once. Renderers in `src/render` are lossy projections and must never synthesise their own copy. If you are writing user-facing prose in a renderer, it belongs in a check.
- Every finding must carry an honesty caveat where the check has known limits.
