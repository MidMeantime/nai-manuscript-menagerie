// --- Types & Interfaces for Mid's Manuscript Menagerie ---

interface ParsedChapterTitle {
    preTitle: string;
    chapterNumber: number | null;
    chapterNumberRaw: string;
    chapterTitle: string;
    isSpecial: boolean;
}

interface ManuscriptChapter {
    /** Position in the current chapter list. Changes when chapters are added or removed: never store it */
    index: number;
    /** Stable identity from UCCDS: the header's section id (first section id when there's no header). Reports are stored by this */
    key: number;
    /** What UCCDS says this entry is: chapter, title, prologue, epilogue, interlude, division, opening or untitled */
    kind: UccdsChapterKind;
    title: string;
    cleanTitle: string;
    rawTitle?: string;
    normalizedNumber: number | null;
    headerSectionId: number;
    startSectionId: number;
    sectionIds: number[];
    paragraphs: string[];
    wordCount: number;
    charCount: number;
    tokenCount: number;
    pageCount: number;
    preview: string;
    hasAnalysis: boolean;
    hasSummary: boolean;
}

interface DocumentMetrics {
    totalChars: number;
    totalWords: number;
    totalTokens: number;
    totalPages: number;
    totalChapters: number;
}

interface ChapterAnalysis {
    /** Position when last shown; refreshed on every scan. Storage uses chapterKey */
    chapterIndex: number;
    /** The chapter's UCCDS key (header section id); negative = couldn't be matched during the 0.3.2 migration */
    chapterKey?: number;
    chapterTitle: string;
    timestamp: number;
    model: string;
    text: string;
    savedToLorebook?: boolean;
    truncated?: boolean;
    suspectedTruncated?: boolean;
}

interface ChapterSummary {
    /** Position when last shown; refreshed on every scan. Storage uses chapterKey */
    chapterIndex: number;
    /** The chapter's UCCDS key (header section id); negative = couldn't be matched during the 0.3.2 migration */
    chapterKey?: number;
    chapterTitle: string;
    timestamp: number;
    model: string;
    text: string;
    usedAnalysis: boolean;
    savedToLorebook: boolean;
    truncated?: boolean;
    suspectedTruncated?: boolean;
}

interface MenagerieConfig {
    aiModel: string;
    /** Log startup/scan timings and stored data sizes (config `debug_logging`) */
    debugLogging: boolean;
    chapterNumberStyle: 'arabic' | 'roman';
    showCharCount: boolean;
    showWordCount: boolean;
    showTokenCount: boolean;
    showPageCount: boolean;
    wordsPerPage: number;
    showChapterSubcounts: boolean;
    showChapterCharCount: boolean;
    showChapterWordCount: boolean;
    showChapterTokenCount: boolean;
    showChapterPageCount: boolean;
    autoAnalyzeBeforeSummarize: boolean;
    analysisMaxTokens: number;
    summaryMaxTokens: number;
    includeLorebookInAnalysis: boolean;
    includeLorebookInSummary: boolean;
    analysisPriorChaptersMode: PriorChaptersMode;
    summaryPriorChaptersMode: PriorChaptersMode;
    autoSummarizePriorChapter: boolean;
    referenceContextSource: ReferenceContextSource;
    analysisLorebookCategory: string;
    saveToLorebook: boolean;
    lorebookCategory: string;
    autoFinishIfTruncated: boolean;
}

type ActiveTab = 'overview' | 'chapters' | 'inspector' | 'analysis' | 'summary';

type PriorChaptersMode = 'off' | 'last_1' | 'last_4' | 'all';

type ReferenceContextSource = 'cached' | 'lorebook';

interface PromptToggles {
    analysisCharacter: boolean;
    analysisCraftQuestions: boolean;
    analysisPriorChapters: PriorChaptersMode;
    summaryUseAnalysis: boolean;
    summaryPriorChapters: PriorChaptersMode;
    summaryKeyDevelopments: boolean;
    summaryTargetedQuestions: boolean;
}

type BooleanPromptToggleKey = 'analysisCharacter' | 'analysisCraftQuestions' | 'summaryUseAnalysis' | 'summaryKeyDevelopments' | 'summaryTargetedQuestions';

type PromptChunkKey =
    | 'analysisHeader' | 'analysisStrengths' | 'analysisCharacter' | 'analysisThematic' | 'analysisCraftQuestions'
    | 'summaryHeader' | 'summaryMain' | 'summaryKeyDevelopments' | 'summaryTargetedQuestions';

/** The overarching page a prompt chunk belongs to */
type PromptPage = 'analysis' | 'summary';

/** One chunk as recorded in an exported prompt file */
interface PromptExportChunk {
    label: string;
    /** Informational: whether the chunk differed from the exporter's default. Import always uses `text`. */
    edited: boolean;
    text: string;
}

/** JSON file format for prompt import/export (one page per file) */
interface PromptExportFile {
    format: string;
    formatVersion: number;
    page: PromptPage;
    /** Human-readable preset name, e.g. "Blunt Line Editor" (optional in files made before presets existed) */
    presetName?: string;
    scriptVersion?: string;
    exportedAt?: string;
    chunks: Partial<Record<PromptChunkKey, PromptExportChunk>>;
}

/** The named preset a page's prompts came from (via import or export) */
interface PromptPresetState {
    /** Empty string = untitled (e.g. imported from a file without a name) */
    name: string;
    /** true once any chunk on the page was edited or reset after the preset was applied/saved */
    modified: boolean;
}

interface PromptChunkView {
    key: PromptChunkKey;
    label: string;
    text: string;
    isEdited: boolean;
}

interface LorebookEntryItem {
    id: string;
    name: string;
    categoryId: string | null;
    enabled: boolean;
}

interface LorebookCategoryItem {
    id: string;
    name: string;
    entryCount: number;
    entries: LorebookEntryItem[];
}

interface LorebookInclusionState {
    includeInAnalysis: boolean;
    includeInSummary: boolean;
    analysisCategoryIds: Set<string>;
    summaryCategoryIds: Set<string>;
    analysisEntryIds: Set<string>;
    summaryEntryIds: Set<string>;
}

interface SerializedLorebookInclusionState {
    includeInAnalysis: boolean;
    includeInSummary: boolean;
    analysisCategoryIds: string[];
    summaryCategoryIds: string[];
    analysisEntryIds: string[];
    summaryEntryIds: string[];
}

interface CategorySelectionStats {
    selected: number;
    total: number;
    isAll: boolean;
    isNone: boolean;
    isPartial: boolean;
}

interface ComputedLorebookStats {
    byCategory: Map<string, { analysis: CategorySelectionStats; summary: CategorySelectionStats }>;
    overallAnalysis: { total: number; selected: number; isAll: boolean; isPartial: boolean; isNone: boolean };
    overallSummary: { total: number; selected: number; isAll: boolean; isPartial: boolean; isNone: boolean };
    activeAnalysisCats: number;
    activeSummaryCats: number;
    totalAnalysisEntries: number;
    totalSummaryEntries: number;
}

interface TokenBudgetStatus {
    hasBudget: boolean;
    waitMs: number;
    reason?: string;
}

interface MenagerieState {
    storyTitle: string;
    storyId: string;
    chapters: ManuscriptChapter[];
    metrics: DocumentMetrics;
    selectedChapterIndex: number;
    /** Key of the selected chapter, so the selection survives chapters being added or removed above it */
    selectedChapterKey: number | null;
    activeTab: ActiveTab;
    /** Where chapters come from: the built-in UCCDS ('embedded') or the UCCDS dependency script */
    chapterSource: 'embedded' | 'dependency';
    /** Version of the UCCDS dependency script in use ("" when embedded or unknown) */
    uccdsDependencyVersion: string;
    /** The chapter rules in effect: the Menagerie's own config (embedded) or the user's UCCDS config (dependency) */
    chapterSettings: UccdsSettings;
    /** Saved reports whose chapter isn't in the current chapter list (header removed or changed) */
    unmatchedReportCount: number;
    isScanning: boolean;
    isGenerating: boolean;
    generatingChapterIndex: number | null;
    generatingAction: 'analyze' | 'summarize' | 'continue-analysis' | 'continue-summary' | null;
    statusMessage: string;
    /** Reports for the current chapter list, by position. Rebuilt from reportStore after every scan */
    analyses: Record<number, ChapterAnalysis>;
    summaries: Record<number, ChapterSummary>;
    promptToggles: PromptToggles;
    showPromptPreview: boolean;
    /** Per-story custom text for system prompt chunks; missing keys fall back to defaults */
    promptOverrides: Partial<Record<PromptChunkKey, string>>;
    /** Chunks currently open in the inline editor (UI-only, not persisted) */
    editingPromptChunks: Set<PromptChunkKey>;
    /** Bumped on reset so the chunk's textarea remounts with fresh initialValue */
    promptChunkRevisions: Partial<Record<PromptChunkKey, number>>;
    /** Per-story record of each page's current named preset */
    promptPresets: Partial<Record<PromptPage, PromptPresetState>>;
    searchQuery: string;
    collapsedCategoryIds: Set<string>;
    hasInitiallyCollapsed: boolean;
    referenceContextSource: ReferenceContextSource;
    lorebookInclusion: LorebookInclusionState;
    availableLorebookCategories: LorebookCategoryItem[];
    replenishCooldowns: Record<string, number>;
}
