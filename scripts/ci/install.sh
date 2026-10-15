#!/usr/bin/env bash
# Installs the app's libraries for a build.
# With a package-lock.json it installs exactly those versions. Without one it picks the
# versions that match the Expo SDK below, a well-tested release rather than the newest.
set -eo pipefail

EXPO_SDK=57

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
npm install --no-audit --no-fund "expo@sdk-$EXPO_SDK"
echo "Building with Expo $(node -p "require('expo/package.json').version")"

# expo install may want to add settings to app.json, which it can't do while app.config.js
# exists, so set that file aside for a moment.
mv app.config.js app.config.js.hold
trap 'mv app.config.js.hold app.config.js 2>/dev/null || true' EXIT
# Try a few times: a dropped connection to npm shouldn't fail the whole build.
ok=""
for attempt in 1 2 3; do
  if npx expo install $LIBS; then ok=1; break; fi
  echo "Install attempt $attempt didn't finish; trying again in 20 seconds."
  sleep 20
done
[ -n "$ok" ]
mv app.config.js.hold app.config.js

echo "Libraries chosen for this build:"
node -p "JSON.stringify(require('./package.json').dependencies, null, 2)"

# A health check that lists any libraries from the wrong Expo version (for the report only).
npx expo-doctor || true
