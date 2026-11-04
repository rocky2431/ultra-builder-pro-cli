# usage: source /tmp/abc-setup.sh; setup_unit <T1|T2|T3> <A|B|C> <base-commit>
# Clones R at <base-commit>, adds the task as milestone M3 with its visible check committed red.
U_ABC="/Users/rocky243/Context Engineering/ultra-builder-pro-cli-v6-p3/bin/install.js"
R_ABC="/Users/rocky243/Context Engineering/ubp-sample-shortlink"
setup_unit() {
  local task="$1" arm="$2" base="$3"
  local dir="/tmp/abc/$task-$arm" src="/tmp/p4-abc/$task"
  local req name title
  case "$task" in
    T1) req=REQ-custom-code; name=custom-code; title="Choose the short code" ;;
    T2) req=REQ-link-detail; name=link-detail; title="Look up one link" ;;
    T3) req=REQ-dedupe; name=dedupe; title="The same link is shortened once" ;;
  esac
  rm -rf "$dir" && mkdir -p /tmp/abc && git clone -q "$R_ABC" "$dir" && cd "$dir" &&
    git checkout -q -B main "$base" &&
    cat "$src/spec.md" >> .ultra/spec.md &&
    cp "$src/test/$name.test.cjs" test/ &&
    REQ="$req" NAME="$name" TITLE="$title" node -e '
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
    node "$U_ABC" gate &&
    git add .ultra test && git commit -q -m "test($name): add $req with a red check (A/B/C unit $task-$arm)" &&
    node "$U_ABC" check > /tmp/abc/$task-$arm.setup-check.log 2>&1
  tail -3 /tmp/abc/$task-$arm.setup-check.log
  cd - > /dev/null
}
