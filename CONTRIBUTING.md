# Contributing

Issues and pull requests are welcome.

- `npm install`, then `npm run dev -- yourstore.com` to run from source.
- `npm test` runs the offline fixture suite; `npm run lint` type-checks.
- New checks go in `src/checks/universal` (platform-neutral) or `src/checks/shopify`, and must return the shared `Finding` type with an honesty caveat where limits exist.
- Keep interpretation in checks, never in renderers.
