// --- State & Configuration Management for Mid's Manuscript Menagerie ---

const STORAGE_PREFIX = "mids_mm_";

/**
 * The model every analysis, summary and token count uses.
 * GLM-4.6 only, on purpose: Xialong is a storytelling model, not an instruct model, so it was
 * removed as an option and is NOT on the dev plan. Please don't add a model picker back without
 * a Xialong-specific prompting workflow (see Menagerie_Action_Plan.md, C4b).
 */
const MENAGERIE_MODEL = "glm-4-6";

const appConfig: MenagerieConfig = {
    aiModel: MENAGERIE_MODEL,
    debugLogging: false,
    chapterNumberStyle: "arabic",
    showCharCount: true,
    showWordCount: true,
    showTokenCount: true,
    showPageCount: true,
    wordsPerPage: 350,
    showChapterSubcounts: true,
    showChapterCharCount: false,
    showChapterWordCount: true,
    showChapterTokenCount: true,
    showChapterPageCount: true,
    autoAnalyzeBeforeSummarize: true,
    analysisMaxTokens: 2048,
    summaryMaxTokens: 1400,
    includeLorebookInAnalysis: true,
    includeLorebookInSummary: true,
    analysisPriorChaptersMode: "last_1" as PriorChaptersMode,
    summaryPriorChaptersMode: "last_1" as PriorChaptersMode,
    autoSummarizePriorChapter: false,
    referenceContextSource: "cached" as ReferenceContextSource,
    analysisLorebookCategory: "Chapter Analyses",
    saveToLorebook: false,
    lorebookCategory: "Chapter Summaries",
    autoFinishIfTruncated: true
};

const DEFAULT_PROMPT_TOGGLES: PromptToggles = {
    analysisCharacter: true,
    analysisCraftQuestions: true,
    analysisPriorChapters: 'last_1',
    summaryUseAnalysis: true,
    summaryPriorChapters: 'last_1',
    summaryKeyDevelopments: true,
    summaryTargetedQuestions: true
};

const DEFAULT_LOREBOOK_INCLUSION: LorebookInclusionState = {
    includeInAnalysis: true,
    includeInSummary: true,
    analysisCategoryIds: new Set<string>(),
    summaryCategoryIds: new Set<string>(),
    analysisEntryIds: new Set<string>(),
    summaryEntryIds: new Set<string>()
};

const appState: MenagerieState = {
    storyTitle: "Untitled Story",
    storyId: "default_story",
    chapters: [],
    metrics: {
        totalChars: 0,
        totalWords: 0,
        totalTokens: 0,
        totalPages: 0,
        totalChapters: 0
    },
    selectedChapterIndex: 0,
    selectedChapterKey: null,
    activeTab: 'overview',
    chapterSource: 'embedded',
    uccdsDependencyVersion: "",
    chapterSettings: uccdsNormalizeSettings(null),
    unmatchedReportCount: 0,
    isScanning: false,
    isGenerating: false,
    generatingChapterIndex: null,
    generatingAction: null,
    statusMessage: "Ready",
    analyses: {},
    summaries: {},
    promptToggles: { ...DEFAULT_PROMPT_TOGGLES },
    showPromptPreview: false,
    promptOverrides: {},
    editingPromptChunks: new Set<PromptChunkKey>(),
    promptChunkRevisions: {},
    promptPresets: {},
    searchQuery: "",
    collapsedCategoryIds: new Set<string>(),
    hasInitiallyCollapsed: false,
    referenceContextSource: "cached" as ReferenceContextSource,
    lorebookInclusion: {
        includeInAnalysis: true,
        includeInSummary: true,
        analysisCategoryIds: new Set<string>(),
        summaryCategoryIds: new Set<string>(),
        analysisEntryIds: new Set<string>(),
        summaryEntryIds: new Set<string>()
    },
    availableLorebookCategories: [],
    replenishCooldowns: {}
};

/** Every tab the panel has; persisted tab values are checked against this */
const VALID_TABS: ActiveTab[] = ['overview', 'chapters', 'inspector', 'analysis', 'summary'];

// --- Story-Safe Storage Layer ---

// Last time a "couldn't save" toast was shown, so a burst of failed writes shows one toast, not ten
let lastStorageWarningAt = 0;
const STORAGE_WARNING_INTERVAL_MS = 30000;

async function getStorageItem(key: string): Promise<any> {
    try {
        if ((api.v1 as any).storyStorage && typeof (api.v1 as any).storyStorage.get === 'function') {
            const val = await (api.v1 as any).storyStorage.get(key);
            if (val !== undefined && val !== null) return val;
        }
    } catch (err) {
        api.v1.error(`Menagerie: couldn't read "${key}" from story storage:`, err);
    }
    // Fallback: partition api.v1.storage by storyId
    const fallbackKey = `${STORAGE_PREFIX}${appState.storyId}_${key}`;
    try {
        return await api.v1.storage.get(fallbackKey);
    } catch (err) {
        api.v1.error(`Menagerie: couldn't read "${key}" from script storage:`, err);
        return null;
    }
}

/**
 * Saves to story storage, falling back to script storage partitioned by story id.
 * Never throws: a failed save is logged and the user gets one throttled warning toast,
 * so a report that didn't persist is no longer lost silently.
 */
async function setStorageItem(key: string, value: any): Promise<void> {
    try {
        if ((api.v1 as any).storyStorage && typeof (api.v1 as any).storyStorage.set === 'function') {
            await (api.v1 as any).storyStorage.set(key, value);
            return;
        }
    } catch (err) {
        api.v1.error(`Menagerie: couldn't save "${key}" to story storage, trying script storage:`, err);
    }
    // Fallback: partition api.v1.storage by storyId
    const fallbackKey = `${STORAGE_PREFIX}${appState.storyId}_${key}`;
    try {
        await api.v1.storage.set(fallbackKey, value);
    } catch (err) {
        api.v1.error(`Menagerie: couldn't save "${key}":`, err);
        const now = Date.now();
        if (now - lastStorageWarningAt >= STORAGE_WARNING_INTERVAL_MS) {
            lastStorageWarningAt = now;
            api.v1.ui.toast("Manuscript Menagerie couldn't save to story storage. Your latest report may not be kept after a reload; copy it somewhere safe.", { type: "warning" })
                .catch(() => { /* toast failure has nowhere left to report */ });
        }
    }
}

/** Debug-only log line (config `debug_logging`) */
function debugLog(...parts: any[]): void {
    if (appConfig.debugLogging) api.v1.log("[Menagerie debug]", ...parts);
}

/** Size of a stored value as JSON, for debug logs */
function jsonSize(value: any): number {
    try {
        return JSON.stringify(value ?? null).length;
    } catch {
        return -1;
    }
}

// --- Configuration Loader ---

async function loadConfigFromSettings(): Promise<void> {
    try {
        const getStr = async (key: string, def: string): Promise<string> => {
            try {
                const val = await api.v1.config.get(key);
                return typeof val === 'string' && val.trim().length > 0 ? val.trim() : def;
            } catch {
                return def;
            }
        };

        const getBool = async (key: string, def: boolean): Promise<boolean> => {
            try {
                const val = await api.v1.config.get(key);
                return typeof val === 'boolean' ? val : def;
            } catch {
                return def;
            }
        };

        const getNum = async (key: string, def: number): Promise<number> => {
            try {
                const val = await api.v1.config.get(key);
                const parsed = typeof val === 'number' ? val : parseInt(String(val), 10);
                return !isNaN(parsed) && parsed > 0 ? parsed : def;
            } catch {
                return def;
            }
        };

        // No `ai_model` option any more: the model is fixed to GLM-4.6 (see MENAGERIE_MODEL)
        appConfig.aiModel = MENAGERIE_MODEL;
        const numStyle = await getStr("chapter_number_style", "arabic");
        appConfig.chapterNumberStyle = (numStyle.toLowerCase() === "roman") ? "roman" : "arabic";
        appConfig.wordsPerPage = await getNum("words_per_page", 350);
        appConfig.showWordCount = await getBool("show_word_count", true);
        appConfig.showPageCount = await getBool("show_page_count", true);
        appConfig.showTokenCount = await getBool("show_token_count", true);
        appConfig.showCharCount = await getBool("show_char_count", true);

        appConfig.showChapterSubcounts = await getBool("show_chapter_subcounts", true);
        appConfig.showChapterWordCount = await getBool("show_chapter_word_count", true);
        appConfig.showChapterPageCount = await getBool("show_chapter_page_count", true);
        appConfig.showChapterTokenCount = await getBool("show_chapter_token_count", true);
        appConfig.showChapterCharCount = await getBool("show_chapter_char_count", false);

        // Chapter detection options are read by loadMenagerieChapterSettings() (chapters.ts, UCCDS option names)

        appConfig.autoAnalyzeBeforeSummarize = await getBool("auto_analyze_before_summarize", true);
        appConfig.analysisMaxTokens = await getNum("analysis_max_tokens", 2048);
        appConfig.summaryMaxTokens = await getNum("summary_max_tokens", 1400);
        appConfig.includeLorebookInAnalysis = await getBool("include_lorebook_in_analysis", true);
        appConfig.includeLorebookInSummary = await getBool("include_lorebook_in_summary", true);
        const analysisPriorMode = await getStr("analysis_prior_chapters_mode", "last_1");
        appConfig.analysisPriorChaptersMode = (['off', 'last_1', 'last_4', 'all'].includes(analysisPriorMode.toLowerCase()))
            ? (analysisPriorMode.toLowerCase() as PriorChaptersMode)
            : 'last_1';
        const priorMode = await getStr("summary_prior_chapters_mode", "last_1");
        appConfig.summaryPriorChaptersMode = (['off', 'last_1', 'last_4', 'all'].includes(priorMode.toLowerCase()))
            ? (priorMode.toLowerCase() as PriorChaptersMode)
            : 'last_1';
        appConfig.autoSummarizePriorChapter = await getBool("auto_summarize_prior_chapter", false);
        const refSource = await getStr("reference_context_source", "cached");
        appConfig.referenceContextSource = (refSource.toLowerCase() === "lorebook") ? "lorebook" : "cached";
        appConfig.analysisLorebookCategory = await getStr("analysis_lorebook_category", "Chapter Analyses");
        appConfig.saveToLorebook = await getBool("save_to_lorebook", false);
        appConfig.lorebookCategory = await getStr("lorebook_category", "Chapter Summaries");
        appConfig.autoFinishIfTruncated = await getBool("auto_finish_if_truncated", true);
        appConfig.debugLogging = await getBool("debug_logging", false);
    } catch (err) {
        api.v1.log("Error loading config:", err);
    }
}

// --- Persisted State Hydration ---

async function loadPersistedState(): Promise<void> {
    try {
        try {
            const sid = await (api.v1 as any).story?.id?.();
            if (sid && typeof sid === 'string') {
                appState.storyId = sid;
            }
        } catch {}

        await loadReportStore();

        // Validate persisted UI state: an old or corrupt value falls back to the default (D3)
        const savedTab = await getStorageItem("active_tab");
        if (typeof savedTab === 'string' && (VALID_TABS as string[]).includes(savedTab)) {
            appState.activeTab = savedTab as ActiveTab;
        }

        // The selected chapter is remembered by key; the old position value is only a fallback
        const savedKey = await getStorageItem("selected_ch_key");
        if (typeof savedKey === 'number' && Number.isInteger(savedKey)) {
            appState.selectedChapterKey = savedKey;
        }
        const savedSelected = await getStorageItem("selected_ch");
        if (typeof savedSelected === 'number' && Number.isInteger(savedSelected) && savedSelected >= 0) {
            // Clamped to the real chapter count after the first scan (scanDocumentChapters)
            appState.selectedChapterIndex = savedSelected;
        }

        const savedToggles = await getStorageItem("prompt_toggles");
        if (savedToggles && typeof savedToggles === 'object') {
            appState.promptToggles = {
                ...DEFAULT_PROMPT_TOGGLES,
                analysisPriorChapters: appConfig.analysisPriorChaptersMode,
                summaryPriorChapters: appConfig.summaryPriorChaptersMode,
                ...savedToggles
            };
            if (!['off', 'last_1', 'last_4', 'all'].includes(appState.promptToggles.analysisPriorChapters)) {
                appState.promptToggles.analysisPriorChapters = 'last_1';
            }
            if (!['off', 'last_1', 'last_4', 'all'].includes(appState.promptToggles.summaryPriorChapters)) {
                appState.promptToggles.summaryPriorChapters = 'last_1';
            }
        } else {
            appState.promptToggles = {
                ...DEFAULT_PROMPT_TOGGLES,
                analysisPriorChapters: appConfig.analysisPriorChaptersMode,
                summaryUseAnalysis: appConfig.autoAnalyzeBeforeSummarize,
                summaryPriorChapters: appConfig.summaryPriorChaptersMode
            };
        }

        const savedOverrides = await getStorageItem("prompt_overrides");
        appState.promptOverrides = {};
        if (savedOverrides && typeof savedOverrides === 'object') {
            for (const [key, value] of Object.entries(savedOverrides)) {
                // An override identical to the (possibly updated) built-in default is dropped, so it reads as "not edited"
                if (typeof value === 'string' && key in DEFAULT_PROMPT_CHUNKS && value !== DEFAULT_PROMPT_CHUNKS[key as PromptChunkKey]) {
                    appState.promptOverrides[key as PromptChunkKey] = value;
                }
            }
        }

        const savedPresets = await getStorageItem("prompt_presets");
        appState.promptPresets = {};
        if (savedPresets && typeof savedPresets === 'object') {
            for (const page of ['analysis', 'summary'] as PromptPage[]) {
                const preset = savedPresets[page];
                if (preset && typeof preset.name === 'string') {
                    appState.promptPresets[page] = { name: preset.name, modified: !!preset.modified };
                }
            }
        }

        const savedLbInclusion = await getStorageItem("lorebook_inclusion");
        if (savedLbInclusion && typeof savedLbInclusion === 'object') {
            appState.lorebookInclusion = {
                includeInAnalysis: typeof savedLbInclusion.includeInAnalysis === 'boolean'
                    ? savedLbInclusion.includeInAnalysis
                    : appConfig.includeLorebookInAnalysis,
                includeInSummary: typeof savedLbInclusion.includeInSummary === 'boolean'
                    ? savedLbInclusion.includeInSummary
                    : appConfig.includeLorebookInSummary,
                analysisCategoryIds: new Set<string>(Array.isArray(savedLbInclusion.analysisCategoryIds) ? savedLbInclusion.analysisCategoryIds : []),
                summaryCategoryIds: new Set<string>(Array.isArray(savedLbInclusion.summaryCategoryIds) ? savedLbInclusion.summaryCategoryIds : []),
                analysisEntryIds: new Set<string>(Array.isArray(savedLbInclusion.analysisEntryIds) ? savedLbInclusion.analysisEntryIds : []),
                summaryEntryIds: new Set<string>(Array.isArray(savedLbInclusion.summaryEntryIds) ? savedLbInclusion.summaryEntryIds : [])
            };
        } else {
            appState.lorebookInclusion = {
                includeInAnalysis: appConfig.includeLorebookInAnalysis,
                includeInSummary: appConfig.includeLorebookInSummary,
                analysisCategoryIds: new Set<string>(),
                summaryCategoryIds: new Set<string>(),
                analysisEntryIds: new Set<string>(),
                summaryEntryIds: new Set<string>()
            };
        }

        const savedRefSource = await getStorageItem("ref_context_source");
        if (savedRefSource === "cached" || savedRefSource === "lorebook") {
            appState.referenceContextSource = savedRefSource;
        } else {
            appState.referenceContextSource = appConfig.referenceContextSource;
        }
    } catch (err) {
        api.v1.log("Error loading persisted state:", err);
    }
}

function serializeInclusionState(): SerializedLorebookInclusionState {
    return {
        includeInAnalysis: appState.lorebookInclusion.includeInAnalysis,
        includeInSummary: appState.lorebookInclusion.includeInSummary,
        analysisCategoryIds: Array.from(appState.lorebookInclusion.analysisCategoryIds),
        summaryCategoryIds: Array.from(appState.lorebookInclusion.summaryCategoryIds),
        analysisEntryIds: Array.from(appState.lorebookInclusion.analysisEntryIds),
        summaryEntryIds: Array.from(appState.lorebookInclusion.summaryEntryIds)
    };
}

// Non-blocking optimistic storage persistence with light debouncing
// (sequence-token debounce over api.v1.timers.sleep; native setTimeout is unavailable in the worker)
let persistInclusionSeq = 0;
function persistInclusionState(): void {
    const seq = ++persistInclusionSeq;
    api.v1.timers.sleep(200).then(async () => {
        if (seq !== persistInclusionSeq) return;
        await setStorageItem("lorebook_inclusion", serializeInclusionState());
    }).catch((err: any) => {
        api.v1.error("Error saving inclusion state:", err);
    });
}

// --- Folding Helpers ---

function toggleCategoryFold(catId: string): void {
    if (appState.collapsedCategoryIds.has(catId)) {
        appState.collapsedCategoryIds.delete(catId);
    } else {
        appState.collapsedCategoryIds.add(catId);
    }
}

function expandAllCategories(): void {
    appState.collapsedCategoryIds.clear();
}

function collapseAllCategories(): void {
    for (const cat of appState.availableLorebookCategories) {
        appState.collapsedCategoryIds.add(cat.id);
    }
}

// --- High-Performance Single-Pass Stats Precomputation ---

function computeAllLorebookStats(): ComputedLorebookStats {
    const byCategory = new Map<string, { analysis: CategorySelectionStats; summary: CategorySelectionStats }>();
    let overallAnalysisTotal = 0;
    let overallAnalysisSelected = 0;
    let overallSummaryTotal = 0;
    let overallSummarySelected = 0;
    let activeAnalysisCats = 0;
    let activeSummaryCats = 0;

    const {
        analysisCategoryIds,
        summaryCategoryIds,
        analysisEntryIds,
        summaryEntryIds
    } = appState.lorebookInclusion;

    for (const cat of appState.availableLorebookCategories) {
        const catEntries = cat.entries || [];
        const total = catEntries.length;

        if (total === 0) {
            const isCatAnalysis = analysisCategoryIds.has(cat.id);
            const isCatSummary = summaryCategoryIds.has(cat.id);
            byCategory.set(cat.id, {
                analysis: { selected: isCatAnalysis ? 1 : 0, total: 1, isAll: isCatAnalysis, isNone: !isCatAnalysis, isPartial: false },
                summary: { selected: isCatSummary ? 1 : 0, total: 1, isAll: isCatSummary, isNone: !isCatSummary, isPartial: false }
            });
            if (isCatAnalysis) {
                overallAnalysisTotal += 1;
                overallAnalysisSelected += 1;
                activeAnalysisCats++;
            }
            if (isCatSummary) {
                overallSummaryTotal += 1;
                overallSummarySelected += 1;
                activeSummaryCats++;
            }
            continue;
        }

        const isCatAnalysis = analysisCategoryIds.has(cat.id);
        const isCatSummary = summaryCategoryIds.has(cat.id);

        let analysisCount = 0;
        let summaryCount = 0;

        for (const entry of catEntries) {
            if (isCatAnalysis || analysisEntryIds.has(entry.id)) {
                analysisCount++;
            }
            if (isCatSummary || summaryEntryIds.has(entry.id)) {
                summaryCount++;
            }
        }

        const aStats: CategorySelectionStats = {
            selected: analysisCount,
            total,
            isAll: analysisCount === total && total > 0,
            isNone: analysisCount === 0,
            isPartial: analysisCount > 0 && analysisCount < total
        };

        const sStats: CategorySelectionStats = {
            selected: summaryCount,
            total,
            isAll: summaryCount === total && total > 0,
            isNone: summaryCount === 0,
            isPartial: summaryCount > 0 && summaryCount < total
        };

        byCategory.set(cat.id, { analysis: aStats, summary: sStats });

        overallAnalysisTotal += total;
        overallAnalysisSelected += analysisCount;
        overallSummaryTotal += total;
        overallSummarySelected += summaryCount;

        if (analysisCount > 0) activeAnalysisCats++;
        if (summaryCount > 0) activeSummaryCats++;
    }

    return {
        byCategory,
        overallAnalysis: {
            total: overallAnalysisTotal,
            selected: overallAnalysisSelected,
            isAll: overallAnalysisTotal > 0 && overallAnalysisSelected === overallAnalysisTotal,
            isPartial: overallAnalysisSelected > 0 && overallAnalysisSelected < overallAnalysisTotal,
            isNone: overallAnalysisSelected === 0
        },
        overallSummary: {
            total: overallSummaryTotal,
            selected: overallSummarySelected,
            isAll: overallSummaryTotal > 0 && overallSummarySelected === overallSummaryTotal,
            isPartial: overallSummarySelected > 0 && overallSummarySelected < overallSummaryTotal,
            isNone: overallSummarySelected === 0
        },
        activeAnalysisCats,
        activeSummaryCats,
        totalAnalysisEntries: overallAnalysisSelected,
        totalSummaryEntries: overallSummarySelected
    };
}

// --- Action Handlers (Optimistic & Set-Based) ---

function toggleLorebookMasterOption(target: 'analysis' | 'summary'): void {
    if (target === 'analysis') {
        appState.lorebookInclusion.includeInAnalysis = !appState.lorebookInclusion.includeInAnalysis;
    } else {
        appState.lorebookInclusion.includeInSummary = !appState.lorebookInclusion.includeInSummary;
    }
    persistInclusionState();
}

function setReferenceContextSource(source: 'cached' | 'lorebook'): void {
    appState.referenceContextSource = source;
    setStorageItem("ref_context_source", source).catch(() => { });
}

function toggleLorebookCategoryInclusion(categoryId: string, target: 'analysis' | 'summary'): void {
    const catSet = target === 'analysis' ? appState.lorebookInclusion.analysisCategoryIds : appState.lorebookInclusion.summaryCategoryIds;
    const entrySet = target === 'analysis' ? appState.lorebookInclusion.analysisEntryIds : appState.lorebookInclusion.summaryEntryIds;

    const cat = appState.availableLorebookCategories.find(c => c.id === categoryId);
    const catEntries = cat?.entries || [];

    const isCatIn = catSet.has(categoryId);
    let count = 0;
    for (const e of catEntries) {
        if (isCatIn || entrySet.has(e.id)) count++;
    }
    const isAll = catEntries.length > 0 ? count === catEntries.length : isCatIn;

    if (isAll) {
        catSet.delete(categoryId);
        for (const e of catEntries) entrySet.delete(e.id);
    } else {
        catSet.add(categoryId);
        for (const e of catEntries) entrySet.add(e.id);
    }

    persistInclusionState();
}

function toggleLorebookEntryInclusion(entryId: string, categoryId: string, target: 'analysis' | 'summary'): void {
    const catSet = target === 'analysis' ? appState.lorebookInclusion.analysisCategoryIds : appState.lorebookInclusion.summaryCategoryIds;
    const entrySet = target === 'analysis' ? appState.lorebookInclusion.analysisEntryIds : appState.lorebookInclusion.summaryEntryIds;

    const cat = appState.availableLorebookCategories.find(c => c.id === categoryId);
    const catEntries = cat?.entries || [];
    const isCurrentlyIncluded = catSet.has(categoryId) || entrySet.has(entryId);

    if (isCurrentlyIncluded) {
        if (catSet.has(categoryId)) {
            catSet.delete(categoryId);
            for (const e of catEntries) {
                if (e.id !== entryId) entrySet.add(e.id);
            }
        }
        entrySet.delete(entryId);
    } else {
        entrySet.add(entryId);
        if (catEntries.length > 0 && catEntries.every(e => entrySet.has(e.id))) {
            catSet.add(categoryId);
        }
    }

    persistInclusionState();
}

function selectAllLorebookCategories(target: 'analysis' | 'summary'): void {
    const catSet = target === 'analysis' ? appState.lorebookInclusion.analysisCategoryIds : appState.lorebookInclusion.summaryCategoryIds;
    const entrySet = target === 'analysis' ? appState.lorebookInclusion.analysisEntryIds : appState.lorebookInclusion.summaryEntryIds;

    catSet.clear();
    entrySet.clear();

    for (const cat of appState.availableLorebookCategories) {
        catSet.add(cat.id);
        if (cat.entries) {
            for (const e of cat.entries) entrySet.add(e.id);
        }
    }

    persistInclusionState();
}

function clearAllLorebookCategories(target: 'analysis' | 'summary'): void {
    const catSet = target === 'analysis' ? appState.lorebookInclusion.analysisCategoryIds : appState.lorebookInclusion.summaryCategoryIds;
    const entrySet = target === 'analysis' ? appState.lorebookInclusion.analysisEntryIds : appState.lorebookInclusion.summaryEntryIds;

    catSet.clear();
    entrySet.clear();

    persistInclusionState();
}

async function scanLorebookCategories(): Promise<void> {
    try {
        if (!api.v1.lorebook || typeof api.v1.lorebook.categories !== 'function') {
            appState.availableLorebookCategories = [];
            return;
        }

        const allCategories = await api.v1.lorebook.categories().catch(() => []) as LorebookCategory[];
        const allEntries = await api.v1.lorebook.entries().catch(() => []) as LorebookEntry[];

        const excludedNames = [
            (appConfig.analysisLorebookCategory || "Chapter Analyses").toLowerCase().trim(),
            (appConfig.lorebookCategory || "Chapter Summaries").toLowerCase().trim()
        ];

        const entriesByCategory: Record<string, LorebookEntryItem[]> = {};
        const uncategorizedEntries: LorebookEntryItem[] = [];

        for (const entry of allEntries) {
            if (!entry || !entry.id) continue;
            const name = (entry.displayName || (entry.keys && entry.keys[0]) || (entry.text ? entry.text.slice(0, 30).trim() : "") || "Untitled Entry").trim();
            const item: LorebookEntryItem = {
                id: entry.id,
                name,
                categoryId: entry.category || null,
                enabled: entry.enabled !== false
            };

            if (entry.category && typeof entry.category === 'string') {
                if (!entriesByCategory[entry.category]) {
                    entriesByCategory[entry.category] = [];
                }
                entriesByCategory[entry.category].push(item);
            } else {
                uncategorizedEntries.push(item);
            }
        }

        const categoryItems: LorebookCategoryItem[] = [];

        for (const cat of allCategories) {
            if (!cat || !cat.id) continue;
            const catName = (cat.name || "Unnamed Category").trim();
            if (excludedNames.includes(catName.toLowerCase())) continue;

            const catEntries = entriesByCategory[cat.id] || [];
            categoryItems.push({
                id: cat.id,
                name: catName,
                entryCount: catEntries.length,
                entries: catEntries
            });
        }

        if (uncategorizedEntries.length > 0) {
            categoryItems.push({
                id: '__uncategorized__',
                name: 'Uncategorized Entries',
                entryCount: uncategorizedEntries.length,
                entries: uncategorizedEntries
            });
        }

        appState.availableLorebookCategories = categoryItems;

        // Start collapsed by default so UI renders instantly on open
        if (!appState.hasInitiallyCollapsed && categoryItems.length > 0) {
            appState.hasInitiallyCollapsed = true;
            for (const cat of categoryItems) {
                appState.collapsedCategoryIds.add(cat.id);
            }
        }
    } catch (err) {
        api.v1.log("Error scanning lorebook categories:", err);
        appState.availableLorebookCategories = [];
    }
}

async function togglePromptOption(key: BooleanPromptToggleKey): Promise<void> {
    appState.promptToggles[key] = !appState.promptToggles[key];
    setStorageItem("prompt_toggles", appState.promptToggles).catch(() => {});
}

async function setAnalysisPriorChapters(mode: PriorChaptersMode): Promise<void> {
    appState.promptToggles.analysisPriorChapters = mode;
    setStorageItem("prompt_toggles", appState.promptToggles).catch(() => {});
}

async function setSummaryPriorChapters(mode: PriorChaptersMode): Promise<void> {
    appState.promptToggles.summaryPriorChapters = mode;
    setStorageItem("prompt_toggles", appState.promptToggles).catch(() => {});
}

function togglePromptPreview(): void {
    appState.showPromptPreview = !appState.showPromptPreview;
}

// --- Prompt Chunk Overrides (per story) ---

let persistOverridesSeq = 0;
function persistPromptOverrides(): void {
    const seq = ++persistOverridesSeq;
    api.v1.timers.sleep(300).then(async () => {
        if (seq !== persistOverridesSeq) return;
        await setStorageItem("prompt_overrides", appState.promptOverrides);
    }).catch((err: any) => {
        api.v1.error("Error saving prompt overrides:", err);
    });
}

// --- Named Prompt Presets (per story) ---

function getPromptChunkPage(key: PromptChunkKey): PromptPage {
    return PROMPT_PAGE_CHUNK_KEYS.analysis.includes(key) ? 'analysis' : 'summary';
}

function persistPromptPresets(): void {
    setStorageItem("prompt_presets", appState.promptPresets).catch((err: any) => {
        api.v1.error("Error saving prompt presets:", err);
    });
}

function setPromptPreset(page: PromptPage, name: string): void {
    appState.promptPresets[page] = { name, modified: false };
    persistPromptPresets();
}

// Renaming keeps the modified flag; naming a page that had no preset starts a fresh, unmodified one
function renamePromptPreset(page: PromptPage, name: string): void {
    const preset = appState.promptPresets[page];
    if (preset) {
        preset.name = name;
    } else {
        appState.promptPresets[page] = { name, modified: false };
    }
    persistPromptPresets();
}

function pageHasPromptEdits(page: PromptPage): boolean {
    return PROMPT_PAGE_CHUNK_KEYS[page].some((key: PromptChunkKey) => typeof appState.promptOverrides[key] === 'string');
}

// Called after any chunk edit/reset. If every chunk on the page is back at its default
// (e.g. reverted by hand), the page drops its preset and reads as plain "Default" again;
// otherwise the preset is flagged as modified the first time one of its chunks changes.
function markPromptPresetModified(key: PromptChunkKey): void {
    const page = getPromptChunkPage(key);
    const preset = appState.promptPresets[page];
    if (!preset) return;
    if (!pageHasPromptEdits(page)) {
        delete appState.promptPresets[page];
        persistPromptPresets();
    } else if (!preset.modified) {
        preset.modified = true;
        persistPromptPresets();
    }
}

// Reverts every chunk on the page to this script version's defaults and clears its preset name
function resetPromptPageToDefaults(page: PromptPage): void {
    for (const key of PROMPT_PAGE_CHUNK_KEYS[page]) {
        delete appState.promptOverrides[key];
        appState.promptChunkRevisions[key] = (appState.promptChunkRevisions[key] || 0) + 1;
    }
    delete appState.promptPresets[page];
    persistPromptOverrides();
    persistPromptPresets();
}

function togglePromptChunkEditing(key: PromptChunkKey): void {
    if (appState.editingPromptChunks.has(key)) {
        appState.editingPromptChunks.delete(key);
    } else {
        appState.editingPromptChunks.add(key);
    }
}

// Called on every keystroke; never re-renders so the textarea keeps focus.
// Text matching the default is stored as "no override" so future default updates still flow through.
function setPromptChunkOverride(key: PromptChunkKey, text: string): void {
    if (text === DEFAULT_PROMPT_CHUNKS[key]) {
        delete appState.promptOverrides[key];
    } else {
        appState.promptOverrides[key] = text;
    }
    markPromptPresetModified(key);
    persistPromptOverrides();
}

function resetPromptChunk(key: PromptChunkKey): void {
    delete appState.promptOverrides[key];
    appState.promptChunkRevisions[key] = (appState.promptChunkRevisions[key] || 0) + 1;
    markPromptPresetModified(key);
    persistPromptOverrides();
}

/**
 * Applies imported chunks to one page. The file's text is always what gets used: text that differs
 * from this script's default becomes an override, text matching it is stored as "no override".
 * The file's `edited` flag is ignored here, because a chunk that was the default when exported
 * (e.g. an archived older-version preset) is no longer the default once defaults change.
 * Chunks missing from the file are left as they are. Returns the number of chunks applied.
 */
function applyImportedPromptChunks(page: PromptPage, chunks: Partial<Record<PromptChunkKey, PromptExportChunk>>): number {
    let applied = 0;
    for (const key of PROMPT_PAGE_CHUNK_KEYS[page]) {
        const chunk = chunks[key];
        if (!chunk) continue;
        if (chunk.text !== DEFAULT_PROMPT_CHUNKS[key]) {
            appState.promptOverrides[key] = chunk.text;
        } else {
            delete appState.promptOverrides[key];
        }
        // Forces any open textarea to remount with the imported text
        appState.promptChunkRevisions[key] = (appState.promptChunkRevisions[key] || 0) + 1;
        applied++;
    }
    persistPromptOverrides();
    return applied;
}

// --- Saved reports, stored by chapter key (D1, since 0.3.2) ---
// Up to 0.3.0 reports lived under "analyses" / "summaries", keyed by chapter POSITION, so adding,
// removing or re-detecting a chapter silently moved every later report onto the wrong chapter.
// Now they live under "analyses_by_key" / "summaries_by_key", keyed by the chapter's UCCDS key
// (its header section id). appState.analyses / appState.summaries are a by-position view of this
// store for the current chapter list, rebuilt after every scan (rebuildReportView).
// The old position-keyed values are never deleted: they're the backup if the migration needs a redo.

const REPORT_SCHEMA_VERSION = 2;

/** Every saved report by chapter key, including reports whose chapter isn't in the list right now */
const reportStore: {
    analyses: Record<string, ChapterAnalysis>;
    summaries: Record<string, ChapterSummary>;
} = { analyses: {}, summaries: {} };

/** Position-keyed reports from 0.3.0 waiting for migrateReportsToChapterKeys() (chapters.ts) */
let legacyReports: { analyses: Record<string, ChapterAnalysis>; summaries: Record<string, ChapterSummary> } | null = null;

function isReportRecord(value: any): boolean {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

async function loadReportStore(): Promise<void> {
    const schema = await getStorageItem("report_schema");
    const byKeyA = await getStorageItem("analyses_by_key");
    const byKeyS = await getStorageItem("summaries_by_key");
    reportStore.analyses = isReportRecord(byKeyA) ? byKeyA : {};
    reportStore.summaries = isReportRecord(byKeyS) ? byKeyS : {};
    legacyReports = null;
    if (typeof schema === 'number' && schema >= REPORT_SCHEMA_VERSION) return;

    const oldA = await getStorageItem("analyses");
    const oldS = await getStorageItem("summaries");
    const hasOld = (isReportRecord(oldA) && Object.keys(oldA).length > 0) || (isReportRecord(oldS) && Object.keys(oldS).length > 0);
    if (hasOld) {
        legacyReports = { analyses: isReportRecord(oldA) ? oldA : {}, summaries: isReportRecord(oldS) ? oldS : {} };
    } else {
        // Nothing saved before 0.3.2: start straight on the new layout
        await setStorageItem("report_schema", REPORT_SCHEMA_VERSION);
    }
}

async function persistReportStore(which: 'analyses' | 'summaries' | 'both'): Promise<void> {
    if (which !== 'summaries') await setStorageItem("analyses_by_key", reportStore.analyses);
    if (which !== 'analyses') await setStorageItem("summaries_by_key", reportStore.summaries);
}

function normalizedTitle(title: string | undefined): string {
    return (title || "").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Moves reports whose header paragraph no longer exists (deleted, or retyped as a new paragraph)
 * to the one chapter with the same title, when exactly one such chapter has no report of that type.
 * A report whose header still exists but no longer counts as a chapter is left where it is, so it
 * reattaches by itself if the header comes back (undo, or different chapter rules).
 */
function relinkReports<T extends { chapterTitle: string; chapterKey?: number }>(
    store: Record<string, T>, chapters: ManuscriptChapter[], existingSectionIds: Set<number>
): boolean {
    const chapterKeys = new Set<number>(chapters.map((c: ManuscriptChapter) => c.key));
    let moved = false;
    for (const [storeKey, report] of Object.entries(store) as [string, T][]) {
        const key = Number(storeKey);
        if (chapterKeys.has(key) || existingSectionIds.has(key)) continue;
        const wanted = normalizedTitle(report.chapterTitle);
        if (!wanted) continue;
        const candidates = chapters.filter((c: ManuscriptChapter) => normalizedTitle(c.cleanTitle) === wanted && !store[String(c.key)]);
        if (candidates.length !== 1) continue;
        const target = candidates[0];
        delete store[storeKey];
        report.chapterKey = target.key;
        store[String(target.key)] = report;
        moved = true;
    }
    return moved;
}

/** Rebuilds the by-position view for `chapters` and counts reports that don't match any chapter */
async function rebuildReportView(chapters: ManuscriptChapter[], existingSectionIds: Set<number>): Promise<void> {
    const movedA = relinkReports(reportStore.analyses, chapters, existingSectionIds);
    const movedS = relinkReports(reportStore.summaries, chapters, existingSectionIds);
    if (movedA || movedS) await persistReportStore(movedA && movedS ? 'both' : (movedA ? 'analyses' : 'summaries'));

    const analyses: Record<number, ChapterAnalysis> = {};
    const summaries: Record<number, ChapterSummary> = {};
    const keys = new Set<string>();
    for (const ch of chapters) {
        const k = String(ch.key);
        keys.add(k);
        const a = reportStore.analyses[k];
        if (a) { a.chapterIndex = ch.index; a.chapterKey = ch.key; analyses[ch.index] = a; }
        const s = reportStore.summaries[k];
        if (s) { s.chapterIndex = ch.index; s.chapterKey = ch.key; summaries[ch.index] = s; }
    }
    appState.analyses = analyses;
    appState.summaries = summaries;
    appState.unmatchedReportCount =
        Object.keys(reportStore.analyses).filter((k: string) => !keys.has(k)).length +
        Object.keys(reportStore.summaries).filter((k: string) => !keys.has(k)).length;
}

/** The store key for a report: its own chapterKey, else the key of the chapter at its position */
function reportKeyFor(report: { chapterIndex: number; chapterKey?: number }): number | null {
    if (typeof report.chapterKey === 'number') return report.chapterKey;
    const ch = appState.chapters[report.chapterIndex];
    return ch ? ch.key : null;
}

async function saveAnalysisToStorage(analysis: ChapterAnalysis): Promise<void> {
    const key = reportKeyFor(analysis);
    appState.analyses[analysis.chapterIndex] = analysis;
    if (key === null) {
        api.v1.error("Menagerie: couldn't tell which chapter this analysis belongs to; it was not saved.");
        return;
    }
    analysis.chapterKey = key;
    reportStore.analyses[String(key)] = analysis;
    await persistReportStore('analyses');
}

async function saveSummaryToStorage(summary: ChapterSummary): Promise<void> {
    const key = reportKeyFor(summary);
    appState.summaries[summary.chapterIndex] = summary;
    if (key === null) {
        api.v1.error("Menagerie: couldn't tell which chapter this summary belongs to; it was not saved.");
        return;
    }
    summary.chapterKey = key;
    reportStore.summaries[String(key)] = summary;
    await persistReportStore('summaries');
}

function chapterKeyAt(chapterIndex: number): string | null {
    const chapter = appState.chapters.find(c => c.index === chapterIndex);
    return chapter ? String(chapter.key) : null;
}

async function clearCachedAnalysis(chapterIndex: number): Promise<void> {
    await clearCachedReports(chapterIndex, 'analysis');
}

async function clearCachedSummary(chapterIndex: number): Promise<void> {
    await clearCachedReports(chapterIndex, 'summary');
}

async function clearCachedReports(chapterIndex: number, target: 'analysis' | 'summary' | 'both'): Promise<void> {
    const key = chapterKeyAt(chapterIndex);
    if (target === 'analysis' || target === 'both') {
        delete appState.analyses[chapterIndex];
        if (key !== null) delete reportStore.analyses[key];
    }
    if (target === 'summary' || target === 'both') {
        delete appState.summaries[chapterIndex];
        if (key !== null) delete reportStore.summaries[key];
    }
    await persistReportStore(target === 'analysis' ? 'analyses' : (target === 'summary' ? 'summaries' : 'both'));
    const chapter = appState.chapters.find(c => c.index === chapterIndex);
    if (chapter) {
        if (target === 'analysis' || target === 'both') chapter.hasAnalysis = false;
        if (target === 'summary' || target === 'both') chapter.hasSummary = false;
    }
}

/** Deletes every saved report that doesn't belong to a chapter in the current list */
async function clearUnmatchedReports(): Promise<number> {
    const keys = new Set<string>(appState.chapters.map((c: ManuscriptChapter) => String(c.key)));
    let removed = 0;
    for (const k of Object.keys(reportStore.analyses)) if (!keys.has(k)) { delete reportStore.analyses[k]; removed++; }
    for (const k of Object.keys(reportStore.summaries)) if (!keys.has(k)) { delete reportStore.summaries[k]; removed++; }
    if (removed > 0) await persistReportStore('both');
    appState.unmatchedReportCount = 0;
    return removed;
}

async function setActiveTab(tab: ActiveTab): Promise<void> {
    appState.activeTab = tab;
    setStorageItem("active_tab", tab).catch(() => {});
}

async function setSelectedChapter(index: number): Promise<void> {
    appState.selectedChapterIndex = index;
    const chapter = appState.chapters[index];
    appState.selectedChapterKey = chapter ? chapter.key : null;
    setStorageItem("selected_ch", index).catch(() => {});
    if (chapter) setStorageItem("selected_ch_key", chapter.key).catch(() => {});
}

// --- Token Replenishment Cooldown Manager ---

function getReplenishCooldown(key: string): number {
    const expiresAt = appState.replenishCooldowns?.[key] || 0;
    const remaining = expiresAt - Date.now();
    return remaining > 0 ? remaining : 0;
}

let isCooldownTickerRunning = false;

function hasActiveCooldown(): boolean {
    const now = Date.now();
    for (const [, exp] of Object.entries(appState.replenishCooldowns || {}) as [string, number][]) {
        if (exp > now) return true;
    }
    return false;
}

function startReplenishCooldown(key: string, durationMs: number): void {
    if (!appState.replenishCooldowns) {
        appState.replenishCooldowns = {};
    }
    appState.replenishCooldowns[key] = Date.now() + durationMs;

    if (isCooldownTickerRunning) return;
    isCooldownTickerRunning = true;

    // 1s ticker via api.v1.timers.sleep (global setInterval is unavailable in the NAI Web Worker sandbox)
    (async () => {
        try {
            while (hasActiveCooldown()) {
                await api.v1.timers.sleep(1000);
                await renderPanel();
            }
        } finally {
            isCooldownTickerRunning = false;
        }
    })().catch((err: any) => api.v1.error("Cooldown ticker error:", err));
}

