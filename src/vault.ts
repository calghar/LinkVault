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

// Tries exact match, then case-insensitive contains, then falls back to first item.
export function fuzzyMatch(
	response: string,
	items: string[],
	label: string
): { matched: string; wasExact: boolean } {
	if (items.length === 0) {
		throw new Error(`No ${label} available to match against.`);
	}

	const cleaned = response.trim();

	const exact = items.find((item) => item === cleaned);
	if (exact) return { matched: exact, wasExact: true };

	const lowerCleaned = cleaned.toLowerCase();
	const fuzzy = items.find((item) => {
		const lowerItem = item.toLowerCase();
		return (
			lowerItem.includes(lowerCleaned) ||
			lowerCleaned.includes(lowerItem)
		);
	});
	if (fuzzy) return { matched: fuzzy, wasExact: false };

	new Notice(
		`\u26a0\ufe0f LinkVault: Could not match ${label} "${cleaned}", using "${items[0]}"`
	);
	return { matched: items[0], wasExact: false };
}

// Inserts a row after the separator line of the matched section's table.
// If no table exists yet, creates one before the next section.
export function insertTableRow(
	content: string,
	sectionName: string,
	newRow: string,
	headerMarker: string
): string {
	const sectionPos = content.indexOf(`## ${sectionName}`);
	const searchFrom = sectionPos > -1 ? sectionPos : 0;

	const headerPos = content.indexOf(headerMarker, searchFrom);

	if (headerPos !== -1) {
		const afterHeader = content.indexOf("\n", headerPos) + 1;
		const afterSep = content.indexOf("\n", afterHeader) + 1;
		return (
			content.slice(0, afterSep) +
			newRow +
			"\n" +
			content.slice(afterSep)
		);
	}

	// No table in this section — create one
	const nextSectionPos = content.indexOf("\n## ", searchFrom + 1);
	const insertPos =
		nextSectionPos > -1 ? nextSectionPos : content.length;

	const table = `\n${headerMarker}\n|-------|------|-----------|\n${newRow}\n`;
	return content.slice(0, insertPos) + table + content.slice(insertPos);
}

export function buildNewKBFile(themeName: string): string {
	const title = themeName.replaceAll("-", " ");
	return `# ${title}\n\n## Overview\n\n| Title | Link | Key Points |\n|-------|------|-----------|\n`;
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
