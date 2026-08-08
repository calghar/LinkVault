# Configuration

## Providers

### Anthropic (Claude)

1. Set **Provider** to `Anthropic`
2. Get an API key from [console.anthropic.com](https://console.anthropic.com/)
3. Default model: `claude-haiku-4-5-20251001` (fast and affordable)

### Ollama (local, free)

1. Install [Ollama](https://ollama.com/) and pull a model: `ollama pull llama3.2`
2. Set **Provider** to `Ollama`
3. Adjust **Ollama host** if needed (default: `http://localhost:11434`)

Model choice matters more locally than it does with a hosted provider. The routing prompts
ask for a strict one-line reply, and instruct-tuned models follow that far more reliably
than base ones — a model that ignores the contract is read as declining every link.

### OpenRouter

1. Set **Provider** to `OpenRouter`
2. Get an API key from [openrouter.ai](https://openrouter.ai/)
3. Set **Model** to any available model (e.g. `anthropic/claude-3.5-haiku`)

All providers support a **custom base URL** for proxies or self-hosted endpoints.

> **API keys are stored in Obsidian's secret store** (added in Obsidian 1.11.4), not in
> `data.json` — so they are never written to your vault files or synced with your notes.
> LinkVault therefore requires **Obsidian 1.11.4 or later**. On first launch after
> upgrading, any key previously saved in `data.json` is migrated into the secret store
> automatically; if that old key was ever synced in plaintext, rotate it.

## Settings

### Knowledge base

| Setting | Description | Default |
| --- | --- | --- |
| KB folder | Folder containing KB files | `Knowledge Base` |
| Index file | Note whose auto-generated region is maintained; excluded from matching | `Index` |
| Index exclusions | Comma-separated filenames to exclude from AI matching | `Knowledge Base Index` |
| Inbox folder | Where clipped notes land | `Inbox` |
| Table header marker | Table header string to search for | `\| Title \| Link \| Key Points \|` |
| After processing | What to do with the inbox file | `trash` |

Changing the **table header marker** changes what LinkVault searches for in existing notes
*and* what it writes into new ones, separator row included. Existing notes using the old
marker will no longer be matched into.

### AI provider

| Setting | Description | Default |
| --- | --- | --- |
| Provider | `anthropic`, `ollama`, or `openrouter` | `anthropic` |
| API key | Provider API key (not needed for Ollama) | — |
| Model | Model name | `claude-haiku-4-5-20251001` |
| Ollama host | Ollama instance URL (Ollama only) | `http://localhost:11434` |
| Context window | Tokens of context sent to Ollama, 1024–131072 (Ollama only) | `8192` |
| Custom base URL | Override the default API endpoint | — |
| Max tokens | Max tokens for LLM responses | `300` |

Ollama requests carry `temperature: 0`, the **context window** above as `num_ctx`, and **max
tokens** as `num_predict`. Left to Ollama's own defaults these are wrong for routing: the model's
sampling temperature is tuned for open-ended generation, and the server's context window is 4096
regardless of the model's real one — large enough to silently truncate the candidate list for a KB
of any size. Raise the context window if LinkVault warns that the match prompt exceeds it.

### Prompts (advanced)

All prompts are customisable with template variables:

| Prompt | Variables |
| --- | --- |
| Extract prompt | `{{content}}` — must return `title`, `keypoints`, `kind` and `domain` |
| File match prompt | `{{title}}`, `{{keypoints}}`, `{{fileList}}` |
| Section match prompt | `{{title}}`, `{{keypoints}}`, `{{sectionList}}`, `{{targetFile}}` |
| New note prompt | `{{title}}`, `{{keypoints}}`, `{{content}}`, `{{fileList}}` |

An unrecognised `{{variable}}` is left in the prompt verbatim rather than replaced with
nothing, so a typo is visible in the raw request under **Debug mode**.

Content sent to the LLM is truncated to a configurable limit (default: 3000 chars).

`{{keypoints}}` carries the summary plus the link's artefact kind and field —
`Prompt injection in webmail. [blog post, web security]`. Sections are usually named by artefact
kind ("Key Blogs", "Notable Papers", "Tools & Monitoring"), so without those the section step is
choosing on an axis it was never shown. An extract prompt that omits `kind` and `domain` still
works; the summary is then passed alone. The table cell always carries the summary only.

`{{fileList}}` gives each candidate on one line: its name, the description after its `[[Index]] →`
backlink, and its section headings. A note with neither is listed by name alone and stays
matchable. Replies are still resolved against note *names* only — naming a description or a
heading resolves to nothing.

The two match prompts must keep asking for the `MATCH:` / `NEW:` / `NONE` contract described
in [Routing](routing.md). A customised prompt that asks for a bare filename still works, but
only when the reply names a file *exactly* — see that page for why.

Editing a prompt opts it out of automatic updates: once its text differs from a shipped
default, LinkVault treats it as yours and never replaces it.

### Debug

**Debug mode** logs every prompt and raw model reply to the developer console
(Ctrl/Cmd+Shift+I) and extends notice timeouts, which is the fastest way to see why a link
was routed where it was.
