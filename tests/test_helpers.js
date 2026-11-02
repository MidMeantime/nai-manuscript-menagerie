// Shared setup for the Menagerie runtime tests. Uses UCCDS's test harness (a mock NovelAI with
// api.v1.messaging, vendored in vendor/uccds/), so the Menagerie and the UCCDS dependency script can
// run side by side. Needs `npm install` once here (the harness uses TypeScript to strip types).
const fs = require('fs');
const path = require('path');
const { readHeaderVersion, UCCDS_VENDOR } = require('../scripts/build.js');

const harness = require(path.join(UCCDS_VENDOR, 'harness.js'));

const ROOT = path.resolve(__dirname, '..');
const version = readHeaderVersion(path.join(ROOT, 'src', 'header.ts'));
const BUNDLE = path.join(ROOT, `Mid's Manuscript Menagerie_v${version}.naiscript`);
if (!fs.existsSync(BUNDLE)) throw new Error(`Build first: ${BUNDLE} not found`);
const SERVICE = path.join(UCCDS_VENDOR, (fs.readdirSync(UCCDS_VENDOR).find((f) => /^UCCDS_v.+\.naiscript$/.test(f)) || ''));

/** Loads the Menagerie bundle, runs onScriptsLoaded, and waits for the first render */
async function boot(options = {}) {
    const env = harness.loadBundle(BUNDLE, Object.assign({ scriptId: 'menagerie' }, options));
    // Lorebook write mocks (the harness only has read calls)
    const lore = env.mock.lore;
    lore.created = [];
    lore.createdCategories = [];
    env.mock.api.v1.lorebook.createEntry = async (entry) => { const id = `e${lore.created.length + 1}`; lore.created.push(entry); lore.entries.push(Object.assign({ id }, entry)); return id; };
    env.mock.api.v1.lorebook.createCategory = async (cat) => { const id = `c${lore.createdCategories.length + 1}`; lore.createdCategories.push(cat); lore.categories.push(Object.assign({ id }, cat)); return id; };
    env.mock.api.v1.lorebook.updateEntry = async () => {};
    env.mock.api.v1.lorebook.entries = async (categoryId) => (categoryId ? lore.entries.filter((e) => e.category === categoryId) : lore.entries);
    env.mock.api.v1.story.id = async () => 'story-1';
    if (options.before) await options.before(env);
    await env.mock.hooks.get('onScriptsLoaded')();
    await harness.settle();
    return env;
}

/** Starts the UCCDS dependency script on the same bus and document as a Menagerie env */
function startService(bus, doc, config = {}) {
    if (!fs.existsSync(SERVICE)) throw new Error('UCCDS dependency script not found in vendor/uccds: run `npm run update-uccds`');
    return harness.loadBundle(SERVICE, { bus, sharedDoc: doc, scriptId: 'uccds-service', config });
}

const errors = (env) => env.mock.logs.filter((l) => l[0] === 'error');
/** Waits (real time) until fn() is truthy, or fails after `ms` */
async function waitFor(fn, ms = 3000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        if (await fn()) return;
        await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error('waitFor timed out');
}

module.exports = Object.assign({}, harness, { version, BUNDLE, SERVICE, boot, startService, errors, waitFor });
