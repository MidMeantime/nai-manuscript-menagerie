// --- Legacy chapter parser (pre-UCCDS), kept ONLY for the one-time report migration ---
// Saved analyses/summaries used to be stored by chapter position under this parser's chapter list.
// migrateReportsToChapterKeys() (chapters.ts) re-runs it once to learn which header each old position
// meant, then moves every report to that chapter's UCCDS key. Nothing else may call it: chapter
// detection is UCCDS now. Safe to delete a few releases after 0.3.2, once old stories have migrated.

/** The detection settings the old parser read from config (option names from 0.3.0 and earlier) */
interface LegacyDetectionConfig {
    chapterDetectionMode: string;
    chapterBreakToken: string;
    separateSceneBreaks: boolean;
    detectBracketedTitles: boolean;
    treatPreambleAsChapter: boolean;
}

/** A chapter as the old parser produced it (no UCCDS key or kind) */
type LegacyChapter = Omit<ManuscriptChapter, 'key' | 'kind'>;

const LEGACY_DETECTION_DEFAULTS: LegacyDetectionConfig = {
    chapterDetectionMode: "auto",
    chapterBreakToken: "***",
    separateSceneBreaks: true,
    detectBracketedTitles: true,
    treatPreambleAsChapter: true
};

function legacyIsDividerToken(text: string, customToken?: string): boolean {
    if (!text) return false;
    const t = text.trim();
    if (customToken && t === customToken.trim()) return true;
    if (t === "***" || t === "---" || t === "* * *" || t === "- - -" || t === "___" || t === "– – –" || t === "— — —") return true;
    if (/^(?:\*\s*){3,}$/.test(t) || /^(?:-\s*){3,}$/.test(t) || /^(?:_\s*){3,}$/.test(t)) return true;
    return false;
}

function legacyIsChapterHeaderPattern(text: string): boolean {
    if (!text) return false;
    let trimmed = text.trim();
    // Allow optional leading scene break in the same section e.g. "***\n# Chapter 1"
    trimmed = trimmed.replace(/^(?:\*{3}|---|[\* \-_]{3,})\s*\n\s*/, '');

    // 1. Markdown headings: #, ##, etc.
    if (/^#{1,6}\s+/.test(trimmed)) return true;
    // 2. Bracketed headers: [Chapter 1], [Title: Foo], [Scene 1], etc.
    if (/^\[\s*(?:(?:Chapter|Title|Scene)\s*:\s*)?[^\]]+\]/i.test(trimmed)) return true;
    // 3. Keyword headings: Chapter, Act, Scene, Book, Part, Volume, Prologue, Epilogue
    if (/^(?:Chapter|Act|Scene|Book|Part|Volume|Prologue|Epilogue)\b(?:\s+(?:\d+|[IVXLCDM]+|[a-zA-Z]+))?(?:\s*[:\-\u2013\u2014].*)?$/i.test(trimmed)) return true;
    return false;
}

/**
 * The old chapter list for a document, exactly as 0.3.0 built it (titles, header/start section ids,
 * section ids). Metrics are left at 0: the migration only needs positions and headers.
 */
function legacyDetectChapters(sections: { sectionId: number; section: { text?: string } }[], cfg: LegacyDetectionConfig, storyTitle: string): LegacyChapter[] {
    const mode = cfg.chapterDetectionMode;
    const breakToken = cfg.chapterBreakToken || "***";
    const separateSceneBreaks = cfg.separateSceneBreaks;
    const detectBracketed = cfg.detectBracketedTitles;
    const treatPreamble = cfg.treatPreambleAsChapter;

    const chapters: LegacyChapter[] = [];
    let currentChapter: LegacyChapter | null = null;
    let currentSectionIds: number[] = [];
    let currentParagraphs: string[] = [];
    let chapterIndex = 0;

    for (let i = 0; i < sections.length; i++) {
        const item = sections[i];
        const text = (item.section && item.section.text) ? item.section.text : "";
        const trimmed = text.trim();

        const isDivider = legacyIsDividerToken(trimmed, breakToken);

        let isHeader = false;
        let headerTitle = "";
        let rawHeaderTitle = "";
        let startSecId = item.sectionId;
        let headerSecId = item.sectionId;
        let initialIds = [item.sectionId];

        if (separateSceneBreaks) {
            // When allowing scene breaks separate from chapters:
            // Break tokens (***, ---, etc.) only define a chapter if immediately followed by a chapter header under the break.
            // Otherwise, they are treated as standard scene breaks and preserved in the chapter content.
            if (isDivider) {
                // Look ahead for the next non-empty section
                let nextNonEmptyIdx = -1;
                let nextNonEmptyText = "";
                for (let j = i + 1; j < sections.length; j++) {
                    const cand = sections[j]?.section?.text?.trim() || "";
                    if (cand.length > 0) {
                        nextNonEmptyIdx = j;
                        nextNonEmptyText = cand;
                        break;
                    }
                }

                if (nextNonEmptyIdx !== -1 && legacyIsChapterHeaderPattern(nextNonEmptyText)) {
                    isHeader = true;
                    rawHeaderTitle = nextNonEmptyText;
                    headerTitle = cleanHeaderTitle(nextNonEmptyText);
                    startSecId = item.sectionId;
                    headerSecId = sections[nextNonEmptyIdx].sectionId;
                    initialIds = [];
                    for (let s = i; s <= nextNonEmptyIdx; s++) {
                        initialIds.push(sections[s].sectionId);
                    }
                    // Advance loop index to consume the header line
                    i = nextNonEmptyIdx;
                }
                // If no chapter header pattern under the break, isHeader remains false -> preserved in currentParagraphs
            } else if (mode === "markdown_headings") {
                if (/^#{1,6}\s+/.test(trimmed)) {
                    isHeader = true;
                    rawHeaderTitle = trimmed;
                    headerTitle = cleanHeaderTitle(trimmed);
                }
            } else if (mode === "break_token") {
                // In break_token mode with separateSceneBreaks, only dividers followed by headers start chapters
            } else {
                // "auto" mode: check if current section is a chapter header pattern
                if (legacyIsChapterHeaderPattern(trimmed)) {
                    isHeader = true;
                    rawHeaderTitle = trimmed;
                    headerTitle = cleanHeaderTitle(trimmed);
                }
            }
        } else {
            // Legacy behavior: every divider is treated as a chapter boundary
            if (mode === "break_token") {
                if (isDivider) {
                    isHeader = true;
                    if (detectBracketed && i + 1 < sections.length) {
                        const nextText = sections[i + 1]?.section?.text?.trim() || "";
                        const bracketMatch = nextText.match(/^\[\s*(?:(?:Title|Chapter)\s*:\s*)?([^\]]+)\]/i);
                        if (bracketMatch && bracketMatch[1]) {
                            rawHeaderTitle = nextText;
                            headerTitle = bracketMatch[1].trim();
                        }
                    }
                    if (!headerTitle) {
                        headerTitle = `Chapter ${chapterIndex + 1}`;
                        rawHeaderTitle = headerTitle;
                    }
                }
            } else if (mode === "markdown_headings") {
                if (/^#{1,6}\s+/.test(trimmed)) {
                    isHeader = true;
                    rawHeaderTitle = trimmed;
                    headerTitle = cleanHeaderTitle(trimmed);
                }
            } else {
                // "auto" mode
                if (!isDivider && legacyIsChapterHeaderPattern(trimmed)) {
                    isHeader = true;
                    rawHeaderTitle = trimmed;
                    headerTitle = cleanHeaderTitle(trimmed);
                    if (i > 0) {
                        const prevText = sections[i - 1]?.section?.text?.trim() || "";
                        if (legacyIsDividerToken(prevText, breakToken)) {
                            startSecId = sections[i - 1].sectionId;
                            initialIds = [startSecId, item.sectionId];
                        }
                    }
                } else if (isDivider) {
                    const nextText = (i + 1 < sections.length) ? (sections[i + 1]?.section?.text?.trim() || "") : "";
                    const nextIsHeader = legacyIsChapterHeaderPattern(nextText);
                    if (!nextIsHeader) {
                        isHeader = true;
                        headerTitle = `Chapter ${chapterIndex + 1}`;
                        rawHeaderTitle = headerTitle;
                    }
                }
            }
        }

        if (isHeader) {
            if (currentChapter) {
                currentChapter.sectionIds = currentSectionIds;
                currentChapter.paragraphs = currentParagraphs;
                chapters.push(currentChapter);
            } else if (currentParagraphs.length > 0 && treatPreamble) {
                // Preamble / Story Beginning
                chapters.push({
                    index: chapterIndex++,
                    title: "Story Beginning (Prologue)",
                    cleanTitle: "Story Beginning",
                    rawTitle: "Story Beginning (Prologue)",
                    normalizedNumber: 0,
                    headerSectionId: currentSectionIds[0],
                    startSectionId: currentSectionIds[0],
                    sectionIds: currentSectionIds,
                    paragraphs: currentParagraphs,
                    wordCount: 0,
                    charCount: 0,
                    tokenCount: 0,
                    pageCount: 0,
                    preview: "",
                    hasAnalysis: false,
                    hasSummary: false
                });
            }

            const parsedHeader = parseChapterTitle(headerTitle || rawHeaderTitle);
            const normalizedNum = parsedHeader.chapterNumber ?? (parsedHeader.isSpecial ? 0 : chapterIndex + 1);
            const rawTitle = rawHeaderTitle || headerTitle || `Chapter ${chapterIndex + 1}`;

            currentChapter = {
                index: chapterIndex++,
                title: rawTitle,
                cleanTitle: cleanHeaderTitle(headerTitle || rawTitle),
                rawTitle: rawTitle,
                normalizedNumber: normalizedNum,
                headerSectionId: headerSecId,
                startSectionId: startSecId,
                sectionIds: initialIds,
                paragraphs: [],
                wordCount: 0,
                charCount: 0,
                tokenCount: 0,
                pageCount: 0,
                preview: "",
                hasAnalysis: false,
                hasSummary: false
            };
            currentSectionIds = initialIds.slice();
            currentParagraphs = [];
        } else {
            if (text) {
                currentParagraphs.push(text);
            }
            currentSectionIds.push(item.sectionId);
        }
    }

    if (currentChapter) {
        currentChapter.sectionIds = currentSectionIds;
        currentChapter.paragraphs = currentParagraphs;
        chapters.push(currentChapter);
    } else if (currentParagraphs.length > 0 && chapters.length === 0) {
        // Document without headers treated as a single unified chapter
        chapters.push({
            index: 0,
            title: storyTitle || "Full Story",
            cleanTitle: storyTitle || "Full Story",
            rawTitle: storyTitle || "Full Story",
            normalizedNumber: 1,
            headerSectionId: currentSectionIds[0],
            startSectionId: currentSectionIds[0],
            sectionIds: currentSectionIds,
            paragraphs: currentParagraphs,
            wordCount: 0,
            charCount: 0,
            tokenCount: 0,
            pageCount: 0,
            preview: "",
            hasAnalysis: false,
            hasSummary: false
        });
    }
    return chapters;
}
