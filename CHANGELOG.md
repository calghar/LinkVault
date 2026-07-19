# Changelog

All notable changes to LinkVault will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **Auto-update KB index** — an auto-generated listing of your KB files (note, H2 sections, and link count) is maintained inside a marker-delimited managed region of the index note. Content outside the markers is never touched. Refreshes automatically when processing a link creates a new KB file, and on demand via the new **"Rebuild KB index"** command.
- **Index file** setting — names the note whose managed region is maintained (default `Index`); that note is now excluded from AI matching so links are never routed into it.

### Planned

- **Anti-misrouting** — a confidence gate replacing the silent first-item fallback, duplicate-link detection, and file/section match-prompt tuning.
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
