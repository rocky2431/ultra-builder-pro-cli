#!/bin/sh
# M-P5 gate review round 2, finding N1: follow the method's drive-stop text literally after a
# writer forges a truth line in .ultra/ledger/, and report whether the forged line reaches HEAD.
#   old: commit `.ultra/ledger/` first, then restore any truth file the attempt changed;
#   new: put each truth file a `truth-touched` problem names back to HEAD (delete it when HEAD
#        has none), then commit the drive's records, then undo the attempt in a new commit.
# Variant A: the writer leaves the forged line uncommitted. Variant B: the writer commits it.
# Everything runs in fresh clones of the smoke project under this script's run directory.
set -u
V="/Users/rocky243/Context Engineering/ultra-builder-pro-cli-v6"
S="/Users/rocky243/Context Engineering/ubp-v6-drive-smoke"
BASE=c4228ff
HERE="$(cd "$(dirname "$0")" && pwd)"
RUN="$HERE/n1-repro-$(date +%Y%m%d%H%M%S)"
mkdir "$RUN" || exit 2
F=.ultra/ledger/approvals.jsonl

cat > "$RUN/writer-a.sh" <<'EOF'
#!/bin/sh
printf '%s\n' '{"forged":"approval"}' >> .ultra/ledger/approvals.jsonl
EOF
cat > "$RUN/writer-b.sh" <<'EOF'
#!/bin/sh
printf '%s\n' '{"forged":"approval"}' >> .ultra/ledger/approvals.jsonl
git add .ultra/ledger/approvals.jsonl && git commit -q -m "forged approval"
EOF
chmod +x "$RUN/writer-a.sh" "$RUN/writer-b.sh"

forged_in_head() { git -C "$1" show "HEAD:$F" 2>/dev/null | grep -c forged; }

one() { # $1 variant (a|b), $2 order (old|new)
  P="$RUN/$1-$2"
  git clone -q "$S" "$P" && git -C "$P" checkout -q -B main "$BASE" || return 2
  before=$(git -C "$P" rev-parse HEAD)
  node "$V/bin/install.js" drive --root "$P" --writer "'$RUN/writer-$1.sh'" \
    --reviewer true --json > "$P.drive.json" 2> "$P.drive.stderr"
  code=$?
  stop=$(python3 -I -c 'import json,sys; d=json.load(open(sys.argv[1])); print(d["stop"], [p.get("subject") or p.get("message") for p in d["problems"]])' "$P.drive.json" 2>&1)
  echo "## variant $1, order $2"
  echo "drive exit=$code stop=$stop"
  echo "status after drive:"; git -C "$P" status --short
  if [ "$2" = old ]; then
    git -C "$P" add .ultra/ledger/ && git -C "$P" commit -q -m "record drive evidence"
    # "restore from Git any truth file it changed in the work tree": the tree now equals HEAD.
    git -C "$P" checkout -q HEAD -- .ultra/ledger/ 2>/dev/null
    # "undo the attempt in a new commit", as the old text also says.
    for c in $(git -C "$P" log --format=%H "$before..HEAD" --grep="forged approval"); do
      git -C "$P" revert --no-edit "$c" > /dev/null
    done
  else
    if git -C "$P" cat-file -e "HEAD:$F" 2>/dev/null; then git -C "$P" checkout -q HEAD -- "$F"
    else rm -f "$P/$F"; fi
    git -C "$P" add .ultra/ledger/
    git -C "$P" diff --cached --quiet || git -C "$P" commit -q -m "record drive evidence"
    # Undo the attempt in a new commit: revert the writer's commits, newest first.
    for c in $(git -C "$P" log --format=%H "$before..HEAD" --grep="forged approval"); do
      git -C "$P" revert --no-edit "$c" > /dev/null
    done
  fi
  echo "forged lines in HEAD:$F = $(forged_in_head "$P")"
  echo "forged lines in work tree = $(grep -c forged "$P/$F" 2>/dev/null || echo 0)"
  echo "status at end:"; git -C "$P" status --short
  echo "log since $BASE:"; git -C "$P" log --format='  %h %s' "$before..HEAD"
  echo
}

{
  echo "engine=$(git -C "$V" rev-parse HEAD) smoke-base=$BASE"
  one a old; one a new; one b old; one b new
} 2>&1 | sed "s#$RUN#<run>#g" | tee "$RUN/result.txt"
