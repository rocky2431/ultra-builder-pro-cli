# usage: source /tmp/p5/evo/evo.sh
#   evo_setup <E1|E2|E3> <unit>     clone R at 7177b6b into /tmp/evo/<unit>, add the task as M3, red check
#   evo_mission <E> <unit> <cur|cand>  write the writer mission (arm A template; cand adds candidate.md)
#   evo_hidden <E> <unit>            run the hidden check on a scratch copy; log only
EVO_U="/Users/rocky243/Context Engineering/ultra-builder-pro-cli-v6-p3/bin/install.js"
EVO_R="/Users/rocky243/Context Engineering/ubp-sample-shortlink"
EVO_BASE=7177b6b
evo_names() {
  case "$1" in
    E1) EVO_REQ=REQ-edit; EVO_NAME=edit; EVO_TITLE="Change where a link goes" ;;
    E2) EVO_REQ=REQ-search; EVO_NAME=search; EVO_TITLE="Find links by their target" ;;
    E3) EVO_REQ=REQ-stats; EVO_NAME=stats; EVO_TITLE="Totals at a glance" ;;
  esac
}
evo_setup() {
  local task="$1" unit="$2" dir="/tmp/evo/$2" src="/tmp/p5/evo/$1"
  evo_names "$task"
  rm -rf "$dir" && mkdir -p /tmp/evo && git clone -q "$EVO_R" "$dir" && cd "$dir" &&
    git checkout -q -B main "$EVO_BASE" &&
    cat "$src/spec.md" >> .ultra/spec.md &&
    cp "$src/test/$EVO_NAME.test.cjs" test/ &&
    REQ="$EVO_REQ" NAME="$EVO_NAME" TITLE="$EVO_TITLE" node -e '
      const fs = require("fs");
      const { REQ, NAME, TITLE } = process.env;
      const p = JSON.parse(fs.readFileSync(".ultra/plan.json", "utf8"));
      p.milestones.push({ id: "M3", title: TITLE, requirements: [REQ] });
      p.nodes.push({ id: `N-${NAME}`, milestone: "M3", title: TITLE, covers: [REQ],
        depends: ["N-delete"], scope: ["src/"] });
      fs.writeFileSync(".ultra/plan.json", JSON.stringify(p, null, 2) + "\n");
      const c = JSON.parse(fs.readFileSync(".ultra/checks.json", "utf8"));
      c.checks.push({ id: `C-${NAME}`, covers: [REQ],
        run: `node --test --test-reporter=spec test/${NAME}.test.cjs`, timeout_sec: 120,
        expect: "^ℹ pass [1-9][0-9]*$" });
      fs.writeFileSync(".ultra/checks.json", JSON.stringify(c, null, 2) + "\n");' &&
    node "$EVO_U" gate > /dev/null &&
    git add .ultra test && git commit -q -m "test($EVO_NAME): add $EVO_REQ with a red check (evolution unit $unit)" &&
    node "$EVO_U" check > "/tmp/evo/$unit.setup-check.log" 2>&1
  echo "$unit: $(grep -c ' red\| fail' /tmp/evo/$unit.setup-check.log) red-ish lines; $(tail -1 /tmp/evo/$unit.setup-check.log)"
  cd - > /dev/null
}
evo_mission() {
  local task="$1" unit="$2" arm="$3" dir="/tmp/evo/$2"
  evo_names "$task"
  local node="N-$EVO_NAME"
  local regress="C-create C-redirect C-count C-persist C-journey-m1 C-expire C-journey-m2 C-delete"
  mkdir -p "$dir/.ultra/.runtime/missions"
  local out="$dir/.ultra/.runtime/missions/$node.md"
  {
    printf '# Mission: node %s of Shortlink\n\n' "$node"
    printf 'Workspace: `%s` (a Git repository, branch `main`). You are the writer of one node. The\nbrief below is everything you are given; the current code is in the repository.\n\n' "$dir"
    printf '`ubp` means `node "%s"`, run from the workspace (the current directory is the project\nroot). Run the `ubp check` line of the brief'"'"'s rules for this node'"'"'s checks. Before\n`ubp node done %s`, also run `ubp check %s`:\nthey must stay green.\n\n' "$EVO_U" "$node" "$regress"
    if [ "$arm" = cand ]; then cat /tmp/p5/evo/candidate.md; printf '\n'; fi
    printf 'Write `.ultra/records/handoffs/%s.md`. Commit inside this repository only (local\ncommits on `main`); install nothing. Stop every server you start by its PID, never with a\npattern-based kill, and keep data files in a temp directory outside the repository.\n\n' "$node"
    printf 'Report: your commits (hash and subject), the final output and exit code of the checks and\nof `ubp node done %s`, and anything you escalated or recorded as a ruling.\n\n---\n\n' "$node"
    (cd "$dir" && node "$EVO_U" context "$node")
  } > "$out"
  echo "$out"
}
evo_hidden() {
  local task="$1" unit="$2" s="/tmp/evo/hidden-run-$2"
  evo_names "$task"
  rm -rf "$s" && cp -R "/tmp/evo/$unit" "$s" && cp /tmp/p5/evo/$task/hidden/*.cjs "$s/test/" &&
    (cd "$s" && node --test --test-reporter=spec test/$EVO_NAME-hidden.test.cjs > /tmp/evo/$unit.hidden.log 2>&1)
  rm -rf "$s"
  echo "hidden check for $unit recorded in /tmp/evo/$unit.hidden.log (not read until all dev units end)"
}
