// --- Chapter detection for Mid's Manuscript Menagerie: UCCDS (dual) ---
// UCCDS is bundled in its dual form (see scripts/build.js): the built-in detector follows the
// Menagerie's own [Chapters] config options, and when the UCCDS dependency script is installed and
// enabled in the same story, chapters come from it instead, so the user's global UCCDS rules apply
// and every UCCDS script agrees. Switching, change events and falling back when UCCDS stops
// answering are all handled by the uccdsDual* layer; this file only mirrors its state into appState.

// Last result, for the cheap "unchanged since" check, and the story title it was made with
let lastUccdsResult: UccdsResult | null = null;
let lastScanTitle = "";

/**
 * The Menagerie's own chapter rules: the UCCDS [Chapters] options in this script's config.
 * Two 0.3.0 options were replaced; their old values are carried over when NovelAI still returns
 * them and the new option is still at its default:
 *   separate_scene_breaks: false      → chapter_boundary_mode: headers_and_dividers
 *   treat_preamble_as_chapter: false  → chapter_opening_text: ignore
 * (chapter_detection_mode, chapter_break_token and detect_bracketed_titles kept their names, and
 * the old "break_token" mode value is understood by uccdsLoadSettings.)
 */
async function loadMenagerieChapterSettings(): Promise<UccdsSettings> {
    const settings = await uccdsLoadSettings();
    const read = async (key: string): Promise<any> => {
        try {
            return await api.v1.config.get(key);
        } catch {
            return undefined;
        }
    };
    const atDefault = (value: any, def: string): boolean => value === undefined || value === null || value === "" || value === def;
    if ((await read("separate_scene_breaks")) === false
        && atDefault(await read("chapter_boundary_mode"), "headers")
        && (await read("chapter_detection_mode")) !== "break_token") {
        settings.boundaryMode = 'headers_and_dividers';
    }
    if ((await read("treat_preamble_as_chapter")) === false && atDefault(await read("chapter_opening_text"), "chapter")) {
        settings.openingText = 'ignore';
    }
    return settings;
}

/** The 0.3.0 detection options, for the one-time report migration only */
async function loadLegacyDetectionConfig(): Promise<LegacyDetectionConfig> {
    const cfg: LegacyDetectionConfig = { ...LEGACY_DETECTION_DEFAULTS };
    try {
        const mode = await api.v1.config.get("chapter_detection_mode");
        if (typeof mode === 'string' && mode) cfg.chapterDetectionMode = mode;
        const token = await api.v1.config.get("chapter_break_token");
        if (typeof token === 'string' && token.trim()) cfg.chapterBreakToken = token.trim();
        const separate = await api.v1.config.get("separate_scene_breaks");
        if (typeof separate === 'boolean') cfg.separateSceneBreaks = separate;
        const brackets = await api.v1.config.get("detect_bracketed_titles");
        if (typeof brackets === 'boolean') cfg.detectBracketedTitles = brackets;
        const preamble = await api.v1.config.get("treat_preamble_as_chapter");
        if (typeof preamble === 'boolean') cfg.treatPreambleAsChapter = preamble;
    } catch {
        // defaults
    }
    return cfg;
}

const SPECIAL_KINDS: UccdsChapterKind[] = ['prologue', 'epilogue', 'interlude'];

/**
 * One UCCDS chapter as a Menagerie chapter. Titles keep the Menagerie's own wording (cleanHeaderTitle
 * over the header as written, "Story Beginning" for opening text, the story title for a story with no
 * headers) so displayed titles and saved Lorebook entry names stay the same as in 0.3.0.
 */
function toManuscriptChapter(c: UccdsChapter, index: number, wholeStory: boolean): ManuscriptChapter {
    let title: string;
    let cleanTitle: string;
    let normalizedNumber: number | null;
    if (c.kind === 'opening') {
        title = "Story Beginning (Prologue)";
        cleanTitle = "Story Beginning";
        normalizedNumber = 0;
    } else if (wholeStory) {
        title = appState.storyTitle || "Full Story";
        cleanTitle = title;
        normalizedNumber = 1;
    } else if (c.header && c.rawHeader) {
        title = c.rawHeader;
        cleanTitle = cleanHeaderTitle(c.rawHeader) || c.title;
        normalizedNumber = SPECIAL_KINDS.includes(c.kind) ? 0 : (c.kind === 'division' ? null : c.number);
    } else {
        title = c.title;
        cleanTitle = c.title;
        normalizedNumber = c.number;
    }
    return {
        index,
        key: c.key,
        kind: c.kind,
        title,
        cleanTitle,
        rawTitle: title,
        normalizedNumber,
        headerSectionId: c.headerSectionId ?? c.startSectionId,
        startSectionId: c.startSectionId,
        sectionIds: c.sectionIds.slice(),
        // Blank paragraphs carry no text for prompts or counts
        paragraphs: c.paragraphs.filter((p: string) => p.length > 0),
        wordCount: 0,
        charCount: 0,
        tokenCount: 0,
        pageCount: 0,
        preview: "",
        hasAnalysis: false,
        hasSummary: false
    };
}

/** The chapter list for a UCCDS result */
function chaptersFromResult(result: UccdsResult): ManuscriptChapter[] {
    const wholeStory = !result.hasHeaders && result.chapters.length === 1 && result.chapters[0].kind === 'untitled';
    return result.chapters.map((c: UccdsChapter, i: number) => toManuscriptChapter(c, i, wholeStory));
}

// --- Source of chapters (built-in or the UCCDS script), via the UCCDS dual layer ---

/** Mirrors the dual layer's source and rules into appState (Overview shows them) */
function syncChapterSourceState(): void {
    const source = uccdsDualSource();
    const info = uccdsDualDependencyInfo();
    if (source !== appState.chapterSource) {
        api.v1.log(source === 'dependency'
            ? `Menagerie: using the UCCDS script${info && info.version ? ` v${info.version}` : ""} for chapters (its chapter rules apply).`
            : "Menagerie: using the built-in chapter detection.");
    }
    appState.chapterSource = source;
    appState.uccdsDependencyVersion = info ? (info.version || "") : "";
    appState.chapterSettings = uccdsDualSettings();
}

/** Loads the built-in rules now; the UCCDS script is looked for in the background (never blocks start-up) */
async function startChapterDetection(): Promise<void> {
    await uccdsDualStart({ loadSettings: loadMenagerieChapterSettings, onChange: onChapterSourceChange });
    syncChapterSourceState();
}

/** 'source': UCCDS turned up or went away (rules changed, rescan fully). 'chapters': UCCDS saw the chapters change */
async function onChapterSourceChange(reason: UccdsDualChangeReason): Promise<void> {
    syncChapterSourceState();
    if (reason === 'source') lastUccdsResult = null;
    // During a generation the scan waits; onGenerationEnd rescans afterwards
    if (appState.isGenerating || isStoryGenerating()) return;
    const changed = await scanDocumentChapters(reason === 'source');
    if (changed) await renderPanel();
}

// --- One-time report migration (0.3.0/0.3.1 position-keyed → 0.3.2 chapter-keyed) ---

/**
 * Moves reports saved by chapter position to their chapter's key. Uses the OLD parser to learn
 * which header each saved position meant (the parser that wrote the data), then finds that header
 * among the UCCDS chapters. A report whose position already pointed at a different title, or whose
 * header isn't a chapter any more, falls back to a unique title match; anything left gets a negative
 * key and counts as unmatched (kept, never deleted). Runs once; waits if the document is still empty.
 */
async function migrateReportsToChapterKeys(chapters: ManuscriptChapter[]): Promise<void> {
    if (!legacyReports) return;
    const scanned = await api.v1.document.scan();
    if (!scanned || scanned.length === 0) return; // story not loaded yet: try again on the next scan

    const legacy = legacyDetectChapters(scanned, await loadLegacyDetectionConfig(), appState.storyTitle);
    let nextOrphanKey = -1;
    for (const k of [...Object.keys(reportStore.analyses), ...Object.keys(reportStore.summaries)]) {
        nextOrphanKey = Math.min(nextOrphanKey, Number(k) - 1);
    }
    const counts = { matched: 0, byTitle: 0, unmatched: 0 };

    const place = <T extends { chapterTitle: string; chapterKey?: number; timestamp: number }>(
        oldStore: Record<string, T>, store: Record<string, T>
    ): void => {
        for (const [posStr, report] of Object.entries(oldStore) as [string, T][]) {
            if (!report || typeof report !== 'object') continue;
            const old = legacy[Number(posStr)];
            let target: ManuscriptChapter | undefined;
            const titleAgrees = !!old && (!report.chapterTitle || normalizedTitle(report.chapterTitle) === normalizedTitle(old.cleanTitle));
            if (old && titleAgrees) {
                target = chapters.find((c: ManuscriptChapter) =>
                    c.key === old.headerSectionId || c.headerSectionId === old.headerSectionId || c.startSectionId === old.startSectionId);
            }
            let how: 'matched' | 'byTitle' | 'unmatched' = target ? 'matched' : 'unmatched';
            if (!target) {
                const byTitle = chapters.filter((c: ManuscriptChapter) => normalizedTitle(c.cleanTitle) === normalizedTitle(report.chapterTitle));
                if (byTitle.length === 1) { target = byTitle[0]; how = 'byTitle'; }
            }
            let key = target ? target.key : nextOrphanKey--;
            const existing = store[String(key)];
            if (existing && existing.timestamp >= report.timestamp) {
                // The chapter already has a newer report: keep both, this one as unmatched
                key = nextOrphanKey--;
                how = 'unmatched';
            } else if (existing) {
                const parkKey = nextOrphanKey--;
                existing.chapterKey = parkKey;
                store[String(parkKey)] = existing;
                counts.unmatched++;
            }
            report.chapterKey = key;
            store[String(key)] = report;
            counts[how]++;
        }
    };
    place(legacyReports.analyses, reportStore.analyses);
    place(legacyReports.summaries, reportStore.summaries);

    await persistReportStore('both');
    await setStorageItem("report_schema", REPORT_SCHEMA_VERSION);
    legacyReports = null;
    api.v1.log(`Menagerie: moved saved reports to chapter keys (${counts.matched} by position, ${counts.byTitle} by title, ${counts.unmatched} unmatched).`);
    if (counts.unmatched > 0) {
        api.v1.ui.toast(`Manuscript Menagerie: ${counts.unmatched} saved report${counts.unmatched === 1 ? "" : "s"} couldn't be matched to a chapter after the chapter detection update. They're kept; see the Overview tab.`, { type: "warning" })
            .catch(() => { /* nowhere left to report */ });
    }
}

// --- Scanning ---

// A scan requested while another one is running is queued, not dropped (B6)
let hasPendingScan = false;
let pendingScanForced = false;

/**
 * Scans the document and rebuilds chapter metrics.
 * Returns true if chapters/metrics were recomputed, false if skipped (document unchanged) or queued.
 * A call made while a scan is running is queued and runs right after it; the running caller gets
 * true if either pass recomputed, so its render covers the queued request too.
 * Pass force = true to bypass the unchanged-document check (manual Rescan).
 */
async function scanDocumentChapters(force = false): Promise<boolean> {
    if (appState.isScanning) {
        hasPendingScan = true;
        pendingScanForced = pendingScanForced || force;
        return false;
    }
    const started = Date.now();
    let changed = await scanDocumentChaptersOnce(force);
    while (hasPendingScan) {
        const queuedForce = pendingScanForced;
        hasPendingScan = false;
        pendingScanForced = false;
        changed = (await scanDocumentChaptersOnce(queuedForce)) || changed;
    }
    if (changed) debugLog(`scan (${appState.chapterSource}): ${Date.now() - started} ms, ${appState.chapters.length} chapters`);
    return changed;
}

/** One scan pass. Use scanDocumentChapters(), which queues overlapping requests. */
async function scanDocumentChaptersOnce(force = false): Promise<boolean> {
    if (appState.isScanning) return false;
    appState.isScanning = true;

    try {
        // 1. Story title
        try {
            const t = await api.v1.story.title.get();
            if (t && typeof t === 'string' && t.trim().length > 0) {
                appState.storyTitle = t.trim();
            }
        } catch {
            // Keep existing or default title
        }

        // 2. Chapters from whichever source is active (the dual layer falls back to built-in by itself)
        const title = appState.storyTitle || "";
        const previous = force || title !== lastScanTitle ? null : lastUccdsResult;
        const result = await uccdsDualGetChaptersIfChanged(previous, { includeText: true });
        syncChapterSourceState();
        if (!result) return false;
        lastUccdsResult = result;
        lastScanTitle = title;

        const chapters = chaptersFromResult(result);
        // Sections that belong to a chapter: a report keyed to a section outside this set had its header deleted
        const existingSectionIds = new Set<number>();
        for (const ch of chapters) for (const id of ch.sectionIds) existingSectionIds.add(id);

        // 3. Saved reports: one-time migration, then the by-position view for this chapter list
        if (legacyReports) await migrateReportsToChapterKeys(chapters);
        await rebuildReportView(chapters, existingSectionIds);

        // 4. Metrics
        await refreshAllChapterMetrics(chapters, appConfig.wordsPerPage, appConfig.aiModel);

        // Keep the same chapter selected even if chapters were added or removed above it
        const previousKey = appState.chapters[appState.selectedChapterIndex]?.key ?? appState.selectedChapterKey;
        appState.chapters = chapters;
        appState.metrics = calculateDocumentTotals(chapters, appConfig.wordsPerPage);
        const keptIndex = previousKey === null || previousKey === undefined ? -1 : chapters.findIndex((c: ManuscriptChapter) => c.key === previousKey);
        if (keptIndex >= 0) {
            appState.selectedChapterIndex = keptIndex;
        } else if (appState.selectedChapterIndex >= chapters.length) {
            appState.selectedChapterIndex = Math.max(0, chapters.length - 1);
        }
        appState.selectedChapterKey = chapters[appState.selectedChapterIndex]?.key ?? null;
        return true;
    } catch (err) {
        // Force a full rescan next time rather than trusting a half-processed result
        lastUccdsResult = null;
        api.v1.error("Error during document scanning:", err);
        return false;
    } finally {
        appState.isScanning = false;
    }
}
