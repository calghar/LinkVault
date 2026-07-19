# Web Clipper setup

LinkVault processes notes from your Inbox folder. The easiest way to get links there is with
[Obsidian Web Clipper](https://obsidian.md/clipper).

The plugin reads two frontmatter properties from clipped notes:

- **`url`** (required) — the source URL, used for the link column in the KB table
- **`title`** (optional) — a fallback title if the AI extraction fails

## Recommended template

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

The note content is what the AI reads to extract a summary and determine which KB file and
section the link belongs to. Richer content (full article text) produces better matching
than a bare URL — and it also feeds the naming step when no existing note fits, so a thin
clip yields a weaker note name.
