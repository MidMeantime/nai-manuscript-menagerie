// --- Live Metrics & Counters Engine for Mid's Manuscript Menagerie ---

/**
 * Token counts by text content (B4). Keyed by model, length and a hash of the whole text, so an
 * edit in the middle of a chapter is never answered from the cache. Capped: the oldest entries go
 * first, and a hit moves its entry to the back, so every chapter's current text stays cached.
 */
const tokenCache = new Map<string, number>();
const TOKEN_CACHE_MAX = 500;

/** FNV-1a over the UTF-16 code units: a cheap 32-bit content hash for cache keys */
function hashText(text: string): string {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(36);
}

function tokenCacheKey(text: string, model: string): string {
    return `${model}:${text.length}:${hashText(text)}`;
}

async function getOrComputeTokenCount(text: string, model: string): Promise<number> {
    if (!text) return 0;
    const cacheKey = tokenCacheKey(text, model);
    const cached = tokenCache.get(cacheKey);
    if (cached !== undefined) {
        tokenCache.delete(cacheKey);
        tokenCache.set(cacheKey, cached);
        return cached;
    }

    try {
        const tokens = await api.v1.tokenizer.encode(text, model);
        if (Array.isArray(tokens)) {
            const count = tokens.length;
            tokenCache.set(cacheKey, count);
            while (tokenCache.size > TOKEN_CACHE_MAX) {
                const oldest = tokenCache.keys().next().value;
                if (oldest === undefined) break;
                tokenCache.delete(oldest);
            }
            return count;
        }
    } catch {
        // Tokenizer temporarily unavailable: estimate below
    }

    // Estimates aren't cached, so the real count replaces them once the tokenizer answers again
    return estimateTokens(text);
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
