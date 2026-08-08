import { App, TFile, Notice, normalizePath } from "obsidian";
import type { LinkVaultSettings } from "./settings";
import {
	configuredContextWindow,
	createProvider,
	type LLMProvider,
} from "./llm";
import {
	describeCandidate,
	getKBFiles,
	getSections,
	sanitizePromptText,
	truncate,
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

export interface ExtractedMetadata {
	title: string;
	keypoints: string;
	kind: string;
	domain: string;
}

const CELL_TITLE_MAX = 60;
const CELL_KEYPOINTS_MAX = 80;
const AXIS_MAX_CHARS = 40;

// Summary, plus " [", both axes, ", " between them, "]".
const ROUTING_SUMMARY_MAX = CELL_KEYPOINTS_MAX + 2 * AXIS_MAX_CHARS + 5;

// No tokeniser ships with the plugin; four characters per token is the usual English ratio. Good
// enough to turn a silent truncation into a warning, not good enough to gate on.
const CHARS_PER_TOKEN = 4;

// Sections are named by artefact kind — "Key Blogs", "Notable Papers", "Tools & Monitoring" — an
// axis the summary alone does not carry. Measured: section accuracy 9/15 to 11/15.
export function routingSummary(metadata: ExtractedMetadata): string {
	const axes = [metadata.kind, metadata.domain].filter((v) => v.length > 0);
	const composed =
		axes.length > 0
			? `${metadata.keypoints} [${axes.join(", ")}]`
			: metadata.keypoints;
	// Sanitised here rather than at extraction: this is where model output re-enters a prompt.
	return sanitizePromptText(composed, ROUTING_SUMMARY_MAX);
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

async function extractMetadata(
	provider: LLMProvider,
	settings: LinkVaultSettings,
	content: string,
	fallbackTitle: string
): Promise<ExtractedMetadata> {
	try {
		const prompt = renderPrompt(settings.extractPrompt, { content });
		const raw = await ask(provider, settings, prompt, "extract");
		log(settings, "Extract raw response:", raw);

		const parsed = extractJSON(raw);
		return {
			title: truncate(parsed?.title ?? fallbackTitle, CELL_TITLE_MAX),
			keypoints: truncate(parsed?.keypoints ?? "", CELL_KEYPOINTS_MAX),
			kind: truncate(parsed?.kind ?? "", AXIS_MAX_CHARS),
			domain: truncate(parsed?.domain ?? "", AXIS_MAX_CHARS),
		};
	} catch (err) {
		console.error(LOG_PREFIX, "Extract failed:", err);
		new Notice("LinkVault: extract failed, using fallback title.");
		return { title: fallbackTitle, keypoints: "", kind: "", domain: "" };
	}
}

// What the file-match call decided, before anything is written. Selecting an existing file and
// naming a new one are kept separate from acting on either, so the duplicate check can run in
// between — nothing is created until the link is known to be new.
type FileChoice =
	| { kind: "existing"; targetFile: TFile }
	| { kind: "create"; proposedName: string | null }
	| { kind: "unnamed" };

// An oversized prompt is truncated by the provider without saying so. Every prompt is checked,
// not only the file match: the new-note prompt carries the whole truncated note and is the largest.
async function ask(
	provider: LLMProvider,
	settings: LinkVaultSettings,
	prompt: string,
	label: string
): Promise<string> {
	const contextWindow = configuredContextWindow(settings);
	const estimate = Math.ceil(prompt.length / CHARS_PER_TOKEN);

	if (
		contextWindow !== null &&
		estimate + settings.maxTokens > contextWindow
	) {
		new Notice(
			`LinkVault: the ${label} prompt is about ${estimate} tokens and the context window is ${contextWindow}. Raise "Context window" in settings.`
		);
	}

	return provider.ask(prompt);
}

async function chooseKBFile(
	app: App,
	provider: LLMProvider,
	settings: LinkVaultSettings,
	metadata: ExtractedMetadata,
	kbFiles: TFile[]
): Promise<FileChoice> {
	// Two lists, deliberately different: the model reads names with their scope, its reply is
	// resolved against bare names only.
	const fileNames = kbFiles.map((f) => f.basename);
	const described = await Promise.all(
		kbFiles.map(async (f) =>
			describeCandidate(f.basename, await app.vault.cachedRead(f))
		)
	);
	log(settings, "Available KB files:", described);

	const prompt = renderPrompt(settings.fileMatchPrompt, {
		title: metadata.title,
		keypoints: routingSummary(metadata),
		fileList: described.join("\n"),
	});
	const raw = await ask(provider, settings, prompt, "file-match");
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

interface DerivedNote {
	name: string;
	tags: string[];
	description: string;
	section: string;
}

// Describes a new KB note for the link: a broad subject name plus the tags and one-line
// description the note template needs. The existing note names go into the prompt so the model
// judges generality against them rather than naming the individual link.
//
// Returns null when the call fails or returns nothing usable — the caller then leaves the link
// unfiled rather than inventing a name of its own.
async function deriveNewNote(
	provider: LLMProvider,
	settings: LinkVaultSettings,
	metadata: ExtractedMetadata,
	content: string,
	existingBasenames: string[]
): Promise<DerivedNote | null> {
	try {
		const prompt = renderPrompt(settings.newNotePrompt, {
			title: metadata.title,
			keypoints: metadata.keypoints,
			content,
			fileList: existingBasenames.join("\n"),
		});
		const raw = await ask(provider, settings, prompt, "new-note");
		log(settings, "New note raw response:", raw);

		const parsed = extractJSON(raw);
		const name = parsed?.name?.trim();
		if (!name) return null;

		return {
			name,
			tags: parseTags(parsed?.tags),
			description: parsed?.description ?? "",
			section: parsed?.section ?? "",
		};
	} catch (err) {
		console.error(LOG_PREFIX, "Naming a new note failed:", err);
		return null;
	}
}

// extractJSON flattens every value to a string, so a tags array arrives as "a,b,c".
function parseTags(value: string | undefined): string[] {
	if (!value) return [];
	return value
		.split(",")
		.map((tag) => tag.trim())
		.filter((tag) => tag.length > 0);
}

// Settles on the new note to create, or null when none can be had.
//
// The naming call is always made: it is the only step that sees the existing notes and is asked
// for a broad subject area, and it also supplies the tags and description the note template
// needs. A name volunteered during matching is used in its place only if the naming call fails,
// since that name describes the link rather than a subject area.
async function resolveNewNote(
	provider: LLMProvider,
	settings: LinkVaultSettings,
	metadata: ExtractedMetadata,
	content: string,
	proposedName: string | null,
	existingBasenames: string[]
): Promise<DerivedNote | null> {
	const derived = await deriveNewNote(
		provider, settings, metadata, content, existingBasenames
	);

	if (derived !== null) {
		const check = validateNewName(derived.name, existingBasenames);
		if (check.ok) return { ...derived, name: check.name };
		log(settings, "Derived name rejected:", derived.name, check.reason);
	}

	if (proposedName !== null) {
		const check = validateNewName(proposedName, existingBasenames);
		if (check.ok)
			return { name: check.name, tags: [], description: "", section: "" };
		log(settings, "Proposed name rejected:", proposedName, check.reason);
	}

	return null;
}

// Turns a described note into a target, reusing an existing note when the name collides.
async function createKBFile(
	app: App,
	settings: LinkVaultSettings,
	note: DerivedNote,
	kbFiles: TFile[]
): Promise<{ targetFile: TFile; createdNew: boolean }> {
	const existing = kbFiles.find((f) => f.basename === note.name);
	if (existing) return { targetFile: existing, createdNew: false };

	const filePath = normalizePath(`${settings.kbFolder}/${note.name}.md`);
	const targetFile = await app.vault.create(
		filePath,
		buildNewKBFile(note.name, {
			tags: note.tags,
			description: note.description,
			section: note.section,
			indexFile: settings.indexFile,
			headerMarker: settings.headerMarker,
		})
	);
	new Notice(`Created new KB note: ${note.name}`);
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

	// A one-section note is a silent catch-all: every link routed to it lands here whether or not
	// it fits. Logged rather than noticed — the signal that matters is the file choice.
	if (sections.length === 1) {
		log(
			settings,
			`Only one section in ${targetFileName} — filed under "${sections[0]}" without asking.`
		);
		return sections[0];
	}

	let chosen: string | null = null;
	try {
		const prompt = renderPrompt(settings.sectionMatchPrompt, {
			title: metadata.title,
			keypoints: routingSummary(metadata),
			sectionList: sections.join("\n"),
			targetFile: targetFileName,
		});
		const raw = await ask(provider, settings, prompt, "section-match");
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
		choice = await chooseKBFile(app, provider, settings, metadata, kbFiles);
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
		const note = await resolveNewNote(
			provider,
			settings,
			metadata,
			truncatedContent,
			choice.kind === "create" ? choice.proposedName : null,
			kbFiles.map((f) => f.basename)
		);

		// The one case that still leaves a link unfiled: no usable name could be produced.
		if (note === null) {
			new Notice(
				`LinkVault: could not name a note for "${metadata.title}" — left in ${settings.inboxFolder}.`
			);
			return;
		}

		({ targetFile, createdNew } = await createKBFile(
			app, settings, note, kbFiles
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
