#!/usr/bin/env bash
# One-shot conversion pipeline for the tokens-sync skill.
# Picks the newest tokens-*.json in the tokens folder, snapshots existing
# *.tokens.json files, runs the converter, snapshots again, and emits
# structured markers the skill parses to render the Post-sync diff tree.
#
# Usage: sync.sh <tokens-folder> <repo-root>
set -u

TF="${1:?tokens folder required}"
RR="${2:?repo root required}"

cd "$TF" || { echo "::ERR::cd failed: $TF"; exit 1; }

RAW=$(ls -t tokens-*.json 2>/dev/null | head -1)
if [ -z "$RAW" ]; then
  echo "::ERR::no tokens-*.json found in $TF"
  exit 2
fi
echo "::RAW::$RAW"

emit_snapshot() {
  find . -name "*.tokens.json" -type f 2>/dev/null | sort | while IFS= read -r f; do
    echo "::FILE::$f"
    cat "$f"
    echo
    echo "::ENDFILE::"
  done
}

echo "::BEFORE_BEGIN::"
emit_snapshot
echo "::BEFORE_END::"

echo "::CONVERT_BEGIN::"
node "$RR/converter/cli.ts" "$PWD/$RAW" 2>&1
CE=$?
echo "::CONVERT_END::$CE"

echo "::AFTER_BEGIN::"
emit_snapshot
echo "::AFTER_END::"

# Emit a browser-ready tokens.css into the user-selected folder, alongside the
# DTCG tree the converter just wrote. Best-effort and silent: only runs after a
# clean conversion, sends all output to /dev/null, and never changes the exit
# code the skill keys off — so the skill UI is unaffected.
if [ "$CE" -eq 0 ]; then
  node "$RR/converter/cli.ts" css --tokens "$TF" --out "$TF/tokens.css" >/dev/null 2>&1 || true
fi

exit $CE
