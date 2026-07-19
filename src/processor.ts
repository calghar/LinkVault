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

// Either a target the model confidently chose, or the material a caller needs to ask the
// user instead. The candidate list and proposed name are carried on the unconfident branch
// rather than discarded, so the follow-up confirmation modal can consume them directly.
type FileMatch =
	| { kind: "resolved"; targetFile: TFile; targetFileName: string; createdNew: boolean }
	| { kind: "unconfident"; candidates: string[]; proposedName: string | null };

async function matchKBFile(
	app: App,
	provider: LLMProvider,
	settings: LinkVaultSettings,
	metadata: ExtractedMetadata
): Promise<FileMatch> {
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

	const reply = parseMatchReply(raw, fileNames);

	if (reply.kind === "match") {
		const found = kbFiles.find((f) => f.basename === reply.name);
		if (found) {
			return {
				kind: "resolved",
				targetFile: found,
				targetFileName: reply.name,
				createdNew: false,
			};
		}
	}

	if (reply.kind === "new") {
		const check = validateNewName(reply.name, fileNames);
		if (!check.ok) {
			log(settings, "Rejected proposed name:", reply.name, check.reason);
			return { kind: "unconfident", candidates: fileNames, proposedName: reply.name };
		}
		// The name may resolve to a file that already exists, in which case use it.
		const existing = kbFiles.find((f) => f.basename === check.name);
		if (existing) {
			return {
				kind: "resolved",
				targetFile: existing,
				targetFileName: check.name,
				createdNew: false,
			};
		}
		const filePath = normalizePath(`${settings.kbFolder}/${check.name}.md`);
		const targetFile = await app.vault.create(
			filePath,
			buildNewKBFile(check.name)
		);
		new Notice(`Created new KB file: ${check.name}`);
		return {
			kind: "resolved",
			targetFile,
			targetFileName: check.name,
			createdNew: true,
		};
	}

	return { kind: "unconfident", candidates: fileNames, proposedName: null };
}

// Returns the chosen section, or null when the model did not confidently choose one.
// A file with no sections, or exactly one, has no choice to make and is not a guess.
async function matchSection(
	provider: LLMProvider,
	settings: LinkVaultSettings,
	metadata: ExtractedMetadata,
	targetFileName: string,
	targetContent: string
): Promise<{ section: string | null; candidates: string[] }> {
	const sections = getSections(targetContent);

	if (sections.length === 0) return { section: "Overview", candidates: [] };
	if (sections.length === 1)
		return { section: sections[0], candidates: sections };

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
		const section =
			reply.kind === "match" ? resolveMatch(reply.name, sections) : null;
		return { section, candidates: sections };
	} catch (err) {
		// A failed call is not a licence to guess — the caller treats null as not confident.
		console.error(LOG_PREFIX, "Section match failed:", err);
		return { section: null, candidates: sections };
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

	const url: string = typeof fm?.url === "string" ? fm.url : "";
	const fallbackTitle: string = typeof fm?.title === "string" ? fm.title : file.basename;
	const truncatedContent = noteContent.slice(0, settings.contentTruncateChars);

	log(settings, "Processing file:", file.path);

	const provider = createProvider(app, settings);

	const metadata = await extractMetadata(
		provider, settings, truncatedContent, fallbackTitle
	);
	log(settings, "Extracted metadata:", metadata);

	let match: FileMatch;
	try {
		match = await matchKBFile(app, provider, settings, metadata);
	} catch (err) {
		new Notice(
			`LinkVault: ${err instanceof Error ? err.message : String(err)}`
		);
		return;
	}

	// Not confident: file nothing rather than guess. The note stays in the Inbox and can be
	// processed again. Replaced by a confirmation dialog in routing-confirmation-modal.
	if (match.kind === "unconfident") {
		log(settings, "File match not confident; leaving note in inbox.");
		new Notice(
			`LinkVault: no confident match for "${metadata.title}" — left in ${settings.inboxFolder}.`
		);
		return;
	}

	const { targetFile, targetFileName, createdNew } = match;
	log(settings, "Matched KB file:", targetFileName);

	// Checked across the whole KB, not just the target, so a link refiled to a different
	// note than last time is still caught. Runs before any write.
	if (url.length > 0) {
		const duplicate = await findDuplicate(app, settings, url);
		if (duplicate) {
			new Notice(
				`LinkVault: already filed in ${duplicate.basename} — nothing written.`
			);
			return;
		}
	}

	const targetContent = await app.vault.cachedRead(targetFile);
	const { section: sectionName } = await matchSection(
		provider, settings, metadata, targetFileName, targetContent
	);

	if (sectionName === null) {
		log(settings, "Section match not confident; leaving note in inbox.");
		new Notice(
			`LinkVault: no confident section in ${targetFileName} — left in ${settings.inboxFolder}.`
		);
		return;
	}
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
