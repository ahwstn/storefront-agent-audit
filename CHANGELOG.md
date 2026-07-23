# Changelog

## 0.1.2

- Hard audit time budget (120s default). A store that slow-walks connections (bot-mitigation tarpits) now produces a partial report with skipped checks marked "not assessed" and a warning, instead of hanging the caller indefinitely.

## 0.1.1

- Agent output now groups findings by category and carries explicit presentation guidance, so assistants render the full structured report (and never add scores or unmeasured claims of their own).
- README: new section on why an AI-written audit is not a measurement, and how the two combine.

## 0.1.0

First release.

- Thirteen checks across Findable / Understandable / Trustworthy / Actionable.
- Retrieval-quality check: shops the store as an agent (runs a real budget query through the store's own MCP search and grades price-constraint adherence), the layer HTML reading cannot see.
- Terminal, `--json` and `--agent` output; a category with no assessable checks reports "not assessed" rather than passing.
- MCP server (`storefront-agent-audit-mcp`) exposing the `audit_store` tool over stdio.
- Shopify-first with a platform-neutral core.
