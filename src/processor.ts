import { App, TFile, Notice } from "obsidian";
import type { LinkVaultSettings } from "./settings";
import { createProvider, type LLMProvider } from "./llm";
import {
	getKBFiles,
	getSections,
	fuzzyMatch,
	insertTableRow,
	buildNewKBFile,
	trashFile,
	formatTableRow,
} from "./vault";

const LOG_PREFIX = "[LinkVault]";

interface ExtractedMetadata {
	title: string;
	keypoints: string;
}

function log(settings: LinkVaultSettings, ...args: unknown[]): void {
	if (settings.debugMode) {
		console.debug(LOG_PREFIX, ...args);
	}
}

function renderPrompt(
	template: string,
	vars: Record<string, string>
): string {
	return template.replaceAll(/\{\{(\w+)\}\}/g, (match, key: string) =>
		Object.hasOwn(vars, key) ? vars[key] : match
	);
}

function extractJSON(raw: string): Record<string, string> | null {
	const match = /\{[\s\S]*?\}/.exec(raw);
	if (!match) return null;
	try {
		return JSON.parse(match[0]);
	} catch {
		return null;
	}
}

function truncate(value: string, max: number): string {
	return value.length > max ? value.slice(0, max - 3) + "..." : value;
}

async function extractMetadata(
	provider: LLMProvider,
	settings: LinkVaultSettings,
	content: string,
	fallbackTitle: string
): Promise<ExtractedMetadata> {
	try {
		const prompt = renderPrompt(settings.extractPrompt, { content });
		const raw = await provider.ask(prompt);
		log(settings, "Extract raw response:", raw);

		const parsed = extractJSON(raw);
		return {
			title: truncate(parsed?.title ?? fallbackTitle, 60),
			keypoints: truncate(parsed?.keypoints ?? "", 80),
		};
	} catch (err) {
		console.error(LOG_PREFIX, "Extract failed:", err);
		new Notice("LinkVault: extract failed, using fallback title.");
		return { title: fallbackTitle, keypoints: "" };
	}
}

async function matchKBFile(
	app: App,
	provider: LLMProvider,
	settings: LinkVaultSettings,
	metadata: ExtractedMetadata
): Promise<{ targetFile: TFile; targetFileName: string }> {
	const kbFiles = getKBFiles(app, settings);
	if (kbFiles.length === 0) {
		throw new Error(`No KB files found in "${settings.kbFolder}" folder.`);
	}

	const fileNames = kbFiles.map((f) => f.basename);
	log(settings, "Available KB files:", fileNames);

	const prompt = renderPrompt(settings.fileMatchPrompt, {
		title: metadata.title,
		keypoints: metadata.keypoints,
		fileList: fileNames.join("\n"),
	});
	const raw = await provider.ask(prompt);
	log(settings, "File match raw response:", raw);

	const response = raw.trim();

	if (response.toUpperCase().startsWith("NEW:")) {
		const themeName = response.slice(4).trim();
		const filePath = `${settings.kbFolder}/${themeName}.md`;
		const targetFile = await app.vault.create(filePath, buildNewKBFile(themeName));
		new Notice(`Created new KB file: ${themeName}`);
		return { targetFile, targetFileName: themeName };
	}

	const { matched } = fuzzyMatch(response, fileNames, "KB file");
	const found = kbFiles.find((f) => f.basename === matched);
	if (!found) {
		throw new Error(`Could not find KB file: ${matched}`);
	}
	return { targetFile: found, targetFileName: matched };
}

async function matchSection(
	provider: LLMProvider,
	settings: LinkVaultSettings,
	metadata: ExtractedMetadata,
	targetFileName: string,
	targetContent: string
): Promise<string> {
	const sections = getSections(targetContent);

	if (sections.length === 0) return "Overview";
	if (sections.length === 1) return sections[0];

	try {
		const prompt = renderPrompt(settings.sectionMatchPrompt, {
			title: metadata.title,
			keypoints: metadata.keypoints,
			sectionList: sections.join("\n"),
			targetFile: targetFileName,
		});
		const raw = await provider.ask(prompt);
		log(settings, "Section match raw response:", raw);
		return fuzzyMatch(raw.trim(), sections, "section").matched;
	} catch (err) {
		console.error(LOG_PREFIX, "Section match failed:", err);
		new Notice("LinkVault: section match failed, using first section.");
		return sections[0];
	}
}

export async function processLink(
	app: App,
	settings: LinkVaultSettings
): Promise<void> {
	const file = app.workspace.getActiveFile();
	if (!file) {
		new Notice("No active file open.");
		return;
	}

	const inboxPath = settings.inboxFolder.toLowerCase();
	if (!file.path.toLowerCase().startsWith(inboxPath + "/")) {
		new Notice(
			`Active file is not in the "${settings.inboxFolder}" folder.`
		);
		return;
	}

	const noteContent = await app.vault.cachedRead(file);
	const cache = app.metadataCache.getFileCache(file);
	const fm = cache?.frontmatter;

	const url = fm?.url ?? "";
	const fallbackTitle = fm?.title ?? file.basename;
	const truncatedContent = noteContent.slice(0, settings.contentTruncateChars);

	log(settings, "Processing file:", file.path);

	const provider = createProvider(settings);

	const metadata = await extractMetadata(
		provider, settings, truncatedContent, fallbackTitle
	);
	log(settings, "Extracted metadata:", metadata);

	let targetFile: TFile;
	let targetFileName: string;
	try {
		const result = await matchKBFile(app, provider, settings, metadata);
		targetFile = result.targetFile;
		targetFileName = result.targetFileName;
	} catch (err) {
		new Notice(
			`LinkVault: ${err instanceof Error ? err.message : String(err)}`
		);
		return;
	}
	log(settings, "Matched KB file:", targetFileName);

	const targetContent = await app.vault.cachedRead(targetFile);
	const sectionName = await matchSection(
		provider, settings, metadata, targetFileName, targetContent
	);
	log(settings, "Matched section:", sectionName);

	const newRow = formatTableRow(metadata.title, url, metadata.keypoints);
	const updatedContent = insertTableRow(
		targetContent, sectionName, newRow, settings.headerMarker
	);
	await app.vault.modify(targetFile, updatedContent);

	if (settings.afterProcessing === "trash") {
		await trashFile(app, file);
	}

	const msg = `"${metadata.title}" -> ${targetFileName} > ${sectionName}`;
	new Notice(msg, settings.debugMode ? 10000 : 5000);
	log(settings, "Done:", msg);
}
