#!/bin/sh
# M-P5 gate after the round-2 fix (N1, 0c26778). Runs, in order and never in parallel:
#   1. `ubp check --all` in v6 (C-release is the full `npm run verify:release`) and a commit of
#      the evidence it records;
#   2. a clean checkout of HEAD outside the v6 tree, installed with `npm ci` from v6's lockfile;
#   3. there: `ubp check --all --root <clean checkout>` (milestone gate step 1), `npm pack
#      --dry-run --json`, install / --doctor --json / --uninstall with HOME and --config-dir in
#      a fresh directory (never the real HOME), and both Skill Creator validators on HEAD's Skill;
#   4. removal of the clean checkout.
# Node 22 is not rerun: round 2 recorded it as ceiling 14, and this change touches only the
# Skill text and one package test.
set -u
V="/Users/rocky243/Context Engineering/ultra-builder-pro-cli-v6"
L="$V/.ultra/.runtime/v6/p5"
cd "$V" || exit 2
test "$(git rev-parse --show-toplevel)" = "$V" || exit 2

{ echo "head=$(git rev-parse HEAD)"; date -u +%FT%TZ; uptime; } > "$L/r3-check-all.log"
node bin/install.js check --all >> "$L/r3-check-all.log" 2>&1
code=$?; echo "exit=$code" >> "$L/r3-check-all.log"; date -u +%FT%TZ >> "$L/r3-check-all.log"
[ "$code" -eq 0 ] || { echo "stop: check --all failed"; exit 1; }
if ! git diff --quiet -- .ultra/ledger/evidence.jsonl; then
  git add .ultra/ledger/evidence.jsonl
  git commit -q -m "chore(ultra): record M-P5 evidence after the N1 fix

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
fi

T=$(mktemp -d "${TMPDIR:-/tmp}/ubp-v6-gate.XXXXXX") || exit 2
C="$T/src"
git worktree add --detach "$C" HEAD > "$L/r3-worktree.log" 2>&1 || exit 2
cd "$C" || exit 2
{ echo "head=$(git rev-parse HEAD)"; echo "status:"; git status --short; node --version; npm --version; } \
  > "$L/r3-env.log" 2>&1

npm ci > "$L/r3-npm-ci.log" 2>&1; echo "exit=$?" >> "$L/r3-npm-ci.log"
{ date -u +%FT%TZ; uptime; } > "$L/r3-clean-check-all.log"
node bin/install.js check --all --root "$C" >> "$L/r3-clean-check-all.log" 2>&1
echo "exit=$?" >> "$L/r3-clean-check-all.log"; date -u +%FT%TZ >> "$L/r3-clean-check-all.log"
npm pack --dry-run --json > "$L/r3-pack.json" 2> "$L/r3-pack.stderr.log"; echo "exit=$?" >> "$L/r3-pack.stderr.log"

ISO="$V/.ultra/.runtime/v6/p5-work/iso3-$(date +%Y%m%d%H%M%S)"
mkdir -p "$ISO/home" "$ISO/cfg"
{
  echo "iso=$ISO"
  echo "--- install"
  HOME="$ISO/home" node bin/install.js --all --global --config-dir "$ISO/cfg"; echo "exit=$?"
  echo "--- doctor"
  HOME="$ISO/home" node bin/install.js --all --global --config-dir "$ISO/cfg" --doctor --json; echo "exit=$?"
  echo "--- uninstall"
  HOME="$ISO/home" node bin/install.js --all --global --config-dir "$ISO/cfg" --uninstall; echo "exit=$?"
  echo "--- left after uninstall"
  find "$ISO/cfg" "$ISO/home" -mindepth 1 | sed "s#$ISO#<iso>#"
} > "$L/r3-doctor.log" 2>&1

{ echo "head=$(git rev-parse HEAD)"; echo "skill_sha=$(git rev-parse HEAD:skills/ultra/SKILL.md)"
  for q in /Users/rocky243/.codex/skills/.system/skill-creator/scripts/quick_validate.py \
    /Users/rocky243/.claude/plugins/marketplaces/claude-plugins-official/plugins/skill-creator/skills/skill-creator/scripts/quick_validate.py; do
    echo "validator=$q"; python3 "$q" "$C/skills/ultra"; echo "exit=$?"
  done; } > "$L/r3-skill-validate.log" 2>&1

cd "$V" && git worktree remove --force "$C"; echo "removed=$?" >> "$L/r3-clean-check-all.log"
rmdir "$T" 2>/dev/null
echo done
