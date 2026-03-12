import { App, TFile, TFolder, Notice } from "obsidian";
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
