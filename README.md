# LinkVault

An Obsidian plugin that saves web-clipped links into your knowledge base. One command extracts a title and summary using AI, picks the right KB file and section, and inserts a table row.

![GitHub Release](https://img.shields.io/github/v/release/calghar/LinkVault)
![License](https://img.shields.io/github/license/calghar/LinkVault)
![Obsidian Minimum Version](https://img.shields.io/badge/obsidian-%3E%3D1.11.4-blueviolet)

## Features

- Supports Anthropic (Claude), Ollama (local/free), and OpenRouter
- Never files a link into a note the model didn't actually choose
- Creates a new note, named after the subject area, when nothing existing fits — matching the structure of your hand-written notes
- Skips links already filed anywhere in your KB, and tells you which note holds them
- Maintains an auto-generated index of your KB files and sections, never touching your curated notes
- All prompts are customisable via template variables
- Retries transient errors (rate limits, 5xx) with exponential backoff
- Debug mode for inspecting raw LLM responses

## How it works

1. Clip a web page into your **Inbox** folder, via [Obsidian Web Clipper](https://obsidian.md/clipper) or any other method
2. Open the clipped note and run **"LinkVault: Process link to KB"** from the command palette
3. LinkVault extracts a title and summary, then picks a KB note and a section within it
4. If the URL is already filed anywhere in your KB, you're told where and nothing is written
5. A table row is inserted, and the inbox note is moved to trash (configurable)

If no existing note covers the link, LinkVault creates one named after the subject area
rather than filing it somewhere approximate. See [Routing](docs/routing.md) for what it does
and doesn't guess at.

## Installation

### From community plugins (recommended)

1. Open **Settings → Community plugins → Browse**
2. Search for **"LinkVault"**
3. Click **Install**, then **Enable**

Requires Obsidian 1.11.4 or later, which introduced the secret store used for API keys.

### Manual / BRAT

1. Install [BRAT](https://github.com/TfTHacker/obsidian42-brat) if you haven't already
2. In BRAT settings, add `calghar/LinkVault`
3. Enable the plugin

### Build from source

```bash
git clone https://github.com/calghar/LinkVault.git
cd LinkVault
npm install
npm run build
```

Copy `main.js`, `manifest.json`, and `styles.css` into your vault at `.obsidian/plugins/linkvault/`.

## Quick start

1. Open **Settings → LinkVault**
2. Set your **KB folder** (where your knowledge base notes live)
3. Set your **Inbox folder** (where clipped notes land)
4. Choose a **provider** and enter your API key (not needed for Ollama)
5. Click **Test connection** to verify
6. Open a note in your Inbox and run **"LinkVault: Process link to KB"** from the command palette (Ctrl/Cmd+P)

Each link uses roughly 1000 tokens across the AI calls. With Claude Haiku, that costs fractions of a cent per link.

## Documentation

| Page | Contents |
| --- | --- |
| [Routing](docs/routing.md) | How a note and section are chosen, when new notes are created, duplicate handling |
| [KB structure](docs/kb-structure.md) | The file layout LinkVault expects, and the auto-generated index region |
| [Web Clipper setup](docs/web-clipper.md) | Clipper template and the frontmatter LinkVault reads |
| [Configuration](docs/configuration.md) | Providers, every setting, prompt variables |
| [Troubleshooting](docs/troubleshooting.md) | What each message means |

## Development

```bash
npm install
npm run dev     # watch build
npm test        # unit tests
npm run lint
npm run build   # typecheck + production bundle
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup details and guidelines.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for a list of changes in each release.

## License

[MIT](LICENSE)
