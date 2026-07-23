#!/usr/bin/env node
import { runAudit, exitCode } from './core/engine.js';
import { renderTerminal, renderJson, renderAgent } from './render/index.js';

const HELP = `storefront-agent-audit <store-domain> [options]

Audit what AI shopping agents can see on a Shopify storefront.
Agent-first: designed to be run by your AI assistant.

Options:
  --json           Machine-readable findings (the full model, lossless)
  --agent          Compact markdown for an AI assistant to read into context
  --check <id>     Run a single check by id
  --sample <n>     Number of product pages to sample (default 8)
  --no-color       Disable colour in the terminal output
  -h, --help       Show this help

Examples:
  npx storefront-agent-audit yourstore.com
  npx storefront-agent-audit yourstore.com --agent
`;

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv.includes('-h') || argv.includes('--help')) {
    process.stdout.write(HELP);
    process.exit(argv.length === 0 ? 1 : 0);
  }
  const positional = argv.filter((a) => !a.startsWith('-'));
  const domain = positional[0];
  if (!domain) { process.stderr.write('Error: a store domain is required.\n'); process.exit(1); }

  const flag = (name: string): string | undefined => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };

  const opts: Parameters<typeof runAudit>[1] = { sampleSize: Number(flag('--sample')) || 8 };
  const only = flag('--check');
  if (only) opts.only = only;

  const report = await runAudit(domain, opts);

  if (argv.includes('--json')) process.stdout.write(renderJson(report) + '\n');
  else if (argv.includes('--agent')) process.stdout.write(renderAgent(report) + '\n');
  else {
    const color = !argv.includes('--no-color') && process.env.NO_COLOR === undefined && process.stdout.isTTY;
    process.stdout.write(renderTerminal(report, color) + '\n');
  }
  process.exit(exitCode(report));
}

main().catch((err) => {
  process.stderr.write(`storefront-agent-audit failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
