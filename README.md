# Design System Tokens Sync

Turn Figma variables into production-ready DTCG design tokens.

Figma variables → [DTCG design tokens](https://design-tokens.github.io/community-group/format/) · headless · no build step · no API required.

**Four pieces, one pipeline:**

- **Figma plugin** — [Raw Design Tokens Exporter](https://www.figma.com/community/plugin/1641072475539163081/raw-design-tokens-exporter) exports your file's variables as JSON.
- **Converter** — transforms JSON into DTCG tokens, one file per collection, with aliases, semantics and modes.
- **Claude Code skill** — runs the whole flow with `/tokens-sync` and shows a diff of what changed.
- **tokens.css** — `/tokens-sync` also writes a browser-ready `tokens.css`.

## Why do I need this?

Your Figma variables are already the design system. They just don't look like one when Figma exports them, and most plugins bury them under another layer of UI and config. `/tokens-sync` is different — one command, and your variables land in code as structured DTCG collections, with modes, aliases, and scope-aware naming semantics.

- **Modes & aliases.** All modes survive the sync, configurable via the `$extensions` key.
  
- **Token semantics & taxonomy.** When `color.button.bg` points at `color.brand.primary` in Figma, it does the same in your tokens. The semantic layer your team relies on is kept safe after the sync.
  
- **Sync comparison.** The Claude skill prints a token-by-token diff (`+ added`, `− removed`) after each run, so design system changes stay in sync.

- **tokens.css.** One `tokens.css` file that unifies all of a project's tokens into a single source of truth.
  
- **Stack.** Native TypeScript on Node ≥22.6 — no bundler, no UI, no build step. Just clone, install, sync.


## Claude Code skill Installation

If you use [Claude Code](https://claude.com/claude-code), clone this repo into your skills folder:

```bash
git clone https://github.com/bunind/tokens-sync.git ~/.claude/skills/tokens-sync
```

Then in any Claude Code session, run `/tokens-sync`. The skill walks you through exporting and syncing. On each subsequent run, it shows exactly which tokens were added or removed in the selected directory, and writes an up-to-date `tokens.css` alongside them.

## Full installation

### 1. Install the Figma plugin (one-time)

Open [Raw Design Tokens Exporter](https://www.figma.com/community/plugin/1641072475539163081/raw-design-tokens-exporter) on Figma Community. Click **Save** to pin it to your account, or **Open in…** to run it once. It then lives under **Plugins → Raw Design Tokens Exporter** in any Figma file.

### 2. Export variables from Figma

In your Figma file, run **Plugins → Raw Design Tokens Exporter**. The plugin exports `tokens-<fileKey>-<timestamp>.json` to `~/Downloads`, or any folder of your choice.

### 3. Convert to DTCG tokens

```bash
cd converter
node cli.ts /path/to/tokens-<fileKey>-<timestamp>.json
```

One `*.tokens.json` file per Figma collection, written next to the input (override with `--out`).

#### CLI options

```
tokens-sync <input-path> [options]

Options:
  --input <path>           Explicit raw JSON path (overrides positional).
  --config <path>          Explicit config file. Skips upward discovery.
  --out <path>             Output folder. Overrides config and input dir.
  --theme-extension <key>  $extensions key for multi-mode values.
  --dry-run                Test run without touching the filesystem.
  --init                   Skips the main menu and starts the tokens sync.
  -h, --help               Show usage.
```

#### Config file

Create `tokens-sync.config.json` next to your tokens folder to lock in:

```json
{
  "out": "./tokens",
  "themeExtension": "default.modes",
  "preserve": ["manifest.json", "resolver/**"]
}
```

Get started:

```bash
node cli.ts --init
```

## Requirements

- **Node ≥22.6** — the converter runs TypeScript natively, no build step. *(On Node 22.6–22.18, pass `--experimental-strip-types` to `node`; Node ≥23 strips by default.)*
- **Figma** — any account works. The plugin runs from Figma Community; no developer mode needed.

## License

[MIT LICENSE](LICENSE)

© 2026 Dmitrii Bunin — [BuninUX](https://buninux.com)
