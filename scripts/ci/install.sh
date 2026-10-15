#!/usr/bin/env bash
# Installs the app's libraries for a build.
# With a package-lock.json it installs exactly those versions. Without one (the very first
# build) it picks the versions that match a settled Expo release (see pick-expo.cjs).
set -eo pipefail

if [ -f package-lock.json ]; then
  npm ci --no-audit --no-fund
  exit 0
fi

LIBS=$(node -p "Object.keys(require('./package.json').dependencies).filter((n) => n !== 'expo').join(' ')")
node -e "
const fs = require('fs');
const p = JSON.parse(fs.readFileSync('package.json', 'utf8'));
p.dependencies = {};
fs.writeFileSync('package.json', JSON.stringify(p, null, 2) + '\n');
"
EXPO_VERSION=$(node scripts/ci/pick-expo.cjs)
echo "Building with Expo $EXPO_VERSION"
npm install --no-audit --no-fund "expo@$EXPO_VERSION"
npx expo install $LIBS || npx expo install $LIBS -- --legacy-peer-deps
echo "Libraries chosen for this build:"
node -p "JSON.stringify(require('./package.json').dependencies, null, 2)"
