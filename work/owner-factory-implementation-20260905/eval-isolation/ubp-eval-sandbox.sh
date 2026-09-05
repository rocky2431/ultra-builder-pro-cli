#!/bin/bash
# ubp-eval-sandbox.sh -- launch one owner-journey evaluation command under the
# macOS seatbelt sandbox so product writes and failing product tests cannot
# escape the evaluation project/temp roots into real-HOME business data.
#
# Mechanism: sandbox-exec, the installed platform sandbox (verified functional
# on this host, macOS 15.6.1). Generated profile shape:
#
#   (version 1)
#   (allow default)                                ; reads, network, mach OK
#   (deny file-write* (subpath "<deny-root>"))     ; default: canonical $HOME
#   (allow file-write* (subpath "<cache-1>")) ...  ; named native caches UNDER
#                                                  ; the deny root, listed
#                                                  ; after it (last matching
#                                                  ; rule wins -- verified)
#
# The named caches are the ONLY re-opened paths. They are the ZCode 0.16.5
# session-runtime stores that the installed headless bundle provably writes
# (source offsets and live evidence in README.md):
#
#   .zcode/cli/rollout      session rollout/model-io, homedir-hardcoded
#   .zcode/cli/db           session sqlite store, homedir-hardcoded
#   .zcode/cli/exec         shell startup snapshots for the terminal tool
#   .zcode/cli/artifacts    per-session artifact/tool-output persistence
#   .zcode/cli/image-cache  \
#   .zcode/cli/pdf-cache     > media cache roots of the same artifact pipeline
#   .zcode/cli/video-cache  /
#
# Everything else under the deny root stays denied, including
# .zcode/cli/config.json, .zcode/cli/plugins, .zcode/security, .zcode/skills,
# .zcode/hooks, .zcode/v2 (credentials/telemetry), memories and workspaces.
# Logs and agent-delegate receipts are NOT re-opened here because both have
# existing relocation settings that the launch contract uses instead:
# ZCODE_LOG_DIR and AGENT_DELEGATION_CONFIG (see README.md). Do not add a
# bare .zcode exception: that re-opens config/plugin/security writes (A-R7
# review gap 1).
#
# The sandbox is enforced by the kernel on the wrapped process and inherited
# by every child it spawns (sh, node, python3 -- verified). It cannot attach
# to an already-running process; the evaluation must be LAUNCHED through this
# wrapper. It does not depend on the HOME environment variable, which is why
# it also contains the pwd-based Path.home() fallback that broke A-R7.
#
# Usage:
#   ubp-eval-sandbox.sh [--deny-root PATH] [--allow-under-deny PATH]...
#                       [--profile-out PATH] [--quiet] -- COMMAND [ARGS...]
#
# Options:
#   --deny-root PATH        Directory tree whose writes are denied. Default:
#                           the canonical real $HOME. The override exists so
#                           verify-isolation.sh can aim the SAME profile code
#                           at a decoy directory; production evaluation runs
#                           must keep the default.
#   --allow-under-deny PATH Extra write exception; must resolve under the deny
#                           root. Repeatable, added AFTER the named caches.
#                           Needs a per-run source justification; do not use
#                           it to re-open config/plugin/security classes.
#   --profile-out PATH      Keep the generated seatbelt profile at PATH as run
#                           evidence instead of deleting it on exit.
#   --quiet                 Suppress the stderr launch banner.
#
# Exit status: the wrapped command's status; 64 on usage/configuration error,
# 65 if sandbox-exec itself is unavailable.

set -u

# Named native session caches re-opened under the deny root, relative to it.
NAMED_CACHES=".zcode/cli/rollout
.zcode/cli/db
.zcode/cli/exec
.zcode/cli/artifacts
.zcode/cli/image-cache
.zcode/cli/pdf-cache
.zcode/cli/video-cache"

profile_safe() {
  # Seatbelt profile strings are double-quoted; reject characters that could
  # break out of the quoted form or smuggle control sequences. Actual
  # operator inputs ($HOME, /tmp evaluation roots) never contain these.
  case "$1" in
    *\"*|*\\*) return 1 ;;
  esac
  [ -n "$(printf '%s' "$1" | tr -d '[:print:]')" ] && return 1
  return 0
}

canonical() {
  # Canonicalize a path the way the kernel will compare it (resolves the
  # /tmp -> /private/tmp symlink class). Works for not-yet-existing leaves
  # whose parent exists.
  local p="$1" d b
  if [ -d "$p" ]; then
    (cd "$p" && pwd -P)
    return
  fi
  d="$(dirname "$p")"
  b="$(basename "$p")"
  if [ -d "$d" ]; then
    printf '%s/%s\n' "$(cd "$d" && pwd -P)" "$b"
    return
  fi
  echo "ubp-eval-sandbox: parent directory of '$p' does not exist" >&2
  return 1
}

canonical_lenient() {
  # Canonicalize the deepest existing ancestor of $1 and re-append the
  # not-yet-existing remainder. Used for named caches that the wrapped
  # process may create during the run (e.g. cli/pdf-cache).
  local p="$1" rest=""
  while [ ! -e "$p" ]; do
    rest="/$(basename "$p")$rest"
    p="$(dirname "$p")"
    if [ "$p" = "/" ]; then
      echo "ubp-eval-sandbox: no existing ancestor for '$1'" >&2
      return 1
    fi
  done
  if [ -d "$p" ]; then
    printf '%s%s\n' "$(cd "$p" && pwd -P)" "$rest"
    return
  fi
  echo "ubp-eval-sandbox: ancestor of '$1' is not a directory" >&2
  return 1
}

DENY_ROOT=""
ALLOW_LIST=""
PROFILE_OUT=""
QUIET=0

while [ $# -gt 0 ]; do
  case "$1" in
    --deny-root)        DENY_ROOT="${2:?--deny-root needs a value}"; shift 2 ;;
    --allow-under-deny) ALLOW_LIST="${ALLOW_LIST}${2:?--allow-under-deny needs a value}
"; shift 2 ;;
    --profile-out)      PROFILE_OUT="${2:?--profile-out needs a value}"; shift 2 ;;
    --quiet)            QUIET=1; shift ;;
    --)                 shift; break ;;
    -h|--help)          sed -n '2,63p' "$0"; exit 0 ;;
    *) echo "ubp-eval-sandbox: unknown option '$1'" >&2; exit 64 ;;
  esac
done

if [ $# -eq 0 ]; then
  echo "ubp-eval-sandbox: missing COMMAND after --" >&2
  exit 64
fi

if ! command -v sandbox-exec >/dev/null 2>&1; then
  echo "ubp-eval-sandbox: sandbox-exec not found; no fallback is provided" >&2
  exit 65
fi

if [ -z "$DENY_ROOT" ]; then
  DENY_ROOT="${HOME:?HOME is not set; pass --deny-root explicitly}"
fi
DENY_ROOT="$(canonical "$DENY_ROOT")" || exit 64

if [ -z "$DENY_ROOT" ] || [ "$DENY_ROOT" = "/" ]; then
  echo "ubp-eval-sandbox: refusing empty or '/' deny root" >&2
  exit 64
fi
if [ ! -d "$DENY_ROOT" ]; then
  echo "ubp-eval-sandbox: deny root '$DENY_ROOT' is not a directory" >&2
  exit 64
fi
if ! profile_safe "$DENY_ROOT"; then
  echo "ubp-eval-sandbox: deny root '$DENY_ROOT' is not profile-safe" >&2
  exit 64
fi

# Prepend the named native caches; operator extras come after them.
NAMED_CANON=""
OLD_IFS="$IFS"
IFS='
'
for rel in $NAMED_CACHES; do
  [ -z "$rel" ] && continue
  nc="$(canonical_lenient "$DENY_ROOT/$rel")" || exit 64
  NAMED_CANON="${NAMED_CANON}${nc}
"
done
IFS="$OLD_IFS"
ALLOW_LIST="${NAMED_CANON}${ALLOW_LIST}"

ALLOW_CANON=""
OLD_IFS="$IFS"
IFS='
'
for a in $ALLOW_LIST; do
  [ -z "$a" ] && continue
  ca="$(canonical_lenient "$a")" || exit 64
  case "$ca" in
    "$DENY_ROOT"/*) ;;
    *) echo "ubp-eval-sandbox: allow path '$ca' is not under deny root '$DENY_ROOT'" >&2
       exit 64 ;;
  esac
  if ! profile_safe "$ca"; then
    echo "ubp-eval-sandbox: allow path '$ca' is not profile-safe" >&2
    exit 64
  fi
  ALLOW_CANON="${ALLOW_CANON}    (allow file-write* (subpath \"$ca\"))
"
done
IFS="$OLD_IFS"

if [ -n "$PROFILE_OUT" ]; then
  PROFILE="$PROFILE_OUT"
else
  PROFILE="$(mktemp "${TMPDIR:-/tmp}/ubp-eval-sandbox-profile.XXXXXX")" || exit 64
fi

{
  printf '(version 1)\n'
  printf '(allow default)\n'
  printf '(deny file-write* (subpath "%s"))\n' "$DENY_ROOT"
  printf '%s' "$ALLOW_CANON"
} > "$PROFILE" || exit 64

if [ "$QUIET" -eq 0 ]; then
  echo "ubp-eval-sandbox: deny-root=$DENY_ROOT" >&2
  printf '%s' "$ALLOW_CANON" | sed 's/^ *//' | grep . | sed 's/^/ubp-eval-sandbox: exception: /' >&2
  echo "ubp-eval-sandbox: profile=$PROFILE" >&2
  echo "ubp-eval-sandbox: exec: $*" >&2
fi

sandbox-exec -f "$PROFILE" "$@"
STATUS=$?

if [ -z "$PROFILE_OUT" ]; then
  rm -f "$PROFILE"
fi
exit "$STATUS"
