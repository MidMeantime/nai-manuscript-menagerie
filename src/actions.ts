// --- Shared Generation Helpers ---

/**
 * Given a base message array and a partial text that was cut off (finish_reason === 'length'),
 * performs a single continuation pass using assistant-prefill. The model receives the partial
 * output as its own prior turn and naturally continues from where it left off.
 */
async function runContinuationPass(
    baseMessages: { role: 'system' | 'user' | 'assistant'; content: string }[],
    partialText: string,
    maxTokens: number
): Promise<{ text: string; truncated: boolean; suspectedTruncated: boolean }> {
    const continuationMessages = [
        ...baseMessages,
        { role: 'assistant' as const, content: partialText }
    ];

    const contResponse = await api.v1.generate(
        continuationMessages,
        {
            model: appConfig.aiModel,
            max_tokens: maxTokens,
            temperature: 0.85,
            top_p: 0.95
        }
    );

    const rawContText = contResponse?.choices?.[0]?.text || "";
    const contFinishReason = contResponse?.choices?.[0]?.finish_reason;
    const cleanCont = cleanContinuationText(partialText, rawContText);

    let combined = partialText;
    if (cleanCont) {
        const needsSpace = /[.,!?:;]\s*$/.test(partialText) && !cleanCont.startsWith(" ") && !cleanCont.startsWith("\n");
        combined = partialText + (needsSpace ? " " : "") + cleanCont;
    }

    const isExplicitTruncated = contFinishReason === "length";
    const isLikelyCutOff = isResponseLikelyCutOff(combined, contFinishReason);
    const isSuspected = !isExplicitTruncated && isLikelyCutOff;

    return {
        text: combined.trim(),
        truncated: isExplicitTruncated,
        suspectedTruncated: isSuspected
    };
}

/**
 * Inspects NovelAI's runtime token budget via api.v1.script.
 * Checks allowed output tokens and uncached input tokens.
 * Returns whether sufficient tokens exist, or if replenishment is needed with the wait duration in ms.
 */
function checkTokenBudget(neededOutputTokens: number, inputMessages?: any[]): TokenBudgetStatus {
    try {
        const scriptApi = (api.v1 as any)?.script;
        if (!scriptApi) {
            return { hasBudget: true, waitMs: 0 };
        }

        let maxWaitMs = 0;
        let constrained = false;
        let reason = "";

        // 1. Check Output Tokens
        if (typeof scriptApi.getAllowedOutput === 'function') {
            const allowedOutput = scriptApi.getAllowedOutput();
            if (typeof allowedOutput === 'number' && allowedOutput < neededOutputTokens) {
                constrained = true;
                let timeUntilOutput = 0;
                if (typeof scriptApi.getTimeUntilAllowedOutput === 'function') {
                    timeUntilOutput = scriptApi.getTimeUntilAllowedOutput(neededOutputTokens);
                }
                maxWaitMs = Math.max(maxWaitMs, typeof timeUntilOutput === 'number' ? timeUntilOutput : 5000);
                reason = `Output tokens limited (${allowedOutput}/${neededOutputTokens})`;
            }
        }

        // 2. Check Input Tokens
        if (inputMessages && typeof scriptApi.countUncachedInputTokens === 'function' && typeof scriptApi.getAllowedInput === 'function') {
            const uncachedNeeded = scriptApi.countUncachedInputTokens(inputMessages);
            const allowedInput = scriptApi.getAllowedInput();
            if (typeof allowedInput === 'number' && typeof uncachedNeeded === 'number' && allowedInput < uncachedNeeded) {
                constrained = true;
                let timeUntilInput = 0;
                if (typeof scriptApi.getTimeUntilAllowedInput === 'function') {
                    timeUntilInput = scriptApi.getTimeUntilAllowedInput(uncachedNeeded);
                }
                maxWaitMs = Math.max(maxWaitMs, typeof timeUntilInput === 'number' ? timeUntilInput : 5000);
                reason = reason
                    ? `${reason}, Input tokens limited (${allowedInput}/${uncachedNeeded})`
                    : `Input tokens limited (${allowedInput}/${uncachedNeeded})`;
            }
        }

        if (constrained) {
            const finalWaitMs = Math.max(maxWaitMs, 3000);
            return { hasBudget: false, waitMs: finalWaitMs, reason };
        }

        return { hasBudget: true, waitMs: 0 };
    } catch (err) {
        api.v1.log("Error checking token budget:", err);
        return { hasBudget: true, waitMs: 0 };
    }
}

// --- Lorebook Context Assembly ---

async function getLorebookContextForTarget(target: 'analysis' | 'summary'): Promise<string> {
    try {
        const isMasterEnabled = target === 'analysis'
            ? appState.lorebookInclusion.includeInAnalysis
            : appState.lorebookInclusion.includeInSummary;

        if (!isMasterEnabled) return "";

        const targetCategoryIds = target === 'analysis'
            ? appState.lorebookInclusion.analysisCategoryIds
            : appState.lorebookInclusion.summaryCategoryIds;
        const targetEntryIds = target === 'analysis'
            ? appState.lorebookInclusion.analysisEntryIds
            : appState.lorebookInclusion.summaryEntryIds;

        const hasCategories = targetCategoryIds && (targetCategoryIds instanceof Set ? targetCategoryIds.size > 0 : (targetCategoryIds as any).length > 0);
        const hasEntries = targetEntryIds && (targetEntryIds instanceof Set ? targetEntryIds.size > 0 : (targetEntryIds as any).length > 0);

        if (!hasCategories && !hasEntries) return "";

        if (!api.v1.lorebook || typeof api.v1.lorebook.entries !== 'function') return "";

        const allEntries = await api.v1.lorebook.entries().catch(() => []) as LorebookEntry[];
        if (!allEntries || allEntries.length === 0) return "";

        const matchedEntries: LorebookEntry[] = [];
        const seenIds = new Set<string>();
        const includeUncategorized = targetCategoryIds instanceof Set
            ? targetCategoryIds.has('__uncategorized__')
            : (targetCategoryIds as any).includes('__uncategorized__');

        for (const entry of allEntries) {
            if (!entry || !entry.id) continue;
            if (entry.enabled === false) continue;
            const text = (entry.text || "").trim();
            if (!text) continue;

            if (seenIds.has(entry.id)) continue;

            const categoryId = entry.category;
            const matchesCategory = categoryId
                ? (targetCategoryIds instanceof Set ? targetCategoryIds.has(categoryId) : (targetCategoryIds as any).includes(categoryId))
                : includeUncategorized;

            const matchesEntry = targetEntryIds instanceof Set
                ? targetEntryIds.has(entry.id)
                : (targetEntryIds as any).includes(entry.id);

            if (matchesCategory || matchesEntry) {
                seenIds.add(entry.id);
                matchedEntries.push(entry);
            }
        }

        if (matchedEntries.length === 0) return "";

        const formattedChunks: string[] = [];
        for (const entry of matchedEntries) {
            const title = (entry.displayName || "Lore Entry").trim();
            formattedChunks.push(`#### ${title}\n${(entry.text || "").trim()}`);
        }

        return formattedChunks.join("\n\n");
    } catch (err) {
        api.v1.log("Error assembling lorebook context:", err);
        return "";
    }
}

// --- Internal Generation Runners ---

async function runInternalAnalysis(chapter: ManuscriptChapter): Promise<string> {
    const chapterHeader = chapter.rawTitle || chapter.title || chapter.cleanTitle;
    const chapterText = chapter.paragraphs.join("\n\n");

    const lorebookContext = await getLorebookContextForTarget('analysis');
    const priorMode = appState.promptToggles.analysisPriorChapters || 'off';
    const priorChapterContext = await getPriorChapterSummariesContext(chapter.index, priorMode);
    const systemPrompt = buildAnalysisSystemPrompt(appState.promptToggles);
    const userPrompt = buildAnalysisUserPrompt(
        chapterHeader,
        chapterText,
        appState.promptToggles,
        lorebookContext,
        priorChapterContext
    );

    const baseMessages = [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: userPrompt }
    ];

    const response = await api.v1.generate(
        baseMessages,
        {
            model: appConfig.aiModel,
            max_tokens: appConfig.analysisMaxTokens,
            temperature: 0.85,
            top_p: 0.95
        }
    );

    let generatedText = response?.choices?.[0]?.text?.trim() || "";
    if (!generatedText) {
        throw new Error("No response returned from model during analysis.");
    }

    const finishReason = response?.choices?.[0]?.finish_reason;
    const isExplicitTruncated = finishReason === "length";
    const isLikelyCutOff = isResponseLikelyCutOff(generatedText, finishReason);
    const isTruncated = isExplicitTruncated;
    const isSuspected = !isExplicitTruncated && isLikelyCutOff;

    // Immediately preserve the generated output in storage so it cannot be lost
    let analysisObj: ChapterAnalysis = {
        chapterIndex: chapter.index,
        chapterKey: chapter.key,
        chapterTitle: chapter.cleanTitle,
        timestamp: Date.now(),
        model: appConfig.aiModel,
        text: generatedText,
        savedToLorebook: false,
        truncated: isTruncated,
        suspectedTruncated: isSuspected
    };
    await saveAnalysisToStorage(analysisObj);
    chapter.hasAnalysis = true;

    if ((isExplicitTruncated || isSuspected) && appConfig.autoFinishIfTruncated) {
        const continuationMessages = [
            ...baseMessages,
            { role: 'assistant' as const, content: generatedText }
        ];
        const budget = checkTokenBudget(appConfig.analysisMaxTokens, continuationMessages);

        if (!budget.hasBudget) {
            api.v1.ui.toast(`Analysis was cut short. Tokens replenishing (${Math.ceil(budget.waitMs / 1000)}s)...`, { type: "warning" });
            startReplenishCooldown(`analysis-${chapter.index}`, budget.waitMs);
        } else {
            try {
                api.v1.ui.toast(
                    isExplicitTruncated
                        ? "Analysis was cut short — continuing automatically..."
                        : "Analysis appears cut short — continuing automatically...",
                    { type: "info" }
                );
                const continuation = await runContinuationPass(baseMessages, generatedText, appConfig.analysisMaxTokens);
                generatedText = continuation.text;
                analysisObj = {
                    ...analysisObj,
                    text: generatedText,
                    timestamp: Date.now(),
                    truncated: continuation.truncated,
                    suspectedTruncated: continuation.suspectedTruncated
                };
                await saveAnalysisToStorage(analysisObj);
                if (continuation.truncated || continuation.suspectedTruncated) {
                    api.v1.ui.toast("Analysis is very long — output was still cut short. You can continue generation manually.", { type: "warning" });
                }
            } catch (contErr: any) {
                api.v1.log("Auto-continuation error in analysis:", contErr);
                const waitMs = checkTokenBudget(appConfig.analysisMaxTokens).waitMs || 10000;
                api.v1.ui.toast("Could not finish automatically due to token limits. You can finish generation once replenished.", { type: "warning" });
                startReplenishCooldown(`analysis-${chapter.index}`, waitMs);
            }
        }
    }

    return generatedText;
}

// --- Lorebook Category & Entry Matching Helpers ---

/**
 * Fields every report entry is created with, so a saved analysis or summary can never activate
 * in the user's own story generation: no keys to match and not always-on (F3).
 * Only applied to new entries; an existing entry's keys/activation are the user's to change.
 */
const REPORT_ENTRY_ACTIVATION: Partial<LorebookEntry> = { keys: [], forceActivation: false };

/** Read-only lookup: the id of the category with this name (case-insensitive), or undefined. Never creates one. */
async function findLorebookCategoryId(categoryName: string): Promise<string | undefined> {
    try {
        const categories = await api.v1.lorebook.categories();
        const existing = categories.find(c => c.name?.toLowerCase() === categoryName.toLowerCase());
        return existing?.id || undefined;
    } catch (err) {
        api.v1.log("Could not read lorebook categories:", err);
        return undefined;
    }
}

/** Finds the category or creates it. Only for save paths: reading must use findLorebookCategoryId (F1). */
async function ensureLorebookCategory(categoryName: string): Promise<string | undefined> {
    try {
        const existingId = await findLorebookCategoryId(categoryName);
        if (existingId) {
            return existingId;
        }

        const newId = await api.v1.lorebook.createCategory({
            name: categoryName,
            enabled: true
        });
        return newId;
    } catch (err) {
        api.v1.log("Could not ensure lorebook category:", err);
        return undefined;
    }
}

function buildAnalysisLorebookTitle(chapter: ManuscriptChapter): string {
    const display = formatChapterDisplayTitle(chapter, appConfig.chapterNumberStyle);
    return `${display} | Analysis`;
}

function buildSummaryLorebookTitle(chapter: ManuscriptChapter): string {
    const display = formatChapterDisplayTitle(chapter, appConfig.chapterNumberStyle);
    return `${display} | Summary`;
}

/**
 * Searches a lorebook category for an entry matching the given chapter.
 * Checks for:
 * 1. Exact match on buildAnalysisLorebookTitle / buildSummaryLorebookTitle
 * 2. Pattern match by chapter number & type keyword
 * 3. Match on chapter cleanTitle
 */
async function findLorebookEntryForChapter(
    chapter: ManuscriptChapter,
    targetType: 'analysis' | 'summary',
    prefetchedEntries?: LorebookEntry[]
): Promise<LorebookEntry | null> {
    try {
        if (!api.v1.lorebook || typeof api.v1.lorebook.entries !== 'function') return null;

        const categoryName = targetType === 'analysis'
            ? (appConfig.analysisLorebookCategory || "Chapter Analyses")
            : (appConfig.lorebookCategory || "Chapter Summaries");

        let entries = prefetchedEntries;
        if (!entries) {
            // Read-only: a missing category just means nothing has been saved yet
            const categoryId = await findLorebookCategoryId(categoryName);
            entries = categoryId
                ? await api.v1.lorebook.entries(categoryId).catch(() => []) as LorebookEntry[]
                : [];
        }

        if (!entries || entries.length === 0) return null;

        const expectedTitle = targetType === 'analysis'
            ? buildAnalysisLorebookTitle(chapter)
            : buildSummaryLorebookTitle(chapter);

        // 1. Exact match (case-insensitive)
        const exact = entries.find(e => e && e.displayName && e.displayName.trim().toLowerCase() === expectedTitle.trim().toLowerCase());
        if (exact) return exact;

        // Also check if displayName matches clean formatSummaryLorebookHeader or alternate divider
        const expectedHeaderClean = formatSummaryLorebookHeader(chapter, appConfig.chapterNumberStyle).replace(/\*\*/g, '').trim().toLowerCase();
        const altMatch = entries.find(e => {
            if (!e || !e.displayName) return false;
            const d = e.displayName.trim().toLowerCase();
            return d === expectedHeaderClean;
        });
        if (altMatch) return altMatch;

        // 2. Pattern match by chapter number & type keyword
        const targetSuffix = targetType === 'analysis' ? 'analysis' : 'summary';
        for (const entry of entries) {
            if (!entry || !entry.displayName) continue;
            const name = entry.displayName.trim();
            const lower = name.toLowerCase();
            if (!lower.includes(targetSuffix)) continue;

            if (chapter.normalizedNumber === 0) {
                if (lower.includes("prologue") || lower.includes("beginning")) {
                    return entry;
                }
            } else if (chapter.normalizedNumber !== null) {
                const romanStr = toRomanNumeral(chapter.normalizedNumber).toLowerCase();
                const numStr = String(chapter.normalizedNumber);
                const numRegex = new RegExp(`\\b(?:chapter|ch\\.?)\\s*(?:0*${numStr}|${romanStr})\\b`, 'i');
                if (numRegex.test(name)) {
                    return entry;
                }
            }
        }

        // 3. Fallback: match by chapter cleanTitle
        if (chapter.cleanTitle && chapter.cleanTitle.length > 2) {
            const cleanSub = chapter.cleanTitle.toLowerCase().replace(/^(?:chapter|ch\.?|act|scene|part|book|episode)\s*(?:\d+|[ivxlcdm]+|[a-z]+)?\s*[:\-\u2013\u2014]?\s*/i, '').trim();
            if (cleanSub.length > 2) {
                for (const entry of entries) {
                    if (!entry || !entry.displayName) continue;
                    const lower = entry.displayName.toLowerCase();
                    if (lower.includes(targetSuffix) && lower.includes(cleanSub)) {
                        return entry;
                    }
                }
            }
        }

        return null;
    } catch (err) {
        api.v1.log("Error finding lorebook entry for chapter:", err);
        return null;
    }
}

/**
 * Returns the effective analysis text to use when referenced by the script/prompt.
 * If referenceContextSource is 'lorebook', looks up the Lorebook entry first; if present with text, uses that.
 * Falls back to cached analysis in script storage.
 */
async function getEffectiveChapterAnalysis(chapter: ManuscriptChapter): Promise<string> {
    const source = appState.referenceContextSource || appConfig.referenceContextSource || 'cached';
    const cachedText = (appState.analyses[chapter.index]?.text || "").trim();

    if (source === 'lorebook') {
        const lbEntry = await findLorebookEntryForChapter(chapter, 'analysis');
        const lbText = (lbEntry?.text || "").trim();
        if (lbText) return lbText;
    }

    return cachedText;
}

/**
 * Returns the effective summary text for a chapter to use when referenced by the script/prompt.
 * If referenceContextSource is 'lorebook', looks up the Lorebook entry first; if present with text, uses that.
 * Falls back to cached summary in script storage.
 */
async function getEffectiveChapterSummary(
    chapter: ManuscriptChapter,
    prefetchedEntries?: LorebookEntry[]
): Promise<string> {
    const source = appState.referenceContextSource || appConfig.referenceContextSource || 'cached';
    const cachedText = (appState.summaries[chapter.index]?.text || "").trim();

    if (source === 'lorebook') {
        const lbEntry = await findLorebookEntryForChapter(chapter, 'summary', prefetchedEntries);
        const lbText = (lbEntry?.text || "").trim();
        if (lbText) return lbText;
    }

    return cachedText;
}

/**
 * Assembles prior chapter summaries with strict backward directionality (ch.index < currentChapterIndex).
 * Lookback modes:
 * - 'off': returns empty string
 * - 'last_1': only immediate prior chapter (index - 1)
 * - 'last_4': up to 4 prior chapters (index - 4 to index - 1)
 * - 'all': all prior chapters (0 to index - 1)
 * Formats chapters chronologically: "#### Chapter N: Title\n[summary text]"
 */
async function getPriorChapterSummariesContext(currentChapterIndex: number, mode: PriorChaptersMode): Promise<string> {
    if (mode === 'off' || currentChapterIndex <= 0) return "";

    let minIndex = 0;
    if (mode === 'last_1') {
        minIndex = currentChapterIndex - 1;
    } else if (mode === 'last_4') {
        minIndex = Math.max(0, currentChapterIndex - 4);
    } // for 'all', minIndex remains 0

    const source = appState.referenceContextSource || appConfig.referenceContextSource || 'cached';
    let prefetchedEntries: LorebookEntry[] | undefined;

    if (source === 'lorebook') {
        try {
            const categoryName = appConfig.lorebookCategory || "Chapter Summaries";
            const categoryId = await findLorebookCategoryId(categoryName);
            prefetchedEntries = categoryId
                ? await api.v1.lorebook.entries(categoryId).catch(() => []) as LorebookEntry[]
                : [];
        } catch {}
    }

    const priorSummaries: string[] = [];

    // Iterate chronologically from minIndex up to currentChapterIndex - 1
    for (let i = minIndex; i < currentChapterIndex; i++) {
        const ch = appState.chapters.find(c => c.index === i);
        const effectiveChapter: ManuscriptChapter = ch || {
            index: i,
            // Placeholder only (no chapter at this position): a negative key never matches a stored report
            key: -(i + 1),
            kind: 'chapter',
            cleanTitle: appState.summaries[i]?.chapterTitle || `Chapter ${i + 1}`,
            title: `Chapter ${i + 1}`,
            normalizedNumber: i + 1,
            paragraphs: [],
            headerSectionId: 0,
            startSectionId: 0,
            sectionIds: [],
            wordCount: 0,
            charCount: 0,
            tokenCount: 0,
            pageCount: 0,
            preview: "",
            hasAnalysis: false,
            hasSummary: false
        };

        const summaryText = await getEffectiveChapterSummary(effectiveChapter, prefetchedEntries);
        if (!summaryText || !summaryText.trim()) continue;

        const title = ch
            ? formatChapterDisplayTitle(ch, appConfig.chapterNumberStyle)
            : (appState.summaries[i]?.chapterTitle ? `Chapter ${i + 1}: ${appState.summaries[i].chapterTitle}` : `Chapter ${i + 1}`);

        priorSummaries.push(`#### ${title}\n${summaryText.trim()}`);
    }

    return priorSummaries.join("\n\n");
}

async function runInternalSummary(chapter: ManuscriptChapter): Promise<string> {
    const useAnalysis = appState.promptToggles.summaryUseAnalysis;
    let existingAnalysis = "";

    if (useAnalysis) {
        existingAnalysis = await getEffectiveChapterAnalysis(chapter);
        if (!existingAnalysis && appConfig.autoAnalyzeBeforeSummarize) {
            api.v1.ui.toast("No prior analysis found. Running developmental analysis first...", { type: "info" });
            existingAnalysis = await runInternalAnalysis(chapter);
            api.v1.ui.toast("Analysis complete. Now generating chapter summary...", { type: "info" });
        }
    }

    const chapterHeader = chapter.rawTitle || chapter.title || chapter.cleanTitle;
    const chapterText = chapter.paragraphs.join("\n\n");

    const lorebookContext = await getLorebookContextForTarget('summary');
    const priorMode = appState.promptToggles.summaryPriorChapters || 'off';
    const priorChapterContext = await getPriorChapterSummariesContext(chapter.index, priorMode);

    const expectedHeader = formatSummaryLorebookHeader(chapter, appConfig.chapterNumberStyle);
    const systemPrompt = buildSummarySystemPrompt(appState.promptToggles);
    const userPrompt = buildSummaryUserPrompt(
        chapterHeader,
        chapterText,
        useAnalysis ? existingAnalysis : undefined,
        appState.promptToggles,
        lorebookContext,
        priorChapterContext
    );

    const baseMessages = [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: userPrompt }
    ];

    const response = await api.v1.generate(
        baseMessages,
        {
            model: appConfig.aiModel,
            max_tokens: appConfig.summaryMaxTokens,
            temperature: 0.85,
            top_p: 0.95
        }
    );

    let summaryText = response?.choices?.[0]?.text?.trim() || "";
    if (!summaryText) {
        throw new Error("No response returned from model during summarization.");
    }
    summaryText = ensureSummaryHeader(summaryText, expectedHeader);

    const finishReason = response?.choices?.[0]?.finish_reason;
    const isExplicitTruncated = finishReason === "length";
    const isLikelyCutOff = isResponseLikelyCutOff(summaryText, finishReason);
    const isTruncated = isExplicitTruncated;
    const isSuspected = !isExplicitTruncated && isLikelyCutOff;

    // Immediately preserve the generated output in storage so it cannot be lost
    let summaryObj: ChapterSummary = {
        chapterIndex: chapter.index,
        chapterKey: chapter.key,
        chapterTitle: chapter.cleanTitle,
        timestamp: Date.now(),
        model: appConfig.aiModel,
        text: summaryText,
        usedAnalysis: useAnalysis && !!existingAnalysis,
        savedToLorebook: false,
        truncated: isTruncated,
        suspectedTruncated: isSuspected
    };
    await saveSummaryToStorage(summaryObj);
    chapter.hasSummary = true;

    if ((isExplicitTruncated || isSuspected) && appConfig.autoFinishIfTruncated) {
        const continuationMessages = [
            ...baseMessages,
            { role: 'assistant' as const, content: summaryText }
        ];
        const budget = checkTokenBudget(appConfig.summaryMaxTokens, continuationMessages);

        if (!budget.hasBudget) {
            api.v1.ui.toast(`Summary was cut short. Tokens replenishing (${Math.ceil(budget.waitMs / 1000)}s)...`, { type: "warning" });
            startReplenishCooldown(`summary-${chapter.index}`, budget.waitMs);
        } else {
            try {
                api.v1.ui.toast(
                    isExplicitTruncated
                        ? "Summary was cut short — continuing automatically..."
                        : "Summary appears cut short — continuing automatically...",
                    { type: "info" }
                );
                const continuation = await runContinuationPass(baseMessages, summaryText, appConfig.summaryMaxTokens);
                summaryText = ensureSummaryHeader(continuation.text, expectedHeader);
                summaryObj = {
                    ...summaryObj,
                    text: summaryText,
                    timestamp: Date.now(),
                    truncated: continuation.truncated,
                    suspectedTruncated: continuation.suspectedTruncated
                };
                await saveSummaryToStorage(summaryObj);
                if (continuation.truncated || continuation.suspectedTruncated) {
                    api.v1.ui.toast("Summary is very long — output was still cut short. You can finish generation manually.", { type: "warning" });
                }
            } catch (contErr: any) {
                api.v1.log("Auto-continuation error in summary:", contErr);
                const waitMs = checkTokenBudget(appConfig.summaryMaxTokens).waitMs || 10000;
                api.v1.ui.toast("Could not finish automatically due to token limits. You can finish generation once replenished.", { type: "warning" });
                startReplenishCooldown(`summary-${chapter.index}`, waitMs);
            }
        }
    }

    if (appConfig.saveToLorebook && !summaryObj.truncated && !summaryObj.suspectedTruncated) {
        try {
            const savedToLorebook = await saveSummaryToLorebookDirect(chapter, summaryText);
            if (savedToLorebook) {
                summaryObj.savedToLorebook = true;
                await saveSummaryToStorage(summaryObj);
            }
        } catch (lbErr) {
            api.v1.log("Lorebook save error:", lbErr);
        }
    }

    return summaryText;
}

// --- Chapter Action Handlers ---

async function analyzeChapterAction(chapterIndex: number): Promise<void> {
    if (appState.isGenerating) {
        api.v1.ui.toast("An AI generation is already in progress.", { type: "warning" });
        return;
    }

    const chapter = appState.chapters.find(c => c.index === chapterIndex);
    if (!chapter) {
        api.v1.ui.toast("Selected chapter could not be found.", { type: "error" });
        return;
    }

    appState.isGenerating = true;
    appState.generatingChapterIndex = chapterIndex;
    appState.generatingAction = 'analyze';
    appState.selectedChapterIndex = chapterIndex;
    appState.statusMessage = `Analyzing ${chapter.cleanTitle}...`;
    await renderPanel();

    try {
        // Chaining policy: check if immediate prior chapter is missing summary
        const priorMode = appState.promptToggles.analysisPriorChapters || 'off';
        if (priorMode !== 'off' && chapterIndex > 0) {
            const priorIdx = chapterIndex - 1;
            const priorCh = appState.chapters.find(c => c.index === priorIdx);
            const priorSummary = priorCh ? await getEffectiveChapterSummary(priorCh) : (appState.summaries[priorIdx]?.text || "");
            if (!priorSummary && appConfig.autoSummarizePriorChapter) {
                if (priorCh) {
                    api.v1.ui.toast(`Auto-summarizing prior chapter (${priorCh.cleanTitle}) for context...`, { type: "info" });
                    appState.statusMessage = `Auto-summarizing prior chapter (${priorCh.cleanTitle})...`;
                    await renderPanel();
                    await runInternalSummary(priorCh);
                    api.v1.ui.toast(`Prior summary complete. Now analyzing ${chapter.cleanTitle}...`, { type: "info" });
                    appState.statusMessage = `Analyzing ${chapter.cleanTitle}...`;
                    await renderPanel();
                }
            }
        }

        api.v1.ui.toast(`Analyzing ${chapter.cleanTitle}...`, { type: "info" });
        await runInternalAnalysis(chapter);
        api.v1.ui.toast(`Developmental analysis complete for ${chapter.cleanTitle}!`, { type: "success" });
        appState.activeTab = 'analysis';
    } catch (err: any) {
        const errStr = formatError(err);
        api.v1.ui.toast(`Analysis error: ${errStr}`, { type: "error" });
        api.v1.log("Analysis error:", err);
    } finally {
        appState.isGenerating = false;
        appState.generatingChapterIndex = null;
        appState.generatingAction = null;
        appState.statusMessage = "Ready";
        await renderPanel();
    }
}

async function summarizeChapterAction(chapterIndex: number): Promise<void> {
    if (appState.isGenerating) {
        api.v1.ui.toast("An AI generation is already in progress.", { type: "warning" });
        return;
    }

    const chapter = appState.chapters.find(c => c.index === chapterIndex);
    if (!chapter) {
        api.v1.ui.toast("Selected chapter could not be found.", { type: "error" });
        return;
    }

    appState.isGenerating = true;
    appState.generatingChapterIndex = chapterIndex;
    appState.generatingAction = 'summarize';
    appState.selectedChapterIndex = chapterIndex;
    appState.statusMessage = `Summarizing ${chapter.cleanTitle}...`;
    await renderPanel();

    try {
        // Chaining policy: check if immediate prior chapter is missing summary
        const priorMode = appState.promptToggles.summaryPriorChapters || 'off';
        if (priorMode !== 'off' && chapterIndex > 0) {
            const priorIdx = chapterIndex - 1;
            const priorCh = appState.chapters.find(c => c.index === priorIdx);
            const priorSummary = priorCh ? await getEffectiveChapterSummary(priorCh) : (appState.summaries[priorIdx]?.text || "");
            if (!priorSummary && appConfig.autoSummarizePriorChapter) {
                if (priorCh) {
                    api.v1.ui.toast(`Auto-summarizing prior chapter (${priorCh.cleanTitle})...`, { type: "info" });
                    appState.statusMessage = `Auto-summarizing prior chapter (${priorCh.cleanTitle})...`;
                    await renderPanel();
                    await runInternalSummary(priorCh);
                    api.v1.ui.toast(`Prior summary complete. Now summarizing ${chapter.cleanTitle}...`, { type: "info" });
                    appState.statusMessage = `Summarizing ${chapter.cleanTitle}...`;
                    await renderPanel();
                }
            }
        }

        await runInternalSummary(chapter);
        api.v1.ui.toast(`Summary complete for ${chapter.cleanTitle}!`, { type: "success" });
        appState.activeTab = 'summary';
    } catch (err: any) {
        const errStr = formatError(err);
        api.v1.ui.toast(`Summary error: ${errStr}`, { type: "error" });
        api.v1.log("Summary error:", err);
    } finally {
        appState.isGenerating = false;
        appState.generatingChapterIndex = null;
        appState.generatingAction = null;
        appState.statusMessage = "Ready";
        await renderPanel();
    }
}

// --- Manual Continuation Actions ---

async function continueAnalysisAction(chapterIndex: number): Promise<void> {
    if (appState.isGenerating) {
        api.v1.ui.toast("An AI generation is already in progress.", { type: "warning" });
        return;
    }

    const chapter = appState.chapters.find(c => c.index === chapterIndex);
    const existing = appState.analyses[chapterIndex];
    if (!chapter || !existing) {
        api.v1.ui.toast("No existing analysis found to continue.", { type: "error" });
        return;
    }

    appState.isGenerating = true;
    appState.generatingChapterIndex = chapterIndex;
    appState.generatingAction = 'continue-analysis';
    appState.statusMessage = `Continuing analysis for ${chapter.cleanTitle}...`;
    await renderPanel();

    try {
        const chapterHeader = chapter.rawTitle || chapter.title || chapter.cleanTitle;
        const chapterText = chapter.paragraphs.join("\n\n");
        const lorebookContext = await getLorebookContextForTarget('analysis');
        const priorMode = appState.promptToggles.analysisPriorChapters || 'off';
        const priorChapterContext = await getPriorChapterSummariesContext(chapter.index, priorMode);
        const systemPrompt = buildAnalysisSystemPrompt(appState.promptToggles);
        const userPrompt = buildAnalysisUserPrompt(
            chapterHeader,
            chapterText,
            appState.promptToggles,
            lorebookContext,
            priorChapterContext
        );

        const baseMessages = [
            { role: 'system' as const, content: systemPrompt },
            { role: 'user' as const, content: userPrompt }
        ];

        const continuationMessages = [
            ...baseMessages,
            { role: 'assistant' as const, content: existing.text }
        ];
        const budget = checkTokenBudget(appConfig.analysisMaxTokens, continuationMessages);
        if (!budget.hasBudget) {
            api.v1.ui.toast(`Tokens are still replenishing (${Math.ceil(budget.waitMs / 1000)}s remaining).`, { type: "warning" });
            startReplenishCooldown(`analysis-${chapterIndex}`, budget.waitMs);
            await renderPanel();
            return;
        }

        api.v1.ui.toast(`Finishing analysis for ${chapter.cleanTitle}...`, { type: "info" });
        const continuation = await runContinuationPass(baseMessages, existing.text, appConfig.analysisMaxTokens);

        const updated: ChapterAnalysis = {
            ...existing,
            text: continuation.text,
            timestamp: Date.now(),
            truncated: continuation.truncated,
            suspectedTruncated: continuation.suspectedTruncated
        };

        await saveAnalysisToStorage(updated);
        if (continuation.truncated || continuation.suspectedTruncated) {
            api.v1.ui.toast("Analysis continued — but appears still cut short. You can continue again.", { type: "warning" });
        } else {
            api.v1.ui.toast(`Analysis continuation complete for ${chapter.cleanTitle}!`, { type: "success" });
        }
    } catch (err: any) {
        const errStr = formatError(err);
        api.v1.ui.toast(`Continuation error: ${errStr}`, { type: "error" });
        api.v1.log("Analysis continuation error:", err);
    } finally {
        appState.isGenerating = false;
        appState.generatingChapterIndex = null;
        appState.generatingAction = null;
        appState.statusMessage = "Ready";
        await renderPanel();
    }
}

async function continueSummaryAction(chapterIndex: number): Promise<void> {
    if (appState.isGenerating) {
        api.v1.ui.toast("An AI generation is already in progress.", { type: "warning" });
        return;
    }

    const chapter = appState.chapters.find(c => c.index === chapterIndex);
    const existing = appState.summaries[chapterIndex];
    if (!chapter || !existing) {
        api.v1.ui.toast("No existing summary found to continue.", { type: "error" });
        return;
    }

    appState.isGenerating = true;
    appState.generatingChapterIndex = chapterIndex;
    appState.generatingAction = 'continue-summary';
    appState.statusMessage = `Continuing summary for ${chapter.cleanTitle}...`;
    await renderPanel();

    try {
        const chapterHeader = chapter.rawTitle || chapter.title || chapter.cleanTitle;
        const chapterText = chapter.paragraphs.join("\n\n");
        const useAnalysis = existing.usedAnalysis;
        const existingAnalysis = useAnalysis ? await getEffectiveChapterAnalysis(chapter) : undefined;
        const lorebookContext = await getLorebookContextForTarget('summary');
        const priorMode = appState.promptToggles.summaryPriorChapters || 'off';
        const priorChapterContext = await getPriorChapterSummariesContext(chapterIndex, priorMode);
        const expectedHeader = formatSummaryLorebookHeader(chapter, appConfig.chapterNumberStyle);
        const existingTextNormalized = ensureSummaryHeader(existing.text, expectedHeader);
        const systemPrompt = buildSummarySystemPrompt(appState.promptToggles);
        const userPrompt = buildSummaryUserPrompt(
            chapterHeader,
            chapterText,
            existingAnalysis,
            appState.promptToggles,
            lorebookContext,
            priorChapterContext
        );

        const baseMessages = [
            { role: 'system' as const, content: systemPrompt },
            { role: 'user' as const, content: userPrompt }
        ];

        const continuationMessages = [
            ...baseMessages,
            { role: 'assistant' as const, content: existingTextNormalized }
        ];
        const budget = checkTokenBudget(appConfig.summaryMaxTokens, continuationMessages);
        if (!budget.hasBudget) {
            api.v1.ui.toast(`Tokens are still replenishing (${Math.ceil(budget.waitMs / 1000)}s remaining).`, { type: "warning" });
            startReplenishCooldown(`summary-${chapterIndex}`, budget.waitMs);
            await renderPanel();
            return;
        }

        api.v1.ui.toast(`Finishing summary for ${chapter.cleanTitle}...`, { type: "info" });
        const continuation = await runContinuationPass(baseMessages, existingTextNormalized, appConfig.summaryMaxTokens);

        const updated: ChapterSummary = {
            ...existing,
            text: ensureSummaryHeader(continuation.text, expectedHeader),
            timestamp: Date.now(),
            truncated: continuation.truncated,
            suspectedTruncated: continuation.suspectedTruncated
        };

        await saveSummaryToStorage(updated);
        if (continuation.truncated || continuation.suspectedTruncated) {
            api.v1.ui.toast("Summary continued — but appears still cut short. You can continue again.", { type: "warning" });
        } else {
            api.v1.ui.toast(`Summary continuation complete for ${chapter.cleanTitle}!`, { type: "success" });
        }

        if (appConfig.saveToLorebook && !updated.savedToLorebook && !updated.truncated && !updated.suspectedTruncated) {
            try {
                const savedToLorebook = await saveSummaryToLorebookDirect(chapter, updated.text);
                if (savedToLorebook) {
                    updated.savedToLorebook = true;
                    await saveSummaryToStorage(updated);
                }
            } catch (lbErr) {
                api.v1.log("Lorebook save error after summary continuation:", lbErr);
            }
        }
    } catch (err: any) {
        const errStr = formatError(err);
        api.v1.ui.toast(`Continuation error: ${errStr}`, { type: "error" });
        api.v1.log("Summary continuation error:", err);
    } finally {
        appState.isGenerating = false;
        appState.generatingChapterIndex = null;
        appState.generatingAction = null;
        appState.statusMessage = "Ready";
        await renderPanel();
    }
}

// --- Lorebook Management Actions ---

async function saveSummaryToLorebookDirect(chapter: ManuscriptChapter, summaryText: string): Promise<boolean> {
    if (!await requestLorebookPermission()) {
        api.v1.ui.toast("Lorebook permission is required to save summaries.", { type: "warning" });
        return false;
    }

    const categoryName = appConfig.lorebookCategory || "Chapter Summaries";
    const categoryId = await ensureLorebookCategory(categoryName);
    const title = buildSummaryLorebookTitle(chapter);
    const expectedHeader = formatSummaryLorebookHeader(chapter, appConfig.chapterNumberStyle);
    const textToSave = ensureSummaryHeader(summaryText, expectedHeader);

    const entries = await api.v1.lorebook.entries(categoryId || null);
    const existing = entries.find(e => e.displayName === title);

    if (existing?.id) {
        await api.v1.lorebook.updateEntry(existing.id, { text: textToSave });
    } else {
        await api.v1.lorebook.createEntry({
            displayName: title,
            text: textToSave,
            category: categoryId,
            ...REPORT_ENTRY_ACTIVATION
        });
    }
    return true;
}

/**
 * Handles adding an individual chapter analysis to the Lorebook with
 * duplicate checking and user overwrite confirmation.
 */
async function addAnalysisToLorebookAction(chapterIndex: number): Promise<void> {
    const chapter = appState.chapters.find(c => c.index === chapterIndex);
    const analysis = appState.analyses[chapterIndex];

    if (!chapter || !analysis || !analysis.text) {
        api.v1.ui.toast("No analysis found to add to Lorebook.", { type: "warning" });
        return;
    }

    if (!await requestLorebookPermission()) {
        api.v1.ui.toast("Lorebook permission is required to save analyses.", { type: "warning" });
        return;
    }

    const categoryName = appConfig.analysisLorebookCategory || "Chapter Analyses";
    const entryTitle = buildAnalysisLorebookTitle(chapter);

    try {
        const categoryId = await ensureLorebookCategory(categoryName);
        const entries = await api.v1.lorebook.entries(categoryId || null);
        const existingEntry = entries.find(e => e.displayName === entryTitle);

        if (existingEntry) {
            // Prompt warning dialog for overwrite
            let modal: any = null;
            modal = await api.v1.ui.modal.open({
                title: "Overwrite Lorebook Entry?",
                size: "small",
                content: [
                    makeText(`An entry named **"${entryTitle}"** already exists in category *"${categoryName}"*.\n\nOverwriting will replace the existing analysis with the current report.`, true),
                    {
                        type: 'row' as const,
                        alignment: 'center',
                        spacing: 'center',
                        content: [
                            makeButton("Overwrite Entry", async () => {
                                await modal.close();
                                try {
                                    await api.v1.lorebook.updateEntry(existingEntry.id, { text: analysis.text });
                                    analysis.savedToLorebook = true;
                                    await saveAnalysisToStorage(analysis);
                                    api.v1.ui.toast(`Overwrote "${entryTitle}" in Lorebook!`, { type: "success" });
                                    await renderPanel();
                                } catch (e) {
                                    api.v1.ui.toast(`Failed to update Lorebook: ${formatError(e)}`, { type: "error" });
                                }
                            }, { primary: true, iconId: 'check' }),
                            makeButton("Cancel", async () => {
                                await modal.close();
                            }, { iconId: 'close' })
                        ]
                    } as any
                ]
            });
            return;
        }

        // New entry creation
        await api.v1.lorebook.createEntry({
            displayName: entryTitle,
            text: analysis.text,
            category: categoryId,
            ...REPORT_ENTRY_ACTIVATION
        });

        analysis.savedToLorebook = true;
        await saveAnalysisToStorage(analysis);
        api.v1.ui.toast(`Saved "${entryTitle}" to Lorebook!`, { type: "success" });
        await renderPanel();
    } catch (err) {
        api.v1.ui.toast(`Lorebook error: ${formatError(err)}`, { type: "error" });
        api.v1.log("Error saving analysis to lorebook:", err);
    }
}

/**
 * Handles adding an individual chapter summary to the Lorebook with
 * duplicate checking and user overwrite confirmation.
 */
async function addSummaryToLorebookAction(chapterIndex: number): Promise<void> {
    const chapter = appState.chapters.find(c => c.index === chapterIndex);
    const summary = appState.summaries[chapterIndex];

    if (!chapter || !summary || !summary.text) {
        api.v1.ui.toast("No summary found to add to Lorebook.", { type: "warning" });
        return;
    }

    if (!await requestLorebookPermission()) {
        api.v1.ui.toast("Lorebook permission is required to save summaries.", { type: "warning" });
        return;
    }

    const categoryName = appConfig.lorebookCategory || "Chapter Summaries";
    const entryTitle = buildSummaryLorebookTitle(chapter);
    const expectedHeader = formatSummaryLorebookHeader(chapter, appConfig.chapterNumberStyle);
    const textToSave = ensureSummaryHeader(summary.text, expectedHeader);
    summary.text = textToSave;
    await saveSummaryToStorage(summary);

    try {
        const categoryId = await ensureLorebookCategory(categoryName);
        const entries = await api.v1.lorebook.entries(categoryId || null);
        const existingEntry = entries.find(e => e.displayName === entryTitle);

        if (existingEntry) {
            // Prompt warning dialog for overwrite
            let modal: any = null;
            modal = await api.v1.ui.modal.open({
                title: "Overwrite Lorebook Entry?",
                size: "small",
                content: [
                    makeText(`An entry named **"${entryTitle}"** already exists in category *"${categoryName}"*.\n\nOverwriting will replace the existing summary with the current report.`, true),
                    {
                        type: 'row' as const,
                        alignment: 'center',
                        spacing: 'center',
                        content: [
                            makeButton("Overwrite Entry", async () => {
                                await modal.close();
                                try {
                                    await api.v1.lorebook.updateEntry(existingEntry.id, { text: textToSave });
                                    summary.savedToLorebook = true;
                                    await saveSummaryToStorage(summary);
                                    api.v1.ui.toast(`Overwrote "${entryTitle}" in Lorebook!`, { type: "success" });
                                    await renderPanel();
                                } catch (e) {
                                    api.v1.ui.toast(`Failed to update Lorebook: ${formatError(e)}`, { type: "error" });
                                }
                            }, { primary: true, iconId: 'check' }),
                            makeButton("Cancel", async () => {
                                await modal.close();
                            }, { iconId: 'close' })
                        ]
                    } as any
                ]
            });
            return;
        }

        // New entry creation
        await api.v1.lorebook.createEntry({
            displayName: entryTitle,
            text: textToSave,
            category: categoryId,
            ...REPORT_ENTRY_ACTIVATION
        });

        summary.savedToLorebook = true;
        await saveSummaryToStorage(summary);
        api.v1.ui.toast(`Saved "${entryTitle}" to Lorebook!`, { type: "success" });
        await renderPanel();
    } catch (err) {
        api.v1.ui.toast(`Lorebook error: ${formatError(err)}`, { type: "error" });
        api.v1.log("Error saving summary to lorebook:", err);
    }
}

// --- Report Clearing Actions with Confirmation Modals ---

/**
 * Prompts confirmation to clear the cached analysis for a chapter.
 */
async function promptClearAnalysisModal(chapterIndex: number): Promise<void> {
    const chapter = appState.chapters.find(c => c.index === chapterIndex);
    const titleDisplay = chapter ? formatChapterDisplayTitle(chapter, appConfig.chapterNumberStyle) : `Chapter ${chapterIndex + 1}`;

    let modal: any = null;
    modal = await api.v1.ui.modal.open({
        title: "Clear Cached Analysis?",
        size: "small",
        content: [
            makeText(`Are you sure you want to clear the cached developmental analysis for **${titleDisplay}**?\n\nThis will remove the analysis report from local script storage. Lorebook entries (if any) will remain untouched.`, true),
            {
                type: 'row' as const,
                alignment: 'center',
                spacing: 'center',
                content: [
                    makeButton("Clear Analysis", async () => {
                        await modal.close();
                        await clearCachedAnalysis(chapterIndex);
                        api.v1.ui.toast(`Cleared cached analysis for ${titleDisplay}`, { type: "success" });
                        await renderPanel();
                    }, { primary: true, iconId: 'trash', overrideStyle: { backgroundColor: 'warning' } }),
                    makeButton("Cancel", async () => {
                        await modal.close();
                    }, { iconId: 'close' })
                ]
            } as any
        ]
    });
}

/**
 * Prompts confirmation to clear the cached summary for a chapter.
 */
async function promptClearSummaryModal(chapterIndex: number): Promise<void> {
    const chapter = appState.chapters.find(c => c.index === chapterIndex);
    const titleDisplay = chapter ? formatChapterDisplayTitle(chapter, appConfig.chapterNumberStyle) : `Chapter ${chapterIndex + 1}`;

    let modal: any = null;
    modal = await api.v1.ui.modal.open({
        title: "Clear Cached Summary?",
        size: "small",
        content: [
            makeText(`Are you sure you want to clear the cached continuity summary for **${titleDisplay}**?\n\nThis will remove the summary report from local script storage. Lorebook entries (if any) will remain untouched.`, true),
            {
                type: 'row' as const,
                alignment: 'center',
                spacing: 'center',
                content: [
                    makeButton("Clear Summary", async () => {
                        await modal.close();
                        await clearCachedSummary(chapterIndex);
                        api.v1.ui.toast(`Cleared cached summary for ${titleDisplay}`, { type: "success" });
                        await renderPanel();
                    }, { primary: true, iconId: 'trash', overrideStyle: { backgroundColor: 'warning' } }),
                    makeButton("Cancel", async () => {
                        await modal.close();
                    }, { iconId: 'close' })
                ]
            } as any
        ]
    });
}

/**
 * Prompts modal dialog to clear cached analysis, summary, or both for a chapter.
 */
async function promptClearReportsModal(chapterIndex: number): Promise<void> {
    const chapter = appState.chapters.find(c => c.index === chapterIndex);
    const titleDisplay = chapter ? formatChapterDisplayTitle(chapter, appConfig.chapterNumberStyle) : `Chapter ${chapterIndex + 1}`;
    const hasAnalysis = !!appState.analyses[chapterIndex];
    const hasSummary = !!appState.summaries[chapterIndex];

    if (!hasAnalysis && !hasSummary) {
        api.v1.ui.toast("No cached reports found for this chapter.", { type: "info" });
        return;
    }

    if (hasAnalysis && !hasSummary) {
        await promptClearAnalysisModal(chapterIndex);
        return;
    }

    if (!hasAnalysis && hasSummary) {
        await promptClearSummaryModal(chapterIndex);
        return;
    }

    let modal: any = null;
    modal = await api.v1.ui.modal.open({
        title: "Clear Cached Reports",
        size: "small",
        content: [
            makeText(`Select which cached report(s) to clear for **${titleDisplay}** from local script storage:\n\n*Note: Lorebook entries will not be deleted.*`, true),
            {
                type: 'column' as const,
                alignment: 'center',
                content: [
                    makeButton("Clear Analysis Only", async () => {
                        await modal.close();
                        await clearCachedAnalysis(chapterIndex);
                        api.v1.ui.toast(`Cleared cached analysis for ${titleDisplay}`, { type: "success" });
                        await renderPanel();
                    }, { iconId: 'trash', overrideStyle: { width: '100%', margin: '4px 0' } }),
                    makeButton("Clear Summary Only", async () => {
                        await modal.close();
                        await clearCachedSummary(chapterIndex);
                        api.v1.ui.toast(`Cleared cached summary for ${titleDisplay}`, { type: "success" });
                        await renderPanel();
                    }, { iconId: 'trash', overrideStyle: { width: '100%', margin: '4px 0' } }),
                    makeButton("Clear Both Reports", async () => {
                        await modal.close();
                        await clearCachedReports(chapterIndex, 'both');
                        api.v1.ui.toast(`Cleared all cached reports for ${titleDisplay}`, { type: "success" });
                        await renderPanel();
                    }, { primary: true, iconId: 'trash', overrideStyle: { width: '100%', margin: '4px 0', backgroundColor: 'warning' } }),
                    makeButton("Cancel", async () => {
                        await modal.close();
                    }, { iconId: 'close', overrideStyle: { width: '100%', margin: '4px 0' } })
                ]
            } as any
        ]
    });
}

// --- Prompt Import / Export ---

/**
 * Small yes/no modal. Resolves before closing (and on X / script-disable closures via modal.closed).
 */
async function confirmModal(title: string, body: string, confirmLabel: string, confirmIconId: IconId = 'check'): Promise<boolean> {
    return new Promise(async (resolve) => {
        let resolved = false;
        function safeResolve(value: boolean): void {
            if (!resolved) { resolved = true; resolve(value); }
        }
        try {
            const modal = await api.v1.ui.modal.open({
                title,
                size: "small",
                content: [
                    { type: 'box' as const, content: [makeText(body, true)] } as any,
                    {
                        type: 'row' as const,
                        alignment: 'center',
                        content: [
                            makeButton(confirmLabel, async () => { safeResolve(true); await modal.close(); }, { primary: true, iconId: confirmIconId }),
                            makeButton("Cancel", async () => { safeResolve(false); await modal.close(); }, { iconId: 'close' })
                        ]
                    } as any
                ]
            });
            modal.closed.then(() => safeResolve(false));
        } catch (err) {
            api.v1.error("Confirm modal error:", err);
            safeResolve(false);
        }
    });
}

interface PresetNameModalOptions {
    title: string;
    intro: string;
    confirmLabel: string;
    confirmIconId: IconId;
    initialName: string;
}

/**
 * Asks for a preset name (used for renaming, and for exporting an untitled preset).
 * Resolves to the cleaned name, or null if cancelled.
 * The input only writes to a local variable (no re-render), so typing never loses focus.
 */
async function promptPresetNameModal(opts: PresetNameModalOptions): Promise<string | null> {
    return new Promise(async (resolve) => {
        let resolved = false;
        function safeResolve(value: string | null): void {
            if (!resolved) { resolved = true; resolve(value); }
        }
        let currentName = opts.initialName;
        try {
            const modal = await api.v1.ui.modal.open({
                title: opts.title,
                size: "small",
                content: [
                    { type: 'box' as const, content: [makeText(opts.intro, true)] } as any,
                    {
                        type: 'textInput' as const,
                        label: "Preset name",
                        placeholder: "e.g. Blunt Line Editor",
                        initialValue: opts.initialName,
                        onChange: (text: string) => { currentName = text ?? ""; },
                        onSubmit: async (text: string) => {
                            const name = sanitizePresetName(text ?? "");
                            if (!name) return;
                            safeResolve(name);
                            await modal.close();
                        },
                        style: { width: '100%', margin: '6px 0' }
                    } as any,
                    {
                        type: 'row' as const,
                        alignment: 'center',
                        content: [
                            makeButton(opts.confirmLabel, async () => {
                                const name = sanitizePresetName(currentName);
                                if (!name) {
                                    api.v1.ui.toast("Give the preset a name first.", { type: "warning" });
                                    return;
                                }
                                safeResolve(name);
                                await modal.close();
                            }, { primary: true, iconId: opts.confirmIconId }),
                            makeButton("Cancel", async () => { safeResolve(null); await modal.close(); }, { iconId: 'close' })
                        ]
                    } as any
                ]
            });
            modal.closed.then(() => safeResolve(null));
        } catch (err) {
            api.v1.error("Preset name modal error:", err);
            safeResolve(null);
        }
    });
}

async function renamePromptPresetAction(page: PromptPage): Promise<void> {
    const name = await promptPresetNameModal({
        title: `Name ${PROMPT_PAGE_LABELS[page]} Preset`,
        intro: `Give the current ${PROMPT_PAGE_LABELS[page]} prompts a preset name. It's used when you export or share them.`,
        confirmLabel: "Save",
        confirmIconId: 'check',
        initialName: appState.promptPresets[page]?.name || ""
    });
    if (!name) return;
    renamePromptPreset(page, name);
    await renderPanel();
}

async function resetPromptPageAction(page: PromptPage): Promise<void> {
    const label = PROMPT_PAGE_LABELS[page];
    const preset = appState.promptPresets[page];
    const editedLabels = PROMPT_PAGE_CHUNK_KEYS[page]
        .filter((key: PromptChunkKey) => typeof appState.promptOverrides[key] === 'string')
        .map((key: PromptChunkKey) => PROMPT_CHUNK_LABELS[key]);

    const lines = [`Revert every ${label} prompt chunk to the v${api.v1.script.version} defaults?`];
    if (editedLabels.length > 0) {
        lines.push(`These edited chunks will be lost:\n${editedLabels.map((l: string) => `- ${l}`).join("\n")}`);
    }
    if (preset?.name) {
        lines.push(`The preset name **${preset.name}** will be cleared. Export it first if you want to keep a copy.`);
    }

    const proceed = await confirmModal(`Reset ${label} Prompts?`, lines.join("\n\n"), "Reset to Default", 'reload');
    if (!proceed) return;

    resetPromptPageToDefaults(page);
    api.v1.ui.toast(`${label} prompts reset to default.`, { type: "success" });
    await renderPanel();
}

async function exportPromptsAction(page: PromptPage): Promise<void> {
    const ok = await requestPermission(
        'fileDownload',
        "Mid's Manuscript Menagerie needs file download access to export your prompt chunks as a JSON file."
    );
    if (!ok) {
        api.v1.ui.toast("File download permission was denied.", { type: "warning" });
        return;
    }

    // A named preset exports straight away; only an untitled one asks for a name first
    let presetName = appState.promptPresets[page]?.name || "";
    if (!presetName) {
        const chosen = await promptPresetNameModal({
            title: `Export ${PROMPT_PAGE_LABELS[page]} Prompts`,
            intro: "This preset doesn't have a name yet. The name is saved in the file, so anyone you share it with sees it when they import.",
            confirmLabel: "Export",
            confirmIconId: 'download',
            initialName: ""
        });
        if (!chosen) return;
        presetName = chosen;
    }

    try {
        const file = buildPromptExportFile(page, presetName);
        await api.v1.file.save(buildPromptExportFilename(page, presetName), JSON.stringify(file, null, 2));
        // The page's prompts now match a named, saved preset
        setPromptPreset(page, presetName);
        api.v1.ui.toast(`Exported "${presetName}" (${PROMPT_PAGE_LABELS[page]} prompts).`, { type: "success" });
        await renderPanel();
    } catch (err) {
        api.v1.error("Prompt export error:", err);
        api.v1.ui.toast(`Export failed: ${formatError(err)}`, { type: "error" });
    }
}

/**
 * Imports a prompt file from the given page's card. One review modal shows the preset details,
 * redirects a file made for the other page (it is never written into this one), and lists any
 * edited chunks the import would replace.
 */
async function importPromptsAction(currentPage: PromptPage): Promise<void> {
    const ok = await requestPermission(
        'fileInput',
        "Mid's Manuscript Menagerie needs file access to import prompt chunks from a JSON file."
    );
    if (!ok) {
        api.v1.ui.toast("File access permission was denied.", { type: "warning" });
        return;
    }

    let raw: string | void;
    try {
        raw = await api.v1.file.prompt({ accept: ".json,application/json" });
    } catch (err) {
        api.v1.error("Prompt import read error:", err);
        api.v1.ui.toast(`Couldn't read the file: ${formatError(err)}`, { type: "error" });
        return;
    }
    if (typeof raw !== 'string') return; // picker cancelled

    const parsed = parsePromptExportFile(raw);
    if (!parsed.file) {
        api.v1.ui.toast(`Import failed: ${parsed.error}`, { type: "error" });
        return;
    }
    const file = parsed.file;
    const targetPage = file.page;
    const targetLabel = PROMPT_PAGE_LABELS[targetPage];
    const currentLabel = PROMPT_PAGE_LABELS[currentPage];
    const presetName = file.presetName || "";
    const presetDisplay = presetName || "Untitled preset";
    const isWrongPage = targetPage !== currentPage;

    const chunkCount = Object.keys(file.chunks).length;
    // Counted against this version's defaults, not the file's `edited` flags (see applyImportedPromptChunks)
    const editedCount = (Object.entries(file.chunks) as [PromptChunkKey, PromptExportChunk][])
        .filter(([key, c]) => c.text !== DEFAULT_PROMPT_CHUNKS[key]).length;
    const details = [
        `**${presetDisplay}**`,
        `${targetLabel} prompts · ${chunkCount} chunk(s), ${editedCount} customized${file.scriptVersion ? ` · made with v${file.scriptVersion}` : ""}`
    ];
    if (isWrongPage) {
        details.push(`⚠ This preset is for the **${targetLabel}** page, but you're importing from **${currentLabel}**. It will be imported into ${targetLabel} instead, and your ${currentLabel} prompts won't change.`);
    }
    const replacedEdits = PROMPT_PAGE_CHUNK_KEYS[targetPage]
        .filter((key: PromptChunkKey) => typeof appState.promptOverrides[key] === 'string' && !!file.chunks[key])
        .map((key: PromptChunkKey) => PROMPT_CHUNK_LABELS[key]);
    if (replacedEdits.length > 0) {
        details.push(`This replaces your current edits to:\n${replacedEdits.map((l: string) => `- ${l}`).join("\n")}`);
    }
    if (parsed.ignored > 0) {
        details.push(`${parsed.ignored} unrecognized chunk(s) in the file will be skipped.`);
    }

    const proceed = await confirmModal(
        isWrongPage ? "Preset Is for a Different Page" : "Import Prompt Preset?",
        details.join("\n\n"),
        isWrongPage ? `Import to ${targetLabel}` : "Import",
        'upload'
    );
    if (!proceed) return;

    const applied = applyImportedPromptChunks(targetPage, file.chunks);
    setPromptPreset(targetPage, presetName);
    api.v1.ui.toast(`Imported "${presetDisplay}" (${applied} ${targetLabel} chunk(s)).`, { type: "success" });

    // Show the page that actually changed
    if (isWrongPage) {
        await setActiveTab(targetPage);
    }
    await renderPanel();
}
