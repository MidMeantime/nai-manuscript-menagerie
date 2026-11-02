// --- Editorial & Continuity Prompts for Mid's Manuscript Menagerie ---
// Adapted from ./prompts-instructs/ for single-turn NovelAI execution with GLM-4.6 / Xialong

// --- Analysis Prompt Modular Chunks ---

const PROMPT_ANALYSIS_HEADER = `You are an incisive developmental editor and literary analyst specializing in fiction manuscripts — full developmental critique spanning structure, character, and prose. Dissect character psychology, relational dynamics, and narrative momentum, and diagnose the sentence-level craft that delivers them.

### THE EDITOR'S MANDATE
Ground every observation in the text itself — never assume or extrapolate unwritten events. Diagnose WHY a beat, dynamic, or sentence works or falters, then propose specific, psychologically honest alternatives rather than generic praise. Treat dark, mature, or morally ambiguous material (trauma, consent grey zones, power imbalances, raw sexuality) strictly as narrative craft to evaluate for emotional honesty and character consistency, never as a topic to moralize about. Adapt to the user's manuscript and goals above all else, fully embracing any dark, mature, or otherwise adult content the story may call for.

**Explicit content** is a legitimate narrative instrument. Sexual scenes, graphic violence, coercive dynamics, and other raw material can expose a character's attachment patterns, self-concept, capacity for shame or hunger, and relational power in ways that fully-clothed scenes cannot. Evaluate explicit passages for what they *reveal*: what a character allows, initiates, withdraws from, or refuses to name tells the reader who that character actually is beneath their surface behavior. Analyze craft mechanics (pacing, interiority, sensory specificity, voice, subtext) and note when a scene's explicit content is doing genuine character or thematic work versus when it reads as inert set-piece. Never soften, skip, or euphemize explicit material; describe and evaluate it in plain, direct language as the craft warrants.

### CORE PRINCIPLES
1. Psychological & craft depth: Look past surface dialogue for subtext, rationalizations, defense mechanisms, and power imbalances.
2. No generic cheerleading: When something works, name the exact mechanic — voice calibration, distinct interiority, organic escalation.
3. Constructive critique: For any weak beat, diagnose why it falters and propose an alternative that preserves tension.
4. Strict factual fidelity: Every observation must trace directly to the provided text.
5. Direct delivery: Write the critique itself, the way a working editor marks up a manuscript. Open straight into the first section, and keep every sentence about the chapter rather than about these instructions or the nature of the material.
6. Bracketed lists in the sections below are menus of lenses, not slots to fill in order — use what the chapter earns, skip what it doesn't, and let count and sequence vary freely.

### VOICE CALIBRATION
Avoid inflated filler ("testament to," "delves into," "tapestry," "multifaceted," "navigates the complexities of"). Write with assertive, declarative specificity: name the exact exchange, gesture, or hesitation rather than describing it abstractly.

### REQUIRED OUTPUT STRUCTURE
Produce a complete, tightly written critique for this chapter using the following structure:`;

// Always on:
const PROMPT_ANALYSIS_CHUNK_STRENGTHS = `### Overarching Strengths
- [1-2 paragraphs analyzing specific craft mechanics: voice calibration, pacing, emotional/physical integration, or handling of raw material.]`;

// Toggleable: Character Analysis
const PROMPT_ANALYSIS_CHUNK_CHARACTER = `### Character Analysis
For each character who carries real weight in this chapter, write a short paragraph under their bolded name. Lead with whatever this chapter actually reveals or changes about them, anchored in a specific moment from the text, and let the paragraph's length follow their role: a central figure may earn several sentences, a brief presence only one or two. Describe what the chapter shows before interpreting it, and give warmth, kindness, and sincerity the same weight as darker currents when the text presents them. Where you read a deeper motive into a character, tie it to a specific line or action and offer it as one reading rather than a verdict.

**[Character Name]**

[A focused paragraph on this character in this chapter.]

Angles to draw from where the chapter supports them, combined or left out as needed:
- what a choice or reaction under pressure shows about who they are
- how they shift, hold firm, or slide back across the chapter
- where power, need, or avoidance shapes how they treat someone else
- how their view of themselves lines up with what they actually do`;

// Always on:
const PROMPT_ANALYSIS_CHUNK_THEMATIC = `### Thematic & Structural Notes
- [Motifs and relational subtext manifesting in this chapter.]
- [Pacing & Scene Turn: evaluate entry stakes, the scene turn where something shifts, and unresolved chapter exit tension.]
- [Line craft: quote one or two short passages exactly as written (a sentence or less each) where the prose is at its strongest or weakest, and name the exact mechanic at work: rhythm, word choice, filtering, dialogue attribution, sensory precision. Any suggested rewrite keeps the manuscript's tense, point of view, and voice, and fits what is happening in that moment of the scene.]`;

// Toggleable: Targeted Craft Questions
const PROMPT_ANALYSIS_CHUNK_CRAFT_QUESTIONS = `### Targeted Craft Questions
1. [Targeted question pointing at a specific blind spot or unconscious authorial decision in this chapter.]
2. [Second craft question regarding character stakes or subtext.]`;

// Ordered list of the analysis chunks active under the given toggles, with per-story overrides applied
function getAnalysisPromptChunks(toggles?: Partial<PromptToggles>): PromptChunkView[] {
    const active = {
        analysisCharacter: true,
        analysisCraftQuestions: true,
        ...toggles
    };

    const keys: PromptChunkKey[] = ['analysisHeader', 'analysisStrengths'];
    if (active.analysisCharacter) keys.push('analysisCharacter');
    keys.push('analysisThematic');
    if (active.analysisCraftQuestions) keys.push('analysisCraftQuestions');

    return keys.map(makePromptChunkView);
}

function buildAnalysisSystemPrompt(toggles?: Partial<PromptToggles>): string {
    return joinPromptChunks(getAnalysisPromptChunks(toggles));
}

function buildAnalysisUserPrompt(
    chapterHeaderOrNum: string,
    chapterTitleOrText: string,
    chapterTextOrToggles?: string | Partial<PromptToggles>,
    togglesOrLb?: Partial<PromptToggles> | string,
    lorebookContextOrPrior?: string,
    priorChapterContext?: string
): string {
    let chapterHeader = "";
    let chapterText = "";
    let toggles: Partial<PromptToggles> | undefined;
    let lorebookContext: string | undefined;
    let priorContext: string | undefined;

    if (typeof chapterTextOrToggles === 'string') {
        const chapterNum = chapterHeaderOrNum;
        const chapterTitle = chapterTitleOrText;
        chapterText = chapterTextOrToggles;
        chapterHeader = chapterTitle
            ? (chapterNum ? `Chapter ${chapterNum}: ${chapterTitle}` : chapterTitle)
            : (chapterNum ? `Chapter ${chapterNum}` : "Chapter");
        toggles = togglesOrLb as Partial<PromptToggles> | undefined;
        lorebookContext = lorebookContextOrPrior;
        priorContext = priorChapterContext;
    } else {
        chapterHeader = chapterHeaderOrNum;
        chapterText = chapterTitleOrText;
        toggles = chapterTextOrToggles as Partial<PromptToggles> | undefined;
        lorebookContext = typeof togglesOrLb === 'string' ? togglesOrLb : undefined;
        priorContext = lorebookContextOrPrior;
    }

    const active = {
        analysisCharacter: true,
        analysisCraftQuestions: true,
        ...toggles
    };

    let prompt = "";

    if (lorebookContext && lorebookContext.trim().length > 0) {
        prompt += `### LOREBOOK REFERENCE CONTEXT (Canon & World Bible)
The following lorebook entries provide established canon, character profiles, and world mechanics. Use this background context to inform your developmental critique (e.g., verifying character consistency, relational histories, and lore fidelity):

${lorebookContext.trim()}

--- END LOREBOOK CONTEXT ---\n\n`;
    }

    if (priorContext && priorContext.trim().length > 0) {
        prompt += `### PRIOR CHAPTER CONTEXT (Narrative Continuity & Arcs)
The PRIOR CHAPTER CONTEXT below reflects continuity and character trajectories established before this chapter starts. Use this background context to track character arcs, psychological progression, and narrative tensions across chapters. Do not critique prior chapter events as current developments unless this chapter's text explicitly revisits, complicates, or transforms them.

${priorContext.trim()}

--- END PRIOR CHAPTER CONTEXT ---\n\n`;
    }

    prompt += `Analyze the following chapter:\n\nChapter: ${chapterHeader}\n\n`;

    prompt += `--- CHAPTER TEXT ---
${chapterText}
--- END CHAPTER TEXT ---\n\n`;

    if (priorContext && priorContext.trim().length > 0) {
        prompt += `Grounding Mandate: Focus your developmental critique exclusively on the text, craft execution, and psychological dynamics of THIS chapter. Use prior chapter context solely to evaluate narrative momentum, relationship progression, and thematic continuity.\n\n`;
    }

    const sectionNames: string[] = ["Overarching Strengths"];
    if (active.analysisCharacter) sectionNames.push("Character Analysis");
    sectionNames.push("Thematic & Structural Notes");
    if (active.analysisCraftQuestions) sectionNames.push("Targeted Craft Questions");

    prompt += `Provide the ${sectionNames.join(", ")} sections now, using the exact structure defined in the system prompt.`;

    return prompt;
}

// --- Summary Prompt Modular Chunks ---

const PROMPT_SUMMARY_HEADER = `You are an incisive continuity tracker and literary analyst specializing in fiction manuscripts — chapter-by-chapter summaries that preserve psychological throughlines, plot causality, and continuity facts across a manuscript in progress. Capture character psychology alongside the events, so every sentence carries an event, a cause, or a change in someone.

### THE EDITOR'S MANDATE
Ground every observation in the text itself — never assume or extrapolate unwritten events. Treat dark, mature, or morally ambiguous material (trauma, consent grey zones, power imbalances, raw sexuality) strictly as narrative craft and psychological reality, never as a topic to moralize about. Never soften, skip, or euphemize explicit material.

### CORE PRINCIPLES
1. Psychological & craft depth: Look past surface dialogue for subtext, rationalizations, defense mechanisms, and power imbalances.
2. Strict factual fidelity: Every plot beat and character development must trace strictly to the text. Keep who did what, to whom, and when exactly as the text has it; to shorten, leave details out rather than combining separate facts. Use words like first, only, never, or always only where the text itself says so.
3. Proportional treatment: Significant events, especially harm events (assault, coercion, humiliation, cruelty), receive direct documentation in plain language — never compressed into a vague clause or softened with euphemism. These moments are catalysts that reshape character psychology.
4. Epistemic calibration: Distinguish objective confirmation, from implication ("heavily hinted at"), from rumor or hearsay, from a character's own rationalization. Calibrate bullet certainty accordingly ("implied to involve," "allegedly," "suspected," "rumored").
5. Direct delivery: Write the summary itself. Open straight into the chapter header, and keep every sentence about the chapter rather than about these instructions or the nature of the material.
6. The lists below are lenses, not fixed slots — use only what the chapter earns, skip the rest, and let bullet count and order match what actually happened rather than the order listed.

### VOICE CALIBRATION
Avoid inflated filler ("testament to," "delves into," "tapestry"). Write with assertive, declarative specificity and plain verbs; a summary records what happened rather than dramatizing it. Each Key Development bullet must be a clean declarative sentence with NO bolded category prefix.

### OUTPUT STRUCTURE
[Chapter header as labeled in the text]`;

// Always on: Main prose paragraphs
const PROMPT_SUMMARY_CHUNK_MAIN = `[1-3 prose paragraphs in present tense, roughly 200-350 words, following the chapter in order:
 Opening: The situation and mindset entering the chapter.
 Middle: The core interaction or conflict and its subtext, with the names, places, objects, and stated facts later chapters will need.
 Close: The climax or resolution, with unresolved hooks and fallout. Capture what characters tell themselves, not just what happens to them.
 A short or single-beat chapter can resolve in two paragraphs. Put words in quotation marks only when they appear in the text.]`;

// Toggleable: Key Developments
const PROMPT_SUMMARY_CHUNK_KEY_DEVELOPMENTS = `Key Developments (3-5 bullets, one sentence each): the durable facts and changes a later chapter will need, stated plainly. Repeating a point from the prose is fine when it's one a later chapter must not miss.
Draw from these where the chapter supports them:
- new or changed facts about a character, a relationship, or the world
- decisions, promises, lies, or secrets that will matter later
- who now knows, suspects, or is hiding what, and from whom
- named people, places, objects, times, or events introduced or confirmed here`;

// Toggleable: Targeted Questions
const PROMPT_SUMMARY_CHUNK_TARGETED_QUESTIONS = `Targeted Questions:
1. [Pointed craft question regarding a character's unstated belief or unresolved tension.]
2. [Second pointed question on narrative causality or stakes.]`;

function getSummaryPromptChunks(toggles?: Partial<PromptToggles>): PromptChunkView[] {
    const active = {
        summaryKeyDevelopments: true,
        summaryTargetedQuestions: true,
        ...toggles
    };

    const keys: PromptChunkKey[] = ['summaryHeader', 'summaryMain'];
    if (active.summaryKeyDevelopments) keys.push('summaryKeyDevelopments');
    if (active.summaryTargetedQuestions) keys.push('summaryTargetedQuestions');

    return keys.map(makePromptChunkView);
}

function buildSummarySystemPrompt(toggles?: Partial<PromptToggles>): string {
    return joinPromptChunks(getSummaryPromptChunks(toggles));
}

// --- Chunk Registry & Override Resolution ---

// Every chunk on each page in display order, regardless of toggles (used by import/export)
const PROMPT_PAGE_CHUNK_KEYS: Record<PromptPage, PromptChunkKey[]> = {
    analysis: ['analysisHeader', 'analysisStrengths', 'analysisCharacter', 'analysisThematic', 'analysisCraftQuestions'],
    summary: ['summaryHeader', 'summaryMain', 'summaryKeyDevelopments', 'summaryTargetedQuestions']
};

const PROMPT_PAGE_LABELS: Record<PromptPage, string> = {
    analysis: "Analysis",
    summary: "Summary"
};

const DEFAULT_PROMPT_CHUNKS: Record<PromptChunkKey, string> = {
    analysisHeader: PROMPT_ANALYSIS_HEADER,
    analysisStrengths: PROMPT_ANALYSIS_CHUNK_STRENGTHS,
    analysisCharacter: PROMPT_ANALYSIS_CHUNK_CHARACTER,
    analysisThematic: PROMPT_ANALYSIS_CHUNK_THEMATIC,
    analysisCraftQuestions: PROMPT_ANALYSIS_CHUNK_CRAFT_QUESTIONS,
    summaryHeader: PROMPT_SUMMARY_HEADER,
    summaryMain: PROMPT_SUMMARY_CHUNK_MAIN,
    summaryKeyDevelopments: PROMPT_SUMMARY_CHUNK_KEY_DEVELOPMENTS,
    summaryTargetedQuestions: PROMPT_SUMMARY_CHUNK_TARGETED_QUESTIONS
};

const PROMPT_CHUNK_LABELS: Record<PromptChunkKey, string> = {
    analysisHeader: "Base Prompt",
    analysisStrengths: "Overarching Strengths",
    analysisCharacter: "Character Analysis",
    analysisThematic: "Thematic & Structural Notes",
    analysisCraftQuestions: "Targeted Craft Questions",
    summaryHeader: "Base Prompt",
    summaryMain: "Summary Prose",
    summaryKeyDevelopments: "Key Developments",
    summaryTargetedQuestions: "Targeted Questions"
};

function makePromptChunkView(key: PromptChunkKey): PromptChunkView {
    const override = appState.promptOverrides[key];
    const isEdited = typeof override === 'string';
    return {
        key,
        label: PROMPT_CHUNK_LABELS[key],
        text: isEdited ? override : DEFAULT_PROMPT_CHUNKS[key],
        isEdited
    };
}

// A chunk the user blanked out is dropped rather than leaving a stray gap in the prompt
function joinPromptChunks(chunks: PromptChunkView[]): string {
    return chunks
        .map(c => c.text.trim())
        .filter(t => t.length > 0)
        .join("\n\n");
}

/** "A", "A and B", "A, B, and C" */
function joinSectionNames(names: string[]): string {
    if (names.length <= 1) return names.join("");
    if (names.length === 2) return `${names[0]} and ${names[1]}`;
    return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function buildSummaryUserPrompt(
    chapterHeaderOrNum: string,
    chapterTitleOrText: string,
    chapterTextOrAnalysis?: string,
    existingAnalysisTextOrToggles?: string | Partial<PromptToggles>,
    togglesOrLb?: Partial<PromptToggles> | string,
    lorebookContextOrPrior?: string,
    priorChapterContext?: string
): string {
    let chapterHeader = "";
    let chapterText = "";
    let existingAnalysisText: string | undefined;
    let toggles: Partial<PromptToggles> | undefined;
    let lorebookContext: string | undefined;
    let priorContext: string | undefined;

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
        toggles = togglesOrLb as Partial<PromptToggles> | undefined;
        lorebookContext = lorebookContextOrPrior;
        priorContext = priorChapterContext;
    } else {
        chapterHeader = chapterHeaderOrNum;
        chapterText = chapterTitleOrText;
        existingAnalysisText = typeof chapterTextOrAnalysis === 'string' ? chapterTextOrAnalysis : undefined;
        toggles = (typeof existingAnalysisTextOrToggles === 'object' ? existingAnalysisTextOrToggles : undefined) as Partial<PromptToggles> | undefined;
        lorebookContext = typeof togglesOrLb === 'string' ? togglesOrLb : undefined;
        priorContext = lorebookContextOrPrior;
    }

    let prompt = "";

    if (lorebookContext && lorebookContext.trim().length > 0) {
        prompt += `### LOREBOOK REFERENCE CONTEXT (Canon & Continuity Bible)
The following lorebook entries provide established canon and character details. Use these references to ensure continuity tracking, terminology, and character dynamics align with established lore:

${lorebookContext.trim()}

--- END LOREBOOK CONTEXT ---\n\n`;
    }

    if (priorContext && priorContext.trim().length > 0) {
        prompt += `### PRIOR CHAPTER CONTEXT (Historical Continuity)
The PRIOR CHAPTER CONTEXT below reflects continuity established before this chapter starts. Do not restate these facts as new developments unless this chapter's text explicitly revisits, complicates, or contradicts them.

${priorContext.trim()}

--- END PRIOR CHAPTER CONTEXT ---\n\n`;
    }

    prompt += `Summarize the following chapter for continuity tracking:\n\nChapter: ${chapterHeader}\n\n`;

    const useAnalysis = toggles?.summaryUseAnalysis !== false;
    if (useAnalysis && existingAnalysisText && existingAnalysisText.trim().length > 0) {
        prompt += `### ESTABLISHED DEVELOPMENTAL ANALYSIS (Ground Truth Context)
The following developmental analysis was already established for this chapter. Treat its named tensions, character arcs, and thematic patterns as the working psychological framing. Reuse its terms and anchor the summary in these established insights:

${existingAnalysisText.trim()}

--- END OF ESTABLISHED ANALYSIS ---\n\n`;
    }

    prompt += `--- CHAPTER TEXT ---
${chapterText}
--- END CHAPTER TEXT ---

`;

    if (priorContext && priorContext.trim().length > 0) {
        prompt += `Grounding Mandate: Focus exclusively on events and character psychology that occur in THIS chapter. Treat prior chapter context as background reality; do not duplicate earlier chapter developments unless they are actively revisited, complicated, or transformed here.\n\n`;
    }

    // Name every active section, as the analysis closing line does (G8)
    const sectionNames: string[] = ["Chapter Summary"];
    if (toggles?.summaryKeyDevelopments !== false) sectionNames.push("Key Developments");
    if (toggles?.summaryTargetedQuestions !== false) sectionNames.push("Targeted Questions");
    prompt += `Provide the ${joinSectionNames(sectionNames)} following the exact output format now.`;

    return prompt;
}


// --- Prompt Import / Export File Format ---

const PROMPT_EXPORT_FORMAT = "mids-manuscript-menagerie/prompts";
const PROMPT_EXPORT_FORMAT_VERSION = 1;
const PROMPT_PRESET_NAME_MAX = 80;

function sanitizePresetName(name: string): string {
    return (name || "").replace(/\s+/g, " ").trim().slice(0, PROMPT_PRESET_NAME_MAX);
}

// "Blunt Line Editor" -> "menagerie-analysis-blunt-line-editor.json"
function buildPromptExportFilename(page: PromptPage, presetName: string): string {
    const slug = presetName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
    return `menagerie-${page}-${slug || "prompts"}.json`;
}

// Records every chunk on the page (edited or not) so the file is a complete, human-readable snapshot
function buildPromptExportFile(page: PromptPage, presetName: string): PromptExportFile {
    const chunks: Partial<Record<PromptChunkKey, PromptExportChunk>> = {};
    for (const key of PROMPT_PAGE_CHUNK_KEYS[page]) {
        const view = makePromptChunkView(key);
        chunks[key] = { label: view.label, edited: view.isEdited, text: view.text };
    }
    return {
        format: PROMPT_EXPORT_FORMAT,
        formatVersion: PROMPT_EXPORT_FORMAT_VERSION,
        page,
        presetName: sanitizePresetName(presetName),
        scriptVersion: api.v1.script.version,
        exportedAt: new Date().toISOString(),
        chunks
    };
}

/**
 * Validates an imported prompt file. Chunk keys that don't belong to the file's page are dropped
 * (and counted), so a file can never write into the other page's chunks.
 */
function parsePromptExportFile(raw: string): { file?: PromptExportFile; ignored: number; error?: string } {
    let data: any;
    try {
        data = JSON.parse(raw);
    } catch {
        return { ignored: 0, error: "The file isn't valid JSON." };
    }
    if (!data || typeof data !== 'object' || data.format !== PROMPT_EXPORT_FORMAT) {
        return { ignored: 0, error: "This isn't a Manuscript Menagerie prompt file." };
    }
    if (typeof data.formatVersion !== 'number' || data.formatVersion > PROMPT_EXPORT_FORMAT_VERSION) {
        return { ignored: 0, error: "This prompt file was made by a newer version of the script. Update the script to import it." };
    }
    if (data.page !== 'analysis' && data.page !== 'summary') {
        return { ignored: 0, error: "The file doesn't say whether it holds Analysis or Summary prompts." };
    }
    if (!data.chunks || typeof data.chunks !== 'object') {
        return { ignored: 0, error: "The file contains no prompt chunks." };
    }

    const page: PromptPage = data.page;
    const allowed = PROMPT_PAGE_CHUNK_KEYS[page];
    const chunks: Partial<Record<PromptChunkKey, PromptExportChunk>> = {};
    let ignored = 0;
    for (const [key, value] of Object.entries(data.chunks) as [string, any][]) {
        const isValid = allowed.includes(key as PromptChunkKey)
            && value && typeof value === 'object' && typeof value.text === 'string';
        if (!isValid) {
            ignored++;
            continue;
        }
        chunks[key as PromptChunkKey] = {
            label: typeof value.label === 'string' ? value.label : PROMPT_CHUNK_LABELS[key as PromptChunkKey],
            edited: value.edited !== false,
            text: value.text
        };
    }
    if (Object.keys(chunks).length === 0) {
        return { ignored, error: `The file contains no usable ${PROMPT_PAGE_LABELS[page]} prompt chunks.` };
    }

    return {
        file: {
            format: data.format,
            formatVersion: data.formatVersion,
            page,
            presetName: typeof data.presetName === 'string' ? sanitizePresetName(data.presetName) || undefined : undefined,
            scriptVersion: typeof data.scriptVersion === 'string' ? data.scriptVersion : undefined,
            exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : undefined,
            chunks
        },
        ignored
    };
}
