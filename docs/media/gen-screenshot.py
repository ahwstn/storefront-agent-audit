#!/usr/bin/env python3
"""Generate a terminal-style SVG screenshot of real audit output for the README."""
import html

# (text, colour) segments per line. None colour = default foreground.
FG = "#c8d3dc"
DIM = "#6b7784"
GREEN = "#4ec9a4"
YELLOW = "#e6c07b"
RED = "#e06c75"
BOLD = "#ffffff"

lines = [
    [("storefront-agent-audit 0.1.0", BOLD), (" · ", DIM), ("kyliecosmetics.com", BOLD), (" · 2026-07-23", DIM)],
    [("HTTP fetch layer only: what non-rendering AI crawlers receive.", DIM)],
    [("Audited market: en / CAD · 56 other market variants exist", DIM)],
    [("", FG)],
    [("  ! ", YELLOW), ("FINDABLE        ", BOLD), ("room to improve", YELLOW)],
    [("      ", FG), ("✓ ", GREEN), ("Audited the en/CAD market; 56 declared variants agents can find", FG)],
    [("      ! ", YELLOW), ("llms.txt / agents.md present but Shopify's default (nobody customises)", FG)],
    [("      ", FG), ("✓ ", GREEN), ("All major AI crawlers allowed to reach product pages", FG)],
    [("", FG)],
    [("  ✗ ", RED), ("UNDERSTANDABLE  ", BOLD), ("needs work", RED)],
    [("      ✗ ", RED), ("49 of the newest 50 products have no description at all", FG)],
    [("      ! ", YELLOW), ("Structured data: 4 of 8 pages have a description, 0 have a SKU", FG)],
    [("      ", FG), ("✓ ", GREEN), ("163 to 480 words readable per page without JavaScript", FG)],
    [("", FG)],
    [("  ! ", YELLOW), ("TRUSTWORTHY     ", BOLD), ("room to improve", YELLOW)],
    [("      ! ", YELLOW), ("Third-party app error visible in served markup on 7 of 8 pages", FG)],
    [("      ", FG), ("✓ ", GREEN), ("Refund, shipping, privacy and terms policies all published", FG)],
    [("", FG)],
    [("  ✗ ", RED), ("ACTIONABLE      ", BOLD), ("needs work", RED)],
    [("      ", FG), ("✓ ", GREEN), ("Storefront MCP endpoint live; UCP manifest published", FG)],
    [("      ✗ ", RED), ("Budget search: only 20% of results honoured a $25 price filter", FG)],
    [("", FG)],
    [("  12 findings · 2 fail · 4 warn · 6 pass", DIM)],
    [("  Full detail: --json  ·  For your AI assistant: --agent", DIM)],
]

char_w = 7.6
line_h = 20
pad_x = 20
pad_top = 44
width = 720
height = pad_top + len(lines) * line_h + 16

out = []
out.append(f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" font-size="13">')
out.append(f'<rect width="{width}" height="{height}" rx="10" fill="#0f1720"/>')
out.append(f'<rect width="{width}" height="30" rx="10" fill="#1b2530"/>')
out.append(f'<rect y="20" width="{width}" height="10" fill="#1b2530"/>')
for i, col in enumerate(["#ff5f56", "#ffbd2e", "#27c93f"]):
    out.append(f'<circle cx="{20 + i*20}" cy="15" r="6" fill="{col}"/>')
out.append(f'<text x="{width/2}" y="19" fill="{DIM}" text-anchor="middle" font-size="11">storefront-agent-audit</text>')
for r, segs in enumerate(lines):
    y = pad_top + r * line_h
    x = pad_x
    for text, colour in segs:
        if not text:
            continue
        weight = ' font-weight="600"' if colour == BOLD else ''
        out.append(f'<text x="{x:.1f}" y="{y}" fill="{colour}"{weight} xml:space="preserve">{html.escape(text)}</text>')
        x += len(text) * char_w
out.append('</svg>')
open("docs/media/terminal.svg", "w").write("\n".join(out))
print("wrote docs/media/terminal.svg", height, "px tall")
