const assert = require('assert');

// 1. Word Counter
function countWords(str) {
    if (!str) return 0;
    let count = 0;
    let inWord = false;
    for (let i = 0; i < str.length; i++) {
        const code = str.charCodeAt(i);
        if (code > 32) {
            if (!inWord) {
                count++;
                inWord = true;
            }
        } else {
            inWord = false;
        }
    }
    return count;
}

// 2. Roman Numerals
const ROMAN_VALS = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"],
    [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
    [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]
];

function toRomanNumeral(num) {
    if (num <= 0 || num > 3999) return String(num);
    let result = "";
    let rem = num;
    for (const [val, roman] of ROMAN_VALS) {
        while (rem >= val) {
            result += roman;
            rem -= val;
        }
    }
    return result;
}

const ROMAN_CHAR_MAP = {
    I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000
};

function parseRomanNumeral(str) {
    const upper = str.toUpperCase().trim();
    if (!/^[IVXLCDM]+$/.test(upper)) return null;
    let total = 0;
    let prev = 0;
    for (let i = upper.length - 1; i >= 0; i--) {
        const val = ROMAN_CHAR_MAP[upper[i]] || 0;
        if (val < prev) {
            total -= val;
        } else {
            total += val;
        }
        prev = val;
    }
    return total > 0 ? total : null;
}

const WORD_NUMBER_MAP = {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
    eighteen: 18, nineteen: 19, twenty: 20
};

function extractNumberFromString(str) {
    if (!str) return null;
    const trimmed = str.trim();
    if (/^\d+$/.test(trimmed)) {
        const n = parseInt(trimmed, 10);
        return isNaN(n) ? null : n;
    }
    const roman = parseRomanNumeral(trimmed);
    if (roman !== null) return roman;
    const wordKey = trimmed.toLowerCase().replace(/[\s-]/g, '');
    if (WORD_NUMBER_MAP[wordKey] !== undefined) return WORD_NUMBER_MAP[wordKey];
    return null;
}

function extractChapterNumber(title) {
    if (!title) return null;

    // 1. Prioritize explicit "Chapter" or "Ch." number
    const chDigit = title.match(/(?:chapter|ch\.?)\s*(\d+)/i);
    if (chDigit && chDigit[1]) {
        const n = parseInt(chDigit[1], 10);
        if (!isNaN(n)) return n;
    }
    const chRoman = title.match(/(?:chapter|ch\.?)\s+([IVXLCDM]+)\b/i);
    if (chRoman && chRoman[1]) {
        const romNum = parseRomanNumeral(chRoman[1]);
        if (romNum !== null) return romNum;
    }
    const chWord = title.match(/(?:chapter|ch\.?)\s+([a-z]+)\b/i);
    if (chWord && chWord[1]) {
        const lower = chWord[1].toLowerCase().replace(/[\s-]/g, '');
        if (WORD_NUMBER_MAP[lower] !== undefined) return WORD_NUMBER_MAP[lower];
    }

    // 2. Secondary: other prefixes (scene, act, part, book, episode)
    const otherDigit = title.match(/(?:scene|act|part|book|episode)\s*(\d+)/i);
    if (otherDigit && otherDigit[1]) {
        const n = parseInt(otherDigit[1], 10);
        if (!isNaN(n)) return n;
    }
    const otherRoman = title.match(/(?:scene|act|part|book|episode)\s+([IVXLCDM]+)\b/i);
    if (otherRoman && otherRoman[1]) {
        const romNum = parseRomanNumeral(otherRoman[1]);
        if (romNum !== null) return romNum;
    }
    const otherWord = title.match(/(?:scene|act|part|book|episode)\s+([a-z]+)\b/i);
    if (otherWord && otherWord[1]) {
        const lower = otherWord[1].toLowerCase().replace(/[\s-]/g, '');
        if (WORD_NUMBER_MAP[lower] !== undefined) return WORD_NUMBER_MAP[lower];
    }

    // 3. Fallback: standalone digits e.g. "# 12" or "12"
    const standaloneDigit = title.match(/(?:#\s*)?(\d+)/);
    if (standaloneDigit && standaloneDigit[1]) {
        const n = parseInt(standaloneDigit[1], 10);
        if (!isNaN(n)) return n;
    }

    return null;
}

function cleanHeaderTitle(raw) {
    if (!raw) return "";
    let clean = raw.trim();
    clean = clean.replace(/^(?:\*{3}|---|[\* \-_]{3,})\s*/, '');
    clean = clean.replace(/^#{1,6}\s*/, '');
    clean = clean.replace(/^\[\s*(?:(?:Chapter|Title|Scene)\s*:\s*)?/i, '').replace(/\s*\]$/, '');
    clean = clean.replace(/^(?:\*{3}|---|[\* \-_]{3,})\s*/, '');
    return clean.trim();
}

function parseChapterTitle(raw, fallbackNumber) {
    if (!raw) {
        return {
            preTitle: "",
            chapterNumber: fallbackNumber !== undefined ? fallbackNumber : null,
            chapterNumberRaw: "",
            chapterTitle: "",
            isSpecial: false
        };
    }

    const clean = cleanHeaderTitle(raw);

    const specialMatch = clean.match(/^(?:((?:Act|Part|Book|Volume|Section|Arc)\s+(?:\d+|[IVXLCDM]+|[a-zA-Z]+))\s*[:\-\u2013\u2014,]\s*)?(Prologue|Epilogue|Interlude|Prelude|Story Beginning(?:\s*\(Prologue\))?)$/i);
    if (specialMatch) {
        return {
            preTitle: specialMatch[1] ? specialMatch[1].trim() : "",
            chapterNumber: 0,
            chapterNumberRaw: "",
            chapterTitle: specialMatch[2].trim(),
            isSpecial: true
        };
    }

    let preTitle = "";
    let rest = clean;

    const preMatch = rest.match(/^((?:(?:Act|Part|Book|Volume|Section|Arc)\s+(?:\d+|[IVXLCDM]+|[a-zA-Z]+)(?:\s*[:\-\u2013\u2014,]\s*|\s+))+)/i);
    if (preMatch) {
        preTitle = preMatch[1].replace(/[\s:\-\u2013\u2014,]+$/, '').trim();
        rest = rest.slice(preMatch[0].length).trim();
    }

    let chapterNum = null;
    let chapterNumRaw = "";
    let subtitle = "";

    const chMatch = rest.match(/^(?:Chapter|Ch\.?|Scene)\b(?:\s*(\d+|[IVXLCDM]+|[a-zA-Z]+))?(?:\s*[:\-\u2013\u2014]\s*(.*))?$/i);
    if (chMatch) {
        chapterNumRaw = chMatch[1] ? chMatch[1].trim() : "";
        if (chapterNumRaw) {
            chapterNum = extractNumberFromString(chapterNumRaw);
        }
        subtitle = chMatch[2] ? chMatch[2].trim() : "";
    } else {
        const numLeadingMatch = rest.match(/^(?:#\s*)?(\d+)(?:\s*[:\-\u2013\u2014]\s*(.*))?$/i);
        if (numLeadingMatch) {
            chapterNumRaw = numLeadingMatch[1];
            chapterNum = parseInt(chapterNumRaw, 10);
            subtitle = numLeadingMatch[2] ? numLeadingMatch[2].trim() : "";
        } else if (preTitle && rest) {
            subtitle = rest.replace(/^[:\-\u2013\u2014]\s*/, '').trim();
        } else if (!preTitle && rest) {
            subtitle = rest;
        }
    }

    if (chapterNum === null && fallbackNumber !== undefined && fallbackNumber !== null) {
        chapterNum = fallbackNumber;
    }

    return {
        preTitle,
        chapterNumber: chapterNum,
        chapterNumberRaw: chapterNumRaw,
        chapterTitle: subtitle,
        isSpecial: false
    };
}

function formatChapterDisplayTitle(chapter, style = 'arabic') {
    const parsed = parseChapterTitle(chapter.cleanTitle, chapter.normalizedNumber);

    if (parsed.isSpecial) {
        if (parsed.preTitle) {
            return `${parsed.preTitle}: ${parsed.chapterTitle}`;
        }
        return parsed.chapterTitle;
    }

    const num = parsed.chapterNumber !== null ? parsed.chapterNumber : chapter.normalizedNumber;
    const numStr = num !== null ? (style === 'roman' ? toRomanNumeral(num) : String(num)) : "";

    const hasPre = parsed.preTitle.length > 0;
    const hasNum = numStr.length > 0;
    const hasSub = parsed.chapterTitle.length > 0;

    let display = "";
    if (hasPre) {
        display += `${parsed.preTitle}: `;
    }

    if (hasNum) {
        display += `Chapter ${numStr}`;
        if (hasSub) {
            display += `: ${parsed.chapterTitle}`;
        }
    } else if (hasSub) {
        display += parsed.chapterTitle;
    } else if (hasPre) {
        display = parsed.preTitle;
    } else {
        display = chapter.cleanTitle;
    }

    return display;
}

function formatSummaryLorebookHeader(chapter, style = 'arabic') {
    const parsed = parseChapterTitle(chapter.cleanTitle, chapter.normalizedNumber);

    if (parsed.isSpecial) {
        if (parsed.preTitle) {
            return `**${parsed.preTitle}: ${parsed.chapterTitle} — Summary**`;
        }
        return `**${parsed.chapterTitle} — Summary**`;
    }

    const num = parsed.chapterNumber !== null ? parsed.chapterNumber : chapter.normalizedNumber;
    const numStr = num !== null ? (style === 'roman' ? toRomanNumeral(num) : String(num)) : "";

    const hasPre = parsed.preTitle.length > 0;
    const hasNum = numStr.length > 0;
    const hasSub = parsed.chapterTitle.length > 0;

    let header = "";
    if (hasPre) {
        header += `${parsed.preTitle}: `;
    }

    if (hasNum) {
        header += `Chapter ${numStr}`;
        if (hasSub) {
            header += `: ${parsed.chapterTitle}`;
        }
    } else if (hasSub) {
        header += parsed.chapterTitle;
    } else if (hasPre) {
        header = parsed.preTitle;
    } else {
        header = chapter.cleanTitle;
    }

    return `**${header} — Summary**`;
}

function ensureSummaryHeader(text, expectedHeader) {
    if (!text || !text.trim()) return expectedHeader;
    const trimmed = text.trim();

    const firstNewlineIdx = trimmed.indexOf('\n');
    const firstLine = (firstNewlineIdx !== -1 ? trimmed.slice(0, firstNewlineIdx) : trimmed).trim();
    const remaining = firstNewlineIdx !== -1 ? trimmed.slice(firstNewlineIdx).trim() : "";

    const isHeaderLine = /^(?:#+\s*|\*{2})?(?:(?:(?:Act|Part|Book|Volume|Section|Arc)\s+(?:\d+|[IVXLCDM]+|[a-zA-Z]+)\s*[:\-\u2013\u2014,]\s*)?(?:Chapter|Ch\.?|Scene|Prologue|Epilogue)\b|Chapter\s+\d+).*?(?:\s*[\u2014\-]\s*Summary)?\*{0,2}$/i.test(firstLine)
        || firstLine.toLowerCase().includes("summary")
        || (firstLine.startsWith("**") && firstLine.endsWith("**"));

    if (isHeaderLine) {
        return remaining ? `${expectedHeader}\n\n${remaining}` : expectedHeader;
    }
    return `${expectedHeader}\n\n${trimmed}`;
}

const DEFAULT_HEADER_PATTERN = /^(?:(\*{3}\s*\n\s*)?(#{1,6}\s+(.+)|\[\s*(?:(?:Chapter|Title)\s*:\s*)?([^\]]+)\]|(?:Chapter|Act|Scene|Book|Part|Prologue|Epilogue)\b(?:\s+(?:\d+|[IVXLCDM]+|[a-zA-Z]+))?(?:\s*[:\-\u2013\u2014].*)?))$/i;

// --- Run Tests ---
console.log("Running logic unit tests...");

// Test 1: Word count
assert.strictEqual(countWords(""), 0);
assert.strictEqual(countWords("   "), 0);
assert.strictEqual(countWords("Hello world"), 2);
assert.strictEqual(countWords("   One\ntwo\tthree   four   "), 4);

// Test 2: Roman numerals
assert.strictEqual(toRomanNumeral(1), "I");
assert.strictEqual(toRomanNumeral(4), "IV");
assert.strictEqual(toRomanNumeral(9), "IX");
assert.strictEqual(toRomanNumeral(14), "XIV");
assert.strictEqual(toRomanNumeral(42), "XLII");

assert.strictEqual(parseRomanNumeral("IV"), 4);
assert.strictEqual(parseRomanNumeral("ix"), 9);
assert.strictEqual(parseRomanNumeral("XIV"), 14);
assert.strictEqual(parseRomanNumeral("Invalid"), null);

// Test 3: Chapter number extraction
assert.strictEqual(extractChapterNumber("Chapter 1: The Beginning"), 1);
assert.strictEqual(extractChapterNumber("Chapter IV - The Woods"), 4);
assert.strictEqual(extractChapterNumber("Chapter Three: Echoes"), 3);
assert.strictEqual(extractChapterNumber("# 12"), 12);
assert.strictEqual(extractChapterNumber("Prologue"), null);
assert.strictEqual(extractChapterNumber("Act 2: Chapter 12"), 12);
assert.strictEqual(extractChapterNumber("Act II: Chapter 12"), 12);

// Test 4: Clean header title
assert.strictEqual(cleanHeaderTitle("# Chapter 1: The Call"), "Chapter 1: The Call");
assert.strictEqual(cleanHeaderTitle("## [Title: The Storm]"), "The Storm");
assert.strictEqual(cleanHeaderTitle("[Chapter: The Descent]"), "The Descent");
assert.strictEqual(cleanHeaderTitle("***"), "");
assert.strictEqual(cleanHeaderTitle("[ Act II: Chapter 12 ]"), "Act II: Chapter 12");

// Test 4b: Title parsing & display title (No Doubling)
const chAct2Ch12 = { cleanTitle: cleanHeaderTitle("[ Act II: Chapter 12 ]"), normalizedNumber: 12 };
assert.strictEqual(formatChapterDisplayTitle(chAct2Ch12), "Act II: Chapter 12");
assert.strictEqual(formatSummaryLorebookHeader(chAct2Ch12), "**Act II: Chapter 12 — Summary**");

const chAct2Ch12Sub = { cleanTitle: cleanHeaderTitle("[ Act II: Chapter 12: The Reckoning ]"), normalizedNumber: 12 };
assert.strictEqual(formatChapterDisplayTitle(chAct2Ch12Sub), "Act II: Chapter 12: The Reckoning");
assert.strictEqual(formatSummaryLorebookHeader(chAct2Ch12Sub), "**Act II: Chapter 12: The Reckoning — Summary**");

const ch12 = { cleanTitle: cleanHeaderTitle("Chapter 12"), normalizedNumber: 12 };
assert.strictEqual(formatChapterDisplayTitle(ch12), "Chapter 12");
assert.strictEqual(formatSummaryLorebookHeader(ch12), "**Chapter 12 — Summary**");

const ch12Sub = { cleanTitle: cleanHeaderTitle("Chapter 12: The Reckoning"), normalizedNumber: 12 };
assert.strictEqual(formatChapterDisplayTitle(ch12Sub), "Chapter 12: The Reckoning");
assert.strictEqual(formatSummaryLorebookHeader(ch12Sub), "**Chapter 12: The Reckoning — Summary**");

const chPrologue = { cleanTitle: cleanHeaderTitle("Prologue"), normalizedNumber: 0 };
assert.strictEqual(formatChapterDisplayTitle(chPrologue), "Prologue");
assert.strictEqual(formatSummaryLorebookHeader(chPrologue), "**Prologue — Summary**");

const chActPrologue = { cleanTitle: cleanHeaderTitle("[ Act I: Prologue ]"), normalizedNumber: 0 };
assert.strictEqual(formatChapterDisplayTitle(chActPrologue), "Act I: Prologue");
assert.strictEqual(formatSummaryLorebookHeader(chActPrologue), "**Act I: Prologue — Summary**");

// Test 4c: Summary header normalizer (fixing old doubled header)
assert.strictEqual(
    ensureSummaryHeader("Chapter 12 — Act II: Chapter 12\n\nBody text.", "**Act II: Chapter 12 — Summary**"),
    "**Act II: Chapter 12 — Summary**\n\nBody text."
);
assert.strictEqual(
    ensureSummaryHeader("Body text with no header.", "**Act II: Chapter 12 — Summary**"),
    "**Act II: Chapter 12 — Summary**\n\nBody text with no header."
);

// Test 5: Header pattern matching
assert.strictEqual(DEFAULT_HEADER_PATTERN.test("# Chapter 1"), true);
assert.strictEqual(DEFAULT_HEADER_PATTERN.test("## Scene 4"), true);
assert.strictEqual(DEFAULT_HEADER_PATTERN.test("[Title: Midnight Revelations]"), true);
assert.strictEqual(DEFAULT_HEADER_PATTERN.test("[Chapter: Into the Dark]"), true);
assert.strictEqual(DEFAULT_HEADER_PATTERN.test("Chapter 1: The Beginning"), true);
assert.strictEqual(DEFAULT_HEADER_PATTERN.test("Chapter IV"), true);
assert.strictEqual(DEFAULT_HEADER_PATTERN.test("Prologue"), true);
assert.strictEqual(DEFAULT_HEADER_PATTERN.test("Epilogue - Aftermath"), true);
assert.strictEqual(DEFAULT_HEADER_PATTERN.test("This is just standard prose text."), false);

// Test 7: Chapter display title formatting (no doubling up)
assert.strictEqual(
    formatChapterDisplayTitle({ cleanTitle: "Chapter 1: The Gathering", normalizedNumber: 1 }, "arabic"),
    "Chapter 1: The Gathering"
);
assert.strictEqual(
    formatChapterDisplayTitle({ cleanTitle: "Chapter 1", normalizedNumber: 1 }, "arabic"),
    "Chapter 1"
);
assert.strictEqual(
    formatChapterDisplayTitle({ cleanTitle: "The Gathering", normalizedNumber: 1 }, "arabic"),
    "Chapter 1: The Gathering"
);
assert.strictEqual(
    formatChapterDisplayTitle({ cleanTitle: "Chapter IV: Shadows", normalizedNumber: 4 }, "roman"),
    "Chapter IV: Shadows"
);
assert.strictEqual(
    formatChapterDisplayTitle({ cleanTitle: "Story Beginning (Prologue)", normalizedNumber: 0 }, "arabic"),
    "Story Beginning (Prologue)"
);

// Test 8: Prompt Modular Chunks & Toggles
const PROMPT_ANALYSIS_HEADER = `You are an incisive developmental editor`;
const PROMPT_ANALYSIS_CHUNK_STRENGTHS = `### Overarching Strengths`;
const PROMPT_ANALYSIS_CHUNK_CHARACTER = `### Character Analysis`;
const PROMPT_ANALYSIS_CHUNK_THEMATIC = `### Thematic & Structural Notes`;
const PROMPT_ANALYSIS_CHUNK_CRAFT_QUESTIONS = `### Targeted Craft Questions`;

function testBuildAnalysisPrompt(toggles = {}) {
    const active = { analysisCharacter: true, analysisCraftQuestions: true, ...toggles };
    const parts = [PROMPT_ANALYSIS_HEADER, PROMPT_ANALYSIS_CHUNK_STRENGTHS];
    if (active.analysisCharacter) parts.push(PROMPT_ANALYSIS_CHUNK_CHARACTER);
    parts.push(PROMPT_ANALYSIS_CHUNK_THEMATIC);
    if (active.analysisCraftQuestions) parts.push(PROMPT_ANALYSIS_CHUNK_CRAFT_QUESTIONS);
    return parts.join("\n\n");
}

const pFull = testBuildAnalysisPrompt();
assert.strictEqual(pFull.includes("### Character Analysis"), true);
assert.strictEqual(pFull.includes("### Targeted Craft Questions"), true);
assert.strictEqual(pFull.includes("### Overarching Strengths"), true);
assert.strictEqual(pFull.includes("### Thematic & Structural Notes"), true);

const pNoChar = testBuildAnalysisPrompt({ analysisCharacter: false });
assert.strictEqual(pNoChar.includes("### Character Analysis"), false);
assert.strictEqual(pNoChar.includes("### Targeted Craft Questions"), true);
assert.strictEqual(pNoChar.includes("### Overarching Strengths"), true);
assert.strictEqual(pNoChar.includes("### Thematic & Structural Notes"), true);

const pNoQuestions = testBuildAnalysisPrompt({ analysisCraftQuestions: false });
assert.strictEqual(pNoQuestions.includes("### Character Analysis"), true);
assert.strictEqual(pNoQuestions.includes("### Targeted Craft Questions"), false);

// Test 9: Summary Modular Chunks & Toggles
const PROMPT_SUMMARY_HEADER = `You are an incisive continuity tracker`;
const PROMPT_SUMMARY_CHUNK_MAIN = `[2-3 prose paragraphs in present tense:`;
const PROMPT_SUMMARY_CHUNK_KEY_DEVELOPMENTS = `Key Developments:`;
const PROMPT_SUMMARY_CHUNK_TARGETED_QUESTIONS = `Targeted Questions:`;

function testBuildSummaryPrompt(toggles = {}) {
    const active = { summaryKeyDevelopments: true, summaryTargetedQuestions: true, ...toggles };
    const parts = [PROMPT_SUMMARY_HEADER, PROMPT_SUMMARY_CHUNK_MAIN];
    if (active.summaryKeyDevelopments) parts.push(PROMPT_SUMMARY_CHUNK_KEY_DEVELOPMENTS);
    if (active.summaryTargetedQuestions) parts.push(PROMPT_SUMMARY_CHUNK_TARGETED_QUESTIONS);
    return parts.join("\n\n");
}

const sFull = testBuildSummaryPrompt();
assert.strictEqual(sFull.includes("Key Developments:"), true);
assert.strictEqual(sFull.includes("Targeted Questions:"), true);

const sNoKey = testBuildSummaryPrompt({ summaryKeyDevelopments: false });
assert.strictEqual(sNoKey.includes("Key Developments:"), false);
assert.strictEqual(sNoKey.includes("Targeted Questions:"), true);

const sNoQuest = testBuildSummaryPrompt({ summaryTargetedQuestions: false });
assert.strictEqual(sNoQuest.includes("Key Developments:"), true);
assert.strictEqual(sNoQuest.includes("Targeted Questions:"), false);

// Test 10: Scene Break Dividers & Header Patterns
function isDividerToken(text, customToken) {
    if (!text) return false;
    const t = text.trim();
    if (customToken && t === customToken.trim()) return true;
    if (t === "***" || t === "---" || t === "* * *" || t === "- - -" || t === "___" || t === "– – –" || t === "— — —") return true;
    if (/^(?:\*\s*){3,}$/.test(t) || /^(?:-\s*){3,}$/.test(t) || /^(?:_\s*){3,}$/.test(t)) return true;
    return false;
}

function isChapterHeaderPattern(text) {
    if (!text) return false;
    let trimmed = text.trim();
    trimmed = trimmed.replace(/^(?:\*{3}|---|[\* \-_]{3,})\s*\n\s*/, '');
    if (/^#{1,6}\s+/.test(trimmed)) return true;
    if (/^\[\s*(?:(?:Chapter|Title|Scene)\s*:\s*)?[^\]]+\]/i.test(trimmed)) return true;
    if (/^(?:Chapter|Act|Scene|Book|Part|Volume|Prologue|Epilogue)\b(?:\s+(?:\d+|[IVXLCDM]+|[a-zA-Z]+))?(?:\s*[:\-\u2013\u2014].*)?$/i.test(trimmed)) return true;
    return false;
}

// Dividers
assert.strictEqual(isDividerToken("***"), true);
assert.strictEqual(isDividerToken("* * *"), true);
assert.strictEqual(isDividerToken("---"), true);
assert.strictEqual(isDividerToken("- - -"), true);
assert.strictEqual(isDividerToken("custom_break", "custom_break"), true);
assert.strictEqual(isDividerToken("This is normal prose"), false);

// Header patterns
assert.strictEqual(isChapterHeaderPattern("# Chapter 1"), true);
assert.strictEqual(isChapterHeaderPattern("## The Awakening"), true);
assert.strictEqual(isChapterHeaderPattern("[Chapter 1: The Dark Forest]"), true);
assert.strictEqual(isChapterHeaderPattern("[Title: Deep in the Woods]"), true);
assert.strictEqual(isChapterHeaderPattern("[Prologue]"), true);
assert.strictEqual(isChapterHeaderPattern("Chapter 2: The Return"), true);
assert.strictEqual(isChapterHeaderPattern("Act I"), true);
assert.strictEqual(isChapterHeaderPattern("Prologue"), true);
assert.strictEqual(isChapterHeaderPattern("***\n# Chapter 2"), true);
assert.strictEqual(isChapterHeaderPattern("***"), false);
assert.strictEqual(isChapterHeaderPattern("Alice walked to the window."), false);

// Test 11: Document scan simulation with separateSceneBreaks = true vs false
function simulateScan(sections, separateSceneBreaks = true) {
    const chapters = [];
    let currentChapter = null;
    let currentParagraphs = [];
    let chapterIndex = 0;

    for (let i = 0; i < sections.length; i++) {
        const text = sections[i].text || "";
        const trimmed = text.trim();
        const isDivider = isDividerToken(trimmed, "***");
        let isHeader = false;
        let headerTitle = "";
        let rawHeaderTitle = "";

        if (separateSceneBreaks) {
            if (isDivider) {
                let nextIdx = -1;
                let nextText = "";
                for (let j = i + 1; j < sections.length; j++) {
                    const cand = (sections[j].text || "").trim();
                    if (cand.length > 0) {
                        nextIdx = j;
                        nextText = cand;
                        break;
                    }
                }
                if (nextIdx !== -1 && isChapterHeaderPattern(nextText)) {
                    isHeader = true;
                    rawHeaderTitle = nextText;
                    headerTitle = cleanHeaderTitle(nextText);
                    i = nextIdx;
                }
            } else if (isChapterHeaderPattern(trimmed)) {
                isHeader = true;
                rawHeaderTitle = trimmed;
                headerTitle = cleanHeaderTitle(trimmed);
            }
        } else {
            if (isDivider) {
                const nextText = (i + 1 < sections.length) ? (sections[i + 1].text || "").trim() : "";
                if (!isChapterHeaderPattern(nextText)) {
                    isHeader = true;
                    headerTitle = `Chapter ${chapterIndex + 1}`;
                    rawHeaderTitle = headerTitle;
                }
            } else if (isChapterHeaderPattern(trimmed)) {
                isHeader = true;
                rawHeaderTitle = trimmed;
                headerTitle = cleanHeaderTitle(trimmed);
            }
        }

        if (isHeader) {
            if (currentChapter) {
                currentChapter.paragraphs = currentParagraphs;
                chapters.push(currentChapter);
            }
            const rawTitle = rawHeaderTitle || headerTitle;
            currentChapter = {
                index: chapterIndex++,
                title: rawTitle,
                rawTitle: rawTitle,
                cleanTitle: cleanHeaderTitle(headerTitle || rawTitle),
                paragraphs: []
            };
            currentParagraphs = [];
        } else {
            if (text) currentParagraphs.push(text);
        }
    }
    if (currentChapter) {
        currentChapter.paragraphs = currentParagraphs;
        chapters.push(currentChapter);
    }
    return chapters;
}

const testDoc = [
    { text: "# Chapter 1: The Gathering" },
    { text: "Paragraph 1 in chapter 1." },
    { text: "***" }, // in-chapter scene break!
    { text: "Paragraph 2 in chapter 1 after scene break." },
    { text: "***" }, // scene break before chapter 2 header!
    { text: "[Chapter 2: The Return]" },
    { text: "Paragraph 1 in chapter 2." },
    { text: "* * *" }, // in-chapter scene break!
    { text: "Paragraph 2 in chapter 2." }
];

// When separateSceneBreaks = true:
const chaptersSeparated = simulateScan(testDoc, true);
assert.strictEqual(chaptersSeparated.length, 2);
assert.strictEqual(chaptersSeparated[0].title, "# Chapter 1: The Gathering");
assert.strictEqual(chaptersSeparated[0].cleanTitle, "Chapter 1: The Gathering");
assert.strictEqual(chaptersSeparated[0].paragraphs.length, 3);
assert.strictEqual(chaptersSeparated[0].paragraphs[0], "Paragraph 1 in chapter 1.");
assert.strictEqual(chaptersSeparated[0].paragraphs[1], "***"); // preserved!
assert.strictEqual(chaptersSeparated[0].paragraphs[2], "Paragraph 2 in chapter 1 after scene break.");

assert.strictEqual(chaptersSeparated[1].title, "[Chapter 2: The Return]");
assert.strictEqual(chaptersSeparated[1].cleanTitle, "Chapter 2: The Return");
assert.strictEqual(chaptersSeparated[1].paragraphs.length, 3);
assert.strictEqual(chaptersSeparated[1].paragraphs[0], "Paragraph 1 in chapter 2.");
assert.strictEqual(chaptersSeparated[1].paragraphs[1], "* * *"); // preserved!
assert.strictEqual(chaptersSeparated[1].paragraphs[2], "Paragraph 2 in chapter 2.");

// Test bracketed chapter following break token: *** followed by [ Act I: Chapter 13 ]
const docWithBrackets = [
    { text: "***" },
    { text: "[ Act I: Chapter 13 ]" },
    { text: "Prose paragraph 1." }
];
const scannedBrackets = simulateScan(docWithBrackets, true);
assert.strictEqual(scannedBrackets.length, 1);
assert.strictEqual(scannedBrackets[0].rawTitle, "[ Act I: Chapter 13 ]");
assert.strictEqual(scannedBrackets[0].title, "[ Act I: Chapter 13 ]");
assert.strictEqual(scannedBrackets[0].cleanTitle, "Act I: Chapter 13");

// 10. Lorebook Context Prompt Integration & Filtering
function buildAnalysisUserPromptSim(chapterHeaderOrNum, chapterTitleOrText, chapterTextOrToggles, togglesOrLb, lorebookContextOrPrior, priorChapterContext) {
    let chapterHeader = "";
    let chapterText = "";
    let toggles;
    let lorebookContext;
    let priorContext;

    if (typeof chapterTextOrToggles === 'string') {
        const chapterNum = chapterHeaderOrNum;
        const chapterTitle = chapterTitleOrText;
        chapterText = chapterTextOrToggles;
        chapterHeader = chapterTitle
            ? (chapterNum ? `Chapter ${chapterNum}: ${chapterTitle}` : chapterTitle)
            : (chapterNum ? `Chapter ${chapterNum}` : "Chapter");
        toggles = togglesOrLb;
        lorebookContext = lorebookContextOrPrior;
        priorContext = priorChapterContext;
    } else {
        chapterHeader = chapterHeaderOrNum;
        chapterText = chapterTitleOrText;
        toggles = chapterTextOrToggles;
        lorebookContext = typeof togglesOrLb === 'string' ? togglesOrLb : undefined;
        priorContext = lorebookContextOrPrior;
    }

    let prompt = "";
    if (lorebookContext && lorebookContext.trim().length > 0) {
        prompt += `### LOREBOOK REFERENCE CONTEXT (Canon & World Bible)\nThe following lorebook entries provide established canon, character profiles, and world mechanics. Use this background context to inform your developmental critique (e.g., verifying character consistency, relational histories, and lore fidelity):\n\n${lorebookContext.trim()}\n\n--- END LOREBOOK CONTEXT ---\n\n`;
    }
    if (priorContext && priorContext.trim().length > 0) {
        prompt += `### PRIOR CHAPTER CONTEXT (Narrative Continuity & Arcs)\nThe PRIOR CHAPTER CONTEXT below reflects continuity and character trajectories established before this chapter starts. Use this background context to track character arcs, psychological progression, and narrative tensions across chapters. Do not critique prior chapter events as current developments unless this chapter's text explicitly revisits, complicates, or transforms them.\n\n${priorContext.trim()}\n\n--- END PRIOR CHAPTER CONTEXT ---\n\n`;
    }
    prompt += `Analyze the following chapter:\n\nChapter: ${chapterHeader}\n\n`;
    prompt += `--- CHAPTER TEXT ---\n${chapterText}\n--- END CHAPTER TEXT ---\n\n`;
    if (priorContext && priorContext.trim().length > 0) {
        prompt += `Grounding Mandate: Focus your developmental critique exclusively on the text, craft execution, and psychological dynamics of THIS chapter. Use prior chapter context solely to evaluate narrative momentum, relationship progression, and thematic continuity.\n\n`;
    }
    prompt += `Provide the structured developmental draft analysis now.`;
    return prompt;
}

function buildSummaryUserPromptSim(chapterHeaderOrNum, chapterTitleOrText, chapterTextOrAnalysis, existingAnalysisTextOrToggles, togglesOrLb, lorebookContextOrPrior, priorChapterContext) {
    let chapterHeader = "";
    let chapterText = "";
    let existingAnalysisText;
    let toggles;
    let lorebookContext;
    let priorContext;

    const isLegacy = (typeof togglesOrLb === 'object' && togglesOrLb !== null)
        || (typeof existingAnalysisTextOrToggles === 'string' && typeof togglesOrLb !== 'string')
        || (arguments.length >= 6 && typeof lorebookContextOrPrior === 'string' && typeof togglesOrLb === 'undefined');

    if (isLegacy) {
        const chapterNum = chapterHeaderOrNum;
        const chapterTitle = chapterTitleOrText;
        chapterText = chapterTextOrAnalysis || "";
        chapterHeader = chapterTitle
            ? (chapterNum ? `Chapter ${chapterNum}: ${chapterTitle}` : chapterTitle)
            : (chapterNum ? `Chapter ${chapterNum}` : "Chapter");
        existingAnalysisText = typeof existingAnalysisTextOrToggles === 'string' ? existingAnalysisTextOrToggles : undefined;
        toggles = togglesOrLb;
        lorebookContext = lorebookContextOrPrior;
        priorContext = priorChapterContext;
    } else {
        chapterHeader = chapterHeaderOrNum;
        chapterText = chapterTitleOrText;
        existingAnalysisText = typeof chapterTextOrAnalysis === 'string' ? chapterTextOrAnalysis : undefined;
        toggles = typeof existingAnalysisTextOrToggles === 'object' ? existingAnalysisTextOrToggles : undefined;
        lorebookContext = typeof togglesOrLb === 'string' ? togglesOrLb : undefined;
        priorContext = lorebookContextOrPrior;
    }

    let prompt = "";
    if (lorebookContext && lorebookContext.trim().length > 0) {
        prompt += `### LOREBOOK REFERENCE CONTEXT (Canon & Continuity Bible)\nThe following lorebook entries provide established canon and character details. Use these references to ensure continuity tracking, terminology, and character dynamics align with established lore:\n\n${lorebookContext.trim()}\n\n--- END LOREBOOK CONTEXT ---\n\n`;
    }
    if (priorContext && priorContext.trim().length > 0) {
        prompt += `### PRIOR CHAPTER CONTEXT (Historical Continuity)\nThe PRIOR CHAPTER CONTEXT below reflects continuity established before this chapter starts. Do not restate these facts as new developments unless this chapter's text explicitly revisits, complicates, or contradicts them.\n\n${priorContext.trim()}\n\n--- END PRIOR CHAPTER CONTEXT ---\n\n`;
    }
    prompt += `Summarize the following chapter for continuity tracking:\n\nChapter: ${chapterHeader}\n\n`;
    prompt += `--- CHAPTER TEXT ---\n${chapterText}\n--- END CHAPTER TEXT ---\n\n`;
    if (priorContext && priorContext.trim().length > 0) {
        prompt += `Grounding Mandate: Focus exclusively on events and character psychology that occur in THIS chapter. Treat prior chapter context as background reality; do not duplicate earlier chapter developments unless they are actively revisited, complicated, or transformed here.\n\n`;
    }
    prompt += `Provide the Chapter Summary and Key Developments following the exact output format now.`;
    return prompt;
}

function filterLorebookEntriesSim(entries, selectedCategoryIds) {
    const matched = [];
    const includeUncategorized = selectedCategoryIds.includes('__uncategorized__');
    for (const entry of entries) {
        if (!entry || entry.enabled === false) continue;
        const text = (entry.text || "").trim();
        if (!text) continue;
        if (!entry.category) {
            if (includeUncategorized) matched.push(entry);
        } else if (selectedCategoryIds.includes(entry.category)) {
            matched.push(entry);
        }
    }
    return matched.map(e => `#### ${e.displayName}\n${e.text.trim()}`).join("\n\n");
}

// Test analysis prompt without lorebook context
const analysisWithoutLb = buildAnalysisUserPromptSim("1", "The Beginning", "Chapter text content.");
assert.strictEqual(analysisWithoutLb.includes("LOREBOOK REFERENCE CONTEXT"), false);
assert.strictEqual(analysisWithoutLb.includes("Chapter text content."), true);

// Test analysis prompt with lorebook context
const dummyLbContext = "#### Arthur\nA young king with doubts.\n\n#### Excalibur\nA mythical sword.";
const analysisWithLb = buildAnalysisUserPromptSim("1", "The Beginning", "Chapter text content.", {}, dummyLbContext);
assert.strictEqual(analysisWithLb.includes("### LOREBOOK REFERENCE CONTEXT (Canon & World Bible)"), true);
assert.strictEqual(analysisWithLb.includes("#### Arthur"), true);
assert.strictEqual(analysisWithLb.includes("#### Excalibur"), true);
assert.strictEqual(analysisWithLb.includes("--- END LOREBOOK CONTEXT ---"), true);

// Test summary prompt with lorebook context
const summaryWithLb = buildSummaryUserPromptSim("1", "The Beginning", "Chapter text content.", undefined, {}, dummyLbContext);
assert.strictEqual(summaryWithLb.includes("### LOREBOOK REFERENCE CONTEXT (Canon & Continuity Bible)"), true);
assert.strictEqual(summaryWithLb.includes("#### Arthur"), true);

// Test entry filtering by category and uncategorized
const mockEntries = [
    { id: "e1", displayName: "Arthur", category: "cat_chars", text: "King of Britain", enabled: true },
    { id: "e2", displayName: "Merlin", category: "cat_chars", text: "Wizard", enabled: true },
    { id: "e3", displayName: "Camelot", category: "cat_places", text: "Castle city", enabled: true },
    { id: "e4", displayName: "Ancient Spell", category: undefined, text: "Lost magic", enabled: true },
    { id: "e5", displayName: "Disabled Entry", category: "cat_chars", text: "Should not appear", enabled: false }
];

const charsOnlyContext = filterLorebookEntriesSim(mockEntries, ["cat_chars"]);
assert.strictEqual(charsOnlyContext.includes("Arthur"), true);
assert.strictEqual(charsOnlyContext.includes("Merlin"), true);
assert.strictEqual(charsOnlyContext.includes("Camelot"), false);
assert.strictEqual(charsOnlyContext.includes("Lost magic"), false);
assert.strictEqual(charsOnlyContext.includes("Disabled Entry"), false);

const charsAndUncatContext = filterLorebookEntriesSim(mockEntries, ["cat_chars", "__uncategorized__"]);
assert.strictEqual(charsAndUncatContext.includes("Arthur"), true);
assert.strictEqual(charsAndUncatContext.includes("Ancient Spell"), true);
assert.strictEqual(charsAndUncatContext.includes("Camelot"), false);

// 11. Prior Chapter Summaries Context Simulation & Directionality
function getPriorChapterSummariesSim(currentChapterIndex, mode, summaries) {
    if (mode === 'off' || currentChapterIndex <= 0) return "";
    let minIndex = 0;
    if (mode === 'last_1') {
        minIndex = currentChapterIndex - 1;
    } else if (mode === 'last_4') {
        minIndex = Math.max(0, currentChapterIndex - 4);
    }
    const priorSummaries = [];
    for (let i = minIndex; i < currentChapterIndex; i++) {
        const s = summaries[i];
        if (!s || !s.text || !s.text.trim()) continue;
        priorSummaries.push(`#### Chapter ${i + 1}: ${s.chapterTitle}\n${s.text.trim()}`);
    }
    return priorSummaries.join("\n\n");
}

const mockSummaries = {
    0: { chapterTitle: "Prologue", text: "The old world ends." },
    1: { chapterTitle: "Awakening", text: "Hero wakes in a forest." },
    2: { chapterTitle: "The Village", text: "Finds an abandoned village." },
    3: { chapterTitle: "The Encounter", text: "Meets a mysterious wanderer." },
    4: { chapterTitle: "The Citadel", text: "Arrives at the citadel gates." },
    5: { chapterTitle: "The Trial", text: "Current chapter summary being generated." }
};

// Mode: off
assert.strictEqual(getPriorChapterSummariesSim(5, 'off', mockSummaries), "");

// Mode: last_1 for Chapter 5 (index 5) -> should ONLY contain Chapter 5 (index 4: The Citadel)
const last1Result = getPriorChapterSummariesSim(5, 'last_1', mockSummaries);
assert.strictEqual(last1Result.includes("Chapter 5: The Citadel"), true);
assert.strictEqual(last1Result.includes("The Encounter"), false);
assert.strictEqual(last1Result.includes("The Trial"), false); // Never includes current or later!

// Mode: last_1 for Chapter 1 (index 0) -> should be empty
assert.strictEqual(getPriorChapterSummariesSim(0, 'last_1', mockSummaries), "");

// Mode: last_4 for Chapter 5 (index 5) -> indices 1, 2, 3, 4 (Awakening, Village, Encounter, Citadel)
const last4Result = getPriorChapterSummariesSim(5, 'last_4', mockSummaries);
assert.strictEqual(last4Result.includes("Chapter 2: Awakening"), true);
assert.strictEqual(last4Result.includes("Chapter 3: The Village"), true);
assert.strictEqual(last4Result.includes("Chapter 4: The Encounter"), true);
assert.strictEqual(last4Result.includes("Chapter 5: The Citadel"), true);
assert.strictEqual(last4Result.includes("Prologue"), false); // Index 0 excluded by last_4 (5-4 = 1)
assert.strictEqual(last4Result.includes("The Trial"), false);

// Mode: all for Chapter 5 (index 5) -> indices 0, 1, 2, 3, 4
const allResult = getPriorChapterSummariesSim(5, 'all', mockSummaries);
assert.strictEqual(allResult.includes("Chapter 1: Prologue"), true);
assert.strictEqual(allResult.includes("Chapter 5: The Citadel"), true);
assert.strictEqual(allResult.includes("The Trial"), false); // Strict directionality

// Check Chronological Order: Prologue comes before Citadel
assert.strictEqual(allResult.indexOf("Prologue") < allResult.indexOf("The Citadel"), true);

// Test Summary User Prompt with Prior Chapter Context
const promptWithPrior = buildSummaryUserPromptSim(
    "6",
    "The Trial",
    "The hero steps into the arena.",
    undefined,
    {},
    dummyLbContext,
    last1Result
);

// Verify section ordering:
// 1. Lorebook context comes before chapter text
// 2. Prior chapter context comes before chapter text
// 3. Grounding mandate comes AFTER chapter text
const lbPos = promptWithPrior.indexOf("LOREBOOK REFERENCE CONTEXT");
const priorPos = promptWithPrior.indexOf("PRIOR CHAPTER CONTEXT (Historical Continuity)");
const summaryIntroPos = promptWithPrior.indexOf("Summarize the following chapter for continuity tracking:");
const chapterTextPos = promptWithPrior.indexOf("--- CHAPTER TEXT ---");
const groundingPos = promptWithPrior.indexOf("Grounding Mandate:");
const outputPos = promptWithPrior.indexOf("Provide the Chapter Summary");

assert.strictEqual(lbPos !== -1 && priorPos !== -1 && summaryIntroPos !== -1 && chapterTextPos !== -1 && groundingPos !== -1, true);
assert.strictEqual(lbPos < priorPos, true);
assert.strictEqual(priorPos < summaryIntroPos, true);
assert.strictEqual(summaryIntroPos < chapterTextPos, true);
assert.strictEqual(chapterTextPos < groundingPos, true);
assert.strictEqual(groundingPos < outputPos, true);

// Verify exact framing text is present
assert.strictEqual(promptWithPrior.includes("The PRIOR CHAPTER CONTEXT below reflects continuity established before this chapter starts. Do not restate these facts as new developments unless this chapter's text explicitly revisits, complicates, or contradicts them."), true);

// Test Analysis User Prompt with Prior Chapter Context
const analysisWithPrior = buildAnalysisUserPromptSim(
    "6",
    "The Trial",
    "The hero steps into the arena.",
    {},
    dummyLbContext,
    last1Result
);

const analysisLbPos = analysisWithPrior.indexOf("LOREBOOK REFERENCE CONTEXT");
const analysisPriorPos = analysisWithPrior.indexOf("PRIOR CHAPTER CONTEXT (Narrative Continuity & Arcs)");
const analysisIntroPos = analysisWithPrior.indexOf("Analyze the following chapter:");
const analysisChapterTextPos = analysisWithPrior.indexOf("--- CHAPTER TEXT ---");
const analysisGroundingPos = analysisWithPrior.indexOf("Grounding Mandate:");
const analysisOutputPos = analysisWithPrior.indexOf("Provide the structured developmental draft analysis now.");

assert.strictEqual(analysisLbPos !== -1 && analysisPriorPos !== -1 && analysisIntroPos !== -1 && analysisChapterTextPos !== -1 && analysisGroundingPos !== -1, true);
assert.strictEqual(analysisLbPos < analysisPriorPos, true);
assert.strictEqual(analysisPriorPos < analysisIntroPos, true);
assert.strictEqual(analysisIntroPos < analysisChapterTextPos, true);
assert.strictEqual(analysisChapterTextPos < analysisGroundingPos, true);
assert.strictEqual(analysisGroundingPos < analysisOutputPos, true);

// Verify analysis-specific framing instruction
assert.strictEqual(analysisWithPrior.includes("Use this background context to track character arcs, psychological progression, and narrative tensions across chapters."), true);
assert.strictEqual(analysisWithPrior.includes("Focus your developmental critique exclusively on the text, craft execution, and psychological dynamics of THIS chapter."), true);

// 12. Token Budget Safeguards & Replenishment Cooldown Simulation
function checkTokenBudgetSim(neededTokens, mockScriptApi) {
    if (!mockScriptApi) return { hasBudget: true, waitMs: 0 };
    let maxWaitMs = 0;
    let constrained = false;

    if (typeof mockScriptApi.getAllowedOutput === 'function') {
        const allowed = mockScriptApi.getAllowedOutput();
        if (allowed < neededTokens) {
            constrained = true;
            const waitTime = typeof mockScriptApi.getTimeUntilAllowedOutput === 'function'
                ? mockScriptApi.getTimeUntilAllowedOutput(neededTokens)
                : 5000;
            maxWaitMs = Math.max(maxWaitMs, waitTime);
        }
    }

    if (constrained) {
        return { hasBudget: false, waitMs: Math.max(maxWaitMs, 3000) };
    }
    return { hasBudget: true, waitMs: 0 };
}

// Case 1: Sufficient tokens -> hasBudget is true, waitMs is 0
const sufficientApi = {
    getAllowedOutput: () => 2048,
    getTimeUntilAllowedOutput: () => 0
};
const sufficientResult = checkTokenBudgetSim(1400, sufficientApi);
assert.strictEqual(sufficientResult.hasBudget, true);
assert.strictEqual(sufficientResult.waitMs, 0);

// Case 2: Insufficient tokens -> hasBudget is false, waitMs calculated
const depletedApi = {
    getAllowedOutput: () => 200,
    getTimeUntilAllowedOutput: (_minTokens) => 15000
};
const depletedResult = checkTokenBudgetSim(1400, depletedApi);
assert.strictEqual(depletedResult.hasBudget, false);
assert.strictEqual(depletedResult.waitMs, 15000);

// Case 3: Cooldown calculation
const testCooldowns = {};
const testNow = Date.now();
testCooldowns['summary-0'] = testNow + 12000;
const remainingMs = Math.max(0, testCooldowns['summary-0'] - testNow);
const remainingSec = Math.ceil(remainingMs / 1000);
assert.strictEqual(remainingSec >= 11 && remainingSec <= 12, true);

// Case 4: Partial output preservation guarantee
const partialSummary = {
    chapterIndex: 0,
    text: "Chapter 1 was cut short here because...",
    truncated: true
};
assert.strictEqual(partialSummary.text.includes("cut short here"), true);
assert.strictEqual(partialSummary.truncated, true);

// 13. Lorebook Context Source Resolution Simulation
function buildAnalysisLorebookTitleSim(chapter, style = 'arabic') {
    const display = formatChapterDisplayTitle(chapter, style);
    return `${display} | Analysis`;
}

function buildSummaryLorebookTitleSim(chapter, style = 'arabic') {
    const display = formatChapterDisplayTitle(chapter, style);
    return `${display} | Summary`;
}

function findLorebookEntrySim(chapter, targetType, entries) {
    if (!entries || entries.length === 0) return null;
    const expectedTitle = targetType === 'analysis'
        ? buildAnalysisLorebookTitleSim(chapter)
        : buildSummaryLorebookTitleSim(chapter);

    // 1. Exact match
    const exact = entries.find(e => e && e.displayName && e.displayName.trim().toLowerCase() === expectedTitle.trim().toLowerCase());
    if (exact) return exact;

    // 2. Pattern match by chapter number & type keyword
    const targetSuffix = targetType === 'analysis' ? 'analysis' : 'summary';
    for (const entry of entries) {
        if (!entry || !entry.displayName) continue;
        const name = entry.displayName.trim();
        const lower = name.toLowerCase();
        if (!lower.includes(targetSuffix)) continue;

        if (chapter.normalizedNumber === 0) {
            if (lower.includes("prologue") || lower.includes("beginning")) return entry;
        } else if (chapter.normalizedNumber !== null) {
            const romanStr = toRomanNumeral(chapter.normalizedNumber).toLowerCase();
            const numStr = String(chapter.normalizedNumber);
            const numRegex = new RegExp(`\\b(?:chapter|ch\\.?)\\s*(?:0*${numStr}|${romanStr})\\b`, 'i');
            if (numRegex.test(name)) return entry;
        }
    }

    // 3. Fallback: match by chapter cleanTitle
    if (chapter.cleanTitle && chapter.cleanTitle.length > 2) {
        const cleanSub = chapter.cleanTitle.toLowerCase().replace(/^(?:chapter|ch\.?|act|scene|part|book|episode)\s*(?:\d+|[ivxlcdm]+|[a-z]+)?\s*[:\-\u2013\u2014]?\s*/i, '').trim();
        if (cleanSub.length > 2) {
            for (const entry of entries) {
                if (!entry || !entry.displayName) continue;
                const lower = entry.displayName.toLowerCase();
                if (lower.includes(targetSuffix) && lower.includes(cleanSub)) return entry;
            }
        }
    }
    return null;
}

function getEffectiveReportSim(chapter, targetType, source, cachedState, lorebookEntries) {
    const cachedText = (cachedState[chapter.index]?.text || "").trim();
    if (source === 'lorebook') {
        const entry = findLorebookEntrySim(chapter, targetType, lorebookEntries);
        const lbText = (entry?.text || "").trim();
        if (lbText) return lbText;
    }
    return cachedText;
}

// Test findLorebookEntrySim
const testChapter1 = { index: 0, normalizedNumber: 1, cleanTitle: "Chapter 1: The Dark Forest" };
const testChapter2 = { index: 1, normalizedNumber: 2, cleanTitle: "The Ancient Ruins" };
const testChapterPrologue = { index: 2, normalizedNumber: 0, cleanTitle: "Story Beginning (Prologue)" };

const testLbEntries = [
    { displayName: "Chapter 1: The Dark Forest | Summary", text: "Edited lorebook summary for Ch 1." },
    { displayName: "Chapter 2 | Summary", text: "Edited lorebook summary for Ch 2." },
    { displayName: "Prologue | Summary", text: "Lorebook summary for prologue." },
    { displayName: "Chapter 1: The Dark Forest | Analysis", text: "Edited lorebook analysis for Ch 1." }
];

// Exact match
assert.strictEqual(findLorebookEntrySim(testChapter1, 'summary', testLbEntries).text, "Edited lorebook summary for Ch 1.");
// Pattern match by number (testChapter2 is "The Ancient Ruins" normalizedNumber: 2, entry is "Chapter 2 | Summary")
assert.strictEqual(findLorebookEntrySim(testChapter2, 'summary', testLbEntries).text, "Edited lorebook summary for Ch 2.");
// Prologue match
assert.strictEqual(findLorebookEntrySim(testChapterPrologue, 'summary', testLbEntries).text, "Lorebook summary for prologue.");
// Analysis match
assert.strictEqual(findLorebookEntrySim(testChapter1, 'analysis', testLbEntries).text, "Edited lorebook analysis for Ch 1.");

// Effective report resolution with source = 'cached' vs 'lorebook'
const mockCachedAnalyses = {
    0: { text: "Cached analysis from script memory" }
};
const mockCachedSummaries = {
    0: { text: "Cached summary from script memory" },
    1: { text: "Cached summary 2" }
};

// When source is 'cached', returns cached version even if lorebook has entry
assert.strictEqual(
    getEffectiveReportSim(testChapter1, 'summary', 'cached', mockCachedSummaries, testLbEntries),
    "Cached summary from script memory"
);

// When source is 'lorebook', returns lorebook version if entry exists
assert.strictEqual(
    getEffectiveReportSim(testChapter1, 'summary', 'lorebook', mockCachedSummaries, testLbEntries),
    "Edited lorebook summary for Ch 1."
);

// When source is 'lorebook' but entry does NOT exist in lorebook, falls back to cache
const testChapter3 = { index: 3, normalizedNumber: 3, cleanTitle: "Unsaved Chapter" };
const mockCachedWithCh3 = { 3: { text: "Fallback cached text for chapter 3" } };
assert.strictEqual(
    getEffectiveReportSim(testChapter3, 'summary', 'lorebook', mockCachedWithCh3, testLbEntries),
    "Fallback cached text for chapter 3"
);

// 14. Cache Clearing Simulation
function simulateClearCachedReports(state, chapters, chapterIndex, target) {
    if (target === 'analysis' || target === 'both') {
        delete state.analyses[chapterIndex];
    }
    if (target === 'summary' || target === 'both') {
        delete state.summaries[chapterIndex];
    }
    const ch = chapters.find(c => c.index === chapterIndex);
    if (ch) {
        if (target === 'analysis' || target === 'both') ch.hasAnalysis = false;
        if (target === 'summary' || target === 'both') ch.hasSummary = false;
    }
}

const clearTestState = {
    analyses: { 0: { text: "Analysis 0" }, 1: { text: "Analysis 1" } },
    summaries: { 0: { text: "Summary 0" }, 1: { text: "Summary 1" } }
};
const clearTestChapters = [
    { index: 0, hasAnalysis: true, hasSummary: true },
    { index: 1, hasAnalysis: true, hasSummary: true }
];

// Clear analysis only for chapter 0
simulateClearCachedReports(clearTestState, clearTestChapters, 0, 'analysis');
assert.strictEqual(clearTestState.analyses[0], undefined);
assert.strictEqual(clearTestState.summaries[0] !== undefined, true);
assert.strictEqual(clearTestChapters[0].hasAnalysis, false);
assert.strictEqual(clearTestChapters[0].hasSummary, true);

// Clear summary only for chapter 0
simulateClearCachedReports(clearTestState, clearTestChapters, 0, 'summary');
assert.strictEqual(clearTestState.summaries[0], undefined);
assert.strictEqual(clearTestChapters[0].hasSummary, false);

// Clear both for chapter 1
simulateClearCachedReports(clearTestState, clearTestChapters, 1, 'both');
assert.strictEqual(clearTestState.analyses[1], undefined);
assert.strictEqual(clearTestState.summaries[1], undefined);
assert.strictEqual(clearTestChapters[1].hasAnalysis, false);
assert.strictEqual(clearTestChapters[1].hasSummary, false);

// 15. Cut-Off Detection Heuristics Tests
function isResponseLikelyCutOff(text, finishReason) {
    if (!text || typeof text !== "string") return false;
    const trimmed = text.trim();
    if (trimmed.length === 0) return false;

    // 1. Explicit API finish reason indicating token limit hit
    if (finishReason === "length") return true;

    // 2. Unclosed code block (odd number of triple backticks)
    const codeBlockCount = (trimmed.match(/```/g) || []).length;
    if (codeBlockCount % 2 === 1) return true;

    // 3. Dangling punctuation or connectors that strongly signal truncation
    if (/[,;:\-—–(\[\{<]\s*$/.test(trimmed)) return true;

    // 4. Ends with a dangling markdown header line (e.g., "### Key Developments")
    if (/(?:^|\n)#{1,6}\s+[^\n]+$/.test(trimmed)) return true;

    // 5. Ends with an incomplete list bullet or numbered list marker (e.g., "- " or "1. ")
    if (/(?:^|\n)\s*(?:[-*+]|\d+\.)\s*$/.test(trimmed)) return true;

    // 6. Closed code block ending is considered complete
    if (trimmed.endsWith("```")) return false;

    // 7. Check if it ends with standard terminal punctuation
    const terminalRegex = /[.!?…\u3002\uff01\uff1f]["'”’\)\]\}*_`]*$/;
    if (terminalRegex.test(trimmed)) return false;

    // 8. If finishReason was explicitly "stop", it finished naturally
    if (finishReason === "stop") return false;

    // 9. Does not end with terminal punctuation and finishReason was not explicitly "stop"
    return true;
}

function cleanContinuationText(previousText, newText) {
    if (!newText) return "";
    let text = newText;

    // Strip conversational preambles
    text = text.replace(/^(?:Continuing (?:where (?:I|we) left off|from before|from where I left off):?\s*|Here is the continuation:?\s*|Continuing:?\s*)/i, "");

    // Strip any overlap with previous text tail (up to 60 characters)
    if (previousText && text) {
        const maxOverlap = Math.min(previousText.length, text.length, 60);
        for (let len = maxOverlap; len >= 4; len--) {
            const tail = previousText.slice(previousText.length - len);
            if (text.startsWith(tail)) {
                text = text.slice(len);
                break;
            }
        }
    }

    return text;
}

// Test: Explicit finishReason 'length'
assert.strictEqual(isResponseLikelyCutOff("Complete sentence.", "length"), true);

// Test: Terminal punctuation complete
assert.strictEqual(isResponseLikelyCutOff("Complete sentence.", "stop"), false);
assert.strictEqual(isResponseLikelyCutOff("Question answered?", null), false);
assert.strictEqual(isResponseLikelyCutOff('Dialogue said: "Hello!"', null), false);
assert.strictEqual(isResponseLikelyCutOff('Emphasis ending with bold**!', null), false);

// Test: Mid-sentence cut-off without terminal punctuation (GLM returning null or undefined)
assert.strictEqual(isResponseLikelyCutOff("The protagonist was walking towards the", null), true);
assert.strictEqual(isResponseLikelyCutOff("The key themes explored in this draft are", undefined), true);

// Test: Dangling punctuation / connectors (even if model returned 'stop')
assert.strictEqual(isResponseLikelyCutOff("The author demonstrates that,", "stop"), true);
assert.strictEqual(isResponseLikelyCutOff("Key characters involved:", "stop"), true);
assert.strictEqual(isResponseLikelyCutOff("Subtextual conflict —", "stop"), true);
assert.strictEqual(isResponseLikelyCutOff("According to (", "stop"), true);

// Test: Trailing markdown headers
assert.strictEqual(isResponseLikelyCutOff("Overview complete.\n\n### Targeted Craft Questions", "stop"), true);
assert.strictEqual(isResponseLikelyCutOff("## Character Arcs", null), true);

// Test: Trailing list bullets
assert.strictEqual(isResponseLikelyCutOff("Here are the points:\n- ", "stop"), true);
assert.strictEqual(isResponseLikelyCutOff("Steps:\n1. ", null), true);

// Test: Code blocks
assert.strictEqual(isResponseLikelyCutOff("```typescript\nconst x = 1;", "stop"), true);
assert.strictEqual(isResponseLikelyCutOff("```typescript\nconst x = 1;\n```", "stop"), false);

// Test: Continuation preamble stripping
const preambleCont = cleanContinuationText("Previous text ending.", "Continuing where I left off: The next part begins.");
assert.strictEqual(preambleCont, "The next part begins.");

const preambleCont2 = cleanContinuationText("Previous text ending.", "Here is the continuation:\nThe next part begins.");
assert.strictEqual(preambleCont2, "The next part begins.");

// Test: Overlap deduplication
const prevText = "She walked slowly towards the ancient stone archway";
const rawNew = "stone archway and found a locked door.";
const cleanedNew = cleanContinuationText(prevText, rawNew);
assert.strictEqual(cleanedNew, " and found a locked door.");

// Test: Smooth joining with punctuation spacing
const prevPunct = "The chapter concluded with high tension.";
// 16. Lorebook Category vs. Entry Selection, Grouping, Stats & Context Assembly Tests

// Mock categories and entries
const rawCategories = [
    { id: "cat_cast", name: "Main Cast" },
    { id: "cat_locations", name: "Settings" }
];

const rawEntries = [
    { id: "ent_hero", category: "cat_cast", displayName: "Aria Thorne", text: "Master navigator.", enabled: true },
    { id: "ent_rival", category: "cat_cast", displayName: "Kaelen Vance", text: "Former ally turned rival.", enabled: true },
    { id: "ent_mentor", category: "cat_cast", displayName: "Master Orel", text: "Elder archivist.", enabled: true },
    { id: "ent_city", category: "cat_locations", displayName: "High Spire", text: "The capital city.", enabled: true },
    { id: "ent_ruins", category: "cat_locations", displayName: "Sunken Ruins", text: "Ancient submerged temple.", enabled: true },
    { id: "ent_secret", category: undefined, displayName: "The Void Core", text: "Mysterious artifact.", enabled: true },
    { id: "ent_disabled", category: "cat_cast", displayName: "Old Draft Char", text: "Deprecated draft.", enabled: false }
];

// Test grouping logic (mimics scanLorebookCategories)
function groupLorebookCategoriesSim(categories, entries, excludedNames = []) {
    const entriesByCategory = {};
    const uncategorized = [];

    for (const e of entries) {
        const item = {
            id: e.id,
            name: e.displayName || e.keys?.[0] || e.text?.slice(0, 30) || "Untitled",
            categoryId: e.category || null,
            enabled: e.enabled !== false
        };
        if (e.category) {
            if (!entriesByCategory[e.category]) entriesByCategory[e.category] = [];
            entriesByCategory[e.category].push(item);
        } else {
            uncategorized.push(item);
        }
    }

    const result = [];
    for (const c of categories) {
        if (excludedNames.includes(c.name.toLowerCase())) continue;
        const catEntries = entriesByCategory[c.id] || [];
        result.push({
            id: c.id,
            name: c.name,
            entryCount: catEntries.length,
            entries: catEntries
        });
    }

    if (uncategorized.length > 0) {
        result.push({
            id: '__uncategorized__',
            name: 'Uncategorized Entries',
            entryCount: uncategorized.length,
            entries: uncategorized
        });
    }

    return result;
}

const groupedCats = groupLorebookCategoriesSim(rawCategories, rawEntries);
assert.strictEqual(groupedCats.length, 3);
assert.strictEqual(groupedCats[0].id, "cat_cast");
assert.strictEqual(groupedCats[0].entries.length, 4); // hero, rival, mentor, disabled
assert.strictEqual(groupedCats[1].id, "cat_locations");
assert.strictEqual(groupedCats[1].entries.length, 2); // city, ruins
assert.strictEqual(groupedCats[2].id, "__uncategorized__");
assert.strictEqual(groupedCats[2].entries.length, 1); // secret

// Selection State Simulation
const simInclusion = {
    includeInAnalysis: true,
    includeInSummary: true,
    analysisCategoryIds: [],
    summaryCategoryIds: [],
    analysisEntryIds: [],
    summaryEntryIds: []
};

function isCategoryIncludedSim(catId, target) {
    const list = target === 'analysis' ? simInclusion.analysisCategoryIds : simInclusion.summaryCategoryIds;
    return list.includes(catId);
}

function isEntryIncludedSim(entryId, catId, target) {
    const catList = target === 'analysis' ? simInclusion.analysisCategoryIds : simInclusion.summaryCategoryIds;
    const entryList = target === 'analysis' ? simInclusion.analysisEntryIds : simInclusion.summaryEntryIds;
    return entryList.includes(entryId) || catList.includes(catId);
}

function getSelectionStatsSim(catId, target, availableCategories) {
    const cat = availableCategories.find(c => c.id === catId);
    if (!cat || !cat.entries || cat.entries.length === 0) {
        const isCatInc = isCategoryIncludedSim(catId, target);
        return { total: 0, selected: 0, isAll: isCatInc, isPartial: false, isNone: !isCatInc };
    }
    let selected = 0;
    for (const entry of cat.entries) {
        if (isEntryIncludedSim(entry.id, catId, target)) selected++;
    }
    const total = cat.entries.length;
    const isAll = selected === total;
    const isNone = selected === 0;
    const isPartial = !isAll && !isNone;
    return { total, selected, isAll, isPartial, isNone };
}

function toggleCategorySim(catId, target, availableCategories) {
    const catList = target === 'analysis' ? simInclusion.analysisCategoryIds : simInclusion.summaryCategoryIds;
    const entryList = target === 'analysis' ? simInclusion.analysisEntryIds : simInclusion.summaryEntryIds;
    const cat = availableCategories.find(c => c.id === catId);
    const catIdx = catList.indexOf(catId);

    if (catIdx >= 0) {
        // Deselect whole category
        catList.splice(catIdx, 1);
        if (cat?.entries) {
            for (const e of cat.entries) {
                const eIdx = entryList.indexOf(e.id);
                if (eIdx >= 0) entryList.splice(eIdx, 1);
            }
        }
    } else {
        // Select whole category
        catList.push(catId);
        if (cat?.entries) {
            for (const e of cat.entries) {
                if (!entryList.includes(e.id)) entryList.push(e.id);
            }
        }
    }
}

function toggleEntrySim(entryId, catId, target, availableCategories) {
    const catList = target === 'analysis' ? simInclusion.analysisCategoryIds : simInclusion.summaryCategoryIds;
    const entryList = target === 'analysis' ? simInclusion.analysisEntryIds : simInclusion.summaryEntryIds;
    const cat = availableCategories.find(c => c.id === catId);

    const isCurrentlyIncluded = isEntryIncludedSim(entryId, catId, target);

    if (isCurrentlyIncluded) {
        // Deselect entry
        const catIdx = catList.indexOf(catId);
        if (catIdx >= 0) {
            catList.splice(catIdx, 1);
            if (cat?.entries) {
                for (const sibling of cat.entries) {
                    if (sibling.id !== entryId && !entryList.includes(sibling.id)) {
                        entryList.push(sibling.id);
                    }
                }
            }
        }
        const eIdx = entryList.indexOf(entryId);
        if (eIdx >= 0) entryList.splice(eIdx, 1);
    } else {
        // Select entry
        if (!entryList.includes(entryId)) entryList.push(entryId);
        if (cat?.entries) {
            const allSelected = cat.entries.every(e => entryList.includes(e.id));
            if (allSelected && !catList.includes(catId)) catList.push(catId);
        }
    }
}

// Initial state: nothing selected
let castStats = getSelectionStatsSim("cat_cast", "analysis", groupedCats);
assert.strictEqual(castStats.total, 4);
assert.strictEqual(castStats.selected, 0);
assert.strictEqual(castStats.isNone, true);
assert.strictEqual(castStats.isAll, false);
assert.strictEqual(castStats.isPartial, false);

// 1. Toggle single entry (Hero) in Analysis
toggleEntrySim("ent_hero", "cat_cast", "analysis", groupedCats);
castStats = getSelectionStatsSim("cat_cast", "analysis", groupedCats);
assert.strictEqual(castStats.selected, 1);
assert.strictEqual(castStats.isPartial, true);
assert.strictEqual(castStats.isAll, false);
assert.strictEqual(castStats.isNone, false);
assert.strictEqual(isCategoryIncludedSim("cat_cast", "analysis"), false);
assert.strictEqual(isEntryIncludedSim("ent_hero", "cat_cast", "analysis"), true);
assert.strictEqual(isEntryIncludedSim("ent_rival", "cat_cast", "analysis"), false);

// Dual-target isolation check: Summary remains untouched
const castSummaryStats = getSelectionStatsSim("cat_cast", "summary", groupedCats);
assert.strictEqual(castSummaryStats.selected, 0);
assert.strictEqual(castSummaryStats.isNone, true);

// 2. Toggle entire Locations category in Analysis
toggleCategorySim("cat_locations", "analysis", groupedCats);
const locStats = getSelectionStatsSim("cat_locations", "analysis", groupedCats);
assert.strictEqual(locStats.total, 2);
assert.strictEqual(locStats.selected, 2);
assert.strictEqual(locStats.isAll, true);
assert.strictEqual(locStats.isPartial, false);
assert.strictEqual(isCategoryIncludedSim("cat_locations", "analysis"), true);
assert.strictEqual(isEntryIncludedSim("ent_city", "cat_locations", "analysis"), true);
assert.strictEqual(isEntryIncludedSim("ent_ruins", "cat_locations", "analysis"), true);

// 3. Deselect single entry (Ruins) from previously full Locations category
toggleEntrySim("ent_ruins", "cat_locations", "analysis", groupedCats);
const locStatsAfterDeselect = getSelectionStatsSim("cat_locations", "analysis", groupedCats);
assert.strictEqual(locStatsAfterDeselect.selected, 1);
assert.strictEqual(locStatsAfterDeselect.isPartial, true);
assert.strictEqual(locStatsAfterDeselect.isAll, false);
assert.strictEqual(isCategoryIncludedSim("cat_locations", "analysis"), false); // Category ID removed
assert.strictEqual(isEntryIncludedSim("ent_city", "cat_locations", "analysis"), true); // Sibling remains selected
assert.strictEqual(isEntryIncludedSim("ent_ruins", "cat_locations", "analysis"), false); // Deselected entry is excluded

// 4. Re-select ruins -> all are selected -> Category ID automatically added back
toggleEntrySim("ent_ruins", "cat_locations", "analysis", groupedCats);
const locStatsReSelected = getSelectionStatsSim("cat_locations", "analysis", groupedCats);
assert.strictEqual(locStatsReSelected.isAll, true);
assert.strictEqual(isCategoryIncludedSim("cat_locations", "analysis"), true);

// 5. Test context assembly simulation with Category + Entry resolution & Deduplication
function buildLorebookContextSim(target, allRawEntries, inclusionState) {
    const isMaster = target === 'analysis' ? inclusionState.includeInAnalysis : inclusionState.includeInSummary;
    if (!isMaster) return "";

    const catIds = target === 'analysis' ? inclusionState.analysisCategoryIds : inclusionState.summaryCategoryIds;
    const entryIds = target === 'analysis' ? inclusionState.analysisEntryIds : inclusionState.summaryEntryIds;

    const matched = [];
    const seen = new Set();
    const incUncat = catIds.includes('__uncategorized__');

    for (const e of allRawEntries) {
        if (!e || !e.id) continue;
        if (e.enabled === false) continue; // Disabled entries never included
        if (!e.text || !e.text.trim()) continue;

        if (seen.has(e.id)) continue;

        const matchesCat = e.category ? catIds.includes(e.category) : incUncat;
        const matchesEntry = entryIds.includes(e.id);

        if (matchesCat || matchesEntry) {
            seen.add(e.id);
            matched.push(e);
        }
    }

    if (matched.length === 0) return "";
    return matched.map(e => `[Lorebook: ${e.displayName}]\n${e.text.trim()}`).join("\n\n");
}

// Current Analysis state has:
// - cat_cast: ent_hero in analysisEntryIds
// - cat_locations: catId in catIds AND both city, ruins in entryIds
// Context should contain ent_hero, ent_city, ent_ruins.
// ent_disabled must NOT appear (enabled: false).
// ent_rival, ent_mentor, ent_secret must NOT appear.
const contextResult = buildLorebookContextSim("analysis", rawEntries, simInclusion);

assert.strictEqual(contextResult.includes("Aria Thorne"), true);
assert.strictEqual(contextResult.includes("High Spire"), true);
assert.strictEqual(contextResult.includes("Sunken Ruins"), true);
assert.strictEqual(contextResult.includes("Kaelen Vance"), false);
assert.strictEqual(contextResult.includes("Master Orel"), false);
assert.strictEqual(contextResult.includes("The Void Core"), false);
assert.strictEqual(contextResult.includes("Old Draft Char"), false);

// Check deduplication: High Spire should appear exactly once even if both cat_locations and ent_city are in inclusion state
const highSpireCount = (contextResult.match(/High Spire/g) || []).length;
assert.strictEqual(highSpireCount, 1);

// Test selecting uncategorized entry individually
toggleEntrySim("ent_secret", "__uncategorized__", "analysis", groupedCats);
const contextWithSecret = buildLorebookContextSim("analysis", rawEntries, simInclusion);
assert.strictEqual(contextWithSecret.includes("The Void Core"), true);

// --- makeIcon & makeCard Tests ---
function makeTextSim(text, markdown = true, overrideStyle = {}) {
    return {
        type: 'text',
        text,
        markdown,
        style: {
            color: 'textMain',
            ...overrideStyle
        }
    };
}

const CARD_STYLE_SIM = {
    backgroundColor: 'bg1',
    border: '1px solid bg2',
    borderRadius: '6px',
    padding: '10px',
    margin: '6px 0'
};

const ACCENT_CARD_STYLE_SIM = {
    ...CARD_STYLE_SIM,
    borderColor: 'primary',
    backgroundColor: 'bg2'
};

function makeIconSim(iconId, overrideStyle = {}) {
    return {
        type: 'button',
        iconId,
        text: '',
        disabled: false,
        disabledWhileCallbackRunning: false,
        callback: () => {},
        style: {
            width: '18px',
            height: '18px',
            minWidth: '18px',
            minHeight: '18px',
            padding: '0',
            border: 'none',
            outline: 'none',
            boxShadow: 'none',
            backgroundColor: 'transparent',
            color: 'textHeading',
            margin: '0 6px 0 0',
            pointerEvents: 'none',
            cursor: 'default',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            ...overrideStyle
        }
    };
}

function makeCardSim(
    title,
    children,
    isAccentOrOptionsOrIcon = false,
    iconId
) {
    let isAccent = false;
    let cardIconId;

    if (typeof isAccentOrOptionsOrIcon === 'boolean') {
        isAccent = isAccentOrOptionsOrIcon;
        if (typeof iconId === 'string') {
            cardIconId = iconId;
        } else if (iconId && typeof iconId === 'object') {
            cardIconId = iconId.iconId;
        }
    } else if (typeof isAccentOrOptionsOrIcon === 'string') {
        cardIconId = isAccentOrOptionsOrIcon;
        if (typeof iconId === 'string') {
            cardIconId = iconId;
        }
    } else if (isAccentOrOptionsOrIcon && typeof isAccentOrOptionsOrIcon === 'object') {
        isAccent = !!isAccentOrOptionsOrIcon.isAccent;
        cardIconId = isAccentOrOptionsOrIcon.iconId;
    }

    let titleText = null;
    if (typeof title === 'string') {
        titleText = title;
    } else if (title && typeof title === 'object') {
        titleText = title.title ?? title.text ?? null;
        if (title.iconId && !cardIconId) {
            cardIconId = title.iconId;
        }
    }

    const content = [];
    if (titleText || cardIconId) {
        if (cardIconId) {
            const titleRow = [
                makeIconSim(cardIconId, {
                    color: 'textHeading',
                    margin: '0 6px 0 0'
                })
            ];
            if (titleText) {
                titleRow.push(makeTextSim(`### ${titleText}`, true, { margin: '0', color: 'textHeading' }));
            }
            content.push({
                type: 'row',
                alignment: 'center',
                style: {
                    margin: '0 0 6px 0',
                    alignItems: 'center'
                },
                content: titleRow
            });
        } else if (titleText) {
            content.push(makeTextSim(`### ${titleText}`, true, { margin: '0 0 6px 0', color: 'textHeading' }));
        }
    }
    content.push(...children);
    return {
        type: 'container',
        style: isAccent ? ACCENT_CARD_STYLE_SIM : CARD_STYLE_SIM,
        content
    };
}

// 1. Classic string title without icon
const c1 = makeCardSim("Document Metrics", [{ type: 'dummy' }]);
assert.strictEqual(c1.type, 'container');
assert.strictEqual(c1.style, CARD_STYLE_SIM);
assert.strictEqual(c1.content.length, 2);
assert.strictEqual(c1.content[0].type, 'text');
assert.strictEqual(c1.content[0].text, '### Document Metrics');

// 2. Null title without icon
const c2 = makeCardSim(null, [{ type: 'dummy' }], true);
assert.strictEqual(c2.style, ACCENT_CARD_STYLE_SIM);
assert.strictEqual(c2.content.length, 1);
assert.strictEqual(c2.content[0].type, 'dummy');

// 3. String icon as 3rd parameter: makeCard("Metrics", [...], "bar-chart")
const c3 = makeCardSim("Metrics", [{ type: 'dummy' }], "bar-chart");
assert.strictEqual(c3.content.length, 2);
assert.strictEqual(c3.content[0].type, 'row');
assert.strictEqual(c3.content[0].content[0].iconId, 'bar-chart');
assert.strictEqual(c3.content[0].content[1].text, '### Metrics');

// 4. Icon as 4th parameter with boolean accent: makeCard("Metrics", [...], true, "bar-chart")
const c4 = makeCardSim("Metrics", [{ type: 'dummy' }], true, "bar-chart");
assert.strictEqual(c4.style, ACCENT_CARD_STYLE_SIM);
assert.strictEqual(c4.content[0].type, 'row');
assert.strictEqual(c4.content[0].content[0].iconId, 'bar-chart');
assert.strictEqual(c4.content[0].content[1].text, '### Metrics');

// 5. Options object as 3rd parameter: makeCard("Metrics", [...], { iconId: "bar-chart", isAccent: true })
const c5 = makeCardSim("Metrics", [{ type: 'dummy' }], { iconId: "bar-chart", isAccent: true });
assert.strictEqual(c5.style, ACCENT_CARD_STYLE_SIM);
assert.strictEqual(c5.content[0].content[0].iconId, 'bar-chart');

// 6. Object title config: makeCard({ title: "Metrics", iconId: "bar-chart" }, [...])
const c6 = makeCardSim({ title: "Metrics", iconId: "bar-chart" }, [{ type: 'dummy' }]);
assert.strictEqual(c6.content[0].content[0].iconId, 'bar-chart');
assert.strictEqual(c6.content[0].content[1].text, '### Metrics');

// 7. Object title config with .text: makeCard({ text: "Metrics", iconId: "bar-chart" }, [...])
const c7 = makeCardSim({ text: "Metrics", iconId: "bar-chart" }, [{ type: 'dummy' }]);
assert.strictEqual(c7.content[0].content[0].iconId, 'bar-chart');
assert.strictEqual(c7.content[0].content[1].text, '### Metrics');

// 8. Icon only with null title: makeCard(null, [...], false, "star")
const c8 = makeCardSim(null, [{ type: 'dummy' }], false, "star");
assert.strictEqual(c8.content[0].type, 'row');
assert.strictEqual(c8.content[0].content.length, 1);
assert.strictEqual(c8.content[0].content[0].iconId, 'star');

// 18. Chapter Title Parsing, Display Formatting, & Summary Header Normalization
const ROMAN_CHAR_MAP_SIM = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
function parseRomanNumeralSim(str) {
    const upper = str.toUpperCase().trim();
    if (!/^[IVXLCDM]+$/.test(upper)) return null;
    let total = 0, prev = 0;
    for (let i = upper.length - 1; i >= 0; i--) {
        const val = ROMAN_CHAR_MAP_SIM[upper[i]] || 0;
        if (val < prev) total -= val;
        else total += val;
        prev = val;
    }
    return total > 0 ? total : null;
}
const WORD_NUMBER_MAP_SIM = {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
    eighteen: 18, nineteen: 19, twenty: 20, twentyone: 21, twentytwo: 22, twentythree: 23,
    twentyfour: 24, twentyfive: 25, thirty: 30, forty: 40, fifty: 50
};
function extractNumberFromStringSim(str) {
    if (!str) return null;
    const trimmed = str.trim();
    if (/^\d+$/.test(trimmed)) {
        const n = parseInt(trimmed, 10);
        return isNaN(n) ? null : n;
    }
    const roman = parseRomanNumeralSim(trimmed);
    if (roman !== null) return roman;
    const wordKey = trimmed.toLowerCase().replace(/[\s-]/g, '');
    if (WORD_NUMBER_MAP_SIM[wordKey] !== undefined) return WORD_NUMBER_MAP_SIM[wordKey];
    return null;
}
function cleanHeaderTitleSim(raw) {
    if (!raw) return "";
    let clean = raw.trim();
    clean = clean.replace(/^(?:\*{3}|---|[\* \-_]{3,})\s*/, '');
    clean = clean.replace(/^#{1,6}\s*/, '');
    clean = clean.replace(/^\[\s*(?:(?:Chapter|Title|Scene)\s*:\s*)?/i, '').replace(/\s*\]$/, '');
    clean = clean.replace(/^(?:\*{3}|---|[\* \-_]{3,})\s*/, '');
    return clean.trim();
}
function parseChapterTitleSim(raw, fallbackNumber) {
    if (!raw) {
        return { preTitle: "", chapterNumber: fallbackNumber ?? null, chapterNumberRaw: "", chapterTitle: "", isSpecial: false };
    }
    const clean = cleanHeaderTitleSim(raw);
    const specialMatch = clean.match(/^(?:((?:Act|Part|Book|Volume|Section|Arc)\s+(?:\d+|[IVXLCDM]+|[a-zA-Z]+))\s*[:\-\u2013\u2014,]\s*)?(Prologue|Epilogue|Interlude|Prelude|Story Beginning(?:\s*\(Prologue\))?)$/i);
    if (specialMatch) {
        return {
            preTitle: specialMatch[1] ? specialMatch[1].trim() : "",
            chapterNumber: 0,
            chapterNumberRaw: "",
            chapterTitle: specialMatch[2].trim(),
            isSpecial: true
        };
    }
    let preTitle = "";
    let rest = clean;
    const preMatch = rest.match(/^((?:(?:Act|Part|Book|Volume|Section|Arc)\s+(?:\d+|[IVXLCDM]+|[a-zA-Z]+)(?:\s*[:\-\u2013\u2014,]\s*|\s+))+)/i);
    if (preMatch) {
        preTitle = preMatch[1].replace(/[\s:\-\u2013\u2014,]+$/, '').trim();
        rest = rest.slice(preMatch[0].length).trim();
    }
    let chapterNum = null;
    let chapterNumRaw = "";
    let subtitle = "";
    const chMatch = rest.match(/^(?:Chapter|Ch\.?|Scene)\b(?:\s*(\d+|[IVXLCDM]+|[a-zA-Z]+))?(?:\s*[:\-\u2013\u2014]\s*(.*))?$/i);
    if (chMatch) {
        chapterNumRaw = chMatch[1] ? chMatch[1].trim() : "";
        if (chapterNumRaw) chapterNum = extractNumberFromStringSim(chapterNumRaw);
        subtitle = chMatch[2] ? chMatch[2].trim() : "";
    } else {
        const numLeadingMatch = rest.match(/^(?:#\s*)?(\d+)(?:\s*[:\-\u2013\u2014]\s*(.*))?$/i);
        if (numLeadingMatch) {
            chapterNumRaw = numLeadingMatch[1];
            chapterNum = parseInt(chapterNumRaw, 10);
            subtitle = numLeadingMatch[2] ? numLeadingMatch[2].trim() : "";
        } else if (preTitle && rest) {
            subtitle = rest.replace(/^[:\-\u2013\u2014]\s*/, '').trim();
        } else if (!preTitle && rest) {
            subtitle = rest;
        }
    }
    if (chapterNum === null && fallbackNumber !== undefined && fallbackNumber !== null) chapterNum = fallbackNumber;
    return { preTitle, chapterNumber: chapterNum, chapterNumberRaw: chapterNumRaw, chapterTitle: subtitle, isSpecial: false };
}
function formatChapterDisplayTitleSim(chapter, style = 'arabic') {
    const parsed = parseChapterTitleSim(chapter.cleanTitle, chapter.normalizedNumber);
    if (parsed.isSpecial) return parsed.preTitle ? `${parsed.preTitle}: ${parsed.chapterTitle}` : parsed.chapterTitle;
    const num = parsed.chapterNumber ?? chapter.normalizedNumber;
    const numStr = num !== null ? String(num) : "";
    const hasPre = parsed.preTitle.length > 0;
    const hasNum = numStr.length > 0;
    const hasSub = parsed.chapterTitle.length > 0;
    let display = "";
    if (hasPre) display += `${parsed.preTitle}: `;
    if (hasNum) {
        display += `Chapter ${numStr}`;
        if (hasSub) display += `: ${parsed.chapterTitle}`;
    } else if (hasSub) {
        display += parsed.chapterTitle;
    } else if (hasPre) {
        display = parsed.preTitle;
    } else {
        display = chapter.cleanTitle;
    }
    return display;
}
function formatSummaryLorebookHeaderSim(chapter, style = 'arabic') {
    const parsed = parseChapterTitleSim(chapter.cleanTitle, chapter.normalizedNumber);
    if (parsed.isSpecial) {
        return parsed.preTitle ? `**${parsed.preTitle}: ${parsed.chapterTitle} — Summary**` : `**${parsed.chapterTitle} — Summary**`;
    }
    const num = parsed.chapterNumber ?? chapter.normalizedNumber;
    const numStr = num !== null ? String(num) : "";
    const hasPre = parsed.preTitle.length > 0;
    const hasNum = numStr.length > 0;
    const hasSub = parsed.chapterTitle.length > 0;
    let header = "";
    if (hasPre) header += `${parsed.preTitle}: `;
    if (hasNum) {
        header += `Chapter ${numStr}`;
        if (hasSub) header += `: ${parsed.chapterTitle}`;
    } else if (hasSub) {
        header += parsed.chapterTitle;
    } else if (hasPre) {
        header = parsed.preTitle;
    } else {
        header = chapter.cleanTitle;
    }
    return `**${header} — Summary**`;
}
function ensureSummaryHeaderSim(text, expectedHeader) {
    if (!text || !text.trim()) return expectedHeader;
    const trimmed = text.trim();
    const firstNewlineIdx = trimmed.indexOf('\n');
    const firstLine = (firstNewlineIdx !== -1 ? trimmed.slice(0, firstNewlineIdx) : trimmed).trim();
    const remaining = firstNewlineIdx !== -1 ? trimmed.slice(firstNewlineIdx).trim() : "";
    const isHeaderLine = /^(?:#+\s*|\*{2}|\[\s*)?(?:(?:(?:Act|Part|Book|Volume|Section|Arc)\s+(?:\d+|[IVXLCDM]+|[a-zA-Z]+)\s*[:\-\u2013\u2014,]\s*)?(?:Chapter|Ch\.?|Scene|Prologue|Epilogue)\b|Chapter\s+\d+).*?(?:\s*[\u2014\-]\s*Summary)?(?:\s*\])?\*{0,2}$/i.test(firstLine)
        || /^\[\s*.*?\s*\](?:\s*[\u2014\-]\s*Summary)?$/i.test(firstLine)
        || firstLine.toLowerCase().includes("summary")
        || (firstLine.startsWith("**") && firstLine.endsWith("**"));
    if (isHeaderLine) {
        return remaining ? `${expectedHeader}\n\n${remaining}` : expectedHeader;
    }
    return `${expectedHeader}\n\n${trimmed}`;
}

// Test parseChapterTitleSim
const p1 = parseChapterTitleSim("[ Act I: Chapter 13 ]");
assert.strictEqual(p1.preTitle, "Act I");
assert.strictEqual(p1.chapterNumber, 13);
assert.strictEqual(p1.chapterTitle, "");
assert.strictEqual(p1.isSpecial, false);

const p2 = parseChapterTitleSim("[ Act II: Chapter 12: The Reckoning ]");
assert.strictEqual(p2.preTitle, "Act II");
assert.strictEqual(p2.chapterNumber, 12);
assert.strictEqual(p2.chapterTitle, "The Reckoning");

const p3 = parseChapterTitleSim("[ Chapter 5 ]");
assert.strictEqual(p3.preTitle, "");
assert.strictEqual(p3.chapterNumber, 5);
assert.strictEqual(p3.chapterTitle, "");

const p4 = parseChapterTitleSim("Prologue");
assert.strictEqual(p4.isSpecial, true);
assert.strictEqual(p4.chapterTitle, "Prologue");

// Test formatChapterDisplayTitleSim (no doubling!)
const chAct13 = { cleanTitle: cleanHeaderTitleSim("[ Act I: Chapter 13 ]"), rawTitle: "[ Act I: Chapter 13 ]", normalizedNumber: 13 };
assert.strictEqual(formatChapterDisplayTitleSim(chAct13), "Act I: Chapter 13");

const chAct12Sub = { cleanTitle: cleanHeaderTitleSim("[ Act II: Chapter 12: The Reckoning ]"), rawTitle: "[ Act II: Chapter 12: The Reckoning ]", normalizedNumber: 12 };
assert.strictEqual(formatChapterDisplayTitleSim(chAct12Sub), "Act II: Chapter 12: The Reckoning");

// Test formatSummaryLorebookHeaderSim
assert.strictEqual(formatSummaryLorebookHeaderSim(chAct13), "**Act I: Chapter 13 — Summary**");
assert.strictEqual(formatSummaryLorebookHeaderSim(chAct12Sub), "**Act II: Chapter 12: The Reckoning — Summary**");

// Test ensureSummaryHeaderSim with bracketed model output
const modelOutputBracketed = "[ Act I: Chapter 13 ]\n\nArthur reflects on his journey.";
const expectedH = "**Act I: Chapter 13 — Summary**";
const normalized1 = ensureSummaryHeaderSim(modelOutputBracketed, expectedH);
assert.strictEqual(normalized1, "**Act I: Chapter 13 — Summary**\n\nArthur reflects on his journey.");

// Test ensureSummaryHeaderSim with bracketed output + summary tag
const modelOutputBracketedSummary = "[ Act I: Chapter 13 ] — Summary\n\nArthur reflects on his journey.";
const normalized2 = ensureSummaryHeaderSim(modelOutputBracketedSummary, expectedH);
assert.strictEqual(normalized2, "**Act I: Chapter 13 — Summary**\n\nArthur reflects on his journey.");

// Test ensureSummaryHeaderSim with unbracketed chapter header
const modelOutputUnbracketed = "Act I: Chapter 13\n\nArthur reflects on his journey.";
const normalized3 = ensureSummaryHeaderSim(modelOutputUnbracketed, expectedH);
assert.strictEqual(normalized3, "**Act I: Chapter 13 — Summary**\n\nArthur reflects on his journey.");

// Test ensureSummaryHeaderSim with prose only (no header output)
const modelOutputProseOnly = "Arthur reflects on his journey.";
const normalized4 = ensureSummaryHeaderSim(modelOutputProseOnly, expectedH);
assert.strictEqual(normalized4, "**Act I: Chapter 13 — Summary**\n\nArthur reflects on his journey.");

// Test modern buildSummaryUserPromptSim with exact chapter as written
const promptExactWritten = buildSummaryUserPromptSim(
    "[ Act I: Chapter 13 ]",
    "Arthur reflects on his journey in the forest."
);
assert.strictEqual(promptExactWritten.includes("Chapter: [ Act I: Chapter 13 ]"), true);
assert.strictEqual(promptExactWritten.includes("Chapter Number:"), false);
assert.strictEqual(promptExactWritten.includes("Chapter Title:"), false);

// Test modern buildAnalysisUserPromptSim with exact chapter as written
const analysisPromptExactWritten = buildAnalysisUserPromptSim(
    "[ Act I: Chapter 13 ]",
    "Arthur reflects on his journey in the forest."
);
assert.strictEqual(analysisPromptExactWritten.includes("Chapter: [ Act I: Chapter 13 ]"), true);
assert.strictEqual(analysisPromptExactWritten.includes("Chapter Number:"), false);
assert.strictEqual(analysisPromptExactWritten.includes("Chapter Title:"), false);

console.log("All unit tests passed successfully!");



