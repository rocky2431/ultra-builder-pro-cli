# usage: hidden <T> <arm>  — runs the hidden check on a scratch copy; writes the log, prints nothing about the result
hidden() {
  local T="$1" A="$2" u="$1-$2" s="/tmp/abc/hidden-run-$1-$2"
  rm -rf "$s" && cp -R "/tmp/abc/$u" "$s" && cp /tmp/p4-abc/$T/hidden/*.cjs "$s/test/" &&
    (cd "$s" && node --test --test-reporter=spec test/$(ls /tmp/p4-abc/$T/hidden/) > /tmp/abc/$u.hidden.log 2>&1)
  rm -rf "$s"
  echo "hidden check for $u recorded in /tmp/abc/$u.hidden.log (not read until all units end)"
}
