#!/bin/bash
# verify-isolation.sh -- harmless end-to-end verification for
# ubp-eval-sandbox.sh and prepare-delegation-config.py.
#
# Every write target lives inside one dedicated temporary parent created by
# this script. The deny semantics are proven against a DECOY home directory
# (the same wrapper code path as production, with --deny-root pointed at the
# decoy). The real HOME is never named as a write target: the only real-HOME
# interaction is one read-only pwd fallback RESOLUTION print (no write),
# whose result is string-compared against the wrapper's default deny root.
#
# Coverage:
#   1   permitted write inside the evaluation project root
#   2   denied direct write under the deny root (A-R7 file shape)
#   3   denied write from child processes (nested sh, and node -- the real
#       evaluation runtime family)
#   4a  missing-HOME pwd fallback resolution (read-only print, no write)
#   4b  missing-HOME/fallback-shaped write aimed at the decoy (A-R7 shape:
#       RECIPES_FILE unset/empty, target = Path.home()/".recipes.json")
#   5a  permitted named-cache writes: cli/rollout, cli/db, cli/exec,
#       cli/artifacts, cli/image-cache (production session stores)
#   5b  denied neighboring config/plugin/security writes under .zcode:
#       cli/config.json, cli/plugins/marketplaces, security, skills, hooks,
#       v2/credentials.json -- existing targets keep their original content
#   6   denied symlink escape from an allowed root into the deny root
#   6b  denied symlink trampoline from INSIDE an allowed named cache into a
#       denied sibling
#   7   denied write via the /tmp alias spelling of a /private/tmp deny root
#   8   permitted read outside all roots (provider auth reads keep working)
#   9   negative control WITHOUT the sandbox (proves the denial above came
#       from the sandbox, not from filesystem permissions)
#   10  profile shape guard: no bare .zcode allow, exactly the seven named
#       caches, deny rule ordered before every allow rule
#   11  prepare-delegation-config.py end-to-end on a synthetic metadata-only
#       registry: receipt_root rewritten, targets preserved, mode 0600,
#       secret-looking field refused
#   12  launch shape: under the default profile, the agent-delegate order
#       (receipt write BEFORE provider-shaped writes) works with the receipt
#       root relocated via the isolated registry and logs relocated via
#       ZCODE_LOG_DIR, plus the named session cache
#
# A case that "must fail" is also checked for file absence/unchanged content
# afterwards: a failing test must itself leave nothing behind. Exit 0 only if
# every expectation holds. On failure the temporary parent is kept for
# inspection and its path is printed.

set -u

HERE="$(cd "$(dirname "$0")" && pwd -P)"
WRAPPER="$HERE/ubp-eval-sandbox.sh"
PREPARE="$HERE/prepare-delegation-config.py"
NODE="${NODE:-/Users/rocky243/.hermes/node/bin/node}"
[ -x "$NODE" ] || NODE="$(command -v node || true)"

if ! command -v python3 >/dev/null 2>&1; then
  echo "SKIP: python3 is required for the fallback-shaped cases" >&2
  exit 2
fi

PARENT="$(mktemp -d /tmp/ubp-eval-isolation-verify.XXXXXX)"
PARENT="$(cd "$PARENT" && pwd -P)"
DECOY="$PARENT/decoy-home"
EVALROOT="$PARENT/eval-root"
mkdir -p "$EVALROOT/project" \
  "$DECOY/.zcode/cli/plugins/marketplaces" \
  "$DECOY/.zcode/security" "$DECOY/.zcode/skills" "$DECOY/.zcode/hooks" \
  "$DECOY/.zcode/v2"
printf 'original\n' > "$DECOY/.zcode/cli/config.json"
printf 'original\n' > "$DECOY/.zcode/v2/credentials.json"

FAILURES=0

ok()   { echo "PASS: $1"; }
bad()  { echo "FAIL: $1"; FAILURES=$((FAILURES + 1)); }

expect_absent() {
  if [ -e "$1" ]; then bad "$2 (unexpected file exists: $1)"; fi
}

expect_content() {
  # $1 path, $2 expected content, $3 label -- a denied write must leave the
  # pre-existing file untouched.
  if [ -f "$1" ] && [ "$(cat "$1")" = "$2" ]; then
    ok "$3"
  else
    bad "$3 (content of $1 changed or file missing)"
  fi
}

run_decoy() {
  # Run a command under the wrapper with the deny root aimed at the decoy.
  "$WRAPPER" --quiet --deny-root "$DECOY" -- "$@"
}

echo "verification parent: $PARENT"
echo "wrapper under test:  $WRAPPER"

echo "--- case 1: permitted write inside the evaluation project root ---"
if run_decoy sh -c 'echo ok > "$1/project/ok.txt"' _ "$EVALROOT" && [ "$(cat "$EVALROOT/project/ok.txt" 2>/dev/null)" = "ok" ]; then
  ok "project-root write succeeded"
else
  bad "project-root write failed"
fi

echo "--- case 2: denied direct write under the deny root ---"
if run_decoy sh -c 'echo synthetic > "$1/.recipes.json"' _ "$DECOY" 2>/dev/null; then
  bad "write under deny root unexpectedly succeeded"
else
  ok "write under deny root denied"
fi
expect_absent "$DECOY/.recipes.json" "case 2"

echo "--- case 3a: denied write from a nested sh child ---"
if run_decoy sh -c 'sh -c "echo synthetic > \"$1/child.txt\""' _ "$DECOY" 2>/dev/null; then
  bad "nested child write unexpectedly succeeded"
else
  ok "nested child write denied"
fi
expect_absent "$DECOY/child.txt" "case 3a"

echo "--- case 3b: denied write from a node child (real runtime family) ---"
if [ -n "$NODE" ]; then
  if run_decoy "$NODE" -e 'require("fs").writeFileSync(process.argv[1],"x")' "$DECOY/node.txt" >/dev/null 2>&1; then
    bad "node child write unexpectedly succeeded"
  else
    ok "node child write denied"
  fi
  expect_absent "$DECOY/node.txt" "case 3b"
else
  echo "SKIP: node not found; case 3b not run"
fi

echo "--- case 4a: missing-HOME pwd fallback resolution (read-only, no write) ---"
RESOLVED="$("$WRAPPER" --quiet -- env -u HOME python3 -c 'from pathlib import Path; print(Path.home())' 2>/dev/null)"
REAL_HOME="$(cd "${HOME:?}" && pwd -P)"
if [ "$RESOLVED" = "$REAL_HOME" ]; then
  ok "pwd fallback resolves to real HOME ('$RESOLVED'); default deny root covers it"
else
  bad "pwd fallback resolved to '$RESOLVED', expected '$REAL_HOME'"
fi

echo "--- case 4b: fallback-shaped write aimed at the decoy (A-R7 shape) ---"
if run_decoy env HOME="$DECOY" RECIPES_FILE= python3 -c '
import os
from pathlib import Path
target = os.environ.get("RECIPES_FILE") or str(Path.home() / ".recipes.json")
with open(target, "w") as fh:
    fh.write("synthetic\n")
print("wrote", target)
' >/dev/null 2>&1; then
  bad "fallback-shaped write to decoy home unexpectedly succeeded"
else
  ok "fallback-shaped write to decoy home denied"
fi
expect_absent "$DECOY/.recipes.json" "case 4b"

echo "--- case 5a: permitted named-cache session writes ---"
CACHE_WRITES_OK=1
run_decoy sh -c '
  set -e
  mkdir -p "$1/.zcode/cli/rollout" "$1/.zcode/cli/db" "$1/.zcode/cli/exec/sess_verify" "$1/.zcode/cli/artifacts/sess_verify" "$1/.zcode/cli/image-cache"
  echo io   > "$1/.zcode/cli/rollout/model-io-sess_verify.jsonl"
  echo db   > "$1/.zcode/cli/db/db.sqlite"
  echo snap > "$1/.zcode/cli/exec/sess_verify/snapshot.sh"
  echo art  > "$1/.zcode/cli/artifacts/sess_verify/out.txt"
  echo img  > "$1/.zcode/cli/image-cache/img.bin"
' _ "$DECOY" || CACHE_WRITES_OK=0
for f in .zcode/cli/rollout/model-io-sess_verify.jsonl .zcode/cli/db/db.sqlite \
         .zcode/cli/exec/sess_verify/snapshot.sh .zcode/cli/artifacts/sess_verify/out.txt \
         .zcode/cli/image-cache/img.bin; do
  [ -f "$DECOY/$f" ] || CACHE_WRITES_OK=0
done
if [ "$CACHE_WRITES_OK" -eq 1 ]; then
  ok "named-cache writes (rollout/db/exec/artifacts/image-cache) succeeded"
else
  bad "named-cache writes failed"
fi

echo "--- case 5b: denied neighboring config/plugin/security writes ---"
DENIED_NEIGHBORS_OK=1
run_decoy sh -c 'echo pwned > "$1/.zcode/cli/config.json"' _ "$DECOY" 2>/dev/null && DENIED_NEIGHBORS_OK=0
run_decoy sh -c 'echo pwned > "$1/.zcode/cli/plugins/marketplaces/x.json"' _ "$DECOY" 2>/dev/null && DENIED_NEIGHBORS_OK=0
run_decoy sh -c 'echo pwned > "$1/.zcode/security/x"' _ "$DECOY" 2>/dev/null && DENIED_NEIGHBORS_OK=0
run_decoy sh -c 'echo pwned > "$1/.zcode/skills/x"' _ "$DECOY" 2>/dev/null && DENIED_NEIGHBORS_OK=0
run_decoy sh -c 'echo pwned > "$1/.zcode/hooks/x"' _ "$DECOY" 2>/dev/null && DENIED_NEIGHBORS_OK=0
run_decoy sh -c 'echo pwned > "$1/.zcode/v2/credentials.json"' _ "$DECOY" 2>/dev/null && DENIED_NEIGHBORS_OK=0
if [ "$DENIED_NEIGHBORS_OK" -eq 1 ]; then
  ok "config/plugin/security/skills/hooks/credentials writes all denied"
else
  bad "a neighboring config/plugin/security write unexpectedly succeeded"
fi
expect_content "$DECOY/.zcode/cli/config.json" "original" "cli/config.json content preserved"
expect_content "$DECOY/.zcode/v2/credentials.json" "original" "v2/credentials.json content preserved"
expect_absent "$DECOY/.zcode/cli/plugins/marketplaces/x.json" "case 5b"
expect_absent "$DECOY/.zcode/security/x" "case 5b"
expect_absent "$DECOY/.zcode/skills/x" "case 5b"
expect_absent "$DECOY/.zcode/hooks/x" "case 5b"

echo "--- case 6: denied symlink escape from an allowed root ---"
ln -s "$DECOY" "$EVALROOT/project/homelink"
if run_decoy sh -c 'echo synthetic > "$1/project/homelink/via-symlink.txt"' _ "$EVALROOT" 2>/dev/null; then
  bad "symlink escape write unexpectedly succeeded"
else
  ok "symlink escape write denied"
fi
expect_absent "$DECOY/via-symlink.txt" "case 6"

echo "--- case 6b: denied symlink trampoline from inside an allowed named cache ---"
ln -s "$DECOY/.zcode/security" "$DECOY/.zcode/cli/rollout/sec-link"
if run_decoy sh -c 'echo pwned > "$1/.zcode/cli/rollout/sec-link/trampoline.txt"' _ "$DECOY" 2>/dev/null; then
  bad "symlink trampoline write unexpectedly succeeded"
else
  ok "symlink trampoline from allowed cache into denied sibling denied"
fi
expect_absent "$DECOY/.zcode/security/trampoline.txt" "case 6b"

echo "--- case 7: denied write via the /tmp alias spelling of the deny root ---"
case "$PARENT" in
  /private/*) ALIAS_PARENT="${PARENT#/private}" ;;
  *)          ALIAS_PARENT="" ;;
esac
if [ -n "$ALIAS_PARENT" ] && [ -d "$ALIAS_PARENT" ]; then
  if run_decoy sh -c 'echo synthetic > "$1/alias.txt"' _ "$ALIAS_PARENT/decoy-home" 2>/dev/null; then
    bad "alias-spelling write unexpectedly succeeded"
  else
    ok "alias-spelling write denied"
  fi
  expect_absent "$DECOY/alias.txt" "case 7"
else
  echo "SKIP: no /tmp alias for $PARENT; case 7 not run"
fi

echo "--- case 8: permitted read outside all roots ---"
if run_decoy sh -c 'head -1 /etc/hosts >/dev/null'; then
  ok "read outside roots succeeded"
else
  bad "read outside roots failed"
fi

echo "--- case 9: negative control without the sandbox ---"
if sh -c 'echo synthetic > "$1/unsandboxed.txt"' _ "$DECOY" && [ -f "$DECOY/unsandboxed.txt" ]; then
  ok "unsandboxed control write succeeded (denials above are attributable to the sandbox)"
  rm -f "$DECOY/unsandboxed.txt"
else
  bad "unsandboxed control write failed; filesystem permissions would invalidate the denial cases"
fi

echo "--- case 10: profile shape guard ---"
KEPT_PROFILE="$PARENT/kept-profile.sb"
if "$WRAPPER" --quiet --deny-root "$DECOY" --profile-out "$KEPT_PROFILE" -- true; then
  PROFILE_OK=1
  if grep -F "(subpath \"$DECOY/.zcode\"))" "$KEPT_PROFILE" >/dev/null; then
    PROFILE_OK=0
    echo "  profile contains a bare .zcode allow:" >&2
    grep -F "(subpath \"$DECOY/.zcode\"))" "$KEPT_PROFILE" >&2
  fi
  for rel in cli/rollout cli/db cli/exec cli/artifacts cli/image-cache cli/pdf-cache cli/video-cache; do
    if ! grep -F "(allow file-write* (subpath \"$DECOY/.zcode/$rel\"))" "$KEPT_PROFILE" >/dev/null; then
      PROFILE_OK=0
      echo "  profile is missing named cache: .zcode/$rel" >&2
    fi
  done
  ALLOW_COUNT="$(grep -c 'allow file-write' "$KEPT_PROFILE")"
  [ "$ALLOW_COUNT" -eq 7 ] || { PROFILE_OK=0; echo "  expected 7 allow rules, found $ALLOW_COUNT" >&2; }
  DENY_LINE="$(grep -n 'deny file-write' "$KEPT_PROFILE" | head -1 | cut -d: -f1)"
  FIRST_ALLOW_LINE="$(grep -n 'allow file-write' "$KEPT_PROFILE" | head -1 | cut -d: -f1)"
  { [ -n "$DENY_LINE" ] && [ -n "$FIRST_ALLOW_LINE" ] && [ "$DENY_LINE" -lt "$FIRST_ALLOW_LINE" ]; } \
    || { PROFILE_OK=0; echo "  deny rule is not ordered before allow rules" >&2; }
  if [ "$PROFILE_OK" -eq 1 ]; then
    ok "profile has no bare .zcode allow, exactly the seven named caches, deny ordered first"
  else
    bad "profile shape violated"
  fi
else
  bad "wrapper run with --profile-out failed"
fi

echo "--- case 11: prepare-delegation-config.py on a synthetic metadata-only registry ---"
SYN="$PARENT/synthetic-registry.json"
cat > "$SYN" <<JSON
{
  "schema_version": 1,
  "acpx_path": "/nonexistent/acpx/dist/cli.js",
  "acpx_config_path": "/nonexistent/acpx/config.json",
  "receipt_root": "$PARENT/global-receipts",
  "default_timeout_seconds": 43200,
  "targets": {"zcode": {"argv": ["/nonexistent/zcode-acp", "--no-browser"]}}
}
JSON
ISO="$EVALROOT/iso"
if python3 "$PREPARE" --source "$SYN" --receipt-root "$ISO/receipts" --out "$ISO/agent-delegation.config.json" >/dev/null; then
  PREP_OK=1
  [ -f "$ISO/agent-delegation.config.json" ] || PREP_OK=0
  MODE="$(stat -f '%Lp' "$ISO/agent-delegation.config.json" 2>/dev/null || echo '?')"
  [ "$MODE" = "600" ] || { PREP_OK=0; echo "  isolated config mode is $MODE, expected 600" >&2; }
  python3 - "$ISO/agent-delegation.config.json" "$ISO/receipts" <<'PY' || PREP_OK=0
import json, sys
from pathlib import Path
cfg = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
expected_root = str(Path(sys.argv[2]).resolve())
assert cfg["schema_version"] == 1, "schema_version changed"
assert cfg["receipt_root"] == expected_root, "receipt_root not rewritten"
assert Path(cfg["receipt_root"]).is_absolute(), "receipt_root not absolute"
assert cfg["targets"]["zcode"]["argv"][0] == "/nonexistent/zcode-acp", "targets not preserved"
assert Path(cfg["acpx_path"]).is_absolute(), "acpx_path not absolute"
assert isinstance(cfg["targets"], dict) and cfg["targets"], "targets empty"
PY
  [ -d "$ISO/receipts" ] || { PREP_OK=0; echo "  receipt root was not created" >&2; }
  if [ "$PREP_OK" -eq 1 ]; then
    ok "isolated registry: receipt_root rewritten, targets preserved, mode 0600"
  else
    bad "isolated registry verification failed"
  fi
else
  bad "prepare-delegation-config.py failed on a valid synthetic registry"
fi
POISON="$PARENT/poisoned-registry.json"
sed 's/"acpx_path"/"api_key"/' "$SYN" > "$POISON"
if python3 "$PREPARE" --source "$POISON" --receipt-root "$ISO/receipts-2" --out "$ISO/poisoned.json" >/dev/null 2>&1; then
  bad "secret-looking field was not refused"
else
  ok "secret-looking field refused, no output written"
fi
expect_absent "$ISO/poisoned.json" "case 11"

echo "--- case 12: launch shape -- receipt before provider, relocated receipt/log roots ---"
if run_decoy env \
     AGENT_DELEGATION_CONFIG="$ISO/agent-delegation.config.json" \
     ZCODE_LOG_DIR="$ISO/zcode-logs" \
     sh -c '
       set -e
       # agent_delegate.py:438-456 order: the run receipt is written FIRST.
       mkdir -p "$2/receipts/20260905T000000Z-verify"
       echo "{}" > "$2/receipts/20260905T000000Z-verify/request.json"
       # Only then would ACPX start the provider: named session cache write
       # plus a log line under the relocated ZCODE_LOG_DIR.
       mkdir -p "$1/.zcode/cli/rollout" "$ZCODE_LOG_DIR"
       echo io  > "$1/.zcode/cli/rollout/model-io-sess_launch.jsonl"
       echo log > "$ZCODE_LOG_DIR/zcode-2099-01-01.jsonl"
     ' _ "$DECOY" "$ISO"; then
  if [ -f "$ISO/receipts/20260905T000000Z-verify/request.json" ] \
     && [ -f "$DECOY/.zcode/cli/rollout/model-io-sess_launch.jsonl" ] \
     && [ -f "$ISO/zcode-logs/zcode-2099-01-01.jsonl" ]; then
    ok "receipt-first launch path works: relocated receipt root, relocated log dir, named session cache"
  else
    bad "launch-shape writes missing after successful run"
  fi
else
  bad "launch-shape run failed under the default profile"
fi

echo "--- global check: decoy home holds only expected files ---"
EXPECTED="$PARENT/expected-files.txt"
cat > "$EXPECTED" <<EOF
$DECOY/.zcode/cli/config.json
$DECOY/.zcode/v2/credentials.json
$DECOY/.zcode/cli/rollout/model-io-sess_verify.jsonl
$DECOY/.zcode/cli/db/db.sqlite
$DECOY/.zcode/cli/exec/sess_verify/snapshot.sh
$DECOY/.zcode/cli/artifacts/sess_verify/out.txt
$DECOY/.zcode/cli/image-cache/img.bin
$DECOY/.zcode/cli/rollout/model-io-sess_launch.jsonl
EOF
UNEXPECTED="$(find "$DECOY" -type f -print | grep -Fxv -f "$EXPECTED" || true)"
if [ -z "$UNEXPECTED" ]; then
  ok "no stray files under the decoy deny root"
else
  bad "stray files under the decoy deny root: $UNEXPECTED"
fi

echo
if [ "$FAILURES" -eq 0 ]; then
  rm -rf "$PARENT"
  echo "RESULT: PASS (all expectations held; temporary parent removed)"
  exit 0
fi
echo "RESULT: FAIL ($FAILURES expectation(s) violated; parent kept at $PARENT)"
exit 1
