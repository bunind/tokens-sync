---
name: tokens-sync
description: Operate the full Figma → DTCG design tokens pipeline end-to-end. Guides the user through tokens export, and converting resulted raw JSON into a DTCG token tree via the local converter CLI. Use when the user types /tokens-sync, asks to sync Figma variables to DTCG tokens, wants to export design tokens from Figma, or mentions tokens-sync.
---

# tokens-sync

Operate the tokens-sync pipeline (Figma plugin + Node converter) from one menu. State persists between runs.

## Interaction model

**Every choice MUST use `AskUserQuestion`** — no numbered text menus, no `yes/no` lines. It provides arrow-key option navigation.

Rules for every `AskUserQuestion` call in this skill:
- Use single-select (`multiSelect: false`).
- List the primary action first. Do NOT append `(Recommended)` to any option label — the leading position alone conveys the default.
- Keep labels short (1–5 words) and put context in the `description`.
- Treat the returned `label` (not an index) as the selection. Re-render the same question only if the runtime returns nothing; otherwise act on the chosen option.
- Folder paths use a plain text prompt — there is no arrow-key affordance for arbitrary strings. Everything else (menu selection, continue/cancel, retry/change folder) goes through `AskUserQuestion`.
- Angle-bracketed tokens in option text (e.g. `<lastTokensFolder>`) are runtime placeholders. Substitute each with the corresponding state value at render time. If the state value is undefined (e.g. on a first-time run), omit the placeholder **and** the preposition/phrase that introduces it — render the surrounding sentence as if the clause were never there. Never display literal `<…>` to the user.

## Banner

Print once per invocation before the first `AskUserQuestion`.

```
DESIGN TOKENS SYNC v1.0
```

## State file

Path: `~/.claude/skills/tokens-sync/state.json`

Shape:
```json
{
  "repoRoot": "<absolute path to the tokens-sync repo root>",
  "lastTokensFolder": "<absolute path to user's tokens folder>"
}
```

Read it on every invocation. Missing file = empty state. Always write back with `mkdir -p` on the parent. Preserve any existing keys when writing — never drop one key while updating the other.

### Persisting state

Persistence MUST be silent — no write errors surface to the user.

Write `state.json` via Bash heredoc (`cat <<'EOF' > <state-path>` or equivalent). Do NOT use the Write tool — it requires a prior Read and errors on stale reads.

Example (run via Bash):
```
mkdir -p "$(dirname '<state-path>')" && cat <<'EOF' > '<state-path>'
{
  "repoRoot": "<resolved-absolute-repo-root>",
  "lastTokensFolder": "<resolved-absolute-folder>"
}
EOF
```

If the Bash write fails for any reason, surface only a single concise line (see [Error messages](#error-messages)) and continue the flow — never abort the conversion the user already approved.

## Error messages

Use these exact strings for every user-facing failure surface. Do not paraphrase.

- **Folder doesn't exist** (Sync Tokens path entry, Change Tokens Folder): `Error: folder not found — <path>`
- **Folder exists but contains no `tokens-*.json`** (Sync Tokens path entry, Change Tokens Folder, Sync recovery): `Error: no tokens-*.json in <path>`
- **`state.json` write failure** (silent except for one fallback line): `Note: couldn't save state (continuing anyway)`

For converter `::ERR::<message>` markers, surface the message verbatim on its own line and stop.

Format rule: one line, no stack trace, no advice — advice belongs in the recovery `AskUserQuestion` that follows.

## Bootstrap: locate the repo (one-time)

The skill is invocable from ANY working directory. The repo location is stored in `state.json` under `repoRoot` and read on every run.

The skill-loading header provides `Base directory for this skill: <abs path>` — that's the canonical repo location. Probe it first.

On every invocation, before showing any menu:

1. Read `state.json`. Let `repoRoot` = the stored value (may be missing).
2. If `repoRoot` is present and non-empty, **trust it optimistically** — do NOT run an `ls` validation prompt. If the path is wrong, the conversion Bash call below will fail and we re-prompt then. This is the common path and MUST issue zero permission prompts.
3. If `repoRoot` is missing or empty:
   - **Probe the skill's base directory** via Bash: `ls <skill-base-dir>/converter/cli.ts` with `description: "Check tokens-sync files exist"`. If it exists, set `repoRoot = <skill-base-dir>`, persist silently, and continue.
   - Otherwise prompt (plain text):
     ```
     Couldn't auto-detect the tokens-sync repo at the skill's install location.

     Enter the absolute path to the tokens-sync repo root (the folder containing /converter):
     ```
     Resolve `~` against `$HOME`. Re-validate `converter/cli.ts` exists. On failure, print a one-line error in the [Error messages](#error-messages) format and re-prompt. Never exit on bad input.
   - On success, persist `repoRoot` in `state.json` (preserving any existing `lastTokensFolder`), then continue.
4. From this point on, ALL references to `<repoRoot>` below refer to the validated, persisted path.

## Branch

- `lastTokensFolder` missing → **First Time Run**
- `lastTokensFolder` present → **Second Time Run**

## First Time Run

Render the banner, then ask via `AskUserQuestion`:

- **question**: `What would you like to do?`
- **header**: `Action`
- **options**:
  1. `Export variables from Figma` — *Figma → exported variables in `~/Downloads`.*
  2. `Sync variables to tokens` — *Exported variables in `<lastTokensFolder>` → DTCG tokens.*

### Option — Export variables from Figma

Print:

```
Run the Raw Design Tokens Exporter Figma plugin:
  • First time only: open https://www.figma.com/community/plugin/1641072475539163081/raw-design-tokens-exporter
    in Figma desktop and click "Open in…" (or "Save" to pin it to your account).
  • In your Figma file, run Plugins → Raw Design Tokens Exporter.
  • It downloads tokens-<fileKey>-<timestamp>.json to ~/Downloads.
  • Move that file into the folder you'll point Sync at next.
```

Then ask via `AskUserQuestion`:

- **question**: `Ready to sync?`
- **header**: `Next step`
- **options**:
  1. `Yes, sync` — *Run the sync on `<lastTokensFolder>`.*
  2. `Not yet` — *Stay on this step; reprint the plugin instructions.*

On `Yes, sync`, advance to **Sync variables to tokens**. On `Not yet`, re-print the instructions and re-ask the same question. Never exit from this loop.

### Option — Sync variables to tokens

Prompt (plain text, since the user is entering a path):
```
Enter the absolute path to the folder containing the exported raw JSON file:

  Example: /Users/you/Documents/tokens
```

Resolve `~` against `$HOME`. The path must be absolute. Validate:
- Folder exists.
- Folder contains at least one file matching `tokens-*.json`.

On validation failure, print the canonical error string (see [Error messages](#error-messages)), then ask via `AskUserQuestion`:

- **question**: `Couldn't use that folder. What would you like to do?`
- **header**: `Retry`
- **options**:
  1. `Try a different folder` — *Re-enter an absolute path.*
  2. `Back to main menu` — *Return to main menu.*

On success:
1. Persist `lastTokensFolder` = resolved folder.
2. Run the [Conversion pipeline](#conversion-pipeline) against the resolved folder.

## Second Time Run

Render the banner, then ask via `AskUserQuestion`:

- **question**: `What would you like to do?`
- **header**: `Action`
- **options**:
  1. `Sync variables to tokens` — *Exported variables in `<lastTokensFolder>` → DTCG tokens.*
  2. `Export variables from Figma` — *Figma → exported variables in `~/Downloads`.*
  3. `Change folder` — *Use a different folder.*

Substitute the absolute `lastTokensFolder` path into option 1's description. Descriptions are plain text and may wrap on narrow terminals.

### Option — Export variables from Figma

Identical to First-Time Export variables from Figma, including the `Ready to sync?` `AskUserQuestion` loop. On `Yes, sync`, jump straight to **Sync variables to tokens** against `lastTokensFolder` — do not re-prompt for a path.

### Option — Sync variables to tokens

- Do not prompt for a path.
- Pick the newest `tokens-*.json` inside `lastTokensFolder`.
- If the folder or any matching file is missing, print the canonical error string (see [Error messages](#error-messages)) and ask via `AskUserQuestion`:
  - **question**: `No exported variables in <lastTokensFolder>. What now?`
  - **header**: `Recover`
  - **options**:
    1. `Pick a different folder` — *Sync from somewhere else.*
    2. `Export from Figma` — *Run the plugin again.*
    3. `Cancel` — *Return without syncing.*
- Otherwise: run the [Conversion pipeline](#conversion-pipeline) against `lastTokensFolder`.

### Option — Change folder

Prompt (plain text) for a new absolute folder path with the same hint as First-Time Sync Tokens. Validate exists + contains `tokens-*.json`.

On validation failure, print the canonical error string (see [Error messages](#error-messages)) and ask via `AskUserQuestion`:

- **question**: `Couldn't use that folder. What would you like to do?`
- **header**: `Retry`
- **options**:
  1. `Try a different folder` — *Re-enter an absolute path.*
  2. `Keep current folder <lastTokensFolder>` — *Discard the change and return.*

On validation success, ask via `AskUserQuestion`:

- **question**: `Found <matched-filename> in <path>. Sync now?`
- **header**: `Sync`
- **options**:
  1. `Sync now` — *Sync this file to DTCG tokens.*
  2. `Save folder only` — *Remember this folder for next time; skip the sync.*

Substitute `<matched-filename>` with the basename of the newest `tokens-*.json` (e.g. `tokens-AbCd-1716638400.json`) and `<path>` with the full absolute folder path.

- `Sync now`: overwrite `lastTokensFolder`, then run the [Conversion pipeline](#conversion-pipeline) against the new folder.
- `Save folder only`: overwrite `lastTokensFolder`, return to the main menu without syncing.

## Conversion pipeline

The full conversion runs in a **single Bash invocation** via the helper script `<repoRoot>/sync.sh`. This is the one and only permission prompt the sync flow should ever produce — do not issue separate `ls`, `find`, `Read`, or `node` calls before or after.

Invoke via Bash with `description` set exactly to `Sync tokens`:

```
bash "<repoRoot>/sync.sh" "<tokens-folder>" "<repoRoot>"
```

`<tokens-folder>` is the resolved absolute folder (`lastTokensFolder`, or the just-validated First-Time folder). The script:
1. Picks the newest `tokens-*.json` in the folder.
2. Snapshots every existing `*.tokens.json` under that folder (BEFORE).
3. Runs `node "<repoRoot>/converter/cli.ts" "<raw-json-path>"`.
4. Snapshots every `*.tokens.json` again (AFTER).
5. On a clean conversion (converter exit 0), regenerates `tokens.css` from the updated DTCG tree via `converter/cli.ts css --tokens <folder> --out <folder>/tokens.css`, wrapping its output in CSS markers. This keeps `tokens.css` in sync with the tokens on every successful run.
6. Streams everything to stdout with markers, and exits with the converter's exit code (the CSS step never changes the overall exit code).

### Output markers

The script prints a stream of line-prefixed markers. Parse them in order:

- `::ERR::<message>` — fatal pre-flight error (e.g. bad folder, no raw JSON). Surface the message and stop.
- `::RAW::<filename>` — the raw JSON file the converter will read.
- `::BEFORE_BEGIN::` … `::BEFORE_END::` — pre-conversion snapshot block.
- `::CONVERT_BEGIN::` … `::CONVERT_END::<exit-code>` — converter stdout/stderr, followed by the exit code on the END marker.
- `::AFTER_BEGIN::` … `::AFTER_END::` — post-conversion snapshot block.
- `::CSS_BEGIN::` … `::CSS_END::<exit-code>` — `tokens.css` regeneration output, followed by its exit code on the END marker. Present only when the conversion exited 0.

Inside a snapshot block, each file is wrapped:
```
::FILE::<relative-path>
<file contents>
::ENDFILE::
```

If `::CONVERT_END::` reports a non-zero exit code, surface the converter output between the CONVERT markers and stop — do not render a diff tree.

On success, parse the BEFORE and AFTER blocks into `{ <relative-path>: <parsed JSON> }` maps. Files only present in AFTER count as having an empty BEFORE. Then compute and render the diff per [Post-sync output](#post-sync-output).

## Post-sync output

After a successful run of the [Conversion pipeline](#conversion-pipeline), render a single `Synced tokens` ASCII tree grouped by collection, showing token-path-level adds and removes only.

### Computing the diff

The converter writes one file per collection at `<outDir>/<slug>/<slug>.tokens.json` (see `mapper.ts:52`). One DTCG file = one collection. Using the BEFORE and AFTER maps parsed from the pipeline output:

1. For each file present in either map, flatten the JSON to the set of leaf token paths (the dotted/slashed key path to each DTCG token, excluding `$value`/`$type` metadata keys themselves — i.e. the token's address, not its value). Files absent from BEFORE count as empty.
2. Per collection (per file):
   - `added` = leaf paths present in new ∖ old
   - `removed` = leaf paths present in old ∖ new
   - If both `added` and `removed` are empty, the collection is **unchanged**.

The collection display name is the slug derived from the file path's first segment (e.g. `color/color.tokens.json` → `color`).

### Rendering rules

- Heading line: `Sync complete · +<added> −<removed> across <K> collections` where `<added>` is the total count of added token paths across all collections, `<removed>` is the total count of removed token paths, and `<K>` is the number of collections that had at least one change.
- Tree uses box-drawing characters: `├──`, `└──`, `│`, with `+ ` for adds and `− ` (U+2212) for removes.
- **Only include collections that have at least one added or removed token.** Collections with zero changes are omitted from the tree entirely.
- After the tree, print a single summary line. Use the correct plural form: `1 collection unchanged` (singular) or `N collections unchanged` (plural). Omit the line entirely if `N == 0`.
- If every collection is unchanged, skip the tree and the unchanged-count line entirely and print only: `Already in sync — no changes to write.`
- Do not print the converter's raw `Wrote/= /unchanged/preserved` lines on success — the tree replaces them. Always preserve the converter's stderr on non-zero exit.

### tokens.css confirmation (always shown on a successful sync)

Every successful sync MUST tell the user that `tokens.css` was regenerated, so they know it stays in sync with the converted tokens. Read the `::CSS_BEGIN::` … `::CSS_END::<exit-code>` block and print one line as the **last** line of the post-sync output — after the tree, the unchanged-count line, or the `Already in sync` line:

- `::CSS_END::0` → print: `tokens.css updated` (this line is mandatory; print it even when token paths are unchanged and even on the `Already in sync` branch).
- `::CSS_END::<non-zero>` → print: `⚠ tokens.css regeneration FAILED — tokens.css is now STALE`, then surface the captured output between the CSS markers verbatim. Do not treat this as a failed sync (the DTCG files were written and are valid) — but the warning must be prominent so the user knows to re-run.
- If no CSS block is present (conversion did not exit 0), omit the line — the non-zero `::CONVERT_END::` path already stopped before reaching here.

### Example

```
Sync complete · +4 −1 across 3 collections
├── color
│   ├── + brand/primary-600
│   ├── + brand/primary-700
│   └── − brand/legacy-accent
├── spacing
│   └── + layout/gutter-lg
└── typography
    └── + heading/display-2xl
2 collections unchanged
```

## Invariants

- Every selection between two or more discrete options MUST use `AskUserQuestion`. Numbered text menus and `(yes/no)` text prompts are forbidden in this skill.
- Never run the converter without a validated raw JSON file path.
- Never run the converter without a `repoRoot` value in state.json. The repo files are trusted optimistically — if the path is wrong, the conversion Bash call fails and the user is re-prompted.
- `repoRoot` and `lastTokensFolder` are each updated only after the new path passes validation. Writes to `state.json` must preserve the other key.
- The skill is `cwd`-independent. The repo root is resolved from the skill's base directory or the persisted `state.json`, never from `cwd`.
- If `AskUserQuestion` returns no usable selection (empty/cancelled), re-ask the same question — never exit on missing input.
- All paths are treated as absolute. `~` resolves against `$HOME` before validation. Relative paths are rejected.
- The state file is the source of truth for run mode — re-read it at the start of every invocation.
