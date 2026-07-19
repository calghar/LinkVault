import { Plugin } from "obsidian";
import {
	LinkVaultSettings,
	DEFAULT_SETTINGS,
	LinkVaultSettingTab,
} from "./settings";
import { processLink } from "./processor";
import { rebuildKBIndex } from "./vault";
import { readApiKey, writeApiKey } from "./secrets";

export default class LinkVaultPlugin extends Plugin {
	settings: LinkVaultSettings = DEFAULT_SETTINGS;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.addCommand({
			id: "process-link-to-kb",
			name: "Process link to KB",
			callback: () => processLink(this.app, this.settings),
		});

		this.addCommand({
			id: "rebuild-kb-index",
			name: "Rebuild KB index",
			callback: () => rebuildKBIndex(this.app, this.settings),
		});

		this.addSettingTab(new LinkVaultSettingTab(this.app, this));
	}

	async loadSettings(): Promise<void> {
		const raw =
			((await this.loadData()) as Record<string, unknown> | null) ?? {};
		await this.migrateApiKey(raw);
		this.settings = {
			...DEFAULT_SETTINGS,
			...(raw as Partial<LinkVaultSettings>),
		};
	}

	// One-time migration: move a legacy plaintext apiKey out of data.json into the
	// secret store. Writes to the store first and only scrubs the plaintext after the
	// write succeeds, so a store failure never loses the key (it retries next load).
	private async migrateApiKey(raw: Record<string, unknown>): Promise<void> {
		const legacy = raw.apiKey;
		if (typeof legacy !== "string" || legacy.length === 0) return;

		try {
			// Stored key wins: if one already exists, discard the plaintext without overwriting.
			if (readApiKey(this.app) === null) {
				writeApiKey(this.app, legacy);
			}
		} catch (err) {
			// Migration is best-effort: a secret-store failure must never abort onload,
			// or no commands get registered and the plugin silently does nothing.
			console.error("[LinkVault] API key migration failed:", err);
			return;
		}
		delete raw.apiKey;
		await this.saveData(raw);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
