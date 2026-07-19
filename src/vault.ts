import { App, TFile, TFolder, Notice, normalizePath } from "obsidian";
import type { LinkVaultSettings } from "./settings";

export function getKBFiles(
	app: App,
	settings: LinkVaultSettings
): TFile[] {
	const folder = app.vault.getAbstractFileByPath(settings.kbFolder);
	if (!folder || !(folder instanceof TFolder)) {
		return [];
	}

	const exclusions = new Set(
		settings.kbIndexExclusions
			.split(",")
			.map((s) => s.trim().toLowerCase())
			.filter((s) => s.length > 0)
	);
	// The index file is never a match target.
	const indexBase = settings.indexFile.trim().toLowerCase();
	if (indexBase.length > 0) exclusions.add(indexBase);

	const files: TFile[] = [];
	collectMarkdownFiles(folder, files);

	return files.filter(
		(f) =>
			!exclusions.has(
				f.basename.toLowerCase()
			)
	);
}

function collectMarkdownFiles(folder: TFolder, result: TFile[]): void {
	for (const child of folder.children) {
		if (child instanceof TFile && child.extension === "md") {
			result.push(child);
		} else if (child instanceof TFolder) {
			collectMarkdownFiles(child, result);
		}
	}
}

// Pulls H2 headings from file content.
export function getSections(content: string): string[] {
	const sections: string[] = [];
	const regex = /^## (.+)$/gm;
	let match;
	while ((match = regex.exec(content)) !== null) {
		sections.push(match[1].trim());
	}
	return sections;
}

// Resolves a response to one of `items`, or null when it resolves to none of them.
//
// This used to fall back to `items[0]` when nothing matched, which meant every link
// landed somewhere whether or not the model had actually chosen it \u2014 the mechanism
// behind silently misrouted links. Callers now handle null explicitly.
//
// The old case-insensitive *substring* pass is gone with it: "contains a name" is a
// guess, not a match.
export function resolveMatch(
	response: string,
	items: string[]
): string | null {
	const cleaned = response.trim().toLowerCase();
	return items.find((item) => item.toLowerCase() === cleaned) ?? null;
}

// Reduces a table row to its cell text, so headers are compared by content rather than by
// exact bytes. Obsidian's formatter pads cells to align the column rules, which rewrites a
// header that was originally identical to the configured marker. Comparing literally, that
// padded header stops matching and the note grows a second table alongside the first.
function headerCells(line: string): string {
	return line
		.split("|")
		.slice(1, -1)
		.map((cell) => cell.trim())
		.join("|");
}

// Inserts a row after the separator line of the matched section's table.
// If no table exists yet, creates one before the next section.
export function insertTableRow(
	content: string,
	sectionName: string,
	newRow: string,
	headerMarker: string
): string {
	const lines = content.split("\n");
	const sectionPos = lines.findIndex(
		(line) => line.trim() === `## ${sectionName}`
	);
	const searchFrom = sectionPos > -1 ? sectionPos + 1 : 0;

	// Bounded to this section. An unbounded search finds the next table anywhere below,
	// which for a section with no table of its own means filing the row under a heading
	// nobody chose.
	const relativeEnd = lines
		.slice(searchFrom)
		.findIndex((line) => line.startsWith("## "));
	const sectionEnd =
		relativeEnd > -1 ? searchFrom + relativeEnd : lines.length;

	const wanted = headerCells(headerMarker);
	const headerPos = lines.findIndex(
		(line, i) =>
			i >= searchFrom && i < sectionEnd && headerCells(line) === wanted
	);

	if (headerPos !== -1) {
		// Past the header and its separator rule.
		lines.splice(headerPos + 2, 0, newRow);
		return lines.join("\n");
	}

	// No table in this section — create one
	const table = ["", headerMarker, buildSeparatorRow(headerMarker), newRow];
	lines.splice(sectionEnd, 0, ...table);
	return lines.join("\n");
}

// ---- New-file name validation ----

const MAX_NAME_LENGTH = 60;

// Placeholder text that must never become a filename. The first entry shipped as a literal
// in the old default prompt, and small models copied it verbatim rather than substituting a
// real theme — creating notes actually named "Descriptive-Theme-Name". Users who customised
// that prompt still carry the literal, so it stays rejected.
// Compared against the normalised, lowercased name, so entries are hyphenated even where the
// prompt text they came from used spaces.
const NAME_PLACEHOLDERS = [
	"descriptive-theme-name",
	"short-hyphenated-topic-name-you-invent-for-this-link",
	"short-note-name-describing-the-topic-this-link-belongs-to",
	"topic-name",
	"theme-name",
	"new-note",
];

export type NameCheck = { ok: true; name: string } | { ok: false; reason: string };

// Models return names in inconsistent case ("productivity-technology-culture" next to
// "Hand-tool-joinery-techniques"). KB notes are Title-Case-Hyphenated — AI-Security,
// Low-Level-Security — so canonicalise before validating, and the existing-file collision
// check below then compares like with like.
//
// Words already containing an interior capital (AI, CodeQL, eBPF) are left alone rather than
// lowercased into something wrong.
export function normalizeNoteName(name: string): string {
	return name
		.trim()
		.replaceAll(/\s+/g, "-")
		.split("-")
		.filter((word) => word.length > 0)
		.map((word) =>
			/[A-Z]/.test(word.slice(1))
				? word
				: word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
		)
		.join("-");
}

// Validates a KB filename from any origin — proposed by the match call, derived by the naming
// call, or typed by the user. Every route goes through here so none can bypass the guard.
// Returns the canonical form on success, which may differ in case from the input.
export function validateNewName(
	proposed: string,
	existingBasenames: string[]
): NameCheck {
	const name = normalizeNoteName(proposed);

	if (name.length === 0) return { ok: false, reason: "Name is empty." };
	if (name.length > MAX_NAME_LENGTH)
		return {
			ok: false,
			reason: `Name is longer than ${MAX_NAME_LENGTH} characters.`,
		};
	if (/[/\\:]/.test(name))
		return { ok: false, reason: "Name cannot contain / \\ or :" };
	if (name.startsWith("."))
		return { ok: false, reason: "Name cannot start with a dot." };
	if (NAME_PLACEHOLDERS.includes(name.toLowerCase()))
		return {
			ok: false,
			reason: "Name is prompt placeholder text, not a real topic.",
		};

	// An existing file wins over creating a near-duplicate of it.
	const existing = existingBasenames.find(
		(b) => b.toLowerCase() === name.toLowerCase()
	);
	if (existing) return { ok: true, name: existing };

	return { ok: true, name };
}

// ---- Duplicate link detection ----

// Normalises a URL for comparison: scheme and host are case-insensitive, a trailing slash
// is not meaningful. Query and fragment are left alone — two URLs differing there are
// treated as distinct, which errs toward filing a new link rather than silently dropping it.
export function normalizeUrl(url: string): string {
	const trimmed = url.trim();
	if (trimmed.length === 0) return "";
	try {
		const parsed = new URL(trimmed);
		const path = parsed.pathname.replace(/\/$/, "");
		return `${parsed.protocol.toLowerCase()}//${parsed.host.toLowerCase()}${path}${parsed.search}${parsed.hash}`;
	} catch {
		return trimmed.replace(/\/$/, "").toLowerCase();
	}
}

// Returns the KB file already holding this URL, or null. Scans every KB file rather than
// only the matched target, so a link refiled to a different note than last time is still
// caught. Reads come from Obsidian's cache and involve no LLM calls.
export async function findDuplicate(
	app: App,
	settings: LinkVaultSettings,
	url: string
): Promise<TFile | null> {
	const needle = normalizeUrl(url);
	if (needle.length === 0) return null;

	for (const file of getKBFiles(app, settings)) {
		const content = await app.vault.cachedRead(file);
		for (const match of content.matchAll(/\((https?:\/\/[^)\s]+)\)/g)) {
			if (normalizeUrl(match[1]) === needle) return file;
		}
	}
	return null;
}

// Builds the separator row matching a table header, so a customised header marker still
// produces a valid table.
export function buildSeparatorRow(headerMarker: string): string {
	const columns = headerMarker.split("|").slice(1, -1).length;
	return `|${Array.from({ length: columns }, () => "------").join("|")}|`;
}

// Renders a tag line from free-form tag text: "#one #two". Tags are lowercased, spaces become
// hyphens, and anything that is not a word character or hyphen is dropped, so model output
// cannot produce a malformed tag.
function formatTags(tags: string[]): string {
	return tags
		.map((tag) =>
			tag
				.trim()
				.toLowerCase()
				.replace(/^#+/, "")
				.replaceAll(/\s+/g, "-")
				.replaceAll(/[^\w-]/g, "")
		)
		.filter((tag) => tag.length > 0)
		.map((tag) => `#${tag}`)
		.join(" ");
}

export interface NewNoteContext {
	tags: string[];
	description: string;
	section: string;
	indexFile: string;
	headerMarker: string;
}

// Existing notes head their first table with a heading describing the kind of link it holds —
// "Attack Research", "Key Blogs", "AWS Security" — not a generic one. Falls back to "Overview"
// when nothing usable was supplied. Pipes would break the table that follows, and a heading is
// a single line.
const DEFAULT_SECTION = "Overview";

function sanitizeSection(section: string): string {
	const cleaned = section
		.split("\n")[0]
		.replaceAll("|", "")
		.replace(/^#+\s*/, "")
		.trim();

	if (cleaned.length === 0) return DEFAULT_SECTION;

	// Models sometimes carry the note name's hyphenation into the heading, yielding
	// "Company-Valuations-and-Market-Performance". Headings in this KB separate words with
	// spaces. Only a heading that is entirely hyphenated is rewritten — a single hyphen is
	// usually a real compound ("Multi-Cloud Reports", "AI Red-Teaming"), so it is left alone.
	const hyphens = cleaned.match(/-/g)?.length ?? 0;
	if (!cleaned.includes(" ") && hyphens >= 2) {
		return cleaned.replaceAll("-", " ");
	}

	return cleaned;
}

// Builds a new KB note in the same shape as the hand-written ones: title, tag line, a backlink
// to the index carrying a one-line description of what the note collects, then a first section
// holding an empty link table.
export function buildNewKBFile(
	themeName: string,
	context: NewNoteContext
): string {
	const title = themeName.replaceAll("-", " ");
	const separator = buildSeparatorRow(context.headerMarker);

	const parts = [`# ${title}`, ""];

	const tagLine = formatTags(context.tags);
	if (tagLine.length > 0) parts.push(tagLine, "");

	const description = context.description.trim();
	parts.push(
		description.length > 0
			? `[[${context.indexFile}]] → ${description}`
			: `[[${context.indexFile}]]`,
		"",
		"---",
		"",
		`## ${sanitizeSection(context.section)}`,
		"",
		context.headerMarker,
		separator,
		""
	);

	return parts.join("\n");
}

export async function trashFile(app: App, file: TFile): Promise<void> {
	await app.fileManager.trashFile(file);
}

function escapeTableCell(value: string): string {
	return value.replaceAll("|", String.raw`\|`).replaceAll("\n", " ");
}

function escapeMarkdownUrl(url: string): string {
	return url.replaceAll(")", "%29");
}

export function formatTableRow(
	title: string,
	url: string,
	keypoints: string
): string {
	const safeTitle = escapeTableCell(title);
	const safeUrl = escapeMarkdownUrl(url);
	const safeKeypoints = escapeTableCell(keypoints);
	return `| ${safeTitle} | [Link](${safeUrl}) | ${safeKeypoints} |`;
}

// ---- KB index (auto-generated managed region) ----

export const INDEX_BEGIN =
	"<!-- BEGIN LinkVault index (auto-generated — do not edit inside) -->";
export const INDEX_END = "<!-- END LinkVault index -->";

interface IndexEntry {
	basename: string;
	sections: string[];
	links: number;
}

// Counts table data rows (links) under the header marker across the whole file.
// A row is a line starting with "|" while inside a table; the separator line is skipped.
export function countLinks(content: string, headerMarker: string): number {
	const marker = headerMarker.trim();
	let count = 0;
	let inTable = false;
	for (const line of content.split("\n")) {
		const trimmed = line.trim();
		if (trimmed === marker) {
			inTable = true;
			continue;
		}
		if (!inTable) continue;
		if (trimmed.startsWith("|")) {
			if (/^\|[\s|:-]+\|?$/.test(trimmed)) continue; // separator row
			count++;
		} else {
			inTable = false;
		}
	}
	return count;
}

// Renders the managed-region body: a table of KB files sorted by basename.
export function buildIndexBody(entries: IndexEntry[]): string {
	if (entries.length === 0) return "_No KB files found._";

	const sorted = [...entries].sort((a, b) =>
		a.basename.toLowerCase().localeCompare(b.basename.toLowerCase())
	);
	const rows = sorted.map((e) => {
		const sections =
			e.sections.length > 0
				? e.sections.map((s) => s.replaceAll("|", String.raw`\|`)).join(", ")
				: "—";
		return `| [[${e.basename}]] | ${sections} | ${e.links} |`;
	});
	return ["| Note | Sections | Links |", "| ---- | -------- | ----- |", ...rows].join(
		"\n"
	);
}

// Splices the managed region into existing index content, preserving everything outside it.
// ok=false signals malformed markers (only one present, or end before begin) — caller must not write.
export function writeManagedRegion(
	existing: string,
	body: string
): { text: string; ok: boolean } {
	const region = `${INDEX_BEGIN}\n${body}\n${INDEX_END}`;
	const begin = existing.indexOf(INDEX_BEGIN);
	const end = existing.indexOf(INDEX_END);

	if (begin === -1 && end === -1) {
		const sep =
			existing.length === 0 ? "" : existing.endsWith("\n") ? "\n" : "\n\n";
		return { text: existing + sep + region + "\n", ok: true };
	}
	if (begin === -1 || end === -1 || end < begin) {
		return { text: existing, ok: false };
	}
	const endClose = end + INDEX_END.length;
	return {
		text: existing.slice(0, begin) + region + existing.slice(endClose),
		ok: true,
	};
}

// Regenerates the managed region of the configured index file from current KB files.
export async function rebuildKBIndex(
	app: App,
	settings: LinkVaultSettings
): Promise<void> {
	const files = getKBFiles(app, settings);
	const entries: IndexEntry[] = [];
	for (const f of files) {
		const content = await app.vault.cachedRead(f);
		entries.push({
			basename: f.basename,
			sections: getSections(content),
			links: countLinks(content, settings.headerMarker),
		});
	}
	const body = buildIndexBody(entries);
	const indexPath = normalizePath(
		`${settings.kbFolder}/${settings.indexFile}.md`
	);
	const existingFile = app.vault.getAbstractFileByPath(indexPath);

	if (existingFile instanceof TFile) {
		const existing = await app.vault.read(existingFile);
		const { text, ok } = writeManagedRegion(existing, body);
		if (!ok) {
			new Notice(
				"LinkVault: index markers are malformed — fix them and rebuild. No changes written."
			);
			return;
		}
		await app.vault.modify(existingFile, text);
	} else {
		const { text } = writeManagedRegion("", body);
		await app.vault.create(indexPath, text);
	}
	new Notice(`LinkVault: index rebuilt (${entries.length} KB files).`);
}
