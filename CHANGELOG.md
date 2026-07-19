# Changelog

All notable changes to LinkVault will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Planned

- **Routing confirmation** — a dialog to confirm a new note's name before it is created, offering existing notes as alternatives.
- **MLX provider** — native Apple Silicon inference, typically faster than the llama.cpp backend for local models.
- **Growth** — mobile support (flip `isDesktopOnly`), batch-process the whole Inbox, and a `normalizePath()` pass for clean re-submission.

## [1.1.0] - 2026-07-19

### Added

- **Auto-update KB index** — an auto-generated listing of your KB files (note, H2 sections, and link count) is maintained inside a marker-delimited managed region of the index note. Content outside the markers is never touched. Refreshes automatically when processing a link creates a new KB file, and on demand via the new **"Rebuild KB index"** command.
- **Index file** setting — names the note whose managed region is maintained (default `Index`); that note is now excluded from AI matching so links are never routed into it.
- **Duplicate-link detection** — before writing, LinkVault checks whether the URL is already filed anywhere in your KB, not just in the matched note. A duplicate is reported with the note that already holds it, and nothing is written.

### Changed

- **BREAKING:** the provider API key is now stored in Obsidian's SecretStorage (added in Obsidian 1.11.4) instead of plaintext `data.json`. `minAppVersion` is raised to `1.11.4`; users on older Obsidian versions stay on 1.0.1 via `versions.json`.
- **Match prompts rewritten.** The model now replies `MATCH: <name>`, `NEW: <name>`, or `NONE`, and is told explicitly that a link touching a topic in passing is not a match. Measured on a 13-note KB with a local `qwen3:4b-instruct`, correct routing over a 15-case set rose from 11/15 to 13–14/15, with all three "no good match" cases correctly declined in every run.
- **A new note is created when nothing matches.** When no existing note covers a link, LinkVault names one from the link's content and files it there. A link is only left in the Inbox if no usable name can be produced. Previously an unmatched response fell through to the *first* file in the list, so links were silently misrouted.
- **New notes are named after a subject area, not the link.** The naming step is shown your existing notes so it matches their level of generality — a link about one company's valuation creates `Space-Industry`, not `SpaceX-Valuation`, so the note can collect further links on that subject.
- **New notes follow the structure of your existing ones**: title, tag line, a `[[Index]] →` backlink describing what the note collects, and a first section with an empty link table. The section heading describes the kind of link it holds — "Valuation Case Studies", "Attack Research" — rather than a fixed "Overview". The table header comes from your configured header marker rather than a fixed one.
- **New note names follow your KB's convention.** Generated names are normalised to `Title-Case-Hyphenated`, matching notes like `AI-Security`; existing acronyms are preserved rather than lowercased.
- **A wrong section no longer blocks filing.** If the note is clear but the section isn't, the link goes into that note's first section and you're told. Choosing the *note* still never guesses.
- Duplicate detection now runs before a note is created, so a link you've already filed can't leave an empty note behind.
- Customised prompts written before this release keep working: a reply that exactly names a file or section is still accepted. Replies that merely *contain* a name are not — that was the guess behind the misrouting.
- **Prompts you never edited now update with the plugin.** Saved settings take precedence over defaults, so anyone who had changed any setting held a frozen copy of the old prompts and would never have received this rewrite. A stored prompt identical to a previously shipped default is replaced on load; a prompt you actually edited is left exactly as you wrote it.

### Fixed

- **Rows now join a table Obsidian has reformatted.** Table headers are matched by their cell text rather than byte-for-byte, so the padding Obsidian's formatter adds to align columns no longer hides the table. Previously a reformatted note grew a second table beside the first, and the original became permanently unreachable.
- **A row can no longer land in a section nobody chose.** The search for a section's table ran to the end of the file, so a section with no table of its own borrowed the next section's. It is now bounded to the section.
- **Custom table headers get a valid separator.** New tables used a hardcoded three-column separator, so a header marker with a different column count produced a table Obsidian would not render.
- **Junk KB notes are no longer created from prompt text.** The old prompt ended with a literal example, `NEW: Descriptive-Theme-Name`, and small local models copied it verbatim — producing a note actually named `Descriptive-Theme-Name.md`. Proposed names are now validated (non-empty, length-limited, no path separators, not placeholder text) and an existing note of that name is reused rather than duplicated.

### Security

- API keys are no longer written to `data.json`, so they are never synced with vault files. An existing plaintext key is migrated into the secret store automatically on first launch (write-before-scrub, so a failed migration never loses the key). Rotate any key that was previously synced in plaintext.

### Documentation

- README trimmed to an overview and split into `docs/` — routing, KB structure, Web Clipper setup, configuration, and troubleshooting each have their own page. The minimum Obsidian version badge said 1.4.0; the plugin has required 1.11.4 since the secret store landed.

### Internal

- Release workflow moved from Node 18 to Node 22. `vite@8`, pulled in by the test runner, requires Node 20 or newer, so under Node 18 npm resolved a different dependency tree than the committed lockfile records and `npm ci` refused to install. The release body also stated a minimum Obsidian version of 1.6.6 while the manifest required 1.11.4; it now reads the manifest.
- Unit tests under `tests/`, run with `npm test`. They cover the pure functions — reply parsing, name validation, table and note construction, URL normalisation, and the managed index region — and were checked by reintroducing three past bugs to confirm each is caught. `@types/node` moved from the template's `^16` pin to `^22`, matching the Node version Obsidian actually ships.

## [1.0.0] - 2026-03-20

### Added

- Core "Process Link to KB" command: extract metadata, match file, match section, insert table row
- LLM provider support: Anthropic (Claude), Ollama (local), and OpenRouter
- Provider interface using the Strategy pattern
- Custom `LLMError` classes with automatic retry and exponential backoff for transient failures (rate limits, 5xx)
- Test Connection button in settings
- Custom base URL support for all providers
- Customisable prompts with template variables
- Three-tier fuzzy matching for file and section names (exact, case-insensitive, fallback)
- Automatic new KB file creation when LLM responds with `NEW: Theme-Name`
- Debug mode with detailed console logging
- Configurable inbox folder, KB folder, index exclusions, and post-processing behaviour
- GitHub Actions workflow for automated releases
