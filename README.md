# LinkVault

An Obsidian plugin that saves web-clipped links into your knowledge base. One command extracts a title and summary using AI, picks the right KB file and section, and inserts a table row.

![GitHub Release](https://img.shields.io/github/v/release/calghar/LinkVault)
![License](https://img.shields.io/github/license/calghar/LinkVault)
![Obsidian Minimum Version](https://img.shields.io/badge/obsidian-%3E%3D1.4.0-blueviolet)

## Table of Contents

- [Features](#features)
- [How It Works](#how-it-works)
- [Installation](#installation)
- [Web Clipper Setup](#web-clipper-setup)
- [KB File Structure](#kb-file-structure)
- [Quick Start](#quick-start)
- [Providers](#providers)
- [Settings](#settings)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [Changelog](#changelog)

## Features

- Supports Anthropic (Claude), Ollama (local/free), and OpenRouter
- Three-tier fuzzy matching (exact, case-insensitive, fallback) so links always land somewhere
- Creates new KB files when no existing file fits the content
- All prompts are customisable via template variables
- Retries transient errors (rate limits, 5xx) with exponential backoff
- Debug mode for inspecting raw LLM responses

## How It Works

1. You clip a web page into your **Inbox** folder (via [Obsidian Web Clipper](https://obsidian.md/clipper) or any method)
2. Open the clipped note and run **"LinkVault: Process Link to KB"** from the command palette
3. The plugin makes 3 AI calls:
   - **Extract** — pulls a title and one-sentence summary from the note
   - **Match file** — picks the best KB index file
   - **Match section** — picks the best H2 section within that file
4. A new table row is inserted into the matched section
5. The inbox note is moved to trash (configurable)

## Installation

### From Community Plugins (recommended)

1. Open **Settings → Community Plugins → Browse**
2. Search for **"LinkVault"**
3. Click **Install**, then **Enable**

### Manual / BRAT

1. Install [BRAT](https://github.com/TfTHacker/obsidian42-brat) if you haven't already
2. In BRAT settings, add `calghar/LinkVault`
3. Enable the plugin

### Build from Source

```bash
git clone https://github.com/calghar/LinkVault.git
cd LinkVault
npm install
npm run build
```

Copy `main.js`, `manifest.json`, and `styles.css` into your vault at `.obsidian/plugins/linkvault/`.

## Web Clipper Setup

LinkVault processes notes from your Inbox folder. The easiest way to get links into your inbox is with [Obsidian Web Clipper](https://obsidian.md/clipper).

The plugin reads two frontmatter properties from clipped notes:

- **`url`** (required) — the source URL, used for the link column in the KB table
- **`title`** (optional) — used as a fallback title if the AI extraction fails

### Recommended template

In the Web Clipper extension, create a new template with these settings:

| Setting | Value |
| --- | --- |
| **Name** | LinkVault |
| **Path** | `Inbox` (must match your LinkVault Inbox folder setting) |
| **Note name** | `{{date\|date:"YYYY-MM-DD"}} - {{title\|safe_name}}` |

**Properties:**

| Name | Type | Value |
| --- | --- | --- |
| `date` | Date | `{{date}}` |
| `url` | Text | `{{url}}` |
| `title` | Text | `{{title}}` |

**Note content:**

```text
# {{title}}

{{content}}

[Source]({{url}})
```

The note content is what the AI reads to extract a summary and determine which KB file and section the link belongs to. Richer content (full article text) produces better matching than a bare URL.

## KB File Structure

Each KB file represents a topic and contains H2 sections with link tables. For example:

```markdown
# System Design

#architecture #distributed-systems

---

## Scalability & Load Balancing

| Title | Link | Key Points |
|-------|------|-----------|
| Existing entry | [Link](https://example.com) | Summary of the article |

---

## Caching Strategies

| Title | Link | Key Points |
|-------|------|-----------|
```

```markdown
# Photography

#photography #composition

---

## Landscape & Nature

| Title | Link | Key Points |
|-------|------|-----------|
```

```markdown
# Personal Finance

#finance #investing

---

## Index Funds & ETFs

| Title | Link | Key Points |
|-------|------|-----------|
```

- Each file can have multiple H2 sections, each with its own table
- Tables must use the `| Title | Link | Key Points |` header (configurable)
- New rows are inserted after the separator row of the matched section

## Quick Start

1. Open **Settings → LinkVault**
2. Set your **KB folder** (where your knowledge base index files live)
3. Set your **Inbox folder** (where clipped notes land)
4. Choose a **provider** and enter your API key (not needed for Ollama)
5. Click **Test Connection** to verify
6. Open a note in your Inbox and run **"LinkVault: Process Link to KB"** from the command palette (Ctrl/Cmd+P)

Each link uses roughly 1000 tokens across the 3 API calls. With Claude Haiku, that costs fractions of a cent per link.

## Providers

### Anthropic (Claude)

1. Set **Provider** to `Anthropic`
2. Get an API key from [console.anthropic.com](https://console.anthropic.com/)
3. Default model: `claude-haiku-4-5-20251001` (fast and affordable)

### Ollama (local, free)

1. Install [Ollama](https://ollama.com/) and pull a model: `ollama pull llama3.2`
2. Set **Provider** to `Ollama`
3. Adjust **Ollama host** if needed (default: `http://localhost:11434`)

### OpenRouter

1. Set **Provider** to `OpenRouter`
2. Get an API key from [openrouter.ai](https://openrouter.ai/)
3. Set **Model** to any available model (e.g. `anthropic/claude-3.5-haiku`)

All providers support a **custom base URL** for proxies or self-hosted endpoints.

## Settings

### Knowledge Base

| Setting | Description | Default |
| --- | --- | --- |
| KB folder | Folder containing KB index files | `Knowledge Base` |
| Index exclusions | Comma-separated filenames to exclude from AI matching | `Knowledge Base Index` |
| Inbox folder | Where clipped notes land | `Inbox` |
| Table header marker | Table header string to search for | `\| Title \| Link \| Key Points \|` |
| After processing | What to do with the inbox file | `trash` |

### AI Provider

| Setting | Description | Default |
| --- | --- | --- |
| Provider | `anthropic`, `ollama`, or `openrouter` | `anthropic` |
| API key | Provider API key (not needed for Ollama) | — |
| Model | Model name | `claude-haiku-4-5-20251001` |
| Ollama host | Ollama instance URL (Ollama only) | `http://localhost:11434` |
| Custom base URL | Override the default API endpoint | — |
| Max tokens | Max tokens for LLM responses | `300` |

### Prompts (Advanced)

All prompts are customisable with template variables:

| Prompt | Variables |
| --- | --- |
| Extract prompt | `{{content}}` |
| File match prompt | `{{title}}`, `{{keypoints}}`, `{{fileList}}` |
| Section match prompt | `{{title}}`, `{{keypoints}}`, `{{sectionList}}` |

Content sent to the LLM is truncated to a configurable limit (default: 3000 chars).

## Troubleshooting

| Error | Fix |
| --- | --- |
| "No KB files found" | Check that **KB folder** matches the actual folder name in your vault |
| "Active file is not in the Inbox folder" | Open a note inside the configured Inbox folder |
| "Cannot reach Ollama at ..." | Run `ollama serve` and check the **Ollama host** setting |
| "API key is not configured" | Enter your API key in **Settings → LinkVault** |
| "Rate limited" | The plugin retries automatically — wait a moment and try again |
| Wrong file/section matched | Enable **Debug mode** to see raw AI responses in the console (Ctrl/Cmd+Shift+I) |

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for a list of changes in each release.

## License

[MIT](LICENSE)
