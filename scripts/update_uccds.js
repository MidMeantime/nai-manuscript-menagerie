// Refreshes the vendored copy of UCCDS (vendor/uccds/) from a UCCDS checkout.
//   node scripts/update_uccds.js [path/to/nai-chapter-detection-uccds]
// Default path: ../../Community Stuff/nai-chapter-detection-uccds (the dev folder layout).
// Run `npm run build` in the UCCDS folder first so its dist/ is current.
// Copies:
//   dist/uccds-dual.ts               -> vendor/uccds/uccds-dual.ts     (bundled into the Menagerie)
//   dist/UCCDS_v<version>.naiscript  -> vendor/uccds/                  (the dependency script, tests only)
//   tools/harness.js                 -> vendor/uccds/harness.js        (mock NovelAI for the tests)
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const VENDOR = path.join(ROOT, 'vendor', 'uccds');
const source = path.resolve(process.argv[2] || path.join(ROOT, '..', '..', 'Community Stuff', 'nai-chapter-detection-uccds'));

function need(file) {
    if (!fs.existsSync(file)) throw new Error(`Not found: ${file}\nPass the UCCDS folder as an argument, and run \`npm run build\` there first.`);
    return file;
}

const dist = path.join(source, 'dist');
const dual = need(path.join(dist, 'uccds-dual.ts'));
const serviceName = fs.existsSync(dist) ? fs.readdirSync(dist).find((f) => /^UCCDS_v.+\.naiscript$/.test(f)) : null;
if (!serviceName) throw new Error(`No UCCDS_v*.naiscript in ${dist}: run \`npm run build\` in the UCCDS folder first.`);
const harness = need(path.join(source, 'tools', 'harness.js'));

fs.mkdirSync(VENDOR, { recursive: true });
for (const f of fs.readdirSync(VENDOR)) {
    if (/^UCCDS_v.+\.naiscript$/.test(f)) fs.unlinkSync(path.join(VENDOR, f));
}
fs.copyFileSync(dual, path.join(VENDOR, 'uccds-dual.ts'));
fs.copyFileSync(path.join(dist, serviceName), path.join(VENDOR, serviceName));
// The harness looks for TypeScript next to its own folder; here that's the Menagerie root
const harnessText = fs.readFileSync(harness, 'utf-8')
    .replace("paths: [path.resolve(__dirname, '..')]", "paths: [path.resolve(__dirname, '..', '..')]")
    .replace('run `npm install` in the UCCDS folder first', 'run `npm install` in the Menagerie folder first');
fs.writeFileSync(path.join(VENDOR, 'harness.js'), harnessText, 'utf-8');

const version = (fs.readFileSync(dual, 'utf-8').match(/UCCDS_VERSION = "([^"]+)"/) || [])[1] || '?';
console.log(`Vendored UCCDS v${version} from ${source}:\n  uccds-dual.ts, ${serviceName}, harness.js`);
