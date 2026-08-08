import { DEFAULT_SETTINGS, type LinkVaultSettings } from "./settings";

// Prompts shipped as defaults in earlier releases.
//
// Stored settings win over defaults, and saveSettings persists the whole settings object —
// so any user who has ever changed a setting holds a frozen copy of the prompts from that
// release and would never receive a revised default. A prompt matching one of these was
// never chosen by the user, only inherited, so replacing it restores the intended default.
// Anything not listed here is treated as the user's own writing and left alone.
const SUPERSEDED_FILE_MATCH_PROMPTS = [
	'Content: "{{title}} — {{keypoints}}"\n\nAvailable knowledge base files:\n{{fileList}}\n\nWhich file is the best match? Reply with ONLY the exact filename (no extension, no explanation).\nIf none fit well, reply: NEW: Descriptive-Theme-Name',
	`You are filing a saved link into a knowledge base. Each file below covers ONE specific topic.

Files:
{{fileList}}

Link: "{{title}} — {{keypoints}}"

A file is a match ONLY if the link is squarely about that file's topic. A link that merely
touches the topic, or that covers many topics with no single focus, is NOT a match.

Reply with exactly one line, one of these three forms:
MATCH: <exact filename from the list above>
NEW: <short hyphenated topic name you invent for this link>
NONE

Use NONE if the link has no single clear topic, or if you are unsure.
No explanation. No other text.`,
];

const SUPERSEDED_EXTRACT_PROMPTS = [
	`Extract metadata from this saved link or post.
Reply ONLY with valid JSON — no markdown fences, no explanation.

{"title": "descriptive title under 60 chars", "keypoints": "one sentence summary under 80 chars"}

Content:
{{content}}`,
];

const SUPERSEDED_SECTION_MATCH_PROMPTS = [
	'Content: "{{title}} — {{keypoints}}"\n\nSections in the target file:\n{{sectionList}}\n\nReply with ONLY the exact section name that best fits this content.',
];

// Replaces inherited prompts with the current defaults. Returns true when anything changed,
// so the caller knows to persist. Comparison is exact: a prompt the user actually edited
// will not match and is preserved verbatim.
export function migratePrompts(settings: LinkVaultSettings): boolean {
	let changed = false;

	if (SUPERSEDED_FILE_MATCH_PROMPTS.includes(settings.fileMatchPrompt)) {
		settings.fileMatchPrompt = DEFAULT_SETTINGS.fileMatchPrompt;
		changed = true;
	}

	if (SUPERSEDED_EXTRACT_PROMPTS.includes(settings.extractPrompt)) {
		settings.extractPrompt = DEFAULT_SETTINGS.extractPrompt;
		changed = true;
	}

	if (SUPERSEDED_SECTION_MATCH_PROMPTS.includes(settings.sectionMatchPrompt)) {
		settings.sectionMatchPrompt = DEFAULT_SETTINGS.sectionMatchPrompt;
		changed = true;
	}

	return changed;
}
