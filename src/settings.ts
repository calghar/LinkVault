import { App, Notice, PluginSettingTab, Setting, SecretComponent } from "obsidian";
import type LinkVaultPlugin from "./main";
import { createProvider, LLMError } from "./llm";
import { readApiKey, writeApiKey, clearApiKey } from "./secrets";

export type LLMProviderType = "anthropic" | "ollama" | "openrouter";
export type AfterProcessing = "trash" | "keep";

export interface LinkVaultSettings {
	// Knowledge Base
	kbFolder: string;
	kbIndexExclusions: string;
	indexFile: string;
	inboxFolder: string;
	headerMarker: string;
	afterProcessing: AfterProcessing;

	// AI Provider
	// The API key is NOT stored here — it lives in Obsidian's secret store (see src/secrets.ts).
	provider: LLMProviderType;
	model: string;
	ollamaHost: string;
	customBaseUrl: string;
	maxTokens: number;

	// Prompts
	extractPrompt: string;
	fileMatchPrompt: string;
	sectionMatchPrompt: string;
	newNotePrompt: string;
	contentTruncateChars: number;

	// Debug
	debugMode: boolean;
}

export const DEFAULT_MODELS: Record<LLMProviderType, string> = {
	anthropic: "claude-haiku-4-5-20251001",
	ollama: "llama3.2",
	openrouter: "anthropic/claude-3.5-haiku",
};

export const DEFAULT_SETTINGS: LinkVaultSettings = {
	kbFolder: "Knowledge Base",
	kbIndexExclusions: "Knowledge Base Index",
	indexFile: "Index",
	inboxFolder: "Inbox",
	headerMarker: "| Title | Link | Key Points |",
	afterProcessing: "trash",

	provider: "anthropic",
	model: DEFAULT_MODELS.anthropic,
	ollamaHost: "http://localhost:11434",
	customBaseUrl: "",
	maxTokens: 300,

	extractPrompt: `Extract metadata from this saved link or post.
Reply ONLY with valid JSON — no markdown fences, no explanation.

{"title": "descriptive title under 60 chars", "keypoints": "one sentence summary under 80 chars"}

Content:
{{content}}`,

	fileMatchPrompt: `You are filing a saved link into a knowledge base. Each file below covers ONE specific topic.

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

	sectionMatchPrompt: `You are filing a saved link into one section of the note "{{targetFile}}".

Sections:
{{sectionList}}

Link: "{{title}} — {{keypoints}}"

A section is a match ONLY if the link is squarely about that section's subject.

Reply with exactly one line, one of these two forms:
MATCH: <exact section name from the list above>
NONE

Use NONE if no section clearly fits, or if you are unsure.
No explanation. No other text.`,

	newNotePrompt: `You are creating a new note in a knowledge base. No existing note covers this link.

Existing notes:
{{fileList}}

Link title: {{title}}
Summary: {{keypoints}}
Note content:
{{content}}

Name a BROAD SUBJECT AREA for the new note, at the same level of generality as the existing
notes above. This note will collect many links on that subject over time, so name the field
the link belongs to — never this one link, and never the event it reports.

Ask yourself: "what shelf does this belong on?" A link about one company's valuation goes on
the shelf for that company's industry, not a shelf called Valuations. A link about one CVE goes
on the shelf for that technology, not a shelf called Vulnerabilities.

Reply ONLY with valid JSON — no markdown fences, no explanation:
{"name": "Broad-Subject-Name", "tags": ["tag-one","tag-two","tag-three"], "description": "one line saying what this note collects"}`,

	contentTruncateChars: 3000,
	debugMode: false,
};

export class LinkVaultSettingTab extends PluginSettingTab {
	plugin: LinkVaultPlugin;

	constructor(app: App, plugin: LinkVaultPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass("linkvault-settings");

		new Setting(containerEl).setName("Knowledge base").setHeading();

		new Setting(containerEl)
			.setName("KB folder")
			.setDesc("Folder containing your knowledge base index files.")
			.addText((text) =>
				text
					.setPlaceholder("Knowledge base")
					.setValue(this.plugin.settings.kbFolder)
					.onChange(async (value) => {
						this.plugin.settings.kbFolder = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Index exclusions")
			.setDesc(
				"Comma-separated filenames to exclude from AI matching (without extension)."
			)
			.addText((text) =>
				text
					.setPlaceholder("Knowledge base index")
					.setValue(this.plugin.settings.kbIndexExclusions)
					.onChange(async (value) => {
						this.plugin.settings.kbIndexExclusions = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Index file")
			.setDesc(
				"Index note (without extension) whose auto-generated region LinkVault maintains. Excluded from AI matching."
			)
			.addText((text) =>
				text
					.setPlaceholder("Index")
					.setValue(this.plugin.settings.indexFile)
					.onChange(async (value) => {
						this.plugin.settings.indexFile = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Inbox folder")
			.setDesc("Folder where clipped notes land.")
			.addText((text) =>
				text
					.setPlaceholder("Inbox")
					.setValue(this.plugin.settings.inboxFolder)
					.onChange(async (value) => {
						this.plugin.settings.inboxFolder = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Table header marker")
			.setDesc("The table header string to search for in KB files.")
			.addText((text) =>
				text
					.setPlaceholder("| title | link | key points |")
					.setValue(this.plugin.settings.headerMarker)
					.onChange(async (value) => {
						this.plugin.settings.headerMarker = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("After processing")
			.setDesc("What to do with the inbox file after processing.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("trash", "Move to trash")
					.addOption("keep", "Keep file")
					.setValue(this.plugin.settings.afterProcessing)
					.onChange(async (value) => {
						this.plugin.settings.afterProcessing =
							value as AfterProcessing;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl).setName("AI provider").setHeading();

		new Setting(containerEl)
			.setName("Provider")
			.setDesc("Select the LLM provider to use.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("anthropic", "Anthropic (Claude)")
					.addOption("ollama", "Ollama (local)")
					.addOption("openrouter", "OpenRouter")
					.setValue(this.plugin.settings.provider)
					.onChange(async (value) => {
						this.plugin.settings.provider =
							value as LLMProviderType;
						this.plugin.settings.model =
							DEFAULT_MODELS[value as LLMProviderType];
						this.plugin.settings.customBaseUrl = "";
						await this.plugin.saveSettings();
						this.display();
					})
			);

		if (this.plugin.settings.provider !== "ollama") {
			const keyIsSet = readApiKey(this.app) !== null;
			const keySetting = new Setting(containerEl)
				.setName("API key")
				.setDesc(
					keyIsSet
						? "A key is set. Enter a new value to replace it, or clear it. Stored in Obsidian's secret store, not data.json."
						: "No key set. Enter your API key. Stored in Obsidian's secret store, not data.json."
				);

			// Masked secret input; never seeded with the stored value.
			new SecretComponent(this.app, keySetting.controlEl).onChange(
				(value) => {
					if (value.length === 0) return;
					try {
						writeApiKey(this.app, value);
					} catch (err) {
						new Notice(
							`LinkVault: could not save key: ${err instanceof Error ? err.message : String(err)}`
						);
					}
				}
			);

			keySetting.addExtraButton((button) =>
				button
					.setIcon("x")
					.setTooltip("Clear key")
					.setDisabled(!keyIsSet)
					.onClick(() => {
						clearApiKey(this.app);
						this.display();
					})
			);
		}

		new Setting(containerEl)
			.setName("Model")
			.setDesc("Model name to use for LLM calls.")
			.addText((text) =>
				text
					.setPlaceholder(
						DEFAULT_MODELS[this.plugin.settings.provider]
					)
					.setValue(this.plugin.settings.model)
					.onChange(async (value) => {
						this.plugin.settings.model = value;
						await this.plugin.saveSettings();
					})
			);

		if (this.plugin.settings.provider === "ollama") {
			new Setting(containerEl)
				.setName("Ollama host")
				.setDesc("The host URL for your Ollama instance.")
				.addText((text) =>
					text
						.setPlaceholder("http://localhost:11434")
						.setValue(this.plugin.settings.ollamaHost)
						.onChange(async (value) => {
							this.plugin.settings.ollamaHost = value;
							await this.plugin.saveSettings();
						})
				);
		}

		if (this.plugin.settings.provider === "openrouter") {
			new Setting(containerEl)
				.setName("Custom base URL")
				.setDesc(
					"Override the default OpenRouter API base URL."
				)
				.addText((text) =>
					text
						.setPlaceholder("https://openrouter.ai/api/v1")
						.setValue(this.plugin.settings.customBaseUrl)
						.onChange(async (value) => {
							this.plugin.settings.customBaseUrl = value;
							await this.plugin.saveSettings();
						})
				);
		}

		new Setting(containerEl)
			.setName("Max tokens")
			.setDesc("Maximum tokens for LLM responses.")
			.addText((text) =>
				text
					.setPlaceholder("300")
					.setValue(String(this.plugin.settings.maxTokens))
					.onChange(async (value) => {
						const num = Number.parseInt(value, 10);
						if (!Number.isNaN(num) && num > 0) {
							this.plugin.settings.maxTokens = num;
							await this.plugin.saveSettings();
						}
					})
			);

		new Setting(containerEl)
			.setName("Test connection")
			.setDesc("Verify that the LLM provider is reachable.")
			.addButton((button) =>
				button
					.setButtonText("Test connection")
					.setCta()
					.onClick(async () => {
						button.buttonEl.addClass("linkvault-test-btn", "is-loading");
						button.setDisabled(true);
						button.setButtonText("Testing...");
						try {
							const provider = createProvider(
								this.app,
								this.plugin.settings
							);
							await provider.testConnection();
							new Notice("Connection successful");
						} catch (err) {
							const msg =
								err instanceof LLMError
									? `${err.code}: ${err.message}`
									: String(err);
							new Notice(`Connection failed: ${msg}`);
						} finally {
							button.buttonEl.removeClass("is-loading");
							button.setDisabled(false);
							button.setButtonText("Test connection");
						}
					})
			);

		const advancedEl = containerEl.createEl("details");
		advancedEl.createEl("summary", {
			text: "Advanced",
			cls: "setting-item-heading",
		});

		if (this.plugin.settings.provider !== "openrouter") {
			new Setting(advancedEl)
				.setName("Custom base URL")
				.setDesc(
					"Override the default API endpoint URL (leave empty for default)."
				)
				.addText((text) =>
					text
						.setPlaceholder("https://...")
						.setValue(this.plugin.settings.customBaseUrl)
						.onChange(async (value) => {
							this.plugin.settings.customBaseUrl = value;
							await this.plugin.saveSettings();
						})
				);
		}

		const promptsEl = containerEl.createEl("details");
		promptsEl.createEl("summary", {
			text: "Prompts (advanced)",
			cls: "setting-item-heading",
		});

		new Setting(promptsEl)
			.setName("Extract prompt")
			.setDesc(
				"Prompt to extract title and keypoints. Variables: {{content}}"
			)
			.addTextArea((text) => {
				text.inputEl.rows = 8;
				text.inputEl.cols = 50;
				text.inputEl.addClass("linkvault-prompt");
				text.setPlaceholder(DEFAULT_SETTINGS.extractPrompt)
					.setValue(this.plugin.settings.extractPrompt)
					.onChange(async (value) => {
						this.plugin.settings.extractPrompt = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(promptsEl)
			.setName("File match prompt")
			.setDesc(
				"Prompt to match content to a Kb file. Variables: {{title}}, {{keypoints}}, {{fileList}}"
			)
			.addTextArea((text) => {
				text.inputEl.rows = 8;
				text.inputEl.cols = 50;
				text.inputEl.addClass("linkvault-prompt");
				text.setPlaceholder(DEFAULT_SETTINGS.fileMatchPrompt)
					.setValue(this.plugin.settings.fileMatchPrompt)
					.onChange(async (value) => {
						this.plugin.settings.fileMatchPrompt = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(promptsEl)
			.setName("Section match prompt")
			.setDesc(
				"Prompt to match content to a section. Variables: {{title}}, {{keypoints}}, {{sectionList}}"
			)
			.addTextArea((text) => {
				text.inputEl.rows = 8;
				text.inputEl.cols = 50;
				text.inputEl.addClass("linkvault-prompt");
				text.setPlaceholder(
					DEFAULT_SETTINGS.sectionMatchPrompt
				)
					.setValue(this.plugin.settings.sectionMatchPrompt)
					.onChange(async (value) => {
						this.plugin.settings.sectionMatchPrompt = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(promptsEl)
			.setName("New note prompt")
			.setDesc(
				"Prompt to name a new note when no existing note matches. Must return JSON with name, tags, and description. Variables: {{title}}, {{keypoints}}, {{content}}, {{fileList}}"
			)
			.addTextArea((text) => {
				text.inputEl.rows = 8;
				text.inputEl.cols = 50;
				text.inputEl.addClass("linkvault-prompt");
				text.setPlaceholder(DEFAULT_SETTINGS.newNotePrompt)
					.setValue(this.plugin.settings.newNotePrompt)
					.onChange(async (value) => {
						this.plugin.settings.newNotePrompt = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(promptsEl)
			.setName("Content truncation (chars)")
			.setDesc(
				"Maximum characters of note content sent to the LLM."
			)
			.addText((text) =>
				text
					.setPlaceholder("3000")
					.setValue(
						String(
							this.plugin.settings.contentTruncateChars
						)
					)
					.onChange(async (value) => {
						const num = Number.parseInt(value, 10);
						if (!Number.isNaN(num) && num > 0) {
							this.plugin.settings.contentTruncateChars =
								num;
							await this.plugin.saveSettings();
						}
					})
			);

		new Setting(containerEl).setName("Debug").setHeading();

		new Setting(containerEl)
			.setName("Debug mode")
			.setDesc(
				"Log detailed information to console for troubleshooting."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.debugMode)
					.onChange(async (value) => {
						this.plugin.settings.debugMode = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
