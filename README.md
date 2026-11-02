# Mid's Manuscript Menagerie

**Manuscript Menagerie** is an all in one workspace for in depth chapter analyses/summaries with no-bleed context retrieval and easy document analytics within **NovelAI**.
Crafted with the purpose of analyzing and critiquing a real work-in-progress novel, the Manuscript Menagerie is perfect for spotting inconsistent details across your draft, seeing where the AI (and therefore, the average reader) picks up on subtexts and where it's lost, keeping track of plotlines, and much more!
## Just here for the script?
Simply head over to the latest releases and grab the `.naiscript` file. Import into NovelAI's script panel as expected.
If you're interested in more details about the script (or contributing 👀) keep reading on!
## Key Features
- **Chapter analyses & summaries (GLM-4.6):** a two-stage editorial pipeline. Analyses cover strengths, character work, themes and targeted craft questions; summaries are character-first (the *why*, not a play-by-play) with optional Key Developments. Truncated outputs can be finished automatically.
- **No-bleed context:** pull in prior chapter summaries (off / last 1 / last 4 / all) and selected Lorebook entries as backstory only, so earlier chapters never leak into the one being analyzed. Choose whether context comes from the script's saved reports or your (editable) Lorebook entries.
- **Editable prompts:** every chunk of the analysis and summary prompts can be edited per story, reset, previewed as one assembled instruction block, and saved/shared as named JSON presets.
- **Lorebook integration:** save summaries and analyses to their own Lorebook categories (auto-save optional). Saved entries never activate on their own during normal story generation.
- **Document analytics:** live word, page, token and character counts for the whole story and per chapter, with a configurable words-per-page.
- **Flexible chapter detection ([UCCDS](https://github.com/MidMeantime/nai-chapter-detection-uccds)):** Markdown `#` headings, `[Bracketed]` titles and `Chapter X` / `Prologue` / `Part Two` lines, Roman numerals and number words, Book/Part grouping, and your own header words (`Scene`, `Episode`, `Afterword`...). NovelAI metadata like `[ Author: …; Tags: … ]` is never a chapter. If the UCCDS script is installed in the story, the Menagerie follows its rules so all your chapter-aware scripts agree.
- **Reports stay with their chapter:** saved analyses and summaries are tied to the chapter itself, not its position, so adding, removing or renumbering chapters doesn't shuffle them.

## Contributing
Contributions are more than welcome! A full contribution guide with development setup, code style guidelines, and PR process will be released soon.
Feature requests and bug reports are encouraged — please open a [GitHub Issue](https://github.com/MidMeantime/nai-manuscript-menagerie/issues) or throw me a message in the Discord thread.

### Building
Everything needed is in this repo. With [Node.js](https://nodejs.org) installed:
```
npm install        # once, for TypeScript
npm run build      # builds the .naiscript
npm test           # unit, runtime and UCCDS tests
```

### Updating UCCDS
Chapter detection comes from [UCCDS](https://github.com/MidMeantime/nai-chapter-detection-uccds), copied into `vendor/uccds/` (don't edit those files here; changes belong in the UCCDS repo). To pull in the latest version from GitHub:
```
npm run fetch-uccds       # downloads from GitHub (no local clone needed)
npm test
```

### Project Structure
```
src/                    TypeScript source, bundled in this order into one .naiscript
  header.ts             script header: id, version, permissions, config options
  types.ts              shared types
  state.ts              app state, config loading, report storage (keyed by chapter)
  helpers.ts            text helpers (previews, title cleanup, escaping)
  counters.ts           word / page / token / character metrics
  legacy-chapters.ts    pre-UCCDS parser, only used for the one-time report migration
  chapters.ts           chapter detection via UCCDS (dual: built in, or the UCCDS script)
  prompts.ts            default prompt chunks (GLM-4.6)
  actions.ts            generation, continuation, Lorebook saving
  ui.ts                 sidebar panel and modals
  main.ts               startup, hooks, background scan loop
scripts/
  build.js              bundles src/ + vendored UCCDS into "Mid's Manuscript Menagerie_v<version>.naiscript"
  update_uccds.js       refreshes vendor/uccds/ from a UCCDS checkout
tests/
  test_logic.js         unit tests
  test_runtime.js       runs the real build in a mock NovelAI
  test_uccds.js         UCCDS integration and report migration tests
  test_helpers.js       shared test setup
vendor/uccds/           UCCDS, vendored (see below)
  uccds-dual.ts         bundled into the script: built-in chapter detection + the client for the UCCDS script
  UCCDS_v<version>.naiscript   the UCCDS dependency script (tests only)
  harness.js            UCCDS's mock NovelAI (tests only)
```

## Related Projects
### Projects that inspired the Menagerie:
*(all scripts and authors come from NovelAI's official Discord and the novelai-scripts forum)*
- ChatGLM by piersf — what I was originally using for chapter/character analyses! also based the core prompts off the assistant + architect prompts
- Brainstorming Partner by Michael — context measurement/management system
- Automatic Chapter Summaries by catfrog_of_the_ocean_lane — obviously the chapter summaries system. also helped a ton with initial chapter detection (which was later refined and ported to [UCCDS](https://github.com/MidMeantime/nai-chapter-detection-uccds))

## Links

- My other scripts: https://storyscriptvault.com/users/MidMeantime
- Like my work? https://buymeacoffee.com/midmeantime

## License
[MIT](LICENSE)
