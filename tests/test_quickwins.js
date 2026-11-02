// Runtime tests for the 0.3.3 quick wins (B4, B8, B10, E12, G8), on the REAL built bundle.
//   node scripts/build.js && node tests/test_quickwins.js
const assert = require('assert');
const { boot: bootEnv, createRunner, version } = require('./test_helpers.js');

const t = createRunner(`Menagerie quick wins (v${version})`);
const STORY = ['# Chapter 1: Dawn', 'The rain fell.', '# Chapter 2: Dusk', 'Short.', '# Chapter 3: Night', 'Dark.'];
const boot = (options = {}) => bootEnv(Object.assign({ doc: STORY }, options));

t.test('B10: config values are read in parallel and still applied (defaults for the rest)', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const config = { words_per_page: 200, show_char_count: false, summary_prior_chapters_mode: 'ALL', lorebook_category: ' Recaps ' };
    const env = await boot({
        before: async (e) => {
            e.mock.api.v1.config.get = async (k) => {
                inFlight++;
                maxInFlight = Math.max(maxInFlight, inFlight);
                await new Promise((r) => setImmediate(r));
                inFlight--;
                if (k === 'auto_finish_if_truncated') throw new Error('config read failed');
                return config[k];
            };
        }
    });
    assert.ok(maxInFlight > 5, `reads overlap (max in flight: ${maxInFlight})`);
    assert.strictEqual(env.run('appConfig.wordsPerPage'), 200);
    assert.strictEqual(env.run('appConfig.showCharCount'), false);
    assert.strictEqual(env.run('appConfig.summaryPriorChaptersMode'), 'all');
    assert.strictEqual(env.run('appConfig.lorebookCategory'), 'Recaps');
    assert.strictEqual(env.run('appConfig.analysisMaxTokens'), 2048, 'unset option keeps its default');
    assert.strictEqual(env.run('appConfig.autoFinishIfTruncated'), true, 'a failed read keeps its default');
});

t.test('B4: an equal-length edit is recounted; the cache is capped; estimates are not cached', async () => {
    const env = await boot();
    // Count words, so two texts of the same length can have different counts
    env.mock.api.v1.tokenizer.encode = async (text) => String(text).split(/\s+/).filter(Boolean);
    assert.strictEqual(await env.run('getOrComputeTokenCount("aa bb cc dd", "glm-4-6")'), 4);
    assert.strictEqual(await env.run('getOrComputeTokenCount("aa bbbbb dd", "glm-4-6")'), 3, 'same length, same ends, new count');
    env.run('tokenCache.clear()');
    for (let i = 0; i < 520; i++) await env.run(`getOrComputeTokenCount("text number ${i}", "glm-4-6")`);
    assert.strictEqual(env.run('tokenCache.size'), env.run('TOKEN_CACHE_MAX'));
    assert.strictEqual(env.run('tokenCache.has(tokenCacheKey("text number 0", "glm-4-6"))'), false, 'oldest dropped');
    assert.strictEqual(env.run('tokenCache.has(tokenCacheKey("text number 519", "glm-4-6"))'), true);
    env.mock.api.v1.tokenizer.encode = async () => { throw new Error('tokenizer down'); };
    await env.run('getOrComputeTokenCount("brand new text here", "glm-4-6")');
    assert.strictEqual(env.run('tokenCache.has(tokenCacheKey("brand new text here", "glm-4-6"))'), false, 'estimate not cached');
    env.mock.api.v1.tokenizer.encode = async (text) => String(text).split(/\s+/).filter(Boolean);
    assert.strictEqual(await env.run('getOrComputeTokenCount("brand new text here", "glm-4-6")'), 4, 'real count once the tokenizer is back');
});

t.test('B8: getChapterByIndex returns the chapter at that position', async () => {
    const env = await boot();
    assert.strictEqual(env.run('appState.chapters.length'), 3);
    for (let i = 0; i < 3; i++) assert.strictEqual(env.run(`getChapterByIndex(${i}) === appState.chapters[${i}]`), true);
    assert.strictEqual(env.run('getChapterByIndex(7)'), undefined);
    assert.strictEqual(env.run('getChapterByIndex(-1)'), undefined);
});

t.test('G8: the summary closing line names every active section', async () => {
    const env = await boot();
    const closing = (toggles) => {
        const p = env.run(`buildSummaryUserPrompt("Chapter 1", "Text.", undefined, ${JSON.stringify(toggles)})`);
        return p.slice(p.lastIndexOf('Provide the'));
    };
    assert.strictEqual(closing({}), 'Provide the Chapter Summary, Key Developments, and Targeted Questions following the exact output format now.');
    assert.strictEqual(closing({ summaryTargetedQuestions: false }), 'Provide the Chapter Summary and Key Developments following the exact output format now.');
    assert.strictEqual(closing({ summaryKeyDevelopments: false }), 'Provide the Chapter Summary and Targeted Questions following the exact output format now.');
    assert.strictEqual(closing({ summaryKeyDevelopments: false, summaryTargetedQuestions: false }), 'Provide the Chapter Summary following the exact output format now.');
});

t.test('E12: a bolded name line gets a blank line before its paragraph (display only)', async () => {
    const env = await boot();
    const fmt = (s) => env.run(`formatReportForDisplay(${JSON.stringify(s)})`);
    assert.strictEqual(fmt('**Mara**\nShe waits.'), '**Mara**\n\nShe waits.');
    assert.strictEqual(fmt('**Mara**  \nShe waits.\n**Tom**\nHe leaves.'), '**Mara**\n\nShe waits.\n**Tom**\n\nHe leaves.');
    assert.strictEqual(fmt('**Mara**\n\nAlready spaced.'), '**Mara**\n\nAlready spaced.', 'already spaced: unchanged');
    assert.strictEqual(fmt('**Mara** waits by the door.\nNext line.'), '**Mara** waits by the door.\nNext line.', 'bold inside a sentence: unchanged');
    assert.strictEqual(fmt('- **Point**\nmore'), '- **Point**\nmore', 'bullets: unchanged');
    assert.strictEqual(fmt(''), '');
    // The report card shows the formatted text; the stored report keeps the original
    env.run('appState.analyses[0] = { chapterIndex: 0, chapterTitle: "Chapter 1: Dawn", text: "**Mara**\\nShe waits.", generatedAt: Date.now() }');
    const card = env.run(`(() => { const noop = async () => {}; return makeReportDisplayCard({
        panel: 'analysis', chapterIndex: 0, titleDisplay: 'Chapter 1: Dawn', report: appState.analyses[0],
        cardTitlePrefix: 'Developmental Analysis', emptyStateText: 'none', emptyStateButtonLabel: 'Run', emptyStateIconId: 'play',
        onRun: noop, onCopy: noop, onAddToLorebook: noop, onContinue: noop, onRerun: noop, onClear: noop,
        rerunLabel: 'Re-analyze', rerunIconId: 'refresh', continueActionKey: 'analysis', cooldownStorageKey: 'cd' }); })()`);
    assert.ok(JSON.stringify(card).includes('**Mara**\\n\\nShe waits.'), 'card shows the spaced version');
    assert.strictEqual(env.run('appState.analyses[0].text'), '**Mara**\nShe waits.', 'saved text untouched');
});

t.run();
