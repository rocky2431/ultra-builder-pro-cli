# usage: ctl <unit> [tag] — controller verification (scope, gate, check --all, status); log /tmp/abc/<unit>.controller-check[-tag].log
ctl() {
  local U="/Users/rocky243/Context Engineering/ultra-builder-pro-cli-v6-p3/bin/install.js"
  local u="$1" tag="${2:+-$2}" d="/tmp/abc/$1" base log
  base=$(grep "^$u	" /tmp/abc/bases.tsv | cut -f2); log=/tmp/abc/$u.controller-check$tag.log
  ( cd "$d" && {
    echo "--- $u files changed since base:"; git diff --stat $base..HEAD
    echo "--- outside src/ and .ultra/records,rulings,ledger:"
    git diff --name-only $base..HEAD | grep -vE '^(src/|\.ultra/(records/|rulings\.md|ledger/))'
    echo "--- status:"; git status --short
    node "$U" gate; echo "gate exit $?"
    node "$U" check --all; echo "check exit $?"
    node "$U" status
  } > "$log" 2>&1 )
  echo "== $u"; grep -E '^(---|gate|check exit|M3|[^ ]+: (fail|unknown|error))' "$log"; git -C "$d" diff --name-only $base..HEAD | grep -vE '^(src/|\.ultra/(records/|rulings\.md|ledger/))'
}
