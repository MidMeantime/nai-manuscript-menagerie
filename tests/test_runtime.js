// Runtime tests: loads the REAL built Menagerie bundle into a mock NovelAI (UCCDS's tools/harness.js,
// via test_helpers.js) and checks the 0.3.1 quick-win fixes. Run from the Menagerie folder after building:
//   node scripts/build.js && node tests/test_runtime.js
// UCCDS integration tests are in tests/test_uccds.js.
const assert = require('assert');
const fs = require('fs');
const { boot: bootEnv, settle, createRunner, findParts, errors, version, BUNDLE } = require('./test_helpers.js');

const t = createRunner(`Menagerie runtime (v${version})`);
const STORY = [
    '# Chapter 1: Dawn',
    'The rain fell all night, and nobody in the house slept. *She* kept the [lamp] lit_until morning.',
    '***',
    'Second scene of chapter one.',
    '# Chapter 2: Dusk',
    'Short.'
];
const boot = (options = {}) => bootEnv(Object.assign({ doc: STORY }, options));

t.test('boots, renders the panel, logs no errors', async () => {
    const env = await boot();
    assert.ok(env.mock.ui.panels.size > 0, 'panel rendered');
    assert.deepStrictEqual(errors(env), []);
    assert.strictEqual(env.run('appState.chapters.length'), 2);
});

t.test('Xialong: no ai_model option, model is always GLM-4.6', async () => {
    const header = fs.readFileSync(BUNDLE, 'utf-8').split('---*/')[0];
    assert.ok(!/ai_model|xialong/i.test(header), 'header has no model option');
    const env = await boot({ config: { ai_model: 'xialong-v1' } });
    assert.strictEqual(env.run('appConfig.aiModel'), 'glm-4-6');
});

t.test('F3: saved summaries are created with no keys and not always-on', async () => {
    const env = await boot();
    const ok = await env.run('saveSummaryToLorebookDirect(appState.chapters[0], "A summary.")');
    assert.strictEqual(ok, true);
    const entry = env.mock.lore.created[0];
    assert.deepStrictEqual(Array.from(entry.keys), []);
    assert.strictEqual(entry.forceActivation, false);
    const src = fs.readFileSync(BUNDLE, 'utf-8');
    assert.strictEqual((src.match(/createEntry\(\{[^}]*\.\.\.REPORT_ENTRY_ACTIVATION/g) || []).length, 3, 'all three createEntry calls');
});

t.test('F1: reading saved reports never creates a lorebook category', async () => {
    const env = await boot({ config: { reference_context_source: 'lorebook', summary_prior_chapters_mode: 'all' } });
    const found = await env.run('findLorebookEntryForChapter(appState.chapters[0], "summary")');
    assert.strictEqual(found, null);
    await env.run('getPriorChapterSummariesContext(1, "all")');
    assert.strictEqual(env.mock.lore.createdCategories.length, 0, 'no category created on read');
    await env.run('saveSummaryToLorebookDirect(appState.chapters[0], "A summary.")');
    assert.strictEqual(env.mock.lore.createdCategories.length, 1, 'saving still creates it');
});

t.test('A8: a failed save is logged and shows one throttled warning', async () => {
    const env = await boot();
    env.mock.api.v1.storyStorage.set = async () => { throw new Error('quota'); };
    env.mock.api.v1.storage.set = async () => { throw new Error('quota'); };
    const before = env.mock.ui.toasts.length;
    await env.run('setStorageItem("analyses", { 0: { text: "x" } })');
    await env.run('setStorageItem("summaries", {})');
    await settle();
    const warnings = env.mock.ui.toasts.slice(before).filter((x) => x.type === 'warning');
    assert.strictEqual(warnings.length, 1, 'one toast for two failures');
    assert.ok(errors(env).some((l) => String(l[1]).includes("couldn't save")), 'logged');
});

t.test('B6: a scan requested mid-scan is queued and picks up the newer text', async () => {
    const env = await boot();
    const docApi = env.mock.api.v1.document;
    const realScan = docApi.scan;
    let release;
    const gate = new Promise((r) => { release = r; });
    let first = true;
    docApi.scan = async (...a) => { if (first) { first = false; await gate; } return realScan(...a); };
    const running = env.run('scanDocumentChapters(true)');
    await settle(3);
    env.mock.doc.sections.push({ id: 9001, text: '# Chapter 3: Night' }, { id: 9002, text: 'Body.' });
    const queued = await env.run('scanDocumentChapters()');
    assert.strictEqual(queued, false, 'second caller is queued');
    release();
    assert.strictEqual(await running, true);
    assert.strictEqual(env.run('appState.chapters.length'), 3, 'queued pass saw chapter 3');
});

t.test('B1: story generation pauses scans; a second onScriptsLoaded replaces the loop', async () => {
    const env = await boot();
    assert.strictEqual(env.run('isStoryGenerating()'), false);
    await env.mock.hooks.get('onGenerationRequested')({});
    assert.strictEqual(env.run('isStoryGenerating()'), true);
    env.run('storyGenerationStartedAt = Date.now() - STORY_GENERATION_STALE_MS - 1');
    assert.strictEqual(env.run('isStoryGenerating()'), false, 'stale flag clears itself');
    await env.mock.hooks.get('onGenerationRequested')({});
    await env.mock.hooks.get('onGenerationEnd')({});
    assert.strictEqual(env.run('isStoryGenerating()'), false);
    const token = env.run('syncLoopToken');
    await env.mock.hooks.get('onScriptsLoaded')();
    await settle();
    assert.strictEqual(env.run('syncLoopToken'), token + 1);
});

t.test('D3: bad persisted tab / chapter values are ignored, good ones kept', async () => {
    const bad = await boot({ before: async (env) => { await env.mock.api.v1.storyStorage.set('active_tab', 'bogus'); await env.mock.api.v1.storyStorage.set('selected_ch', -2); } });
    assert.strictEqual(bad.run('appState.activeTab'), 'overview');
    assert.strictEqual(bad.run('appState.selectedChapterIndex'), 0);
    const good = await boot({ before: async (env) => { await env.mock.api.v1.storyStorage.set('active_tab', 'summary'); await env.mock.api.v1.storyStorage.set('selected_ch', 1); } });
    assert.strictEqual(good.run('appState.activeTab'), 'summary');
    assert.strictEqual(good.run('appState.selectedChapterIndex'), 1);
    const far = await boot({ before: async (env) => { await env.mock.api.v1.storyStorage.set('selected_ch', 40); } });
    assert.strictEqual(far.run('appState.selectedChapterIndex'), 1, 'clamped to the last chapter after the scan');
});

t.test('A6 + E11: Inspector preview is plain text with exactly one ellipsis', async () => {
    const env = await boot({ before: async (env) => { await env.mock.api.v1.storyStorage.set('active_tab', 'inspector'); } });
    const preview = env.run('appState.chapters[0].preview');
    assert.ok(!/\.\.\./.test(preview), 'no "..."');
    assert.ok((preview.match(/…/g) || []).length <= 1, 'at most one …');
    assert.ok(!preview.includes('***'), 'scene breaks skipped');
    const panel = Array.from(env.mock.ui.panels.values())[0];
    const parts = findParts(panel.content, (p) => p.type === 'text' && typeof p.text === 'string' && p.text.startsWith('“'));
    assert.strictEqual(parts.length, 1, 'preview part rendered');
    assert.strictEqual(parts[0].markdown, false);
    assert.ok(!parts[0].text.includes('..."'), 'no appended dots');
    // makePreview edge cases
    const mp = (s, n) => env.run(`makePreview(${JSON.stringify(s)}, ${n})`);
    assert.strictEqual(mp('Short line.', 140), 'Short line.');
    assert.strictEqual(mp('one two three four five six seven', 20), 'one two three four…');
    assert.strictEqual(mp('Word word word... more words here', 17), 'Word word word…');
    assert.strictEqual(mp('First sentence ends here. Then more text goes on', 34), 'First sentence ends here. …');
});

t.test('A9: debug timings only when debug_logging is on', async () => {
    const off = await boot();
    assert.ok(!off.mock.logs.some((l) => String(l[1]).includes('[Menagerie debug]')));
    const on = await boot({ config: { debug_logging: true } });
    const lines = on.mock.logs.filter((l) => l[1] === '[Menagerie debug]').map((l) => String(l[2]));
    assert.ok(lines.some((l) => l.startsWith('startup ')), 'startup timing');
    assert.ok(lines.some((l) => l.startsWith('stored data:')), 'stored sizes');
});

t.run();
