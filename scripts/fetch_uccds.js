// Downloads the UCCDS dist files from GitHub so contributors don't need a local checkout.
//   node scripts/fetch_uccds.js [branch]
// Default branch: main
//
// Downloads from https://github.com/MidMeantime/nai-chapter-detection-uccds:
//   dist/uccds-dual.ts              -> vendor/uccds/uccds-dual.ts
//   dist/UCCDS_v<version>.naiscript -> vendor/uccds/  (for tests)
//   tools/harness.js                -> vendor/uccds/harness.js (patched for Menagerie paths)
//
// This is the GitHub-friendly counterpart of update_uccds.js (which copies from a local clone).

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');
const VENDOR = path.join(ROOT, 'vendor', 'uccds');
const BRANCH = process.argv[2] || 'main';

const REPO_RAW = `https://raw.githubusercontent.com/MidMeantime/nai-chapter-detection-uccds/${BRANCH}`;
const REPO_API = `https://api.github.com/repos/MidMeantime/nai-chapter-detection-uccds/contents/dist?ref=${BRANCH}`;

// ─── helpers ────────────────────────────────────────────────────────────────

function get(url) {
    return new Promise((resolve, reject) => {
        const options = { headers: { 'User-Agent': 'menagerie-fetch-uccds' } };
        https.get(url, options, (res) => {
            // Follow one redirect (GitHub raw URLs sometimes 301/302)
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return get(res.headers.location).then(resolve, reject);
            }
            if (res.statusCode !== 200) {
                res.resume();
                return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
            }
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', reject);
        }).on('error', reject);
    });
}

async function getText(url) {
    return (await get(url)).toString('utf-8');
}

async function getJSON(url) {
    return JSON.parse(await getText(url));
}

// ─── main ───────────────────────────────────────────────────────────────────

async function main() {
    console.log(`Fetching UCCDS from GitHub (branch: ${BRANCH})...\n`);

    // 1. List dist/ to find the naiscript filename
    let distFiles;
    try {
        distFiles = await getJSON(REPO_API);
    } catch (err) {
        throw new Error(
            `Could not list dist/ from GitHub: ${err.message}\n` +
            `Make sure https://github.com/MidMeantime/nai-chapter-detection-uccds exists and has a dist/ folder.`
        );
    }

    const naiscriptEntry = distFiles.find((f) => /^UCCDS_v.+\.naiscript$/.test(f.name));
    if (!naiscriptEntry) {
        throw new Error(
            `No UCCDS_v*.naiscript found in the dist/ folder on branch "${BRANCH}".\n` +
            `The UCCDS repo may not have been built yet — check its releases or ask the maintainer.`
        );
    }
    const naiscriptName = naiscriptEntry.name;

    // 2. Download the three files
    const [dualSrc, naiscriptSrc, harnessSrc] = await Promise.all([
        getText(`${REPO_RAW}/dist/uccds-dual.ts`),
        getText(`${REPO_RAW}/dist/${naiscriptName}`),
        getText(`${REPO_RAW}/tools/harness.js`),
    ]);

    // 3. Prepare vendor dir — remove any old naiscript versions
    fs.mkdirSync(VENDOR, { recursive: true });
    for (const f of fs.readdirSync(VENDOR)) {
        if (/^UCCDS_v.+\.naiscript$/.test(f)) fs.unlinkSync(path.join(VENDOR, f));
    }

    // 4. Write uccds-dual.ts
    fs.writeFileSync(path.join(VENDOR, 'uccds-dual.ts'), dualSrc, 'utf-8');

    // 5. Write the naiscript
    fs.writeFileSync(path.join(VENDOR, naiscriptName), naiscriptSrc, 'utf-8');

    // 6. Write harness.js with the same path patch as update_uccds.js
    const harnessPatched = harnessSrc
        .replace("paths: [path.resolve(__dirname, '..')]", "paths: [path.resolve(__dirname, '..', '..')]")
        .replace('run `npm install` in the UCCDS folder first', 'run `npm install` in the Menagerie folder first');
    fs.writeFileSync(path.join(VENDOR, 'harness.js'), harnessPatched, 'utf-8');

    // 7. Report
    const version = (dualSrc.match(/UCCDS_VERSION = "([^"]+)"/) || [])[1] || '?';
    console.log(`Vendored UCCDS v${version} from GitHub (${BRANCH}):`);
    console.log(`  uccds-dual.ts, ${naiscriptName}, harness.js`);
}

main().catch((err) => {
    console.error(`\nError: ${err.message}`);
    process.exit(1);
});
