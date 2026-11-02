// --- Helper Utilities for Mid's Manuscript Menagerie ---

function delay(ms: number): Promise<void> {
    return api.v1.timers.sleep(ms);
}

function formatError(err: any): string {
    if (!err) return "Unknown error";
    return err.message || err.toString() || JSON.stringify(err);
}

function countWords(str: string): number {
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

function estimateTokens(str: string): number {
    if (!str) return 0;
    return Math.ceil(str.length / 4);
}

function formatNumber(num: number): string {
    return num.toLocaleString();
}

const ROMAN_VALS: [number, string][] = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"],
    [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
    [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]
];

function toRomanNumeral(num: number): string {
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

const ROMAN_CHAR_MAP: Record<string, number> = {
    I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000
};

function parseRomanNumeral(str: string): number | null {
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

const WORD_NUMBER_MAP: Record<string, number> = {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
    eighteen: 18, nineteen: 19, twenty: 20, twentyone: 21, twentytwo: 22, twentythree: 23,
    twentyfour: 24, twentyfive: 25, thirty: 30, forty: 40, fifty: 50
};

function extractNumberFromString(str: string): number | null {
    if (!str) return null;
    const trimmed = str.trim();
    if (/^\d+$/.test(trimmed)) {
        const n = parseInt(trimmed, 10);
        return isNaN(n) ? null : n;
    }
    const roman = parseRomanNumeral(trimmed);
    if (roman !== null) return roman;
    const wordKey = trimmed.toLowerCase().replace(/[\s-]/g, '');
    if (WORD_NUMBER_MAP[wordKey] !== undefined) {
        return WORD_NUMBER_MAP[wordKey];
    }
    return null;
}

function formatChapterNumber(num: number | null, style: 'arabic' | 'roman'): string {
    if (num === null) return "";
    return style === 'roman' ? toRomanNumeral(num) : String(num);
}

function cleanHeaderTitle(raw: string): string {
    if (!raw) return "";
    let clean = raw.trim();
    clean = clean.replace(/^(?:\*{3}|---|[\* \-_]{3,})\s*/, '');
    clean = clean.replace(/^#{1,6}\s*/, '');
    clean = clean.replace(/^\[\s*(?:(?:Chapter|Title|Scene)\s*:\s*)?/i, '').replace(/\s*\]$/, '');
    clean = clean.replace(/^(?:\*{3}|---|[\* \-_]{3,})\s*/, '');
    return clean.trim();
}

/**
 * Deconstructs a chapter header into its semantic components:
 * - preTitle: Optional outer hierarchy prefix (e.g. "Act II", "Part 1", "Book 3")
 * - chapterNumber: Extracted chapter number (or fallback if unnumbered)
 * - chapterNumberRaw: Raw token for number (e.g. "12", "XII", "Twelve")
 * - chapterTitle: Subtitle / descriptive chapter title (or "" if none)
 * - isSpecial: True for Prologue, Epilogue, Story Beginning
 */
function parseChapterTitle(raw: string, fallbackNumber?: number | null): ParsedChapterTitle {
    if (!raw) {
        return {
            preTitle: "",
            chapterNumber: fallbackNumber ?? null,
            chapterNumberRaw: "",
            chapterTitle: "",
            isSpecial: false
        };
    }

    const clean = cleanHeaderTitle(raw);

    // 1. Special sections like Prologue, Epilogue, Story Beginning
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

    // 2. Extract any pre-title prefix (Act, Part, Book, Volume, Section, Arc)
    let preTitle = "";
    let rest = clean;

    const preMatch = rest.match(/^((?:(?:Act|Part|Book|Volume|Section|Arc)\s+(?:\d+|[IVXLCDM]+|[a-zA-Z]+)(?:\s*[:\-\u2013\u2014,]\s*|\s+))+)/i);
    if (preMatch) {
        preTitle = preMatch[1].replace(/[\s:\-\u2013\u2014,]+$/, '').trim();
        rest = rest.slice(preMatch[0].length).trim();
    }

    // 3. Extract chapter keyword and number from rest
    let chapterNum: number | null = null;
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

/**
 * Formats a clean display title for a chapter in the UI without doubling.
 * E.g.:
 * - [ Act II: Chapter 12 ] -> "Act II: Chapter 12"
 * - [ Act II: Chapter 12: The Reckoning ] -> "Act II: Chapter 12: The Reckoning"
 * - [ Chapter 12: The Reckoning ] -> "Chapter 12: The Reckoning"
 * - [ Chapter 12 ] -> "Chapter 12"
 * - Prologue -> "Prologue"
 */
function formatChapterDisplayTitle(chapter: ManuscriptChapter, style: 'arabic' | 'roman'): string {
    const parsed = parseChapterTitle(chapter.cleanTitle, chapter.normalizedNumber);

    if (parsed.isSpecial) {
        if (parsed.preTitle) {
            return `${parsed.preTitle}: ${parsed.chapterTitle}`;
        }
        return parsed.chapterTitle;
    }

    const num = parsed.chapterNumber ?? chapter.normalizedNumber;
    const numStr = num !== null ? formatChapterNumber(num, style) : "";

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

/**
 * Formats the exact Lorebook summary header syntax requested by the user:
 * `**[pre-chapter title (if applicable)] Chapter [number]: [chapter title (if applicable)] — Summary**`
 *
 * Examples:
 * - [ Act II: Chapter 12 ] -> "**Act II: Chapter 12 — Summary**"
 * - [ Act II: Chapter 12: The Reckoning ] -> "**Act II: Chapter 12: The Reckoning — Summary**"
 * - [ Chapter 12: The Reckoning ] -> "**Chapter 12: The Reckoning — Summary**"
 * - [ Chapter 12 ] -> "**Chapter 12 — Summary**"
 * - Prologue -> "**Prologue — Summary**"
 */
function formatSummaryLorebookHeader(chapter: ManuscriptChapter, style?: 'arabic' | 'roman'): string {
    const numStyle = style || (typeof appConfig !== 'undefined' ? appConfig.chapterNumberStyle : 'arabic');
    const parsed = parseChapterTitle(chapter.cleanTitle, chapter.normalizedNumber);

    if (parsed.isSpecial) {
        if (parsed.preTitle) {
            return `**${parsed.preTitle}: ${parsed.chapterTitle} — Summary**`;
        }
        return `**${parsed.chapterTitle} — Summary**`;
    }

    const num = parsed.chapterNumber ?? chapter.normalizedNumber;
    const numStr = num !== null ? formatChapterNumber(num, numStyle) : "";

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

/**
 * Ensures that summary text starts with the exact standardized summary header:
 * `**[pre-chapter title (if applicable)] Chapter [number]: [chapter title (if applicable)] — Summary**`
 * Replaces any existing header line (such as an unbolded or doubled header)
 * or prepends the header if no header was generated.
 */
function ensureSummaryHeader(text: string, expectedHeader: string): string {
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

/**
 * Short plain-text preview of prose (E11): collapses whitespace, cuts at a sentence end when one
 * falls in the last part of the window, otherwise at a word boundary, and adds exactly one "…"
 * only when text was actually cut. Never ends in a doubled ellipsis.
 */
function makePreview(text: string, maxChars: number): string {
    const clean = (text || "").replace(/\s+/g, " ").trim();
    if (clean.length <= maxChars) return clean;
    const head = clean.slice(0, maxChars + 1);
    // Prefer ending on a full sentence if one ends in the last 40% of the window
    const sentenceEnd = Math.max(head.lastIndexOf(". "), head.lastIndexOf("! "), head.lastIndexOf("? "), head.lastIndexOf("\u201D "), head.lastIndexOf("\" "));
    if (sentenceEnd >= maxChars * 0.6) {
        const sentence = clean.slice(0, sentenceEnd + 1).trim();
        // A trailing "..." isn't a sentence end; fall through to the word cut, which strips it
        if (!/(?:\.\.|…)$/.test(sentence)) return sentence + " …";
    }
    const space = head.lastIndexOf(" ");
    const cut = space > maxChars * 0.5 ? clean.slice(0, space) : clean.slice(0, maxChars);
    // Drop trailing punctuation, dashes and any ellipsis already at the cut, so only one "…" remains
    return cut.replace(/(?:\.{2,}|\u2026|[\s,;:\u2013\u2014-])+$/, "") + "…";
}

function truncateString(str: string, maxLen: number): string {
    if (!str) return "";
    return str.length > maxLen ? str.slice(0, maxLen) + "..." : str;
}

/**
 * Requests a script permission if it hasn't already been granted.
 * Uses api.v1.permissions.list() to check current grants, then
 * api.v1.permissions.request() to prompt the user if needed.
 * Returns true if permission is (or becomes) granted.
 */
async function requestPermission(permission: ScriptPermission, reason: string): Promise<boolean> {
    try {
        if (await api.v1.permissions.has(permission)) return true;
        return await api.v1.permissions.request(permission, reason);
    } catch (err) {
        api.v1.log(`Permission request error (${permission}):`, err);
        return false;
    }
}

/**
 * Copies text to clipboard, requesting clipboardWrite permission first.
 */
async function copyTextToClipboard(text: string): Promise<boolean> {
    const ok = await requestPermission(
        'clipboardWrite',
        "Mid's Manuscript Menagerie needs clipboard access to copy analysis and summary reports."
    );
    if (!ok) {
        api.v1.ui.toast("Clipboard permission was denied.", { type: "warning" });
        return false;
    }
    try {
        await api.v1.clipboard.writeText(text);
        return true;
    } catch (err) {
        api.v1.log("Clipboard write error:", err);
        return false;
    }
}

/**
 * Ensures lorebookEdit permission is granted before any lorebook write operation.
 * Returns true if the user has (or grants) the permission.
 */
async function requestLorebookPermission(): Promise<boolean> {
    return requestPermission(
        'lorebookEdit',
        "Mid's Manuscript Menagerie needs Lorebook access to save chapter analyses and summaries as Lorebook entries."
    );
}

/**
 * Check whether an assistant response (analysis or summary) appears to have been cut off prematurely.
 * Combines explicit token length checks with heuristic syntax detection (unclosed code blocks,
 * dangling punctuation, dangling headers, dangling list markers, and absence of terminal punctuation).
 */
function isResponseLikelyCutOff(text: string, finishReason?: string | null): boolean {
    if (!text || typeof text !== "string") return false;
    const trimmed = text.trim();
    if (trimmed.length === 0) return false;

    // 1. Explicit API finish reason indicating token limit hit
    if (finishReason === "length") return true;

    // 2. Unclosed code block (odd number of triple backticks)
    const codeBlockCount = (trimmed.match(/```/g) || []).length;
    if (codeBlockCount % 2 === 1) return true;

    // 3. Dangling punctuation or connectors that strongly signal truncation
    // (comma, semicolon, colon, hyphen, en/em dash, opening brackets/parentheses)
    if (/[,;:\-—–(\[\{<]\s*$/.test(trimmed)) return true;

    // 4. Ends with a dangling markdown header line (e.g., "### Key Developments")
    if (/(?:^|\n)#{1,6}\s+[^\n]+$/.test(trimmed)) return true;

    // 5. Ends with an incomplete list bullet or numbered list marker (e.g., "- " or "1. ")
    if (/(?:^|\n)\s*(?:[-*+]|\d+\.)\s*$/.test(trimmed)) return true;

    // 6. Closed code block ending is considered complete
    if (trimmed.endsWith("```")) return false;

    // 7. Check if it ends with standard terminal punctuation (optionally wrapped in quotes/brackets/emphasis)
    const terminalRegex = /[.!?…\u3002\uff01\uff1f]["'”’\)\]\}*_`]*$/;
    if (terminalRegex.test(trimmed)) return false;

    // 8. If finishReason was explicitly "stop" and code blocks/dangling syntax passed, it finished naturally
    if (finishReason === "stop") return false;

    // 9. Does not end with terminal punctuation and finishReason was not explicitly "stop"
    return true;
}

/**
 * Clean and prepare continuation text by stripping conversational preambles
 * and detecting/removing any duplicate overlap with the tail of the previous text.
 */
function cleanContinuationText(previousText: string, newText: string): string {
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

