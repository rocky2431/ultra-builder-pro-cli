# usage: abc_mission <T> <arm> <node> [map-file]
abc_mission() {
  local T="$1" arm="$2" node="$3" map="$4" dir="/tmp/abc/$1-$2"
  local U="/Users/rocky243/Context Engineering/ultra-builder-pro-cli-v6-p3/bin/install.js"
  local regress="C-create C-redirect C-count C-persist C-journey-m1 C-expire C-journey-m2 C-delete"
  mkdir -p "$dir/.ultra/.runtime/missions"
  local out="$dir/.ultra/.runtime/missions/$node.md"
  {
    printf '# Mission: node %s of Shortlink\n\n' "$node"
    printf 'Workspace: `%s` (a Git repository, branch `main`). You are the writer of one node. The\nbrief below is everything you are given; the current code is in the repository.\n\n' "$dir"
    printf '`ubp` means `node "%s"`, run from the workspace (the current directory is the project\nroot). Run the `ubp check` line of the brief'"'"'s rules for this node'"'"'s checks. Before\n`ubp node done %s`, also run `ubp check %s`:\nthey must stay green.\n\n' "$U" "$node" "$regress"
    if [ -n "$map" ]; then printf '## Code map from a read-only explorer (may be incomplete; the code is the truth)\n\n'; cat "$map"; printf '\n\n'; fi
    printf 'Write `.ultra/records/handoffs/%s.md`. Commit inside this repository only (local\ncommits on `main`); install nothing. Stop every server you start by its PID, never with a\npattern-based kill, and keep data files in a temp directory outside the repository.\n\n' "$node"
    printf 'Report: your commits (hash and subject), the final output and exit code of the checks and\nof `ubp node done %s`, and anything you escalated or recorded as a ruling.\n\n---\n\n' "$node"
    (cd "$dir" && node "$U" context "$node")
  } > "$out"
  echo "$out"
}
