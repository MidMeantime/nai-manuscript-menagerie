// --- Initialization & Lifecycle Hooks for Mid's Manuscript Menagerie ---

/** Bumped each time the background sync loop starts; an older loop sees the change and exits (B1 step 5) */
let syncLoopToken = 0;

/**
 * True while the user's own story generation runs (set in onGenerationRequested, cleared in
 * onGenerationEnd), so the background scan doesn't read a half-streamed document (B1 step 4).
 * Generations the Menagerie runs itself are tracked separately in appState.isGenerating.
 */
let storyGenerationActive = false;
let storyGenerationStartedAt = 0;
/** If onGenerationEnd never arrives (error, reload mid-generation), stop waiting after this long */
const STORY_GENERATION_STALE_MS = 5 * 60 * 1000;

function isStoryGenerating(): boolean {
    if (storyGenerationActive && Date.now() - storyGenerationStartedAt > STORY_GENERATION_STALE_MS) {
        storyGenerationActive = false;
    }
    return storyGenerationActive;
}

async function initializeManuscriptMenagerie(): Promise<void> {
    try {
        const t0 = Date.now();
        // 1. Hydrate configuration and storage
        await loadConfigFromSettings();
        // Chapter rules: the built-in ones now; the UCCDS script (if installed) is found in the background
        await startChapterDetection();
        const t1 = Date.now();
        await loadPersistedState();
        const t2 = Date.now();

        // 2. Perform initial document scan and metrics calculation
        await scanDocumentChapters();
        const t3 = Date.now();
        await scanLorebookCategories();
        const t4 = Date.now();

        // 3. Render initial UI panel
        await renderPanel();
        const t5 = Date.now();

        // Startup timings (A9 step 1): tells whether a slow open is config, storage, scanning/tokenizing, lorebook or rendering
        debugLog(
            `startup ${t5 - t0} ms: config ${t1 - t0} · stored state ${t2 - t1} · chapter scan ${t3 - t2} · lorebook ${t4 - t3} · render ${t5 - t4}`
        );
        debugLog(
            `stored data: analyses ${jsonSize(reportStore.analyses)} chars (${Object.keys(reportStore.analyses).length} reports), ` +
            `summaries ${jsonSize(reportStore.summaries)} chars (${Object.keys(reportStore.summaries).length} reports); ` +
            `${appState.chapters.length} chapters, ${appState.metrics.totalWords} words`
        );

        api.v1.log("Mid's Manuscript Menagerie initialized successfully.");
    } catch (err) {
        api.v1.error("Initialization error in Mid's Manuscript Menagerie:", err);
    }
}

// Register NovelAI Lifecycle Hooks
api.v1.hooks.register("onScriptsLoaded", async () => {
    await initializeManuscriptMenagerie();

    // Background sync: checks every 12 seconds using api.v1.timers.sleep
    // (global setInterval is unavailable in the NAI Web Worker sandbox).
    // The scan skips parsing/tokenizing when the document signature is unchanged,
    // and the panel only re-renders when the scan actually recomputed something.
    // If this hook runs again in the same worker, the newer loop takes over and this one exits.
    const myToken = ++syncLoopToken;
    (async () => {
        while (myToken === syncLoopToken) {
            await api.v1.timers.sleep(12000);
            if (myToken !== syncLoopToken) break;
            if (!appState.isGenerating && !appState.isScanning && !isStoryGenerating()) {
                const changed = await scanDocumentChapters();
                if (changed) await renderPanel();
            }
        }
    })().catch((err: any) => api.v1.error("Periodic sync loop error:", err));
});

// Pause background scans while the story itself is generating. Returns nothing, so generation is never blocked.
api.v1.hooks.register("onGenerationRequested", async () => {
    storyGenerationActive = true;
    storyGenerationStartedAt = Date.now();
});

// Update metrics on generation completion
api.v1.hooks.register("onGenerationEnd", async () => {
    storyGenerationActive = false;
    if (!appState.isGenerating) {
        const changed = await scanDocumentChapters();
        if (changed) await renderPanel();
    }
});

// Update metrics when undo/redo/history navigation occurs
api.v1.hooks.register("onHistoryNavigated", async () => {
    if (!appState.isGenerating) {
        const changed = await scanDocumentChapters();
        if (changed) await renderPanel();
    }
});
