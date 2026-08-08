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

## Descriptions decide where links land

The line after the title — `[[Index]] → what this note collects` — is what LinkVault shows the
model when it picks a note. It is the single biggest lever you have over routing accuracy, ahead
of the model you choose. A note without one is still matchable, but only on its filename.

Write three things, in this order:

1. **The subject.** What the note is about.
2. **The kinds of thing it collects** — papers, tool repos, vendor blogs, courses.
3. **The boundary against its nearest neighbour**, which is what settles a close call.

The third does the work. Two notes that both sound plausible for a link are exactly where routing
goes wrong, and the boundary clause is the only thing that separates them:

```markdown
[[Index]] → Tools and frameworks that find bugs in code: static analysis, fuzzing harnesses,
LLM-assisted and automated bug finding, supply-chain scanning. Policy and prioritisation goes to
[[Vulnerability-Management]].
```

Without that last sentence, a repo doing LLM-assisted bug finding routes to whichever note
mentions LLMs. With it, it lands here.

Keep descriptions under 300 characters — that is the bound LinkVault sends. Since the boundary
clause comes last, a longer description loses precisely the part that matters. Wiki-links inside
the description are fine and keep your graph intact.

A note with only one section is a silent catch-all: every link routed there lands in the same
place whether or not it fits. If a note is accumulating unrelated links, it usually needs either
more sections or a sharper description.

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
