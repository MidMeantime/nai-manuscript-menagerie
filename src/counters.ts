// --- Live Metrics & Counters Engine for Mid's Manuscript Menagerie ---

const tokenCache = new Map<string, number>();

async function getOrComputeTokenCount(text: string, model: string): Promise<number> {
    if (!text) return 0;
    // For very long texts or fast updates, cache hash key
    const cacheKey = `${model}:${text.length}:${text.slice(0, 32)}:${text.slice(-32)}`;
    if (tokenCache.has(cacheKey)) {
        return tokenCache.get(cacheKey)!;
    }

    try {
        if ((api.v1 as any).tokenizer && typeof (api.v1 as any).tokenizer.encode === 'function') {
            const tokens = await (api.v1 as any).tokenizer.encode(text, model);
            if (Array.isArray(tokens)) {
                const count = tokens.length;
                tokenCache.set(cacheKey, count);
                return count;
            }
        }
    } catch {
        // Fallback to estimation if tokenizer is temporarily unavailable
    }

    const estimated = estimateTokens(text);
    tokenCache.set(cacheKey, estimated);
    return estimated;
}

function calculateDocumentTotals(chapters: ManuscriptChapter[], wordsPerPage: number): DocumentMetrics {
    let totalChars = 0;
    let totalWords = 0;
    let totalTokens = 0;

    for (const ch of chapters) {
        totalChars += ch.charCount;
        totalWords += ch.wordCount;
        totalTokens += ch.tokenCount;
    }

    const wpp = wordsPerPage > 0 ? wordsPerPage : 350;
    const totalPages = Math.ceil(totalWords / wpp);

    return {
        totalChars,
        totalWords,
        totalTokens,
        totalPages,
        totalChapters: chapters.length
    };
}

async function refreshAllChapterMetrics(chapters: ManuscriptChapter[], wordsPerPage: number, model: string): Promise<void> {
    const wpp = wordsPerPage > 0 ? wordsPerPage : 350;

    for (const ch of chapters) {
        let words = 0;
        let chars = 0;
        let preview = "";

        for (const p of ch.paragraphs) {
            words += countWords(p);
            chars += p.length;
            // Collect a little more than the preview length; skip scene-break lines like ***
            if (preview.length < 200 && p.trim() && !uccdsIsDivider(p, appState.chapterSettings)) {
                preview += (preview ? " " : "") + p.trim();
            }
        }

        ch.wordCount = words;
        ch.charCount = chars;
        ch.pageCount = Math.ceil(words / wpp);
        ch.preview = makePreview(preview, 140);

        // Compute or retrieve cached tokens
        const fullChapterText = ch.paragraphs.join("\n\n");
        ch.tokenCount = await getOrComputeTokenCount(fullChapterText, model);

        // Check if analysis or summary exists in state
        ch.hasAnalysis = !!appState.analyses[ch.index];
        ch.hasSummary = !!appState.summaries[ch.index];
    }
}
