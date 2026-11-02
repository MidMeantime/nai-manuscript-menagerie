// UCCDS integration tests: the real built Menagerie with the embedded detector, with the UCCDS
// dependency script beside it on a mock messaging bus, and the one-time move of saved reports from
// chapter positions (0.3.0 / 0.3.1) to chapter keys (0.3.2).
//   node scripts/build.js && node tests/test_uccds.js
const assert = require('assert');
const { boot, startService, createBus, createDocument, settle, createRunner, findParts, errors, waitFor, version } = require('./test_helpers.js');

const t = createRunner(`Menagerie + UCCDS (v${version})`);
const titles = (env) => env.run.plain('appState.chapters.map((c) => c.cleanTitle)');
const report = (title, text, timestamp = 1) => ({ chapterIndex: 0, chapterTitle: title, timestamp, model: 'glm-4-6', text });
const overviewText = (env) => {
    const panel = Array.from(env.mock.ui.panels.values())[0];
    return findParts(panel.content, (p) => p.type === 'text').map((p) => p.text).join('\n');
};

// Story whose chapter list changes under UCCDS: the [ Style ] line was a chapter in 0.3.0
const STYLED = ['Chapter 1: Start', 'Body one.', '[ Style: dark, gritty ]', 'Body two.', 'Chapter 2: Next', 'Body three.'];

// ---------- embedded ----------

t.test('embedded by default: UCCDS rules, Menagerie titles, overview says so', async () => {
    const env = await boot({ doc: STYLED, before: async (e) => { await e.mock.api.v1.storyStorage.set('active_tab', 'overview'); } });
    assert.strictEqual(env.run('appState.chapterSource'), 'embedded');
    assert.deepStrictEqual(titles(env), ['Chapter 1: Start', 'Chapter 2: Next'], 'metadata bracket is not a chapter');
    assert.deepStrictEqual(env.run.plain('appState.chapters.map((c) => [c.key, c.kind, c.normalizedNumber])'), [[1000, 'chapter', 1], [1004, 'chapter', 2]]);
    assert.deepStrictEqual(env.run.plain('appState.chapters[0].paragraphs'), ['Body one.', '[ Style: dark, gritty ]', 'Body two.']);
    assert.ok(/built-in UCCDS v1\.0\.0/.test(overviewText(env)));
    assert.deepStrictEqual(errors(env), []);
});

t.test('opening text and a story without headers keep their 0.3.0 titles', async () => {
    const env = await boot({ doc: ['A note first.', '# Chapter 1', 'Body.'] });
    assert.deepStrictEqual(titles(env), ['Story Beginning', 'Chapter 1']);
    assert.strictEqual(env.run('appState.chapters[0].normalizedNumber'), 0);
    const whole = await boot({ doc: ['Just prose.', 'More prose.'] });
    assert.deepStrictEqual(titles(whole), ['Test Story']);
});

t.test('config: UCCDS options apply, custom words work ("Scene")', async () => {
    const doc = ['Chapter 1: Start', 'Body.', 'Scene 2', 'Body.', 'Chapter 2: Next', 'Body.'];
    assert.strictEqual((await boot({ doc })).run('appState.chapters.length'), 2);
    const env = await boot({ doc, config: { chapter_custom_chapter_words: 'Scene' } });
    assert.deepStrictEqual(titles(env), ['Chapter 1: Start', 'Scene 2', 'Chapter 2: Next']);
});

t.test('config: 0.3.0 values carry over when the new option is at its default', async () => {
    const env = await boot({ config: { separate_scene_breaks: false, treat_preamble_as_chapter: false } });
    assert.strictEqual(env.run('appState.chapterSettings.boundaryMode'), 'headers_and_dividers');
    assert.strictEqual(env.run('appState.chapterSettings.openingText'), 'ignore');
    const explicit = await boot({ config: { separate_scene_breaks: false, chapter_boundary_mode: 'dividers' } });
    assert.strictEqual(explicit.run('appState.chapterSettings.boundaryMode'), 'dividers', 'a changed new option wins');
    const bt = await boot({ config: { chapter_detection_mode: 'break_token' } });
    assert.strictEqual(bt.run('appState.chapterSettings.boundaryMode'), 'dividers');
});

// ---------- saved reports: migration (D1) ----------

t.test('migration: position-keyed reports move to their chapter keys', async () => {
    const env = await boot({
        doc: STYLED,
        before: async (e) => {
            await e.mock.api.v1.storyStorage.set('analyses', {
                0: report('Chapter 1: Start', 'A1'),
                1: report('Style: dark, gritty', 'A-style'),
                2: report('Chapter 2: Next', 'A2')
            });
            await e.mock.api.v1.storyStorage.set('summaries', { 2: report('Chapter 2: Next', 'S2') });
        }
    });
    assert.strictEqual(env.run('appState.analyses[0].text'), 'A1');
    assert.strictEqual(env.run('appState.analyses[1].text'), 'A2', 'report followed its chapter, not its old position');
    assert.strictEqual(env.run('appState.summaries[1].text'), 'S2');
    assert.strictEqual(env.run('appState.unmatchedReportCount'), 1, 'the [ Style ] report is kept but unmatched');
    const store = env.mock.storyStorage;
    assert.strictEqual(await store.get('report_schema'), 2);
    assert.deepStrictEqual(Object.keys(await store.get('analyses_by_key')).sort(), ['-1', '1000', '1004']);
    assert.ok(await store.get('analyses'), 'old position-keyed data is left as a backup');
    assert.ok(env.mock.ui.toasts.some((x) => /couldn't be matched/.test(x.message)), 'user is told');
    assert.ok(env.run('appState.chapters[1].hasAnalysis'));
});

t.test('migration: a report already on the wrong position is matched by title', async () => {
    const env = await boot({
        doc: STYLED,
        // 0.3.0 position 1 is the [ Style ] chapter, but this report says it's for Chapter 2
        before: async (e) => { await e.mock.api.v1.storyStorage.set('analyses', { 1: report('Chapter 2: Next', 'A2') }); }
    });
    assert.strictEqual(env.run('appState.analyses[1].text'), 'A2');
    assert.strictEqual(env.run('appState.unmatchedReportCount'), 0);
});

t.test('migration runs once, and waits while the document is empty', async () => {
    const env = await boot({ doc: [], before: async (e) => { await e.mock.api.v1.storyStorage.set('analyses', { 0: report('Chapter 1: Start', 'A1') }); } });
    assert.strictEqual(await env.mock.storyStorage.get('report_schema'), undefined, 'not migrated against an empty document');
    env.mock.doc.sections.push({ id: 5000, text: 'Chapter 1: Start' }, { id: 5001, text: 'Body.' });
    await env.run('scanDocumentChapters(true)');
    assert.strictEqual(await env.mock.storyStorage.get('report_schema'), 2);
    assert.strictEqual(env.run('appState.analyses[0].text'), 'A1');
    const fresh = await boot({});
    assert.strictEqual(await fresh.mock.storyStorage.get('report_schema'), 2, 'a story with nothing saved starts on the new layout');
});

// ---------- saved reports: by key from now on ----------

t.test('reports and selection stay with their chapter when a chapter is added above', async () => {
    const env = await boot({ doc: ['# Chapter 1: A', 'One.', '# Chapter 2: B', 'Two.'] });
    await env.run('saveAnalysisToStorage({ chapterIndex: 1, chapterKey: appState.chapters[1].key, chapterTitle: "Chapter 2: B", timestamp: 1, model: "glm-4-6", text: "for B" })');
    await env.run('setSelectedChapter(1)');
    env.mock.doc.sections.unshift({ id: 900, text: '# Prologue' }, { id: 901, text: 'Before.' });
    await env.run('scanDocumentChapters(true)');
    assert.deepStrictEqual(titles(env), ['Prologue', 'Chapter 1: A', 'Chapter 2: B']);
    assert.strictEqual(env.run('appState.analyses[2] && appState.analyses[2].text'), 'for B');
    assert.strictEqual(env.run('appState.analyses[1]'), undefined);
    assert.strictEqual(env.run('appState.selectedChapterIndex'), 2, 'selection followed the chapter');
});

t.test('a deleted and retyped header gets its report back by title', async () => {
    const env = await boot({ doc: ['# Chapter 1: A', 'One.', '# Chapter 2: B', 'Two.'] });
    await env.run('saveSummaryToStorage({ chapterIndex: 1, chapterKey: appState.chapters[1].key, chapterTitle: "Chapter 2: B", timestamp: 1, model: "glm-4-6", text: "S-B", usedAnalysis: false, savedToLorebook: false })');
    const i = env.mock.doc.sections.findIndex((s) => s.text === '# Chapter 2: B');
    env.mock.doc.sections.splice(i, 1, { id: 7777, text: '# Chapter 2: B' }); // same text, new paragraph
    await env.run('scanDocumentChapters(true)');
    assert.strictEqual(env.run('appState.summaries[1] && appState.summaries[1].text'), 'S-B');
    assert.ok((await env.mock.storyStorage.get('summaries_by_key'))['7777']);
});

t.test('a header that stops being a chapter keeps its report until it comes back; unmatched reports can be cleared', async () => {
    const env = await boot({ doc: ['# Chapter 1: A', 'One.', '# Chapter 2: B', 'Two.'] });
    await env.run('saveAnalysisToStorage({ chapterIndex: 1, chapterKey: appState.chapters[1].key, chapterTitle: "Chapter 2: B", timestamp: 1, model: "glm-4-6", text: "for B" })');
    const sec = env.mock.doc.sections.find((s) => s.text === '# Chapter 2: B');
    sec.text = 'Chapter two was here once, now it is prose.';
    await env.run('scanDocumentChapters(true)');
    assert.strictEqual(env.run('appState.unmatchedReportCount'), 1);
    sec.text = '# Chapter 2: B';
    await env.run('scanDocumentChapters(true)');
    assert.strictEqual(env.run('appState.analyses[1].text'), 'for B', 'reattached on its own');
    sec.text = 'Prose again.';
    await env.run('scanDocumentChapters(true)');
    assert.strictEqual(await env.run('clearUnmatchedReports()'), 1);
    assert.deepStrictEqual(Object.keys(await env.mock.storyStorage.get('analyses_by_key')), []);
});

t.test('clearing a chapter\'s report removes it from the keyed store', async () => {
    const env = await boot({ doc: ['# Chapter 1: A', 'One.'] });
    await env.run('saveAnalysisToStorage({ chapterIndex: 0, chapterKey: appState.chapters[0].key, chapterTitle: "Chapter 1: A", timestamp: 1, model: "glm-4-6", text: "x" })');
    await env.run('clearCachedReports(0, "both")');
    assert.deepStrictEqual(Object.keys(await env.mock.storyStorage.get('analyses_by_key')), []);
    assert.strictEqual(env.run('appState.chapters[0].hasAnalysis'), false);
});

// ---------- dependency ----------

t.test('dependency: switches to the UCCDS script and follows ITS rules', async () => {
    const bus = createBus();
    const doc = createDocument(['Chapter 1: Start', 'Body.', 'Scene 2', 'Body.', 'Chapter 2: Next', 'Body.']);
    const service = startService(bus, doc, { chapter_custom_chapter_words: 'Scene' });
    await settle();
    // The Menagerie's own config would NOT count "Scene"; the dependency's does
    const env = await boot({ bus, sharedDoc: doc, before: async (e) => { await e.mock.api.v1.storyStorage.set('active_tab', 'overview'); } });
    await waitFor(() => env.run('appState.chapterSource') === 'dependency');
    await waitFor(() => env.run('appState.chapters.length') === 3);
    assert.deepStrictEqual(titles(env), ['Chapter 1: Start', 'Scene 2', 'Chapter 2: Next']);
    assert.strictEqual(env.run('appState.uccdsDependencyVersion'), '1.0.0');
    assert.ok(/Chapters from the UCCDS script v1\.0\.0/.test(overviewText(env)));
    assert.ok(service.mock.ui.panels.size > 0);
    assert.deepStrictEqual(errors(env), []);
});

t.test('dependency: found when it loads after the Menagerie', async () => {
    const bus = createBus();
    const doc = createDocument(['# Chapter 1', 'Body.']);
    const env = await boot({ bus, sharedDoc: doc });
    assert.strictEqual(env.run('appState.chapterSource'), 'embedded');
    startService(bus, doc);
    await waitFor(() => env.run('appState.chapterSource') === 'dependency', 6000);
    assert.strictEqual(env.run('appState.chapters.length'), 1);
});

t.test('dependency: chapter changes arrive, and a vanished dependency falls back to embedded', async () => {
    const bus = createBus();
    const doc = createDocument(['# Chapter 1', 'Body.']);
    startService(bus, doc);
    await settle();
    const env = await boot({ bus, sharedDoc: doc });
    await waitFor(() => env.run('appState.chapterSource') === 'dependency');
    doc.sections.push({ id: 8000, text: '# Chapter 2' }, { id: 8001, text: 'More.' });
    await env.run('scanDocumentChapters()');
    assert.strictEqual(env.run('appState.chapters.length'), 2);
    // UCCDS disabled: it stops answering
    bus.subs.splice(0, bus.subs.length, ...bus.subs.filter((s) => s.scriptId !== 'uccds-service'));
    doc.sections.push({ id: 8002, text: '# Chapter 3' }, { id: 8003, text: 'Even more.' });
    await env.run('scanDocumentChapters()');
    assert.strictEqual(env.run('appState.chapterSource'), 'embedded');
    assert.strictEqual(env.run('appState.chapters.length'), 3, 'the embedded detector picked up');
});

t.run();
