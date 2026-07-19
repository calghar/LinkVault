# Changelog

All notable changes to LinkVault will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **Auto-update KB index** — an auto-generated listing of your KB files (note, H2 sections, and link count) is maintained inside a marker-delimited managed region of the index note. Content outside the markers is never touched. Refreshes automatically when processing a link creates a new KB file, and on demand via the new **"Rebuild KB index"** command.
- **Index file** setting — names the note whose managed region is maintained (default `Index`); that note is now excluded from AI matching so links are never routed into it.
- **Duplicate-link detection** — before writing, LinkVault checks whether the URL is already filed anywhere in your KB, not just in the matched note. A duplicate is reported with the note that already holds it, and nothing is written.

### Changed

- **Match prompts rewritten.** The model now replies `MATCH: <name>`, `NEW: <name>`, or `NONE`, and is told explicitly that a link touching a topic in passing is not a match. Measured on a 13-note KB with a local `qwen3:4b-instruct`, correct routing over a 15-case set rose from 11/15 to 13–14/15, with all three "no good match" cases correctly declined in every run.
- **Links that cannot be confidently routed are no longer filed.** They stay in the Inbox with a notice, and can be processed again. Previously an unmatched response fell through to the *first* file or section in the list, so links were silently misrouted.
- Customised prompts written before this release keep working: a reply that exactly names a file or section is still accepted. Replies that merely *contain* a name are not — that was the guess behind the misrouting.

### Fixed

- **Junk KB notes are no longer created from prompt text.** The old prompt ended with a literal example, `NEW: Descriptive-Theme-Name`, and small local models copied it verbatim — producing a note actually named `Descriptive-Theme-Name.md`. Proposed names are now validated (non-empty, length-limited, no path separators, not placeholder text) and an existing note of that name is reused rather than duplicated.

### Planned

- **Routing confirmation** — a dialog offering candidate notes and sections when a match is not confident, replacing today's "left in the Inbox" behaviour.
- **MLX provider** — native Apple Silicon inference, typically faster than the llama.cpp backend for local models.
- **Growth** — mobile support (flip `isDesktopOnly`), batch-process the whole Inbox, and a `normalizePath()` pass for clean re-submission.

## [1.1.0] - 2026-07-18

### Changed

- **BREAKING:** the provider API key is now stored in Obsidian's SecretStorage (added in Obsidian 1.11.4) instead of plaintext `data.json`. `minAppVersion` is raised to `1.11.4`; users on older Obsidian versions stay on 1.0.1 via `versions.json`.

### Security

- API keys are no longer written to `data.json`, so they are never synced with vault files. An existing plaintext key is migrated into the secret store automatically on first launch (write-before-scrub, so a failed migration never loses the key). Rotate any key that was previously synced in plaintext.

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
