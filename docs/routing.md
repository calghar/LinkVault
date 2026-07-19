# Routing

How LinkVault decides where a link goes.

## The pipeline

Running **"LinkVault: Process Link to KB"** on an inbox note makes up to four AI calls:

- **Extract** — pulls a title and one-sentence summary from the note
- **Match file** — picks a KB note, proposes a new one, or declines
- **Name new note** — only when nothing matched: names a note from the link's content
- **Match section** — picks an H2 section within the chosen note

Between matching and writing, the URL is checked against your whole KB. If it is already
filed, you're told where and nothing is written — so a duplicate never leaves a half-made
note behind.

## Choosing the note never guesses

If no existing note covers the link, LinkVault creates one rather than filing it somewhere
approximate. A link is left in your Inbox only when no usable name can be produced.

This is the behaviour that fixed misrouting. Previously an unmatched reply fell through to
the *first* file in the list, so a general-interest link could land in a security note with
no signal that anything had gone wrong.

## Choosing the section does fall back

If the note is clear but no section fits, the link goes into that note's first section and
you're told. A row in the wrong section is a two-second fix, unlike a link filed under the
wrong topic — so this is the one place the plugin still guesses, and it guesses only
*within* a note it chose confidently.

## The match contract

Match prompts ask the model to reply with exactly one line:

```
MATCH: <exact name from the list>
NEW: <short hyphenated topic name>     (file match only)
NONE
```

`NONE`, an unrecognised name, or an unparseable reply all mean "no existing note fits". For
the file match that starts the new-note flow; for the section match it falls back to the
note's first section.

If you've customised a prompt from an older release, a reply that *exactly* names a file or
section is still accepted — but a reply that merely contains a name is not, since that was
the guess behind misrouted links.

## New notes

A created note is named after the **subject area** the link belongs to, never the link
itself. The naming step is given your existing note names so it matches their level of
generality — a link about one company's valuation creates `Space-Industry`, not
`SpaceX-Valuation`, leaving a note that collects further links on that subject.

Names are normalised to `Title-Case-Hyphenated` and validated before anything is created:
non-empty, 60 characters or fewer, no path separators, and not leftover placeholder text. A
name matching an existing note reuses that note rather than creating a second one.

New notes follow the same structure as hand-written ones:

```markdown
# Space Industry

#space #aerospace #launch-vehicles

[[Index]] → Links on the commercial space industry, launch providers, and satellite operators.

---

## Launch Providers & Operators

| Title | Link | Key Points |
|------|------|------|
```

The section heading describes the kind of link it holds, matching how your existing notes
are organised, rather than a fixed "Overview". The backlink points at your configured index
note, and the table header is your configured header marker, so a customised marker still
produces a valid table.

## Duplicate links

Before writing, LinkVault checks whether the URL is already filed anywhere in your KB — not
just in the matched note. One URL lives in one note, so filing the same link into a second
note has to be done by hand.

Comparison ignores scheme case, host case, and a trailing slash. Links differing by path
case, query string, or fragment are treated as distinct, which errs toward filing a new link
rather than silently dropping one.

## Prompt updates

If you never edited the prompts, they update automatically when the plugin updates — a
stored prompt identical to an older shipped default is replaced. Prompts you actually
customised are never overwritten.

This matters because saved settings take precedence over defaults: anyone who had changed
any setting held a frozen copy of the prompts from that release and would otherwise never
receive a revision.
