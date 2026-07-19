import { App, TFile, Notice, normalizePath } from "obsidian";
import type { LinkVaultSettings } from "./settings";
import { createProvider, type LLMProvider } from "./llm";
import {
	getKBFiles,
	getSections,
	resolveMatch,
	insertTableRow,
	buildNewKBFile,
	trashFile,
	formatTableRow,
	rebuildKBIndex,
	validateNewName,
	findDuplicate,
} from "./vault";
import { parseMatchReply } from "./match";

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
		const parsed: unknown = JSON.parse(match[0]);
		if (typeof parsed !== "object" || parsed === null) return null;
		return Object.fromEntries(
			Object.entries(parsed as Record<string, unknown>).map(
				([k, v]) => [k, typeof v === "string" ? v : String(v)]
			)
		);
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

// What the file-match call decided, before anything is written. Selecting an existing file and
// naming a new one are kept separate from acting on either, so the duplicate check can run in
// between — nothing is created until the link is known to be new.
type FileChoice =
	| { kind: "existing"; targetFile: TFile }
	| { kind: "create"; proposedName: string | null }
	| { kind: "unnamed" };

async function chooseKBFile(
	provider: LLMProvider,
	settings: LinkVaultSettings,
	metadata: ExtractedMetadata,
	kbFiles: TFile[]
): Promise<FileChoice> {
	const fileNames = kbFiles.map((f) => f.basename);
	log(settings, "Available KB files:", fileNames);

	const prompt = renderPrompt(settings.fileMatchPrompt, {
		title: metadata.title,
		keypoints: metadata.keypoints,
		fileList: fileNames.join("\n"),
	});
	const raw = await provider.ask(prompt);
	log(settings, "File match raw response:", raw);

	const reply = parseMatchReply(raw, fileNames);

	if (reply.kind === "match") {
		const found = kbFiles.find((f) => f.basename === reply.name);
		if (found) return { kind: "existing", targetFile: found };
	}

	// "No existing file fits" is the reason to create one, not a reason to stop. A name the
	// model volunteered is used as-is; otherwise one is derived from the note's content.
	if (reply.kind === "new") return { kind: "create", proposedName: reply.name };
	return { kind: "unnamed" };
}

// Derives a name for a new KB note from the link's content. Returns null when the call fails —
// the caller then leaves the link unfiled rather than inventing a name of its own.
async function deriveNoteName(
	provider: LLMProvider,
	settings: LinkVaultSettings,
	metadata: ExtractedMetadata,
	content: string
): Promise<string | null> {
	try {
		const prompt = renderPrompt(settings.newNotePrompt, {
			title: metadata.title,
			keypoints: metadata.keypoints,
			content,
		});
		const raw = await provider.ask(prompt);
		log(settings, "New note name raw response:", raw);
		return raw.trim().split("\n")[0]?.trim() ?? null;
	} catch (err) {
		console.error(LOG_PREFIX, "Naming a new note failed:", err);
		return null;
	}
}

// Settles on a name for a new note, or null when none can be had.
//
// A name the model volunteered during matching is tried first, since it cost nothing. If it
// fails validation — a placeholder echo, a path separator — that is not the end: the dedicated
// naming call gets a turn before the link is abandoned.
async function resolveNewNoteName(
	provider: LLMProvider,
	settings: LinkVaultSettings,
	metadata: ExtractedMetadata,
	content: string,
	proposedName: string | null,
	existingBasenames: string[]
): Promise<string | null> {
	if (proposedName !== null) {
		const check = validateNewName(proposedName, existingBasenames);
		if (check.ok) return check.name;
		log(settings, "Proposed name rejected:", proposedName, check.reason);
	}

	const derived = await deriveNoteName(provider, settings, metadata, content);
	if (derived === null) return null;

	const check = validateNewName(derived, existingBasenames);
	if (check.ok) return check.name;

	log(settings, "Derived name rejected:", derived, check.reason);
	return null;
}

// Turns a validated name into a target, reusing an existing note when the name collides.
async function createKBFile(
	app: App,
	settings: LinkVaultSettings,
	name: string,
	kbFiles: TFile[]
): Promise<{ targetFile: TFile; createdNew: boolean }> {
	const existing = kbFiles.find((f) => f.basename === name);
	if (existing) return { targetFile: existing, createdNew: false };

	const filePath = normalizePath(`${settings.kbFolder}/${name}.md`);
	const targetFile = await app.vault.create(filePath, buildNewKBFile(name));
	new Notice(`Created new KB note: ${name}`);
	return { targetFile, createdNew: true };
}

// Picks a section within an already-chosen file.
//
// Unlike the file choice, this falls back rather than declining: a link in the wrong section of
// the right note is visible and trivially moved, whereas an unfiled link is work. The fallback
// is announced so it is never silent.
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

	let chosen: string | null = null;
	try {
		const prompt = renderPrompt(settings.sectionMatchPrompt, {
			title: metadata.title,
			keypoints: metadata.keypoints,
			sectionList: sections.join("\n"),
			targetFile: targetFileName,
		});
		const raw = await provider.ask(prompt);
		log(settings, "Section match raw response:", raw);
		const reply = parseMatchReply(raw, sections);
		if (reply.kind === "match") chosen = resolveMatch(reply.name, sections);
	} catch (err) {
		console.error(LOG_PREFIX, "Section match failed:", err);
	}

	if (chosen) return chosen;

	new Notice(
		`LinkVault: no clear section in ${targetFileName} — filed under "${sections[0]}".`
	);
	return sections[0];
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

	const url: string = typeof fm?.url === "string" ? fm.url : "";
	const fallbackTitle: string = typeof fm?.title === "string" ? fm.title : file.basename;
	const truncatedContent = noteContent.slice(0, settings.contentTruncateChars);

	log(settings, "Processing file:", file.path);

	const provider = createProvider(app, settings);

	const metadata = await extractMetadata(
		provider, settings, truncatedContent, fallbackTitle
	);
	log(settings, "Extracted metadata:", metadata);

	const kbFiles = getKBFiles(app, settings);
	if (kbFiles.length === 0) {
		new Notice(
			`LinkVault: no KB notes found in "${settings.kbFolder}".`
		);
		return;
	}

	let choice: FileChoice;
	try {
		choice = await chooseKBFile(provider, settings, metadata, kbFiles);
	} catch (err) {
		new Notice(
			`LinkVault: ${err instanceof Error ? err.message : String(err)}`
		);
		return;
	}

	// Before anything is created or written: a URL already in the KB needs no target at all,
	// and checking here means a duplicate never leaves an empty new note behind.
	if (url.length > 0) {
		const duplicate = await findDuplicate(app, settings, url);
		if (duplicate) {
			new Notice(
				`LinkVault: already filed in ${duplicate.basename} — nothing written.`
			);
			return;
		}
	}

	let targetFile: TFile;
	let createdNew = false;

	if (choice.kind === "existing") {
		targetFile = choice.targetFile;
	} else {
		// No existing note fits, so make one.
		const name = await resolveNewNoteName(
			provider,
			settings,
			metadata,
			truncatedContent,
			choice.kind === "create" ? choice.proposedName : null,
			kbFiles.map((f) => f.basename)
		);

		// The one case that still leaves a link unfiled: no usable name could be produced.
		if (name === null) {
			new Notice(
				`LinkVault: could not name a note for "${metadata.title}" — left in ${settings.inboxFolder}.`
			);
			return;
		}

		({ targetFile, createdNew } = await createKBFile(
			app, settings, name, kbFiles
		));
	}

	const targetFileName = targetFile.basename;
	log(settings, "Target KB note:", targetFileName, { createdNew });

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

	// A new KB file changed the index's file set — refresh it. Best-effort: the row is
	// already saved, so a refresh failure is reported but never reverses the insert.
	if (createdNew) {
		try {
			await rebuildKBIndex(app, settings);
		} catch (err) {
			console.error(LOG_PREFIX, "Index refresh failed:", err);
			new Notice("LinkVault: link saved, but index refresh failed.");
		}
	}

	if (settings.afterProcessing === "trash") {
		await trashFile(app, file);
	}

	const msg = `"${metadata.title}" -> ${targetFileName} > ${sectionName}`;
	new Notice(msg, settings.debugMode ? 10000 : 5000);
	log(settings, "Done:", msg);
}
