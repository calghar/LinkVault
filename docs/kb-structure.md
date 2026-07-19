# KB structure

## KB files

Each KB file represents a topic and contains H2 sections with link tables:

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

- Each file can have multiple H2 sections, each with its own table
- Tables must use the `| Title | Link | Key Points |` header (configurable — see
  [Configuration](configuration.md))
- New rows are inserted after the separator row of the matched section
- A section with no table yet gets one built for it

Notes on unrelated topics follow the same shape:

```markdown
# Photography

#photography #composition

---

## Landscape & Nature

| Title | Link | Key Points |
|-------|------|-----------|
```

## The KB index

LinkVault keeps an auto-generated listing of your KB files — each note with its H2 sections
and link count — inside your index note. The listing lives in a marker-delimited **managed
region**:

```markdown
<!-- BEGIN LinkVault index (auto-generated — do not edit inside) -->
| Note | Sections | Links |
| ---- | -------- | ----- |
| [[AI-Security]] | Adversarial ML, Prompt Injection | 27 |
<!-- END LinkVault index -->
```

Everything **outside** those two markers — your title, tags, curated tables, theme
groupings — is never touched.

The region is refreshed automatically whenever processing a link creates a new KB file, and
on demand via the **"LinkVault: Rebuild KB index"** command. Set which note holds the region
with the **Index file** setting (default: `Index`); that note is also excluded from AI
matching, so links are never routed into it.

If the markers are edited into an invalid state — only one present, or the end marker before
the begin marker — a rebuild reports the problem and writes nothing, rather than guessing at
the region's boundary and risking your curated content.

Deleting or renaming a KB note outside the plugin does not refresh the index. Run **"Rebuild
KB index"** afterwards.
