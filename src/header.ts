/*---
compatibilityVersion: naiscript-1.0
id: 813d5c32-3c38-4bf8-8739-edb68b7e57a3
version: 0.3.2
name: Mid's Manuscript Menagerie
author: MidMeantime
description: Real-time document and chapter analytics (characters, words, tokens, pages) with flexible chapter detection and a two-stage developmental editorial & continuity pipeline. Chapter detection by UCCDS; if the UCCDS script is installed, its chapter rules are used.
memoryLimit: 16
permissions:
  - lorebookEdit
  - clipboardWrite
  - fileDownload
  - fileInput
config:
  - name: chapter_number_style
    prettyName: "[Chapters] Number Display Style"
    type: select
    options:
      - label: "Arabic (1, 2, 3...)"
        value: "arabic"
      - label: "Roman (I, II, III...)"
        value: "roman"
    description: "Format for displaying chapter numbers in the panel: 'arabic' (1, 2, 3...) or 'roman' (I, II, III...)."
  - name: words_per_page
    prettyName: "[Story] Words Per Page"
    type: number
    default: 350
    decimal: false
    description: "Number of words defining a standard manuscript page (default: 350)."
  - name: show_word_count
    prettyName: "[Story] Show Total Word Count"
    type: boolean
    default: true
    description: "Display total word count in manuscript overview."
  - name: show_page_count
    prettyName: "[Story] Show Total Page Count"
    type: boolean
    default: true
    description: "Display estimated page count in manuscript overview."
  - name: show_token_count
    prettyName: "[Story] Show Total Token Count"
    type: boolean
    default: true
    description: "Display total token count in manuscript overview."
  - name: show_char_count
    prettyName: "[Story] Show Total Character Count"
    type: boolean
    default: true
    description: "Display total character count in manuscript overview."
  - name: show_chapter_subcounts
    prettyName: "[Chapters] Show Chapter Sub-Counts"
    type: boolean
    default: true
    description: "Display individual counts for each chapter in the list."
  - name: show_chapter_word_count
    prettyName: "[Chapters] Show Word Count"
    type: boolean
    default: true
    description: "Display word count for each chapter."
  - name: show_chapter_page_count
    prettyName: "[Chapters] Show Page Count"
    type: boolean
    default: true
    description: "Display page count for each chapter."
  - name: show_chapter_token_count
    prettyName: "[Chapters] Show Token Count"
    type: boolean
    default: true
    description: "Display token count for each chapter."
  - name: show_chapter_char_count
    prettyName: "[Chapters] Show Character Count"
    type: boolean
    default: false
    description: "Display character count for each chapter."
  - name: chapter_detection_mode
    prettyName: "[Chapters] Header Style"
    type: select
    options:
      - label: "Auto (Headings, Brackets & Keywords)"
        value: "auto"
      - label: "Markdown Headings Only"
        value: "markdown_headings"
    description: "Which lines count as chapter headers: 'auto' (Markdown #, [bracketed] titles and standalone 'Chapter X' / 'Prologue' / 'Part Two' lines) or Markdown # headings only."
  - name: detect_bracketed_titles
    prettyName: "[Chapters] Detect Bracketed Titles"
    type: boolean
    default: true
    description: "Detect bracketed headers like [Chapter 1: The Beginning] or [The Long Night]. Bracketed metadata such as [ Author: X; Tags: Y ] is always ignored."
  - name: chapter_break_token
    prettyName: "[Chapters] Break Token"
    type: string
    default: "***"
    description: "Scene/chapter divider recognised besides *** / --- / ___ (for example ~~~)."
  - name: chapter_only_break_token
    prettyName: "[Chapters] Only Use My Break Token"
    type: boolean
    default: false
    description: "Only the break token above counts as a divider, so a lone --- or ___ stays normal text."
  - name: chapter_boundary_mode
    prettyName: "[Chapters] Where Chapters Start"
    type: select
    options:
      - label: "At chapter headers (dividers are scene breaks)"
        value: "headers"
      - label: "At headers and at any divider without a header"
        value: "headers_and_dividers"
      - label: "Only at dividers (a header under one names the chapter)"
        value: "dividers"
    description: "What starts a new chapter. The default keeps *** scene breaks inside chapters and only splits at real chapter headers."
  - name: chapter_no_header_fallback
    prettyName: "[Chapters] Story Without Headers"
    type: select
    options:
      - label: "Treat the whole story as one chapter"
        value: "single"
      - label: "Split it on dividers"
        value: "dividers"
    description: "What to do when the story has no chapter headers at all."
  - name: chapter_opening_text
    prettyName: "[Chapters] Text Before the First Header"
    type: select
    options:
      - label: "Keep it as an 'Opening' chapter"
        value: "chapter"
      - label: "Leave it out"
        value: "ignore"
    description: "Untitled text before the first chapter header (a preface, notes, an unlabelled prologue)."
  - name: chapter_division_headers
    prettyName: "[Chapters] Part / Book / Act Headers"
    type: select
    options:
      - label: "Group the chapters under them (not numbered)"
        value: "separate"
      - label: "Count them as chapters"
        value: "chapter"
    description: "Headers like 'Part Two', '[Book 3: Ashes]' or 'Act II'. By default they group the chapters that follow and don't use up a chapter number."
  - name: chapter_numbering
    prettyName: "[Chapters] Numbering Across Books / Parts"
    type: select
    options:
      - label: "Auto (restart only if the story already does)"
        value: "auto"
      - label: "Restart at 1 in each Book / Part"
        value: "restart"
      - label: "Continuous through the whole story"
        value: "continuous"
    description: "How chapters are counted when the story has Book/Part headers."
  - name: chapter_custom_chapter_words
    prettyName: "[Chapters] My Chapter Words"
    type: string
    default: ""
    description: "Your own words that start a numbered chapter like 'Chapter' does, separated by commas. Example: Section, Episode, Scene. Works in all header styles ([ Section 3: ], # Episode 2, Scene Four: Rain). A word here stops counting as a Part word (Section is one by default)."
  - name: chapter_custom_part_words
    prettyName: "[Chapters] My Part / Book Words"
    type: string
    default: ""
    description: "Your own words for headers that group chapters like 'Part' or 'Book', separated by commas. Example: Saga, Season, Cycle."
  - name: chapter_custom_unnumbered_words
    prettyName: "[Chapters] My Unnumbered Section Words"
    type: string
    default: ""
    description: "Your own words for unnumbered sections like 'Prologue', separated by commas. Example: Intro, Foreword, Afterword, Intermission. Before the first chapter they count as a prologue, after the last as an epilogue, in between as an interlude."
  - name: auto_analyze_before_summarize
    prettyName: "[AI Pipeline] Auto-Analyze Before Summarizing"
    type: boolean
    default: true
    description: "If no prior analysis exists when summarizing a chapter, automatically run developmental analysis first."
  - name: analysis_max_tokens
    prettyName: "[AI] Max Tokens for Analysis"
    type: number
    default: 2048
    decimal: false
    description: "Maximum generation tokens for chapter analysis. Raise this if analyses are being cut off mid-sentence."
  - name: summary_max_tokens
    prettyName: "[AI] Max Tokens for Summary"
    type: number
    default: 1400
    decimal: false
    description: "Maximum generation tokens for chapter summary. Raise this if summaries are being cut off mid-sentence."
  - name: auto_finish_if_truncated
    prettyName: "[AI] Auto-Finish Truncated Outputs"
    type: boolean
    default: true
    description: "If a generation is cut off at the token limit, automatically run a continuation pass to complete the output. A manual 'Continue' button is also shown on truncated reports."
  - name: include_lorebook_in_analysis
    prettyName: "[Lorebook] Include in Analyses"
    type: boolean
    default: true
    description: "Include selected Lorebook categories as reference context when generating developmental analyses."
  - name: include_lorebook_in_summary
    prettyName: "[Lorebook] Include in Summaries"
    type: boolean
    default: true
    description: "Include selected Lorebook categories as reference context when generating continuity summaries."
  - name: analysis_prior_chapters_mode
    prettyName: "[AI Pipeline] Prior Chapter Context for Analysis"
    type: select
    options:
      - label: "Last 1 Chapter"
        value: "last_1"
      - label: "Last 4 Chapters"
        value: "last_4"
      - label: "All Prior Chapters"
        value: "all"
      - label: "Off"
        value: "off"
    description: "Prior chapter summary lookback depth for developmental analysis: 'off', 'last_1' (immediate prior chapter), 'last_4' (up to 4 prior chapters), or 'all'."
  - name: summary_prior_chapters_mode
    prettyName: "[AI Pipeline] Prior Chapter Summary Context"
    type: select
    options:
      - label: "Last 1 Chapter"
        value: "last_1"
      - label: "Last 4 Chapters"
        value: "last_4"
      - label: "All Prior Chapters"
        value: "all"
      - label: "Off"
        value: "off"
    description: "Prior chapter summary lookback depth for continuity tracking: 'off', 'last_1' (immediate prior chapter), 'last_4' (up to 4 prior chapters), or 'all'."
  - name: auto_summarize_prior_chapter
    prettyName: "[AI Pipeline] Auto-Summarize Prior Chapter"
    type: boolean
    default: false
    description: "If prior chapter context is enabled and the immediately preceding chapter has no summary, automatically generate its summary first."
  - name: reference_context_source
    prettyName: "[AI Pipeline] Context Reference Source"
    type: select
    options:
      - label: "Cached (Script Storage)"
        value: "cached"
      - label: "Lorebook Entries (with Cache Fallback)"
        value: "lorebook"
    description: "Source to use when prompts reference prior chapter summaries (for continuity) or chapter analyses (when summarizing): 'cached' uses reports stored in script memory; 'lorebook' reads entries from your Lorebook categories (allowing manual edits to be reflected in AI prompts), falling back to cache if no Lorebook entry exists."
  - name: analysis_lorebook_category
    prettyName: "[Lorebook] Analysis Category"
    type: string
    default: "Chapter Analyses"
    description: "Lorebook category name for saved chapter analyses."
  - name: save_to_lorebook
    prettyName: "[Lorebook] Auto-Save Summaries to Lorebook"
    type: boolean
    default: false
    description: "Automatically save generated chapter summaries to a Lorebook category."
  - name: lorebook_category
    prettyName: "[Lorebook] Summary Category"
    type: string
    default: "Chapter Summaries"
    description: "Lorebook category name for saved chapter summaries."
  - name: debug_logging
    prettyName: "[Debug] Log Timings"
    type: boolean
    default: false
    description: "Writes startup and scan timings plus stored report sizes to the script log. Leave off unless you're reporting a slow-loading story."
---*/
/**
 * Mid's Manuscript Menagerie
 * 
 * Features:
 * - Real-time document metrics: Characters, Words, Tokens, Pages (configurable 350 words/page default)
 * - Chapter detection by UCCDS (built in; uses the UCCDS script and its shared chapter rules when that's installed)
 * - Per-chapter sub-counts with prominent styling and configurable visibility toggles
 * - Two-stage editorial AI pipeline:
 *   - "Analyze Chapter": In-depth developmental draft critique (strengths, character arcs/tensions, motifs/subtext)
 *   - "Summarize Chapter": Continuity tracking & synopsis; automatically links to existing chapter analysis or auto-generates one
 * - Per-story prompt editing: each instruction chunk can be edited in place and reset to default
 * - Lorebook integration with collision/overwrite protection dialogs
 * - Native iconId iconography for seamless integration with NovelAI's UI
 */

