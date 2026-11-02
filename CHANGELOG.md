# Changelog

User-facing notes for each release. The newest is at the top. Each release's `.naiscript` is attached to its [GitHub release](https://github.com/MidMeantime/nai-manuscript-menagerie/releases).

## v0.3.2

*v0.3.0 → v0.3.2: chapters, properly.* This release also includes 0.3.1, which was never released by itself.

> Chapter detection now runs on [UCCDS](https://github.com/MidMeantime/nai-chapter-detection-uccds), so far fewer things get mistaken for chapters and numbering finally behaves. Saved analyses and summaries now stay attached to their chapter instead of to a position in the list. The 0.3.1 fixes are in here too. There are no prompt changes, so your custom prompts and presets are untouched.

### New Chapter Detection (UCCDS)
* **Fewer fake chapters**: NovelAI metadata lines like `[ Author: …; Tags: … ]` or `[ Style: … ]`, bracketed asides like `[He looked away.]`, and sentences such as "Act now — …" are no longer treated as chapters.
* **Better numbering**: Chapters after a Prologue or an unnumbered chapter get the right number. Book / Part / Act headers group the chapters under them instead of using up a chapter number. `Chapter 7.` (with a trailing period) now counts as a chapter.
* **New `[Chapters]` options** in the Config tab: where chapters start (headers, dividers, or both), what to do with a story that has no headers, text before the first header, how Part/Book headers behave, numbering across Books (restart or continuous), "only use my break token", and **your own header words** for chapters (`Episode`, `Section`…), parts (`Saga`, `Season`…) and unnumbered sections (`Intro`, `Afterword`…).
* **Your old settings carry over.** Heads up: `Scene 2` lines no longer count as chapters by default. Add `Scene` to **My Chapter Words** to get them back.
* **Works with the UCCDS script**: if the UCCDS script is installed in a story, the Menagerie follows its rules, so all your chapter-aware scripts agree. The Overview tab tells you which source is in use. If UCCDS is turned off, the Menagerie falls back to its built-in detector.

### Reports Stay With Their Chapter
* Saved analyses and summaries are now tied to the chapter itself, not its place in the list. Adding, removing or renumbering chapters doesn't shuffle them anymore, and the selected chapter stays selected.
* **One-time update on first load**: your existing reports are moved to their chapters automatically. Anything that can't be placed (for example, a report on a `[ Style: … ]` line that's no longer a chapter) shows up under **Unmatched Reports** in the Overview tab, where you can delete it. Nothing is deleted automatically, and the old data is kept as a backup.

### Fixes from 0.3.1
* **Saved reports can't leak into your story**: new Lorebook entries made by the Menagerie have no keys and aren't always-on, so they never activate during normal generation. Entries you already have aren't changed, so check older ones if you're unsure.
* **No more surprise empty categories**: reading reports from the Lorebook no longer creates a category as a side effect.
* **Cleaner Inspector preview**: plain text with a single `…` (no more six dots), and stray `*` or `_` in your manuscript can't break the card.
* **Failed saves now warn you** instead of silently losing a report.
* **Smoother background scanning**: scans pause while your story is generating, overlapping scans are queued instead of dropped, and reloading the script no longer stacks duplicate background loops.
* **Xialong removed**: everything runs on GLM-4.6, the instruct model the prompts are written for. If you had Xialong selected, there's nothing to do.
* **New `[Debug] Log Timings` option** (off by default): logs start-up and scan times. Turn it on if a story loads slowly and you want to report it.

### Known Issues
* The script is about 100 KB bigger than 0.3.0 because the UCCDS detector is built in. If a long story opens noticeably slower, please send me the `[Debug] Log Timings` output.
* The summary's closing line doesn't mention Targeted Questions even when that option is on.
* If the model skips the blank line after a bolded character name, the name and paragraph display as one block.
