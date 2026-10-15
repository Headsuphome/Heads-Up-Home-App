// Prints the Expo version to build with: the newest full release that has been out for at
// least two weeks, so a brand-new release with teething problems is never picked by accident.
const { execSync } = require('child_process');

const MIN_AGE_DAYS = 14;
const times = JSON.parse(execSync('npm view expo time --json', { encoding: 'utf8' }));
const cutoff = Date.now() - MIN_AGE_DAYS * 24 * 60 * 60 * 1000;
const parts = (v) => v.split('.').map(Number);
const newer = (a, b) => {
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
};

let best = null;
for (const [version, when] of Object.entries(times)) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) continue; // skip previews like 55.0.0-canary
  if (Date.parse(when) > cutoff) continue;
  if (!best || newer(version, best)) best = version;
}
if (!best) throw new Error('No settled Expo release found');
console.log(best);
