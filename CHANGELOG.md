# Changelog

## 0.1.0 (unreleased)

First release.

- Thirteen checks across Findable / Understandable / Trustworthy / Actionable.
- Retrieval-quality check: shops the store as an agent (runs a real budget query through the store's own MCP search and grades price-constraint adherence), the layer HTML reading cannot see.
- Terminal, `--json` and `--agent` output; a category with no assessable checks reports "not assessed" rather than passing.
- MCP server (`storefront-agent-audit-mcp`) exposing the `audit_store` tool over stdio.
- Shopify-first with a platform-neutral core.
