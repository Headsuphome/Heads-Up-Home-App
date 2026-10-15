#!/usr/bin/env bash
# Saves a short report of a build to the "build-logs" branch, so a failed build can be
# looked at from the code alone. Nothing private goes in it.
set -uo pipefail

RUN="${BUILD_NUMBER:-0}"
LOG="$GITHUB_WORKSPACE/build.log"
REMOTE="https://x-access-token:${GH_TOKEN}@github.com/${GITHUB_REPOSITORY}.git"
DIR="$RUNNER_TEMP/report"

rm -rf "$DIR"
if ! git clone -q --depth 1 --branch build-logs "$REMOTE" "$DIR" 2>/dev/null; then
  mkdir -p "$DIR"
  git -C "$DIR" init -q
  git -C "$DIR" checkout -q -b build-logs
  git -C "$DIR" remote add origin "$REMOTE"
fi

OUT="$DIR/runs/$RUN"
mkdir -p "$OUT"
{
  echo "status: ${STATUS:-unknown}"
  echo "commit: ${GITHUB_SHA}"
  echo "trigger: ${GITHUB_REF}"
  echo "finished: $(date -u +%FT%TZ)"
} > "$OUT/summary.txt"
if [ -f "$LOG" ]; then
  tail -n 4000 "$LOG" > "$OUT/build-tail.log"
  grep -n -i -E "error|failed|exception|what went wrong" "$LOG" | head -400 > "$OUT/problems.txt" || true
fi
if [ -f "$GITHUB_WORKSPACE/gradle-detail.log" ]; then
  tail -n 3000 "$GITHUB_WORKSPACE/gradle-detail.log" > "$OUT/gradle-detail.log"
  grep -n -B3 -A25 -E "command 'node'|What went wrong|Caused by" "$GITHUB_WORKSPACE/gradle-detail.log" | head -600 > "$OUT/gradle-problems.txt" || true
fi
cp "$GITHUB_WORKSPACE/package.json" "$GITHUB_WORKSPACE/app.json" "$OUT/" 2>/dev/null || true
cp "$GITHUB_WORKSPACE/package-lock.json" "$OUT/" 2>/dev/null || true

git -C "$DIR" config user.name "Heads Up Home build"
git -C "$DIR" config user.email "noreply@headsuphome.co.uk"
git -C "$DIR" add -A
git -C "$DIR" commit -q -m "Build $RUN: ${STATUS:-unknown}"
git -C "$DIR" push -q origin build-logs
