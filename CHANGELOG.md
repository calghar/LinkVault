# Changelog

All notable changes to LinkVault will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

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
