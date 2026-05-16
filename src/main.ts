import { Plugin } from "obsidian";
import {
	LinkVaultSettings,
	DEFAULT_SETTINGS,
	LinkVaultSettingTab,
} from "./settings";
import { processLink } from "./processor";

export default class LinkVaultPlugin extends Plugin {
	settings: LinkVaultSettings = DEFAULT_SETTINGS;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.addCommand({
			id: "process-link-to-kb",
			name: "Process link to KB",
			callback: () => processLink(this.app, this.settings),
		});

		this.addSettingTab(new LinkVaultSettingTab(this.app, this));
	}

	async loadSettings(): Promise<void> {
		const loaded: Partial<LinkVaultSettings> =
			(await this.loadData()) as Partial<LinkVaultSettings> ?? {};
		this.settings = {
			...DEFAULT_SETTINGS,
			...loaded,
		};
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
