import { describe, it, expect, beforeEach } from "vitest";
// Imported by path, not as "obsidian": vitest aliases the module name to this same file, but
// tsc resolves it to the real types package, which has neither of these.
import { setRequestUrl, type RequestOptions, App } from "./obsidian.stub";
import { createProvider, configuredContextWindow } from "../src/llm";
import { DEFAULT_SETTINGS, type LinkVaultSettings } from "../src/settings";

let captured: RequestOptions | null = null;

// The stub carries only what the providers touch, so the real App type has to be asserted.
const stubApp = new App() as unknown as import("obsidian").App;

function settingsFor(
	overrides: Partial<LinkVaultSettings>
): LinkVaultSettings {
	return { ...DEFAULT_SETTINGS, ...overrides };
}

function bodyOf(options: RequestOptions | null): Record<string, unknown> {
	return JSON.parse(options?.body ?? "{}") as Record<string, unknown>;
}

beforeEach(() => {
	captured = null;
	setRequestUrl((options) => {
		captured = options;
		return Promise.resolve({
			status: 200,
			json: {
				response: "NONE",
				content: [{ text: "NONE" }],
				choices: [{ message: { content: "NONE" } }],
			},
		});
	});
});

describe("Ollama generation options", () => {
	it("sends temperature, num_ctx and num_predict", async () => {
		const settings = settingsFor({
			provider: "ollama",
			ollamaNumCtx: 16384,
			maxTokens: 250,
		});
		await createProvider(stubApp, settings).ask("hi");

		expect(bodyOf(captured).options).toEqual({
			temperature: 0,
			num_ctx: 16384,
			num_predict: 250,
		});
	});

	it("carries the configured window rather than a constant", async () => {
		const settings = settingsFor({ provider: "ollama", ollamaNumCtx: 4096 });
		await createProvider(stubApp, settings).ask("hi");

		const options = bodyOf(captured).options as { num_ctx: number };
		expect(options.num_ctx).toBe(4096);
	});

	it("leaves the other providers' request bodies alone", async () => {
		const settings = settingsFor({ provider: "openrouter" });
		await createProvider(stubApp, settings).ask("hi");

		expect(bodyOf(captured)).not.toHaveProperty("options");
	});

	it("does not send options on the connection test", async () => {
		const settings = settingsFor({ provider: "ollama" });
		await createProvider(stubApp, settings).testConnection();

		expect(captured?.method).toBe("GET");
	});
});

describe("configuredContextWindow", () => {
	it("returns the setting for Ollama", () => {
		expect(
			configuredContextWindow(
				settingsFor({ provider: "ollama", ollamaNumCtx: 8192 })
			)
		).toBe(8192);
	});

	it("returns null for providers the plugin sends no window to", () => {
		expect(
			configuredContextWindow(settingsFor({ provider: "anthropic" }))
		).toBeNull();
		expect(
			configuredContextWindow(settingsFor({ provider: "openrouter" }))
		).toBeNull();
	});
});
