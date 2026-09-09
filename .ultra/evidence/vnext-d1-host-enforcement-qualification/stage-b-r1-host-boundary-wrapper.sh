#!/bin/sh
env | cut -d= -f1 | LC_ALL=C sort > "/Users/rocky243/Context Engineering/ultra-builder-pro-cli/.ultra/.runtime/stage-b-d1q02/d1q02-r1-20260905t220538-5d954643/final-host-env-keys.txt"
exec "/tmp/ubp-factory-stage-b-l7dd0y3s/zcode-acp/target/debug/zcode-acp" "$@"
