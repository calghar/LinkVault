import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type LinkVaultPlugin from "./main";
import { createProvider, LLMError } from "./llm";

export type LLMProviderType = "anthropic" | "ollama" | "openrouter";
export type AfterProcessing = "trash" | "keep";

export interface LinkVaultSettings {
	// Knowledge Base
	kbFolder: string;
	kbIndexExclusions: string;
	inboxFolder: string;
	headerMarker: string;
	afterProcessing: AfterProcessing;

	// AI Provider
	provider: LLMProviderType;
	apiKey: string;
	model: string;
	ollamaHost: string;
	customBaseUrl: string;
	maxTokens: number;

	// Prompts
	extractPrompt: string;
	fileMatchPrompt: string;
	sectionMatchPrompt: string;
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
	inboxFolder: "Inbox",
	headerMarker: "| Title | Link | Key Points |",
	afterProcessing: "trash",

	provider: "anthropic",
	apiKey: "",
	model: DEFAULT_MODELS.anthropic,
	ollamaHost: "http://localhost:11434",
	customBaseUrl: "",
	maxTokens: 300,

	extractPrompt: `Extract metadata from this saved link or post.
Reply ONLY with valid JSON — no markdown fences, no explanation.

{"title": "descriptive title under 60 chars", "keypoints": "one sentence summary under 80 chars"}

Content:
{{content}}`,

	fileMatchPrompt: `Content: "{{title}} — {{keypoints}}"

Available knowledge base files:
{{fileList}}

Which file is the best match? Reply with ONLY the exact filename (no extension, no explanation).
If none fit well, reply: NEW: Descriptive-Theme-Name`,

	sectionMatchPrompt: `Content: "{{title}} — {{keypoints}}"

Sections in the target file:
{{sectionList}}

Reply with ONLY the exact section name that best fits this content.`,

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
			new Setting(containerEl)
				.setName("API key")
				.setDesc(
					`API key for ${this.plugin.settings.provider}.`
				)
				.addText((text) => {
					text.inputEl.type = "password";
					text.setPlaceholder("Enter your API key")
						.setValue(this.plugin.settings.apiKey)
						.onChange(async (value) => {
							this.plugin.settings.apiKey = value;
							await this.plugin.saveSettings();
						});
				});
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
